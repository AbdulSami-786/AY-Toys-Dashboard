import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { buildLedger } from '../lib/ledger';
import { uid } from '../lib/format';
import { emptyData, newCompany, sampleData, defaultAccounts } from './defaults';
import { sheets, TABLES, KEY_MESSAGE } from './sheets';
import { SHEET, SHEET_READY } from '../config';
import { mergeCompanies, newer } from './companies';
import { isShared, sharePayload, shareIndex } from '../lib/share';
import { getData, setData, delData, migrateAll } from './storage';
import { isWriter } from './tabLock';
import { makeLookups } from '../lib/lookups';
import { usePerm } from './users';
import { buildSheetReports, reportsSig } from '../lib/sheetReports';
import { shopSummary } from '../lib/shopStats';

const StoreCtx = createContext(null);
const REPORT_DELAY = 20000; // ms without changes before the sheet's Reports tab is updated
const PULL_EVERY = 5 * 60000; // download other computers' changes this often (while the app is on screen)
const RETRY_EVERY = 60000; // after a failed or missing download
export const OFFLINE_MESSAGE = 'No internet — everything is saved on this computer and uploads by itself when the connection is back.';
// fetch failed / no answer (not: the sheet answered with an error, or the owner key is wrong)
const isNetworkError = (e) => !!e && !e.server && e.code !== 'key';
export const OUTDATED_SCRIPT =
  'Your Google Apps Script code is out of date. Copy the new code from Company › Google Sheets Sync › Setup Guide, paste it over the old code, Save, run setup once, then Deploy › Manage deployments › Edit › Version: New version › Deploy.';
export const useStore = () => useContext(StoreCtx);


