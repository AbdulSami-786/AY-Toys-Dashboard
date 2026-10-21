import { useMemo, useRef, useState } from 'react';
import { Users, Truck, Plus, Pencil, Trash2, FileBarChart, Printer, Download, ChevronDown, Phone, Mail, Share2 } from 'lucide-react';
import { useStore, useLookups } from '../store/store';
import { useWindowKeys } from '../store/windows';
import { useNav } from '../store/nav';
import { useDialog, useContextMenu, Empty } from '../components/ui';
import { usePrint } from '../components/print';
import { NameModal } from './NameModals';
import { ShareLedgerModal } from './ShareLedger';
import { isShared } from '../lib/share';
import { nameInUse } from '../lib/usage';
import { TXN_TYPES } from '../store/defaults';
import { txnTotal, inRange as inRangeSafe } from '../lib/ledger';
import { money, toCSV, downloadFile, num, round2 } from '../lib/format';
import { fmtDate, RANGE_OPTIONS, rangeFor, today, daysBetween } from '../lib/dates';
import { useListNav } from '../components/listnav';

const CUSTOMER_NEW = [
  ['invoice', 'Invoice', 'Ctrl+I'],
  ['salesreceipt', 'Sales Receipt'],
  ['estimate', 'Estimate'],
  ['salesorder', 'Sales Order'],
  ['payment', 'Receive Payment'],
  ['creditmemo', 'Credit Memo / Refund'],
];
const VENDOR_NEW = [
  ['bill', 'Enter Bill'],
  ['paybills', 'Pay Bills'],
  ['check', 'Write Check'],
  ['purchaseorder', 'Purchase Order'],
  ['vendorcredit', 'Bill Credit'],
];

