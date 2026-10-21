import { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { useStore, useLookups } from '../store/store';
import { useNav } from '../store/nav';
import { TXN_TYPES } from '../store/defaults';
import { money, round2 } from '../lib/format';
import { fmtDate, today, addDays } from '../lib/dates';

// Income Tracker / Bill Tracker: colored summary bands + filterable list
export default function Tracker({ kind = 'income' }) {
  const { data, ledger, company } = useStore();
  const L = useLookups();
  const nav = useNav();
  const isIncome = kind === 'income';
  const [filter, setFilter] = useState('open');
  const t = today();
  const docs = useMemo(() => {
    const types = isIncome ? ['invoice', 'estimate', 'salesorder', 'payment', 'salesreceipt'] : ['bill', 'purchaseorder', 'billpayment', 'check'];
    return data.txns
      .filter((x) => types.includes(x.type) && !x.voided)
      .map((x) => {
        const open = ledger.open.get(x.id);
        let status = '';
        if (x.type === 'invoice' || x.type === 'bill') status = (open || 0) > 0.004 ? ((x.dueDate || x.date) < t ? 'overdue' : 'open') : 'paid';
        else if (['estimate', 'salesorder', 'purchaseorder'].includes(x.type)) status = x.closed ? 'closed' : 'unbilled';
        else status = 'paid';
        return { x, open, status };
      })
      .sort((a, b) => (a.x.date < b.x.date ? 1 : -1));
  }, [data.txns, ledger, isIncome, t]);

  const sum = (fn) => round2(docs.filter(fn).reduce((s, d) => s + (d.open ?? d.x.total ?? d.x.amount ?? 0), 0));
  const recentPaid = (d) => d.status === 'paid' && ['payment', 'salesreceipt', 'billpayment', 'check'].includes(d.x.type) && d.x.date >= addDays(t, -30);
  const bands = [
    ['unbilled', isIncome ? 'Estimates & Sales Orders' : 'Purchase Orders', sum((d) => d.status === 'unbilled'), 'var(--series-1)'],
    ['open', isIncome ? 'Open Invoices' : 'Open Bills', sum((d) => d.status === 'open'), 'var(--warn)'],
    ['overdue', 'Overdue', sum((d) => d.status === 'overdue'), 'var(--danger)'],
    ['paid', 'Paid last 30 days', round2(docs.filter(recentPaid).reduce((s, d) => s + (d.x.amount ?? d.x.total ?? 0), 0)), 'var(--ok)'],
  ];
  const rows = docs.filter((d) => (filter === 'all' ? true : filter === 'open' ? d.status === 'open' || d.status === 'overdue' : filter === 'paid' ? recentPaid(d) : d.status === filter));

  return (
    <div className="win">
      <div className="win-title">
        <Activity size={20} />
        <h1>{isIncome ? 'Income Tracker' : 'Bill Tracker'}</h1>
      </div>
      <div className="pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, paddingBottom: 6 }}>
        {bands.map(([k, label, v, c]) => (
          <button key={k} className="kpi" onClick={() => setFilter(k)} style={{ borderTop: `4px solid ${c}`, outline: filter === k ? '2px solid var(--primary)' : 'none' }}>
            <div className="val">
              {company.currency} {money(v)}
            </div>
            <div className="lbl">{label}</div>
          </button>
        ))}
      </div>
      <div className="toolbar flat">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 200 }}>
          <option value="open">Open + overdue</option>
          <option value="overdue">Overdue</option>
          <option value="unbilled">{isIncome ? 'Unbilled (estimates / SO)' : 'Purchase orders'}</option>
          <option value="paid">Paid (30 days)</option>
          <option value="all">All</option>
        </select>
      </div>
      <div className="win-body tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{isIncome ? 'Customer' : 'Vendor'}</th>
              <th>Type</th>
              <th>Number</th>
              <th>Date</th>
              <th>Due Date</th>
              <th className="r">Amount</th>
              <th className="r">Open Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ x, open, status }) => (
              <tr key={x.id} onDoubleClick={() => nav.openTxn(x)}>
                <td>{L.nameOf(x.customerId || x.vendorId)}</td>
                <td>{TXN_TYPES[x.type]?.label}</td>
                <td>{x.num}</td>
                <td>{fmtDate(x.date, company.dateStyle)}</td>
                <td>{fmtDate(x.dueDate, company.dateStyle)}</td>
                <td className="r">{money(x.total ?? x.amount)}</td>
                <td className="r">{open !== undefined ? money(open) : ''}</td>
                <td>
                  <span className={'badge ' + (status === 'overdue' ? 'err' : status === 'open' || status === 'unbilled' ? 'warn' : 'ok')}>{status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