// small settings live in localStorage; the books themselves in IndexedDB (storage.js)
let reportStorageError = () => {};
const LS = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    if (!isWriter()) return false; // another tab has the books
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('localStorage write failed', e);
      reportStorageError(e);
      return false;
    }
  },
  del(key) {
    if (!isWriter()) return;
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const BOOL_FIELDS = ['active', 'voided', 'closed', 'taxable', 'accountNumbers'];
function normalize(rec) {
  const r = { ...rec };
  for (const f of BOOL_FIELDS) {
    if (r[f] === 'TRUE' || r[f] === 'true') r[f] = true;
    if (r[f] === 'FALSE' || r[f] === 'false') r[f] = false;
  }
  return r;
}

// fields the forms expect on list records (empty cells come back from the sheet as missing)
const BLANK_NAME = { company: '', contact: '', phone: '', altPhone: '', email: '', billTo: '', shipTo: '', address: '', city: '', type: '', terms: '', priceLevelId: '', rep: '', ntn: '', accountNo: '', notes: '' };
const LIST_DEFAULTS = {
  accounts: { number: '', description: '', parentId: '', sys: '' },
  customers: BLANK_NAME,
  vendors: BLANK_NAME,
  items: { sku: '', barcode: '', category: '', uom: '', description: '', purchaseDescription: '', expenseAccountId: '', preferredVendorId: '' },
};
const fromSheetRec = (table) => (rec) => ({ ...(LIST_DEFAULTS[table] || {}), ...normalize(rec) });

// Upload queue entries are references — { op: 'upsert' | 'delete', table, id } — and the record is read from the
// books when it is sent, so the queue stays tiny and a record edited ten times uploads once.
// { op: 'replaceAll' } re-uploads the whole company (new company, restored backup).
const toRef = (o) => (o.op === 'replaceAll' ? { op: 'replaceAll' } : { op: o.op, table: o.table, id: o.id ?? o.record?.id });
function compactQueue(list) {
  const refs = list.map(toRef);
  if (refs.some((o) => o.op === 'replaceAll')) return [{ op: 'replaceAll' }];
  const at = new Map();
  const out = [];
  for (const o of refs) {
    const k = o.table + ':' + o.id;
    if (at.has(k)) out[at.get(k)] = null;
    at.set(k, out.length);
    out.push(o);
  }
  return out.filter(Boolean);
}
const tablesOf = (d) => Object.fromEntries(TABLES.map((t) => [t, (d && d[t]) || []]));
// errors that mean "the sheet refused this record" rather than "try again later"
const RECORD_ERROR = /characters|cell|invalid|too large|exceed|maximum/i;

export function StoreProvider({ children }) {
  const [companies, setCompanies] = useState(() => LS.get('ay.companies', []));
  const [activeId, setActiveId] = useState(() => LS.get('ay.active', null));
  const [settings, setSettings] = useState(() => ({ autoSync: true, ...LS.get('ay.settings', {}) }));
  const [dataState, setDataState] = useState(() => ({ companyId: activeId, data: null }));
  const [sync, setSync] = useState({ status: 'idle', message: '', last: null, pending: 0 });
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const syncNowRef = useRef(null);
  const syncBusyRef = useRef(false);
  const lastTryRef = useRef(0);
  const autoRef = useRef({});
  const [storageError, setStorageError] = useState('');
  const queueRef = useRef(Object.fromEntries(Object.entries(LS.get('ay.queue', {})).map(([k, v]) => [k, (v || []).map(toRef)])));
  const failedRef = useRef(LS.get('ay.queueFailed', {})); // records the sheet refused: { companyId: [{ op, table, id, error, at }] }
  const [failedUploads, setFailedUploads] = useState(() => failedRef.current);
  const timerRef = useRef(null);
  const flushingRef = useRef(false);
  const [keyState, setKeyState] = useState({ state: 'unknown', url: '' });
  const [pulled, setPulled] = useState(null); // company whose data was downloaded this session
  const [companiesSync, setCompaniesSync] = useState({ status: SHEET_READY ? 'loading' : 'off', message: '' });

  const company = companies.find((c) => c.id === activeId) || null;
  const perm = usePerm();
  const permRef = useRef(perm);
  permRef.current = perm;
  const companiesRef = useRef(companies);
  companiesRef.current = companies;
  const data = dataState.companyId === activeId ? dataState.data : null;
  const sheetUrl = SHEET; // one Google Sheet for every company (src/config.js)

  // ----- persistence -----
  useEffect(() => {
    reportStorageError = (e) => setStorageError(`Could not save on this computer (${e?.name || e?.message || 'storage error'}).`);
    return () => {
      reportStorageError = () => {};
    };
  }, []);
  useEffect(() => {
    LS.set('ay.companies', companies);
  }, [companies]);
  useEffect(() => {
    LS.set('ay.active', activeId);
  }, [activeId]);
  useEffect(() => {
    LS.set('ay.settings', settings);
  }, [settings]);

  // load the books of the open company (IndexedDB; older copies in localStorage are moved over)
  const dataRef = useRef(dataState);
  dataRef.current = dataState;
  const loadedRef = useRef(null); // the object just read from storage — no need to write it back
  useEffect(() => {
    migrateAll().catch(() => {});
  }, []);
  useEffect(() => {
    if (!activeId || (dataState.companyId === activeId && dataState.data)) return;
    let live = true;
    getData(activeId).then((d) => {
      if (!live) return;
      const next = { ...emptyData(), ...(d || {}) };
      loadedRef.current = next;
      setDataState({ companyId: activeId, data: next });
    });
    return () => {
      live = false;
    };
  }, [activeId, dataState]);

  // save every change (one write at a time; the newest state always wins)
  const writing = useRef({ busy: false, next: null });
  useEffect(() => {
    const { companyId, data: d } = dataState;
    if (!companyId || !d || d === loadedRef.current) return;
    const w = writing.current;
    w.next = { companyId, d };
    if (w.busy) return;
    w.busy = true;
    (async () => {
      while (w.next) {
        const job = w.next;
        w.next = null;
        const r = await setData(job.companyId, job.d);
        if (r.ok) setStorageError('');
        else if (!r.skipped) {
          console.error('Saving the books failed', r.error);
          setStorageError(`Could not save on this computer (${r.error?.name || r.error?.message || 'storage error'}).`);
        }
      }
      w.busy = false;
    })();
  }, [dataState]);

  // apply theme
  useEffect(() => {
    const root = document.documentElement;
    const t = company?.theme || { primary: '#2ca01c', mode: 'light' };
    root.style.setProperty('--primary', t.primary || '#2ca01c');
    root.dataset.mode = t.mode || 'light';
    root.dataset.density = t.density || 'normal';
    document.title = company ? `${company.name} - AY Toys` : 'AY Toys';
  }, [company]);

  const ledger = useMemo(() => (data ? buildLedger(data) : null), [data]);

  // ----- sync queue -----
  const pendingCount = () => Object.values(queueRef.current).reduce((s, q) => s + q.length, 0);
  const saveQueue = () => LS.set('ay.queue', queueRef.current);
  const saveFailed = () => {
    LS.set('ay.queueFailed', failedRef.current);
    setFailedUploads({ ...failedRef.current });
  };

  // the books of a company: the open one from memory, others from storage
  const booksOf = async (companyId) => {
    const cur = dataRef.current;
    if (cur.companyId === companyId && cur.data) return cur.data;
    return (await getData(companyId)) || null;
  };

  /** Upload what is queued. Returns '' when done, or the error that stopped it (it is retried later). */
  const flush = useCallback(
    async (onlyCompany) => {
      if (flushingRef.current || !isWriter() || !SHEET_READY) return '';
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        // known to be offline: don't even try; the change waits and goes up when the connection is back
        setSync((s) => ({ ...s, status: 'offline', message: OFFLINE_MESSAGE, pending: pendingCount() }));
        return 'offline';
      }
      const list = LS.get('ay.companies', []);
      const ids = Object.keys(queueRef.current).filter((id) => (onlyCompany ? id === onlyCompany : true));
      if (!ids.length) {
        setSync((s) => ({ ...s, status: s.status === 'error' || s.status === 'offline' ? s.status : 'synced', pending: 0 }));
        return '';
      }
      flushingRef.current = true;
      try {
        for (const id of ids) {
          const co = list.find((c) => c.id === id);
          if (!co) {
            delete queueRef.current[id];
            continue;
          }
          queueRef.current[id] = compactQueue(queueRef.current[id] || []);
          const refs = queueRef.current[id];
          if (!refs.length) {
            delete queueRef.current[id];
            continue;
          }
          setSync((s) => ({ ...s, status: 'syncing', pending: pendingCount() }));
          const books = await booksOf(id);
          if (refs[0].op === 'replaceAll') {
            if (books) await sheets.replaceAll(SHEET, co.code, tablesOf(books));
            queueRef.current[id] = (queueRef.current[id] || []).slice(1);
          } else {
            const batch = refs.slice(0, 300);
            const ops = batch
              .map((r) => {
                if (r.op === 'delete') return { op: 'delete', table: r.table, id: r.id };
                const rec = books?.[r.table]?.find((x) => x.id === r.id);
                return rec ? { op: 'upsert', table: r.table, record: rec } : null; // deleted since: its delete is queued
              })
              .filter(Boolean);
            try {
              if (ops.length) await sheets.push(SHEET, co.code, ops);
            } catch (e) {
              if (!e.server) throw e; // offline / key problem: stop, retry later
              // one record the sheet refuses must not block the rest: send one by one, set aside what is refused
              let sent = 0;
              const refused = [];
              for (const op of ops) {
                try {
                  await sheets.push(SHEET, co.code, [op]);
                  sent++;
                } catch (e1) {
                  if (!e1.server) throw e1;
                  refused.push({ op: op.op, table: op.table, id: op.id ?? op.record?.id, error: e1.message, at: new Date().toISOString() });
                }
              }
              // nothing at all went through and the error doesn't point at the data → the sheet is having trouble
              if (!sent && !refused.every((x) => RECORD_ERROR.test(x.error))) throw e;
              failedRef.current[id] = [...(failedRef.current[id] || []).filter((f) => !refused.some((r) => r.table === f.table && r.id === f.id)), ...refused];
              saveFailed();
            }
            queueRef.current[id] = (queueRef.current[id] || []).slice(batch.length);
          }
          if (!queueRef.current[id].length) delete queueRef.current[id];
          saveQueue();
        }
        setSync({ status: 'synced', message: '', last: new Date().toISOString(), pending: pendingCount() });
        if (pendingCount()) setTimeout(() => flush(), 300);
        return '';
      } catch (e) {
        const off = isNetworkError(e);
        setSync((s) => ({ ...s, status: off ? 'offline' : 'error', message: off ? OFFLINE_MESSAGE : e.message, pending: pendingCount() }));
        return e.message || 'Upload failed';
      } finally {
        flushingRef.current = false;
      }
    },
    [],
  );

  // keep uploading until this company's queue is empty (a big first upload takes several rounds)
  const flushAll = useCallback(
    async (companyId) => {
      for (let round = 0; round < 200; round++) {
        const before = (queueRef.current[companyId] || []).length;
        if (!before) return '';
        while (flushingRef.current) await new Promise((r) => setTimeout(r, 100));
        const err = await flush(companyId);
        if (err) return err;
        if ((queueRef.current[companyId] || []).length >= before) return 'Upload did not progress';
      }
      return (queueRef.current[companyId] || []).length ? 'Too many changes waiting' : '';
    },
    [flush],
  );

  // put refused uploads back in the queue (after the cause is fixed)
  const retryFailed = useCallback(
    (companyId) => {
      const f = failedRef.current[companyId] || [];
      if (!f.length) return;
      queueRef.current[companyId] = [...(queueRef.current[companyId] || []), ...f.map(toRef)];
      delete failedRef.current[companyId];
      saveQueue();
      saveFailed();
      flush(companyId);
    },
    [flush],
  );

  const enqueue = useCallback(
    (companyId, ops) => {
      if (!companyId || !ops.length) return;
      queueRef.current[companyId] = [...(queueRef.current[companyId] || []), ...ops.map(toRef)];
      saveQueue();
      if (!SHEET_READY) {
        setSync((s) => ({ ...s, status: 'local', pending: pendingCount() }));
        return;
      }
      const off = typeof navigator !== 'undefined' && navigator.onLine === false;
      setSync((s) => ({ ...s, status: off ? 'offline' : 'pending', message: off ? OFFLINE_MESSAGE : s.message, pending: pendingCount() }));
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => flush(), 1200);
    },
    [flush],
  );

  // Automatic sync — nothing to click:
  //  · internet back → upload what waited, download the latest, refresh the shop list
  //  · every 30 s: upload anything still waiting; download again after a failure, and every few minutes
  //  · coming back to the app after a while → download
  useEffect(() => {
    if (!SHEET_READY) return undefined;
    const auto = () => autoRef.current;
    const pullNow = () => {
      const a = auto();
      if (!a.companyId || a.autoSync === false || !syncNowRef.current) return;
      lastTryRef.current = Date.now();
      syncNowRef.current().catch(() => {});
    };
    const back = () => {
      setOnline(true);
      auto().runDeletes?.();
      if (auto().companiesError) auto().fetchCompanies?.().catch(() => {});
      if (pendingCount()) flush();
      pullNow();
    };
    const gone = () => {
      setOnline(false);
      setSync((s) => (s.status === 'syncing' ? s : { ...s, status: 'offline', message: OFFLINE_MESSAGE, pending: pendingCount() }));
    };
    const tick = () => {
      if (!navigator.onLine) return;
      if (pendingCount()) flush();
      const a = auto();
      a.runDeletes?.();
      if (a.companiesError) a.fetchCompanies?.().catch(() => {});
      if (document.hidden) return;
      const behind = a.syncStatus === 'error' || a.syncStatus === 'offline' || a.pulled !== a.companyId;
      if (Date.now() - lastTryRef.current >= (behind ? RETRY_EVERY : PULL_EVERY)) pullNow();
    };
    const seen = () => {
      if (!document.hidden && navigator.onLine && Date.now() - lastTryRef.current > 2 * 60000) pullNow();
    };
    window.addEventListener('online', back);
    window.addEventListener('offline', gone);
    document.addEventListener('visibilitychange', seen);
    const t = setInterval(tick, 30000);
    return () => {
      window.removeEventListener('online', back);
      window.removeEventListener('offline', gone);
      document.removeEventListener('visibilitychange', seen);
      clearInterval(t);
    };
  }, [flush]);

  // ----- data mutations -----
  const mutate = useCallback(
    (fn, ops) => {
      setDataState((prev) => {
        if (!prev.data) return prev;
        return { ...prev, data: fn(prev.data) };
      });
      enqueue(activeId, ops);
    },
    [activeId, enqueue],
  );

  const saveRecord = useCallback(
    (table, rec) => {
      const record = { ...rec, id: rec.id || uid(), updatedAt: new Date().toISOString() };
      if (!record.createdAt) record.createdAt = record.updatedAt;
      mutate(
        (d) => {
          const list = d[table] || [];
          const idx = list.findIndex((r) => r.id === record.id);
          const next = idx >= 0 ? list.map((r) => (r.id === record.id ? record : r)) : [...list, record];
          return { ...d, [table]: next };
        },
        [{ op: 'upsert', table, record }],
      );
      return record;
    },
    [mutate],
  );

  const saveMany = useCallback(
    (table, records) => {
      const stamp = new Date().toISOString();
      const recs = records.map((r) => ({ ...r, id: r.id || uid(), updatedAt: stamp, createdAt: r.createdAt || stamp }));
      mutate(
        (d) => {
          const map = new Map((d[table] || []).map((r) => [r.id, r]));
          recs.forEach((r) => map.set(r.id, r));
          return { ...d, [table]: [...map.values()] };
        },
        recs.map((record) => ({ op: 'upsert', table, record })),
      );
      return recs;
    },
    [mutate],
  );

  const deleteRecord = useCallback(
    (table, id) => {
      if (!permRef.current.can('delete')) {
        window.dispatchEvent(new CustomEvent('ay:denied', { detail: "You don't have permission to delete or void. Ask the Super Admin." }));
        return false;
      }
      mutate((d) => ({ ...d, [table]: (d[table] || []).filter((r) => r.id !== id) }), [{ op: 'delete', table, id }]);
    },
    [mutate],
  );

  // ----- companies -----
  const pushCompany = useCallback(
    async (co) => {
      if (!SHEET_READY) return;
      try {
        await sheets.saveCompany(SHEET, co);
      } catch (e) {
        const off = isNetworkError(e);
        setSync((s) => ({ ...s, status: off ? 'offline' : 'error', message: off ? OFFLINE_MESSAGE : e.message }));
      }
    },
    [],
  );

  const addCompany = useCallback(
    (info, { sample = false } = {}) => {
      const co = newCompany(info);
      const d = sample ? sampleData() : emptyData();
      setCompanies((list) => [...list, co]);
      setActiveId(co.id);
      setDataState({ companyId: co.id, data: d }); // saved to this computer by the persistence effect
      pushCompany(co);
      queueRef.current[co.id] = [{ op: 'replaceAll' }];
      saveQueue();
      if (SHEET_READY) setTimeout(() => flush(co.id), 500);
      return co;
    },
    [pushCompany, flush],
  );

  const updateCompany = useCallback(
    (id, patch) => {
      setCompanies((list) =>
        list.map((c) => {
          if (c.id !== id) return c;
          const next = { ...c, ...patch, updatedAt: new Date().toISOString() };
          pushCompany(next);
          return next;
        }),
      );
    },
    [pushCompany],
  );

  const switchCompany = useCallback((id) => {
    setActiveId(id);
    setDataState({ companyId: id, data: null }); // loaded from storage by the effect above
  }, []);

  const runCompanyDeletes = useCallback(async () => {
    for (const d of LS.get('ay.companyDeletes', [])) {
      try {
        await sheets.deleteCompany(SHEET, d.id, d.code);
        LS.set('ay.companyDeletes', LS.get('ay.companyDeletes', []).filter((x) => x.id !== d.id));
      } catch (e) {
        if (!e.server) return; // offline: later
      }
    }
  }, []);

  const deleteCompany = useCallback(
    (id) => {
      const co = companies.find((c) => c.id === id);
      setCompanies((list) => list.filter((c) => c.id !== id));
      delData(id);
      delete queueRef.current[id];
      saveQueue();
      delete failedRef.current[id];
      saveFailed();
      delete sharePubRef.current[id];
      LS.set('ay.sharePub', sharePubRef.current);
      if (activeId === id) {
        setActiveId(null);
        setDataState({ companyId: null, data: null });
      }
      // removed from the sheet too — if that fails (offline), it is kept in a list and retried, so the shop
      // does not come back when the shop list is downloaded again
      if (SHEET_READY && co) {
        LS.set('ay.companyDeletes', [...LS.get('ay.companyDeletes', []).filter((x) => x.id !== co.id), { id: co.id, code: co.code }]);
        runCompanyDeletes();
      }
    },
    [companies, activeId, runCompanyDeletes],
  );

  // Load the company list from the Google Sheet (every computer does this when the app starts)
  const fetchCompanies = useCallback(async () => {
    if (!SHEET_READY) return 0;
    setCompaniesSync({ status: 'loading', message: '' });
    try {
      const sec = await sheets.secure(SHEET);
      if (sec.state === 'locked') throw new Error(KEY_MESSAGE);
      if (sec.state === 'legacy') throw new Error(OUTDATED_SCRIPT);
      await runCompanyDeletes();
      const gone = new Set(LS.get('ay.companyDeletes', []).map((x) => x.id));
      const remote = (await sheets.listCompanies(SHEET)).filter((r) => !gone.has(String(r.id)));
      const merged = mergeCompanies(companiesRef.current, remote);
      setCompanies(merged);
      setCompaniesSync({ status: 'ok', message: '', count: remote.length, at: new Date().toISOString() });
      return merged;
    } catch (e) {
      setCompaniesSync({ status: 'error', message: e.message });
      throw e;
    }
  }, [runCompanyDeletes]);

  // first start on a computer: list the companies from the sheet, and open the only one if there is one
  useEffect(() => {
    if (!SHEET_READY) return;
    const hadNone = !companiesRef.current.length;
    fetchCompanies()
      .then((list) => {
        if (hadNone && list.length === 1 && !activeId) switchCompany(list[0].id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Protect the Apps Script with the owner key (created on first connect) — see sheets.secure
  const secureSheet = useCallback(async (url) => {
    if (!url) {
      setKeyState({ state: 'nourl', url: '' });
      return { state: 'nourl' };
    }
    setKeyState((k) => ({ ...k, state: k.url === url && k.state === 'ok' ? 'ok' : 'checking', url }));
    try {
      const r = await sheets.secure(url);
      setKeyState({ state: r.state, url, claimed: !!r.claimed, version: r.version || 0 });
      return r;
    } catch (e) {
      setKeyState({ state: 'error', url, message: e.message });
      throw e;
    }
  }, []);

  // Full two-way sync for the active company
  const syncNow = useCallback(async () => {
    if (!company) return;
    const url = sheetUrl;
    if (!url) {
      setSync((s) => ({ ...s, status: 'local', message: 'No Google Sheet connected' }));
      return;
    }
    if (syncBusyRef.current) return;
    syncBusyRef.current = true;
    lastTryRef.current = Date.now();
    try {
      setSync((s) => ({ ...s, status: 'syncing', message: '' }));
      const sec = await secureSheet(url);
      if (sec.state === 'locked') throw new Error(KEY_MESSAGE);
      // company settings (theme, templates, shortcuts…): keep the most recent copy
      const gone = new Set(LS.get('ay.companyDeletes', []).map((x) => x.id));
      const remoteCos = (await sheets.listCompanies(url)).filter((r) => !gone.has(String(r.id)));
      const remoteMe = remoteCos.find((c) => String(c.id) === company.id);
      setCompanies((list) => mergeCompanies(list, remoteCos));
      if (!remoteMe || newer(company, remoteMe)) await pushCompany(company);
      const upErr = await flushAll(company.id);
      if (upErr) throw new Error('Could not upload the changes made on this computer: ' + upErr);
      const remote = await sheets.pull(url, company.code);
      const remoteEmpty = !(remote.accounts || []).length;
      const local = (await booksOf(company.id)) || emptyData();
      if (remoteEmpty) {
        await sheets.replaceAll(url, company.code, tablesOf(local));
      } else {
        const next = emptyData();
        TABLES.forEach((t) => (next[t] = (remote[t] || []).map(fromSheetRec(t))));
        if (!next.accounts.length) next.accounts = defaultAccounts();
        // Keep this computer's version of: records the sheet refused (listed in Google Sheets Sync) and anything
        // changed while the download was running (it is in the upload queue again).
        setDataState((prev) => {
          if (prev.companyId !== company.id) return prev;
          const cur = prev.data || local;
          const waiting = queueRef.current[company.id] || [];
          if (waiting.some((o) => o.op === 'replaceAll')) return prev; // a full upload is waiting: this computer's copy wins
          const merged = { ...next };
          for (const f of [...(failedRef.current[company.id] || []), ...waiting]) {
            if (!f.table) continue;
            const mine = (cur[f.table] || []).find((x) => x.id === f.id);
            merged[f.table] = (merged[f.table] || []).filter((x) => x.id !== f.id);
            if (f.op !== 'delete' && mine) merged[f.table] = [...merged[f.table], mine];
          }
          return { companyId: company.id, data: merged };
        });
      }
      setPulled(company.id);
      setOnline(true);
      setSync({ status: 'synced', message: '', last: new Date().toISOString(), pending: pendingCount() });
    } catch (e) {
      const off = isNetworkError(e);
      setSync((s) => ({ ...s, status: off ? 'offline' : 'error', message: off ? OFFLINE_MESSAGE : e.message, pending: pendingCount() }));
      throw e;
    } finally {
      syncBusyRef.current = false;
    }
  }, [company, sheetUrl, flushAll, pushCompany, secureSheet]);
  syncNowRef.current = syncNow;

  autoRef.current = {
    companyId: company?.id || null,
    autoSync: settings.autoSync,
    pulled,
    syncStatus: sync.status,
    companiesError: companiesSync.status === 'error',
    fetchCompanies,
    runDeletes: runCompanyDeletes,
  };

  // Upload everything (overwrite the Google Sheet with local data)
  const pushAll = useCallback(async () => {
    if (!company || !sheetUrl) return;
    setSync((s) => ({ ...s, status: 'syncing' }));
    try {
      await pushCompany(company);
      await sheets.replaceAll(sheetUrl, company.code, tablesOf(data));
      delete queueRef.current[company.id];
      saveQueue();
      setSync({ status: 'synced', message: '', last: new Date().toISOString(), pending: pendingCount() });
    } catch (e) {
      // not uploaded: keep a full upload waiting, so a later download can't bring the old sheet copy back
      queueRef.current[company.id] = [{ op: 'replaceAll' }];
      saveQueue();
      setSync((s) => ({ ...s, status: 'error', message: e.message, pending: pendingCount() }));
      throw e;
    }
  }, [company, sheetUrl, data, pushCompany]);

  // pull on company open
  useEffect(() => {
    if (company && sheetUrl && settings.autoSync !== false) {
      syncNow().catch(() => {});
    } else if (company && !sheetUrl) {
      setSync((s) => ({ ...s, status: 'local', pending: pendingCount() }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // replace the whole company (restore a backup): everything is re-uploaded, even if that has to wait
  const replaceData = useCallback(
    (d) => {
      const next = { ...emptyData(), ...d };
      setDataState({ companyId: activeId, data: next });
      queueRef.current[activeId] = [{ op: 'replaceAll' }];
      saveQueue();
      if (SHEET_READY) setTimeout(() => flush(activeId), 500);
    },
    [activeId, flush],
  );
  // recalculate every balance (nothing changes in the books, nothing to upload)
  const rebuildData = useCallback(() => setDataState((prev) => (prev.data ? { ...prev, data: { ...prev.data } } : prev)), []);

  // ----- shared party ledgers (read-only links, see lib/share.js) -----
  // sharePub[companyId] = { sigs: { token: signature of the published snapshot }, removes: [tokens to unpublish] }
  const sharePubRef = useRef(LS.get('ay.sharePub', {}));
  const [shareSync, setShareSync] = useState({ status: 'idle', message: '', last: null, published: {} });
  const shareBusyRef = useRef(false);
  const shareAgainRef = useRef(false);
  const shareFailedRef = useRef(false);
  const securedUrlRef = useRef('');
  const latestRef = useRef({});
  latestRef.current = { company, data, ledger, sheetUrl };

  const publishShares = useCallback(async () => {
    const { company: co, data: d, ledger: lg, sheetUrl: url } = latestRef.current;
    if (!co || !d || !lg || !url) return;
    if (shareBusyRef.current) {
      shareAgainRef.current = true;
      return;
    }
    const pub = sharePubRef.current[co.id] || { sigs: {}, removes: [] };
    const sigs = {};
    const changed = [];
    const index = d.customers.some(isShared) || d.vendors.some(isShared) ? shareIndex(d, lg) : null;
    for (const [which, list] of [
      ['customer', d.customers],
      ['vendor', d.vendors],
    ]) {
      for (const party of list || []) {
        if (!isShared(party)) continue;
        const { sig, upsert } = sharePayload({ data: d, ledger: lg, company: co, which, party, index });
        sigs[party.share.token] = sig;
        if (pub.sigs?.[party.share.token] !== sig) changed.push({ sig, upsert });
      }
    }
    const removes = [...new Set([...(pub.removes || []), ...Object.keys(pub.sigs || {}).filter((t) => !sigs[t])])];
    const published = Object.fromEntries(Object.entries(pub.sigs || {}).filter(([t]) => sigs[t]));
    // keep tokens queued by unpublishShare while this upload was running
    const record = () => {
      const queued = (sharePubRef.current[co.id]?.removes || []).filter((t) => !removes.includes(t));
      sharePubRef.current[co.id] = { sigs: { ...published }, removes: queued };
      LS.set('ay.sharePub', sharePubRef.current);
    };
    if (!changed.length && !removes.length) {
      setShareSync((s) => ({ ...s, status: 'live', message: '', published }));
      return;
    }

    shareBusyRef.current = true;
    setShareSync((s) => ({ ...s, status: 'publishing', message: '' }));
    try {
      if (securedUrlRef.current !== url) {
        const sec = await sheets.secure(url);
        if (sec.state === 'legacy') throw new Error(OUTDATED_SCRIPT);
        if (sec.state === 'locked') throw new Error(KEY_MESSAGE);
        securedUrlRef.current = url;
      }
      // a few ledgers per request keeps each upload small
      const batches = [];
      let batch = [];
      let size = 0;
      for (const c of changed) {
        if (batch.length && size + c.upsert.data.length > 3e6) {
          batches.push(batch);
          batch = [];
          size = 0;
        }
        batch.push(c);
        size += c.upsert.data.length;
      }
      if (batch.length || !batches.length) batches.push(batch);
      for (let b = 0; b < batches.length; b++) {
        await sheets.publishLedgers(url, {
          companyId: co.id,
          companyName: co.legalName || co.name,
          upserts: batches[b].map((x) => x.upsert),
          removes: b === 0 ? removes : [],
        });
        batches[b].forEach((x) => (published[x.upsert.token] = x.sig));
        record();
      }
      shareFailedRef.current = false;
      setShareSync({ status: 'live', message: '', last: new Date().toISOString(), published: { ...published } });
    } catch (e) {
      shareFailedRef.current = true;
      setShareSync((s) => ({
        ...s,
        status: 'error',
        message: /Unknown action/.test(e.message) ? OUTDATED_SCRIPT : e.message,
        published: { ...(sharePubRef.current[co.id]?.sigs || {}) },
      }));
    } finally {
      shareBusyRef.current = false;
      if (shareAgainRef.current) {
        shareAgainRef.current = false;
        setTimeout(() => publishShares(), 200);
      }
    }
  }, []);

  // Unpublish a link (sharing stopped or a new link made) — also when another computer published it
  const unpublishShare = useCallback(
    (token) => {
      if (!token || !activeId) return;
      const pub = sharePubRef.current[activeId] || { sigs: {}, removes: [] };
      sharePubRef.current[activeId] = { ...pub, removes: [...new Set([...(pub.removes || []), token])] };
      LS.set('ay.sharePub', sharePubRef.current);
    },
    [activeId],
  );

  // Republish shared ledgers shortly after anything changes (after this session's first download)
  useEffect(() => {
    if (!company || !data || !sheetUrl) return;
    const pub = sharePubRef.current[company.id];
    const any =
      data.customers.some(isShared) || data.vendors.some(isShared) || Object.keys(pub?.sigs || {}).length > 0 || (pub?.removes || []).length > 0;
    if (!any) return;
    if (settings.autoSync !== false && pulled !== company.id) return;
    const t = setTimeout(() => publishShares(), 1500);
    return () => clearTimeout(t);
  }, [data, company, sheetUrl, pulled, settings.autoSync, publishShares]);

  useEffect(() => {
    setShareSync({ status: 'idle', message: '', last: null, published: { ...(sharePubRef.current[activeId]?.sigs || {}) } });
  }, [activeId]);

  // retry a failed publish
  useEffect(() => {
    const t = setInterval(() => {
      if (shareFailedRef.current && navigator.onLine) publishShares();
    }, 60000);
    return () => clearInterval(t);
  }, [publishShares]);

  // ----- the Google Sheet's "Reports" tab (see lib/sheetReports.js) -----
  // reportPub[companyId] = fingerprint of the reports last sent, so unchanged reports are not sent again
  const reportPubRef = useRef(LS.get('ay.reportPub', {}));
  const [reportSync, setReportSync] = useState({ status: 'idle', message: '', last: null });
  const reportBusyRef = useRef(false);
  const reportAgainRef = useRef(false);
  const reportFailedRef = useRef(false);

  const publishReports = useCallback(async (force = false) => {
    const { company: co, data: d, ledger: lg, sheetUrl: url } = latestRef.current;
    if (!co || !d || !lg || !url || !isWriter()) return;
    if (reportBusyRef.current) {
      reportAgainRef.current = true;
      return;
    }
    reportBusyRef.current = true;
    try {
      const reports = await buildSheetReports({ data: d, ledger: lg, company: co });
      const summary = shopSummary({ data: d, ledger: lg }, co.fyMonth || 1);
      const name = co.legalName || co.name;
      const sig = reportsSig([reports, { ...summary, at: '' }]) + '|' + name;
      if (force !== true && reportPubRef.current[co.id] === sig) {
        reportFailedRef.current = false;
        setReportSync((s) => ({ ...s, status: 'live', message: '' }));
        return;
      }
      setReportSync((s) => ({ ...s, status: 'publishing', message: '' }));
      if (securedUrlRef.current !== url) {
        const sec = await sheets.secure(url);
        if (sec.state === 'legacy') throw new Error(OUTDATED_SCRIPT);
        if (sec.state === 'locked') throw new Error(KEY_MESSAGE);
        securedUrlRef.current = url;
      }
      await sheets.publishReports(url, { companyId: co.id, code: co.code, name, at: new Date().toISOString(), reports, summary });
      reportPubRef.current = { ...reportPubRef.current, [co.id]: sig };
      LS.set('ay.reportPub', reportPubRef.current);
      reportFailedRef.current = false;
      setReportSync({ status: 'live', message: '', last: new Date().toISOString() });
    } catch (e) {
      reportFailedRef.current = true;
      setReportSync((s) => ({ ...s, status: 'error', message: /Unknown action/.test(e.message) ? OUTDATED_SCRIPT : e.message }));
    } finally {
      reportBusyRef.current = false;
      if (reportAgainRef.current) {
        reportAgainRef.current = false;
        setTimeout(() => publishReports(), 1000);
      }
    }
  }, []);

  // update the sheet's reports once the books have been quiet for a moment (after this session's first download)
  useEffect(() => {
    if (!company || !data || !sheetUrl) return;
    if (settings.autoSync !== false && pulled !== company.id) return;
    const t = setTimeout(() => publishReports(), REPORT_DELAY);
    return () => clearTimeout(t);
  }, [data, company, sheetUrl, pulled, settings.autoSync, publishReports]);

  useEffect(() => {
    setReportSync({ status: 'idle', message: '', last: null });
  }, [activeId]);

  useEffect(() => {
    const t = setInterval(() => {
      if (reportFailedRef.current && navigator.onLine) publishReports();
    }, 120000);
    return () => clearInterval(t);
  }, [publishReports]);

  // auto next number for a transaction type
  const nextNum = useCallback(
    (type, start = 1) => {
      const nums = (data?.txns || []).filter((t) => t.type === type).map((t) => String(t.num || ''));
      let max = 0;
      let prefix = '';
      nums.forEach((n) => {
        const m = /^(.*?)(\d+)$/.exec(n);
        if (m && Number(m[2]) >= max) {
          max = Number(m[2]);
          prefix = m[1];
        }
      });
      return max ? prefix + (max + 1) : String(start);
    },
    [data],
  );

  const value = {
    companies,
    company,
    activeId,
    data,
    ledger,
    settings,
    setSettings,
    sync,
    sheetUrl,
    saveRecord,
    saveMany,
    deleteRecord,
    addCompany,
    updateCompany,
    switchCompany,
    deleteCompany,
    fetchCompanies,
    companiesSync,
    syncNow,
    pushAll,
    replaceData,
    rebuildData,
    nextNum,
    flush,
    storageError,
    failedUploads: failedUploads[activeId] || [],
    retryFailed,
    keyState,
    secureSheet,
    online,
    shareSync,
    publishShares,
    reportSync,
    publishReports,
    unpublishShare,
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

// Convenience lookups
export function useLookups() {
  const { data, company } = useStore();
  return useMemo(() => makeLookups(data, company), [data, company]);
}