function Statement({ customer, rows, company, L, balance }) {
  const style = company.dateStyle;
  const buckets = [0, 0, 0, 0, 0];
  rows.open.forEach((d) => {
    const age = Math.max(0, daysBetween(d.due, today()));
    const i = d.open < 0 || age <= 0 ? 0 : age <= 30 ? 1 : age <= 60 ? 2 : age <= 90 ? 3 : 4;
    buckets[i] += d.open;
  });
  return (
    <div className="print-doc">
      <div className="pd-head">
        <div>
          <div className="pd-co">{company.legalName || company.name}</div>
          <div style={{ whiteSpace: 'pre-line' }}>{[company.address, company.city, company.phone].filter(Boolean).join('\n')}</div>
        </div>
        <div>
          <div className="pd-title">STATEMENT</div>
          <div style={{ textAlign: 'right' }}>Date: {fmtDate(today(), style)}</div>
        </div>
      </div>
      <div className="pd-boxes">
        <div className="pd-box">
          <b>To</b>
          {customer.billTo || customer.name}
        </div>
        <div className="pd-box" style={{ marginLeft: 'auto', minWidth: 180 }}>
          <b>Amount Due</b>
          <span style={{ fontSize: 18, fontWeight: 700 }}>
            {company.currency} {money(balance)}
          </span>
        </div>
      </div>
      <table className="pd-lines">
        <thead>
          <tr>
            <th>Date</th>
            <th>Transaction</th>
            <th className="r">Amount</th>
            <th className="r">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.ar.map((r, i) => (
            <tr key={i}>
              <td>{fmtDate(r.date, style)}</td>
              <td>
                {TXN_TYPES[r.type]?.label} #{r.num} {r.memo ? '— ' + r.memo : ''}
              </td>
              <td className="r">{money(r.amount)}</td>
              <td className="r">{money(r.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="pd-lines" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th className="r">Current</th>
            <th className="r">1-30 days past due</th>
            <th className="r">31-60</th>
            <th className="r">61-90</th>
            <th className="r">Over 90</th>
            <th className="r">Amount Due</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {buckets.map((b, i) => (
              <td key={i} className="r">
                {money(b)}
              </td>
            ))}
            <td className="r">
              <b>{money(balance)}</b>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function NameCenter({ which }) {
  const isC = which === 'customer';
  const { data, ledger, deleteRecord, saveRecord, company } = useStore();
  const L = useLookups();
  const nav = useNav();
  const dlg = useDialog();
  const print = usePrint();
  const ctx = useContextMenu();
  const list = isC ? data.customers : data.vendors;
  const balMap = isC ? ledger.custBal : ledger.vendBal;
  const [sel, setSel] = useState(list[0]?.id || null);
  const [view, setView] = useState('active');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [tFilter, setTFilter] = useState('All');
  const [range, setRange] = useState('All');
  const [newMenu, setNewMenu] = useState(false);
  const [sharing, setSharing] = useState(null);
  const ref = useRef(null);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return list
      .filter((p) => (view === 'all' ? true : view === 'open' ? Math.abs(balMap.get(p.id) || 0) > 0.004 : p.active !== false))
      .filter((p) => !ql || [p.name, p.phone, p.contact, p.city, p.email].some((x) => String(x || '').toLowerCase().includes(ql)))
      .map((p) => ({ ...p, bal: balMap.get(p.id) || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [list, view, q, balMap]);

  const p = list.find((x) => x.id === sel);
  const { keys, onTypeAhead } = useListNav(rows, sel, setSel, { containerRef: ref });

  const txns = useMemo(() => {
    if (!p) return [];
    const r = rangeFor(range, company.fyMonth) || { from: '', to: '' };
    return data.txns
      .filter((t) => (isC ? t.customerId === p.id : t.vendorId === p.id))
      .filter((t) => tFilter === 'All' || t.type === tFilter || (tFilter === 'open' && ledger.open.get(t.id) > 0.004))
      .filter((t) => inRangeSafe(t.date, r.from, r.to))
      .sort((a, b) => (a.date === b.date ? String(b.createdAt).localeCompare(String(a.createdAt)) : a.date < b.date ? 1 : -1));
  }, [p, data.txns, tFilter, range, isC, ledger, company.fyMonth]);

  const del = async (x) => {
    if (!x) return;
    const used = nameInUse(data, x.id);
    if (used) {
      if (await dlg.confirm(`"${x.name}" is used in ${used} and can't be deleted.\n\nMake inactive instead?`, { ok: 'Make Inactive' }))
        saveRecord(isC ? 'customers' : 'vendors', { ...x, active: false });
      return;
    }
    if (await dlg.confirm(`Delete "${x.name}"?`, { ok: 'Delete', danger: true })) {
      deleteRecord(isC ? 'customers' : 'vendors', x.id);
      setSel(null);
    }
  };

  const newTxn = (type) => nav.open(type, isC ? { prefill: { customerId: p?.id } } : { prefill: { vendorId: p?.id } });

  const printStatement = () => {
    if (!p) return;
    const ar = [];
    let bal = 0;
    ledger.lines
      .filter((l) => l.accountId === ledger.sys.AR && l.nameId === p.id)
      .forEach((l) => {
        bal = round2(bal + l.amount);
        ar.push({ date: l.date, type: l.type, num: l.num, memo: ledger.txnById.get(l.txnId)?.memo, amount: l.amount, balance: bal });
      });
    const open = data.txns
      .filter((t) => t.customerId === p.id && ledger.open.has(t.id) && Math.abs(ledger.open.get(t.id)) > 0.004)
      .map((t) => ({ due: t.dueDate || t.date, open: ledger.open.get(t.id) }));
    print(<Statement customer={p} rows={{ ar, open }} company={company} L={L} balance={balMap.get(p.id) || 0} />);
  };

  const exportCsv = () => {
    const out = [[isC ? 'Customer' : 'Vendor', 'Contact', 'Phone', 'Email', 'City', 'Terms', 'Balance']];
    rows.forEach((r) => out.push([r.name, r.contact, r.phone, r.email, r.city, r.terms, r.bal]));
    downloadFile(`${company.name}_${isC ? 'customers' : 'vendors'}.csv`, toCSV(out), 'text/csv');
  };

  useWindowKeys({
    ...keys,
    enter: () => p && setModal(p),
    'ctrl+n': () => setModal({}),
    'ctrl+e': () => p && setModal(p),
    'ctrl+d': () => del(p),
    'ctrl+q': () => p && nav.report('quickreport', { nameId: p.id }),
    'ctrl+p': () => (isC ? printStatement() : nav.report('vbd', { nameId: p?.id })),
    'ctrl+shift+l': () => p && setSharing(p.id),
  });

  const menu = (x) => [
    { label: `New ${isC ? 'Customer' : 'Vendor'}`, key: 'Ctrl+N', onClick: () => setModal({}) },
    { label: `Edit ${isC ? 'Customer' : 'Vendor'}`, key: 'Ctrl+E', onClick: () => setModal(x) },
    { label: 'Delete', key: 'Ctrl+D', onClick: () => del(x) },
    { label: x.active === false ? 'Make Active' : 'Make Inactive', onClick: () => saveRecord(isC ? 'customers' : 'vendors', { ...x, bal: undefined, active: x.active === false }) },
    '-',
    ...(isC ? CUSTOMER_NEW : VENDOR_NEW).map(([t, l]) => ({ label: l, onClick: () => newTxn(t) })),
    '-',
    { label: 'QuickReport', key: 'Ctrl+Q', onClick: () => nav.report('quickreport', { nameId: x.id }) },
    isC ? { label: 'Print Statement', onClick: printStatement } : { label: 'Vendor Balance Detail', onClick: () => nav.report('vbd', { nameId: x.id }) },
    { label: isShared(x) ? 'Share Ledger (shared)…' : 'Share Ledger…', key: 'Ctrl+Shift+L', onClick: () => setSharing(x.id) },
  ];

  const typeFilters = isC
    ? [['All', 'All Transactions'], ['open', 'Open (unpaid)'], ['invoice', 'Invoices'], ['salesreceipt', 'Sales Receipts'], ['payment', 'Payments'], ['creditmemo', 'Credit Memos'], ['estimate', 'Estimates'], ['salesorder', 'Sales Orders']]
    : [['All', 'All Transactions'], ['open', 'Open Bills'], ['bill', 'Bills'], ['billpayment', 'Bill Payments'], ['check', 'Checks'], ['purchaseorder', 'Purchase Orders'], ['vendorcredit', 'Bill Credits']];

  const Icon = isC ? Users : Truck;
  const totalBal = rows.reduce((s, r) => s + r.bal, 0);
  const overLimit = p && num(p.creditLimit) > 0 && (balMap.get(p.id) || 0) > num(p.creditLimit);

  return (
    <div className="win" onKeyDown={onTypeAhead}>
      <div className="toolbar flat">
        <Icon size={18} />
        <b style={{ fontSize: 15 }}>{isC ? 'Customer Center' : 'Vendor Center'}</b>
        <span className="tb-sep" />
        <button className="btn sm primary" onClick={() => setModal({})}>
          <Plus size={13} /> New {isC ? 'Customer' : 'Vendor'}
        </button>
        <div style={{ position: 'relative' }}>
          <button className="btn sm" onClick={() => setNewMenu((v) => !v)} onBlur={() => setTimeout(() => setNewMenu(false), 150)}>
            New Transactions <ChevronDown size={12} />
          </button>
          {newMenu && (
            <div className="menu-drop" style={{ top: 28 }}>
              {(isC ? CUSTOMER_NEW : VENDOR_NEW).map(([t, l, k]) => (
                <div key={t} className="menu-item" onMouseDown={() => newTxn(t)}>
                  <span>{l}</span>
                  {k && <span className="menu-key">{k}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        {isC && (
          <button className="btn sm" disabled={!p} onClick={printStatement}>
            <Printer size={13} /> Statement
          </button>
        )}
        <button className="btn sm" disabled={!p} onClick={() => nav.report('quickreport', { nameId: p.id })}>
          <FileBarChart size={13} /> QuickReport
        </button>
        <button className="btn sm" disabled={!p} onClick={() => setSharing(p.id)} title="Private view-only link + password for this party (Ctrl+Shift+L)">
          <Share2 size={13} /> Share Ledger
        </button>
        <button className="btn sm" onClick={() => nav.report(isC ? 'cbs' : 'vbs')}>
          {isC ? 'Customer' : 'Vendor'} Balances
        </button>
        <button className="btn sm" onClick={() => nav.report(isC ? 'arsum' : 'apsum')}>
          Aging
        </button>
        <button className="btn sm" onClick={exportCsv} title="Export to Excel (CSV)">
          <Download size={13} />
        </button>
      </div>
      <div className="center" style={{ flex: 1, minHeight: 0 }}>
        <div className="center-left">
          <div className="filter">
            <select value={view} onChange={(e) => setView(e.target.value)}>
              <option value="active">Active {isC ? 'Customers' : 'Vendors'}</option>
              <option value="all">All {isC ? 'Customers' : 'Vendors'}</option>
              <option value="open">With open balances</option>
            </select>
            <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="tbl-wrap" style={{ flex: 1 }} ref={ref}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="r" style={{ width: 120 }}>
                    Balance Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    data-id={r.id}
                    className={(r.id === sel ? 'sel ' : '') + (r.active === false ? 'inactive' : '')}
                    onClick={() => setSel(r.id)}
                    onDoubleClick={() => setModal(r)}
                    onContextMenu={(e) => {
                      setSel(r.id);
                      ctx.show(e, menu(r));
                    }}
                  >
                    <td>
                      {r.name}
                      {isShared(r) && <Share2 size={11} className="shared-ic" aria-label="Ledger shared" />}
                    </td>
                    <td className={'r' + (r.bal < 0 ? ' neg' : '')}>{money(r.bal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{rows.length} names</td>
                  <td className="r">{money(totalBal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div className="center-right">
          {!p ? (
            <Empty icon={<Icon size={30} />}>Select a {which} on the left, or press Ctrl+N / Insert to add one.</Empty>
          ) : (
            <>
              <div className="info-card">
                <div>
                  <h2>
                    {p.name}{' '}
                    <button className="icon-btn" onClick={() => setModal(p)} title="Edit (Ctrl+E)">
                      <Pencil size={14} />
                    </button>
                    {isShared(p) && (
                      <button className="badge pri" style={{ border: 0, cursor: 'pointer', marginLeft: 6, verticalAlign: 2 }} onClick={() => setSharing(p.id)} title="Ledger is shared — click to manage">
                        <Share2 size={10} /> Ledger shared
                      </button>
                    )}
                  </h2>
                  <dl className="kv">
                    <dt>Company</dt>
                    <dd>{p.company || '—'}</dd>
                    <dt>Contact</dt>
                    <dd>{p.contact || '—'}</dd>
                    <dt>
                      <Phone size={11} /> Phone
                    </dt>
                    <dd>{[p.phone, p.altPhone].filter(Boolean).join(' / ') || '—'}</dd>
                    <dt>
                      <Mail size={11} /> Email
                    </dt>
                    <dd>{p.email || '—'}</dd>
                  </dl>
                </div>
                <dl className="kv">
                  <dt>{isC ? 'Bill to' : 'Address'}</dt>
                  <dd>{(isC ? p.billTo : p.address) || p.city || '—'}</dd>
                  <dt>Terms</dt>
                  <dd>{p.terms || '—'}</dd>
                  {isC && (
                    <>
                      <dt>Price level</dt>
                      <dd>{L.lists.priceLevels.find((x) => x.id === p.priceLevelId)?.name || 'Base price'}</dd>
                    </>
                  )}
                  <dt>Credit limit</dt>
                  <dd>{num(p.creditLimit) ? money(p.creditLimit) : '—'}</dd>
                  {p.notes && (
                    <>
                      <dt>Notes</dt>
                      <dd>{p.notes}</dd>
                    </>
                  )}
                </dl>
                <div className="bal-box">
                  <div className="lbl">Open balance</div>
                  <div className={'val' + ((balMap.get(p.id) || 0) < 0 ? ' neg' : '')}>
                    {company.currency} {money(balMap.get(p.id) || 0)}
                  </div>
                  {overLimit && <div className="badge err mt">Over credit limit</div>}
                  <div className="flex mt" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {isC ? (
                      <>
                        <button className="btn sm primary" onClick={() => newTxn('payment')}>
                          Receive Payment
                        </button>
                        <button className="btn sm" onClick={() => newTxn('invoice')}>
                          Invoice
                        </button>
                        <button className="btn sm" onClick={() => setSharing(p.id)}>
                          <Share2 size={12} /> Share Ledger
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn sm primary" onClick={() => newTxn('paybills')}>
                          Pay Bills
                        </button>
                        <button className="btn sm" onClick={() => newTxn('bill')}>
                          Enter Bill
                        </button>
                        <button className="btn sm" onClick={() => setSharing(p.id)}>
                          <Share2 size={12} /> Share Ledger
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="center-txns">
                <div className="toolbar flat">
                  <b>Transactions</b>
                  <span className="sp" />
                  <span className="small muted">Show</span>
                  <select value={tFilter} onChange={(e) => setTFilter(e.target.value)} style={{ width: 170 }}>
                    {typeFilters.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <span className="small muted">Date</span>
                  <select value={range} onChange={(e) => setRange(e.target.value)} style={{ width: 170 }}>
                    {RANGE_OPTIONS.filter((r) => r !== 'Custom').map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div className="tbl-wrap" style={{ flex: 1 }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Num</th>
                        <th>Date</th>
                        <th>{isC ? 'Due / Ref' : 'Due Date'}</th>
                        <th>Memo</th>
                        <th>Status</th>
                        <th className="r">Open Balance</th>
                        <th className="r">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txns.map((t) => {
                        const open = ledger.open.get(t.id);
                        const posting = TXN_TYPES[t.type]?.posting;
                        const status = t.voided
                          ? 'Void'
                          : !posting
                            ? t.closed
                              ? 'Closed'
                              : 'Open'
                            : open === undefined
                              ? ''
                              : Math.abs(open) < 0.005
                                ? 'Paid'
                                : open < 0
                                  ? 'Credit'
                                  : (t.dueDate || t.date) < today()
                                    ? 'Overdue'
                                    : 'Open';
                        return (
                          <tr key={t.id} className={t.voided ? 'voided' : ''} onDoubleClick={() => nav.openTxn(t)}>
                            <td>{TXN_TYPES[t.type]?.label}</td>
                            <td>{t.num}</td>
                            <td>{fmtDate(t.date, company.dateStyle)}</td>
                            <td>{fmtDate(t.dueDate, company.dateStyle) || t.poNumber || ''}</td>
                            <td className="muted">{t.memo}</td>
                            <td>
                              {status && (
                                <span className={'badge ' + (status === 'Paid' || status === 'Closed' ? 'ok' : status === 'Overdue' ? 'err' : status === 'Void' ? '' : 'warn')}>{status}</span>
                              )}
                            </td>
                            <td className="r">{open !== undefined ? money(open) : ''}</td>
                            <td className="r">{money(txnTotal(t, ledger))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!txns.length && <Empty>No transactions for this filter.</Empty>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {modal && (
        <NameModal
          which={which}
          initial={modal.id ? (({ bal, ...r }) => r)(modal) : undefined}
          onClose={() => setModal(null)}
          onSaved={(x) => setSel(x.id)}
        />
      )}
      {sharing && <ShareLedgerModal which={which} partyId={sharing} onClose={() => setSharing(null)} />}
      {ctx.node}
    </div>
  );
}
