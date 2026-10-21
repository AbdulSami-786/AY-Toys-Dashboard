import { useEffect, useMemo, useState } from 'react';
import { Plus, Building2, Trash2, Pencil, LogIn, RefreshCw, Cloud, CloudOff, AlertCircle, ChevronRight, Store, LayoutGrid, BarChart3 } from 'lucide-react';
import { useStore } from '../store/store';
import { SHEET, SHEET_READY } from '../config';
import { sheets } from '../store/sheets';
import { usePerm, useUsers } from '../store/users';
import { getData } from '../store/storage';
import { buildLedger } from '../lib/ledger';
import { PERIODS, periodRange, shopStats, SUMMARY_FIELDS, profitAndLoss, balanceSheet, salesByMonth } from '../lib/shopStats';
import { Modal, useDialog } from '../components/ui';
import { Field } from '../components/inputs';
import ThemePicker from '../components/ThemePicker';
import { today } from '../lib/dates';

const initials = (n) =>
  (n || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

export function CompanyModal({ initial, onClose, onSave, isNew }) {
  const [f, setF] = useState(
    initial || {
      name: '',
      legalName: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      ntn: '',
      currency: 'Rs',
      theme: { preset: 'qb', primary: '#2ca01c', mode: 'light' },
      sample: false,
    },
  );
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });
  const submit = (e) => {
    e?.preventDefault();
    if (!f.name.trim()) return;
    onSave({ ...f, name: f.name.trim(), legalName: f.legalName || f.name.trim() });
  };
  return (
    <Modal
      title={isNew ? 'Add Company' : 'Edit Company'}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={!f.name.trim()}>
            {isNew ? 'Create Company' : 'Save'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <div className="grid2">
          <Field label="Company name *">
            <input autoFocus value={f.name} onChange={set('name')} placeholder="e.g. AY Toys Karachi" />
          </Field>
          <Field label="Legal name">
            <input value={f.legalName} onChange={set('legalName')} placeholder="Same as company name" />
          </Field>
          <Field label="Phone">
            <input value={f.phone} onChange={set('phone')} />
          </Field>
          <Field label="Email">
            <input value={f.email} onChange={set('email')} />
          </Field>
          <Field label="Address">
            <input value={f.address} onChange={set('address')} />
          </Field>
          <Field label="City">
            <input value={f.city} onChange={set('city')} />
          </Field>
          <Field label="NTN / Tax ID">
            <input value={f.ntn} onChange={set('ntn')} />
          </Field>
          <Field label="Currency symbol">
            <input value={f.currency} onChange={set('currency')} style={{ width: 90 }} />
          </Field>
        </div>
        <div className="section-title">Theme for this company</div>
        <ThemePicker theme={f.theme} onChange={set('theme')} name={f.name || 'Company'} />
        {isNew && (
          <>
            <div className="section-title">Start with</div>
            <label className="check">
              <input type="checkbox" checked={f.sample} onChange={set('sample')} />
              Load sample toy-wholesale data (customers, vendors, items, invoices, bills) — good for trying things out
            </label>
          </>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ---------------- start screen data ----------------
// Books of shops other than the open one are read from this computer's database once per session.
const booksCache = new Map(); // companyId → { data, ledger } | null (not on this computer)
const pause = () => new Promise((r) => setTimeout(r, 0));

function useShopBooks(companies, company, data, ledger, nonce) {
  const [books, setBooks] = useState({});
  const ids = companies.map((c) => c.id).join(',');
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const c of companies) {
        if (!alive) return;
        if (c.id === company?.id && data && ledger) {
          setBooks((b) => (b[c.id]?.ledger === ledger ? b : { ...b, [c.id]: { data, ledger } }));
          continue;
        }
        if (!booksCache.has(c.id)) {
          await pause();
          const d = await getData(c.id);
          await pause();
          booksCache.set(c.id, d && Array.isArray(d.txns) ? { data: d, ledger: buildLedger(d) } : null);
        }
        if (alive) setBooks((b) => ({ ...b, [c.id]: booksCache.get(c.id) }));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, company?.id, data, ledger, nonce]);
  return books;
}

function useSheetSummaries(nonce) {
  const [list, setList] = useState({});
  useEffect(() => {
    if (!SHEET_READY) return;
    let alive = true;
    sheets
      .listSummaries(SHEET)
      .then((rows) => alive && setList(Object.fromEntries(rows.map((r) => [r.id, r]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [nonce]);
  return list;
}

const whole = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const amount = (n, cur) => (n < 0 ? '-' : '') + (cur ? cur + ' ' : '') + whole(Math.abs(n));

// ---------------- the start screen ----------------
const START_TABS = [
  { id: 'shops', label: 'Shops', short: 'Shops', icon: Store },
  { id: 'summary', label: 'All Shops Summary', short: 'Summary', icon: LayoutGrid },
  { id: 'reports', label: 'All Shops Reports', short: 'Reports', icon: BarChart3 },
];
const REPORTS = [
  { id: 'pl', label: 'Profit & Loss' },
  { id: 'bs', label: 'Balance Sheet' },
  { id: 'months', label: 'Sales by Month' },
];

const remember = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};
const recall = (k, d) => {
  try {
    return localStorage.getItem(k) || d;
  } catch {
    return d;
  }
};

export default function Companies({ fullscreen, create, onOpen }) {
  const { companies: allCompanies, company, data, ledger, addCompany, updateCompany, switchCompany, deleteCompany, fetchCompanies, companiesSync } = useStore();
  const perm = usePerm();
  const { logout } = useUsers() || {};
  // a user sees only their shops; figures and the All Shops tabs need their own permission
  const companies = allCompanies.filter((c) => perm.canShop(c.id));
  const figuresOk = perm.can('shops:figures');
  const dlg = useDialog();
  const [modal, setModal] = useState(create ? { isNew: true } : null);
  const [tabPick, setTabState] = useState(() => recall('ay.startTab', 'shops'));
  const tab = figuresOk ? tabPick : 'shops';
  const [period, setPeriodState] = useState(() => recall('ay.startPeriod', 'month'));
  const [report, setReportState] = useState(() => recall('ay.startReport', 'pl'));
  const [nonce, setNonce] = useState(0);
  const setTab = (v) => (setTabState(v), remember('ay.startTab', v));
  const setPeriod = (v) => (setPeriodState(v), remember('ay.startPeriod', v));
  const setReport = (v) => (setReportState(v), remember('ay.startReport', v));
  const books = useShopBooks(companies, company, data, ledger, nonce);
  const remote = useSheetSummaries(nonce);

  const save = (f) => {
    const { sample, ...info } = f;
    if (modal.isNew) {
      addCompany(info, { sample });
      dlg.toast(`Shop "${f.name}" created`);
      onOpen?.();
    } else {
      updateCompany(modal.initial.id, info);
      dlg.toast('Shop updated');
    }
    setModal(null);
  };

  const open = (c) => {
    if (company?.id !== c.id) switchCompany(c.id);
    onOpen?.();
  };

  const remove = async (c) => {
    const ok = await dlg.confirm(
      `Delete shop "${c.name}"?\n\nAll of its local data will be removed from this computer. Its tabs in the Google Sheet are kept (delete them manually if you want).`,
      { ok: 'Delete', danger: true },
    );
    if (ok) {
      booksCache.delete(c.id);
      deleteCompany(c.id);
    }
  };

  const reload = async () => {
    booksCache.clear();
    setNonce((n) => n + 1);
    if (!SHEET_READY) return;
    try {
      const n = (await fetchCompanies()).length;
      dlg.toast(n ? `${n} shop${n === 1 ? '' : 's'} in the Google Sheet` : 'No shops in the Google Sheet yet');
    } catch (e) {
      dlg.alert('Could not load shops from the Google Sheet:\n\n' + e.message);
    }
  };

  // each shop's figures for the chosen period: from its books here, else from the Google Sheet
  const figures = useMemo(() => {
    const out = {};
    for (const c of companies) {
      const b = books[c.id];
      if (b) out[c.id] = { ...shopStats(b, periodRange(period, c.fyMonth || 1)), source: 'here' };
      else if (remote[c.id]?.summary?.[period]) out[c.id] = { ...remote[c.id].summary[period], source: 'sheet', at: remote[c.id].at };
      else out[c.id] = b === null ? { source: 'none' } : { source: 'loading' };
    }
    return out;
  }, [companies, books, remote, period]);

  const periods = (
    <div className="st-chips" role="radiogroup" aria-label="Period">
      {PERIODS.map((p) => (
        <button key={p.id} type="button" role="radio" aria-checked={period === p.id} className={'st-chip' + (period === p.id ? ' on' : '')} onClick={() => setPeriod(p.id)}>
          {p.label}
        </button>
      ))}
    </div>
  );

  const shopsTab = (
    <>
      <div className="st-bar">
        {figuresOk && periods}
        <button className="btn sm st-reload" onClick={reload} title="Recalculate and reload the shop list from the Google Sheet">
          <RefreshCw size={14} className={companiesSync.status === 'loading' ? 'spin' : ''} /> <span>Refresh</span>
        </button>
      </div>
      <div className="st-shops">
        {companies.map((c) => (
          <ShopCard
            key={c.id}
            c={c}
            f={figuresOk ? figures[c.id] : null}
            current={company?.id === c.id}
            period={period}
            onOpen={() => open(c)}
            onEdit={perm.admin ? () => setModal({ initial: c }) : null}
            onDelete={perm.admin ? () => remove(c) : null}
          />
        ))}
        {!companies.length && <div className="empty">No shop has been given to you yet. Ask the Super Admin.</div>}
        {perm.admin && (
        <button className="st-add" onClick={() => setModal({ isNew: true })}>
          <Plus size={24} />
          <b>Add Shop</b>
          <span className="muted small">Each shop has its own books &amp; theme</span>
        </button>
        )}
      </div>
      <div className="st-sheet">
        {!SHEET_READY ? (
          <span className="small muted">
            <CloudOff size={13} /> No Google Sheet is set up in this build, so shops are saved on this computer only (see the README).
          </span>
        ) : companiesSync.status === 'error' ? (
          <span className="small neg">
            <AlertCircle size={13} /> {companiesSync.message}
          </span>
        ) : (
          <span className="small muted">
            <Cloud size={13} /> All shops are kept in one Google Sheet — every computer sees the same list.
          </span>
        )}
      </div>
    </>
  );

  const list = (
    <div className="st">
      <div className="st-tabs" role="tablist">
        {START_TABS.filter((t) => figuresOk || t.id === 'shops').map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={'st-tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
            <t.icon size={16} /> <span className="full">{t.label}</span>
            <span className="short">{t.short}</span>
          </button>
        ))}
      </div>
      <div className="st-panel" key={tab}>
        {tab === 'shops' && shopsTab}
        {tab === 'summary' && <SummaryTab companies={companies} figures={figures} periods={periods} period={period} onOpen={open} />}
        {tab === 'reports' && <ReportsTab companies={companies} books={books} report={report} setReport={setReport} periods={periods} period={period} />}
      </div>
    </div>
  );

  const m = modal && <CompanyModal initial={modal.initial} isNew={modal.isNew} onClose={() => setModal(null)} onSave={save} />;

  if (fullscreen)
    return (
      <div className="welcome">
        <div className="welcome-card">
          <div className="welcome-head">
            <div className="brand-logo">AY</div>
            <div>
              <h1>AY Toys</h1>
              <p>Pick a shop to open, or compare all of them.</p>
            </div>
            {logout && (
              <button className="btn welcome-back st-logout" onClick={logout} title={perm.me ? 'Logged in as ' + perm.me.name : ''}>
                Log out
              </button>
            )}
            {company && onOpen && perm.canShop(company.id) && (
              <button className="btn welcome-back" onClick={onOpen}>
                Continue in {company.name} <ChevronRight size={15} />
              </button>
            )}
          </div>
          <div className="welcome-body">{list}</div>
        </div>
        {m}
      </div>
    );

  return (
    <div className="win">
      <div className="win-title">
        <Building2 size={20} />
        <h1>Shops</h1>
        <span className="sub">
          {companies.length} shop{companies.length === 1 ? '' : 's'}
        </span>
        {perm.admin && (
          <button className="btn primary sp" onClick={() => setModal({ isNew: true })}>
            <Plus size={14} /> Add Shop
          </button>
        )}
      </div>
      <div className="win-body pad">{list}</div>
      {m}
    </div>
  );
}

function ShopCard({ c, f, current, period, onOpen, onEdit, onDelete }) {
  const cur = c.currency || 'Rs';
  const color = c.theme?.primary || '#2ca01c';
  const ready = f && (f.source === 'here' || f.source === 'sheet');
  const tile = (label, v, cls = '', sub = '') => (
    <div className={'st-kpi ' + cls}>
      <span className="k">{label}</span>
      <span className="v">{ready ? amount(v, cur) : f?.source === 'loading' ? <span className="st-skel" /> : '—'}</span>
      {sub && <span className="s">{sub}</span>}
    </div>
  );
  const periodLabel = PERIODS.find((p) => p.id === period)?.label || '';
  return (
    <div className={'st-card' + (current ? ' current' : '')} style={{ '--shop': color }}>
      <button className="st-card-head" onClick={onOpen} title={'Open ' + c.name}>
        <span className="ini">{initials(c.name)}</span>
        <span className="nm">
          <b>{c.name}</b>
          <span>{[c.city || c.address, current ? 'Open now' : ''].filter(Boolean).join(' · ') || ' '}</span>
        </span>
        <ChevronRight size={20} />
      </button>
      {f && (
      <div className="st-kpis">
        {tile('Sales · ' + periodLabel, f?.sales, 'sales', ready && f.salesCount !== undefined ? `${f.salesCount} sale${f.salesCount === 1 ? '' : 's'}` : '')}
        {tile('Expenses', f?.expenses, 'exp')}
        {tile('Net profit', f?.netProfit, ready && f.netProfit < 0 ? 'loss' : 'profit')}
        {tile('Cash in hand', f?.cashInHand, 'cash', ready && f.notDeposited ? `incl. ${amount(f.notDeposited, cur)} not deposited` : 'today')}
      </div>
      )}
      {f?.source === 'sheet' && <div className="st-src">From the Google Sheet · updated {new Date(f.at).toLocaleString()}</div>}
      {f?.source === 'none' && <div className="st-src">Open this shop once on this computer to see its figures.</div>}
      <div className="st-card-foot">
        <button className="btn primary" onClick={onOpen}>
          <LogIn size={15} /> {current ? 'Continue' : 'Open shop'}
        </button>
        {onEdit && (
          <button className="btn" onClick={onEdit}>
            <Pencil size={14} /> Edit
          </button>
        )}
        {onDelete && (
          <button className="btn ghost st-del" onClick={onDelete} title="Delete shop" aria-label={'Delete ' + c.name}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function SummaryTab({ companies, figures, periods, period, onOpen }) {
  const shops = companies.filter((c) => figures[c.id]?.source === 'here' || figures[c.id]?.source === 'sheet');
  const missing = companies.filter((c) => !shops.includes(c));
  const cur = companies[0]?.currency || 'Rs';
  const total = (k) => shops.reduce((s, c) => s + (Number(figures[c.id][k]) || 0), 0);
  const periodLabel = PERIODS.find((p) => p.id === period)?.label || '';
  return (
    <>
      <div className="st-bar">{periods}</div>
      <div className="st-totals">
        {[
          ['Total sales', 'sales', 'sales'],
          ['Total expenses', 'expenses', 'exp'],
          ['Net profit', 'netProfit', total('netProfit') < 0 ? 'loss' : 'profit'],
          ['Cash in hand', 'cashInHand', 'cash'],
        ].map(([label, k, cls]) => (
          <div key={k} className={'st-kpi big ' + cls}>
            <span className="k">{label}</span>
            <span className="v">{amount(total(k), cur)}</span>
            <span className="s">{k === 'cashInHand' ? 'all shops, today' : `all shops · ${periodLabel}`}</span>
          </div>
        ))}
      </div>
      <ShopTable
        cols={shops.map((c) => ({ id: c.id, label: c.name, onClick: () => onOpen(c) }))}
        rows={SUMMARY_FIELDS.map((f) => ({
          kind: f.strong ? 'strong' : 'row',
          label: f.label,
          values: shops.map((c) => figures[c.id][f.key]),
          total: total(f.key),
        }))}
        cur={cur}
        note={
          [
            'Sales, costs and profit: ' + periodLabel.toLowerCase() + '. Cash, bank, receivables, payables and stock: today.',
            missing.length ? `Not included (not on this computer and not in the Google Sheet yet): ${missing.map((c) => c.name).join(', ')}.` : '',
          ]
            .filter(Boolean)
            .join(' ')
        }
      />
    </>
  );
}

function ReportsTab({ companies, books, report, setReport, periods, period }) {
  const shops = companies.filter((c) => books[c.id]).map((c) => ({ ...c, company: c, books: books[c.id] }));
  const missing = companies.filter((c) => !books[c.id]);
  const cur = companies[0]?.currency || 'Rs';
  const rows = useMemo(() => {
    if (!shops.length) return [];
    if (report === 'bs') return balanceSheet(shops, today());
    if (report === 'months') return salesByMonth(shops, periodRange('year', shops[0].fyMonth || 1));
    return profitAndLoss(shops, (s) => periodRange(period, s.fyMonth || 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shops.map((s) => s.id + (s.books.ledger ? 1 : 0)).join(), books, report, period]);
  const periodLabel = PERIODS.find((p) => p.id === period)?.label || '';
  const subtitle = report === 'bs' ? 'As of today' : report === 'months' ? 'This year, month by month' : periodLabel;
  return (
    <>
      <div className="st-bar">
        <div className="st-seg" role="tablist" aria-label="Report">
          {REPORTS.map((r) => (
            <button key={r.id} type="button" role="tab" aria-selected={report === r.id} className={report === r.id ? 'on' : ''} onClick={() => setReport(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        {report === 'pl' && periods}
      </div>
      <div className="st-rep-title">
        <b>{REPORTS.find((r) => r.id === report)?.label} — All Shops</b>
        <span className="muted">{subtitle}</span>
      </div>
      {shops.length ? (
        <ShopTable cols={shops.map((s) => ({ id: s.id, label: s.name }))} rows={rows} cur={cur} note={missing.length ? `Not included (books not on this computer yet — open each once): ${missing.map((c) => c.name).join(', ')}.` : ''} />
      ) : (
        <div className="empty">{companies.length ? 'Loading the books…' : 'Add a shop to see reports.'}</div>
      )}
    </>
  );
}

// Rows × shops table with a Total column. The first column stays put while the shops scroll sideways (phones).
function ShopTable({ cols, rows, cur, note }) {
  return (
    <>
      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th />
              {cols.map((c) => (
                <th key={c.id} className="n">
                  {c.onClick ? (
                    <button className="linkish" onClick={c.onClick} title={'Open ' + c.label}>
                      {c.label}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              {cols.length > 1 && <th className="n tot">Total</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) =>
              r.kind === 'section' ? (
                <tr key={i} className="k-section">
                  <td colSpan={cols.length + 2}>{r.label}</td>
                </tr>
              ) : (
                <tr key={i} className={'k-' + r.kind}>
                  <td>{r.label}</td>
                  {r.values.map((v, j) => (
                    <td key={j} className={'n' + (v < 0 ? ' neg' : '')}>
                      {amount(v, '')}
                    </td>
                  ))}
                  {cols.length > 1 && <td className={'n tot' + (r.total < 0 ? ' neg' : '')}>{amount(r.total, '')}</td>}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <div className="st-note">
        Amounts in {cur}, rounded to whole {cur === 'Rs' ? 'rupees' : 'units'}. {note}
      </div>
    </>
  );
}
