import { useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useStore, useLookups } from '../store/store';
import { useWindowKeys } from '../store/windows';
import { useNav } from '../store/nav';
import { useOptions } from '../store/options';
import Combo from '../components/Combo';
import { Field, DateInput, MoneyInput, Select } from '../components/inputs';
import { useListNav } from '../components/listnav';
import { TXN_TYPES } from '../store/defaults';
import { txnTotal, inRange } from '../lib/ledger';
import { money, num } from '../lib/format';
import { fmtDate } from '../lib/dates';

export default function Find({ q: q0 = '', type: type0 = '' }) {
  const { data, ledger, company } = useStore();
  const L = useLookups();
  const O = useOptions();
  const nav = useNav();
  const [q, setQ] = useState(q0);
  const [type, setType] = useState(type0 || '');
  const [nameId, setNameId] = useState('');
  const [itemId, setItemId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [sel, setSel] = useState(null);
  const ref = useRef(null);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return data.txns
      .filter((t) => !type || t.type === type)
      .filter((t) => !nameId || t.customerId === nameId || t.vendorId === nameId)
      .filter((t) => !itemId || [...(t.lines || []), ...(t.itemLines || [])].some((l) => l.itemId === itemId))
      .filter((t) => inRange(t.date, from, to))
      .filter((t) => amount === '' || Math.abs(txnTotal(t, ledger) - num(amount)) < 0.01)
      .filter((t) => {
        if (!ql) return true;
        const hay = [
          t.num,
          t.memo,
          t.poNumber,
          t.ref,
          L.nameOf(t.customerId || t.vendorId),
          TXN_TYPES[t.type]?.label,
          String(txnTotal(t, ledger)),
          ...(t.lines || []).map((l) => l.description),
          ...(t.itemLines || []).map((l) => l.description),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(ql);
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 500);
  }, [data.txns, q, type, nameId, itemId, from, to, amount, ledger, L]);

  // also search names & items (simple find)
  const names = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (ql.length < 2) return [];
    return [
      ...data.customers.filter((c) => c.name.toLowerCase().includes(ql) || String(c.phone || '').includes(ql)).map((c) => ({ kind: 'Customer', id: c.id, name: c.name })),
      ...data.vendors.filter((c) => c.name.toLowerCase().includes(ql) || String(c.phone || '').includes(ql)).map((c) => ({ kind: 'Vendor', id: c.id, name: c.name })),
      ...data.items.filter((i) => [i.name, i.sku, i.barcode].some((x) => String(x || '').toLowerCase().includes(ql))).map((i) => ({ kind: 'Item', id: i.id, name: i.name })),
    ].slice(0, 12);
  }, [q, data]);

  const { keys } = useListNav(rows, sel, setSel, { containerRef: ref });
  useWindowKeys({ ...keys, enter: () => sel && nav.openTxn(sel) });

  return (
    <div className="win">
      <div className="win-title">
        <Search size={20} />
        <h1>Find</h1>
        <span className="sub">{rows.length} matching transactions</span>
      </div>
      <div className="report-toolbar">
        <Field label="Search text (number, memo, name, amount…)" style={{ width: 280 }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <Field label="Transaction type" style={{ width: 170 }}>
          <Select value={type} onChange={setType} options={[{ value: '', label: 'All types' }, ...Object.entries(TXN_TYPES).map(([k, v]) => ({ value: k, label: v.label }))]} />
        </Field>
        <Field label="Name" style={{ width: 200 }}>
          <Combo value={nameId} onChange={setNameId} options={[{ id: '', label: '(any)' }, ...O.nameOpts]} />
        </Field>
        <Field label="Item" style={{ width: 180 }}>
          <Combo value={itemId} onChange={setItemId} options={[{ id: '', label: '(any)' }, ...O.itemOpts]} />
        </Field>
        <Field label="From" style={{ width: 125 }}>
          <DateInput value={from} onChange={setFrom} />
        </Field>
        <Field label="To" style={{ width: 125 }}>
          <DateInput value={to} onChange={setTo} />
        </Field>
        <Field label="Amount" style={{ width: 120 }}>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <button
          className="btn sm"
          onClick={() => {
            setQ('');
            setType('');
            setNameId('');
            setItemId('');
            setFrom('');
            setTo('');
            setAmount('');
          }}
        >
          Reset
        </button>
      </div>
      {names.length > 0 && (
        <div className="toolbar flat" style={{ flexWrap: 'wrap' }}>
          <span className="small muted">Lists:</span>
          {names.map((n) => (
            <button
              key={n.kind + n.id}
              className="btn sm"
              onClick={() => (n.kind === 'Item' ? nav.report('quickreport', { itemId: n.id }) : nav.report('quickreport', { nameId: n.id }))}
            >
              <span className="badge">{n.kind}</span> {n.name}
            </button>
          ))}
        </div>
      )}
      <div className="win-body tbl-wrap" ref={ref}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Type</th>
              <th>Num</th>
              <th>Date</th>
              <th>Name</th>
              <th>Memo</th>
              <th className="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} data-id={t.id} className={(t.id === sel ? 'sel ' : '') + (t.voided ? 'voided' : '')} onClick={() => setSel(t.id)} onDoubleClick={() => nav.openTxn(t)}>
                <td>{TXN_TYPES[t.type]?.label}</td>
                <td>{t.num}</td>
                <td>{fmtDate(t.date, company.dateStyle)}</td>
                <td>{L.nameOf(t.customerId || t.vendorId)}</td>
                <td className="muted">{t.memo}</td>
                <td className="r">{money(txnTotal(t, ledger))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
