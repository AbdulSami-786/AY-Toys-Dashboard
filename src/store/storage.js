// Where each company's books are kept on this computer.
// IndexedDB (the browser's database — hundreds of MB) instead of localStorage (about 5 MB, which a busy
// wholesaler fills within a year). Older copies in localStorage are moved over the first time they are read.
// Every write checks the tab lock, so a tab that lost it can never overwrite the books.

import { isWriter } from './tabLock';

const DB = 'aytoys';
const STORE = 'kv';
const idbKey = (id) => 'data.' + id;
const lsKey = (id) => 'ay.data.' + id;

let dbPromise = null;
function openDb() {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available'));
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB is blocked'));
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  return dbPromise;
}
async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    let result;
    if (req) req.onsuccess = () => (result = req.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || req?.error);
    tx.onabort = () => reject(tx.error || new Error('Write cancelled'));
  });
}

// stored as { savedAt, data } so the newest copy wins if both places have one
const wrap = (data) => ({ savedAt: Date.now(), data });
const unwrapLs = (raw) => {
  if (!raw) return null;
  const v = JSON.parse(raw);
  return v && v.savedAt && v.data ? v : { savedAt: 0, data: v }; // older versions stored the data itself
};

export async function getData(id) {
  if (!id) return null;
  let fromIdb = null;
  try {
    fromIdb = await idb('readonly', (s) => s.get(idbKey(id)));
  } catch {
    fromIdb = null;
  }
  let fromLs = null;
  try {
    fromLs = unwrapLs(localStorage.getItem(lsKey(id)));
  } catch {
    fromLs = null;
  }
  const best = fromIdb && (!fromLs || fromIdb.savedAt >= fromLs.savedAt) ? fromIdb : fromLs;
  // move a localStorage copy into IndexedDB (frees the small localStorage space)
  if (fromLs && best === fromLs && isWriter()) {
    const r = await setData(id, fromLs.data);
    if (r.ok && r.where === 'idb') localStorage.removeItem(lsKey(id));
  } else if (fromLs && best === fromIdb && isWriter()) {
    localStorage.removeItem(lsKey(id));
  }
  return best ? best.data : null;
}

/** → { ok: true, where: 'idb' | 'ls' } | { ok: false, error } | { ok: false, skipped: true } (not this tab's turn) */
export async function setData(id, data) {
  if (!isWriter()) return { ok: false, skipped: true };
  const rec = wrap(data);
  try {
    await idb('readwrite', (s) => s.put(rec, idbKey(id)));
    return { ok: true, where: 'idb' };
  } catch (e) {
    try {
      // no IndexedDB here (e.g. some private windows): fall back to localStorage
      localStorage.setItem(lsKey(id), JSON.stringify(rec));
      return { ok: true, where: 'ls' };
    } catch (e2) {
      return { ok: false, error: e2 || e };
    }
  }
}

export async function delData(id) {
  if (!isWriter()) return;
  try {
    await idb('readwrite', (s) => s.delete(idbKey(id)));
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(lsKey(id));
  } catch {
    /* ignore */
  }
}

// move every company still kept in localStorage
export async function migrateAll() {
  const ids = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('ay.data.')) ids.push(k.slice(8));
    }
  } catch {
    return;
  }
  for (const id of ids) await getData(id);
}
