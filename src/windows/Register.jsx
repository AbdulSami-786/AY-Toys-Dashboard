import { useMemo, useRef, useState } from 'react';
import { List } from 'lucide-react';
import { useStore, useLookups } from '../store/store';
import { useWindows, useWindowKeys } from '../store/windows';
import { useNav } from '../store/nav';
import { useOptions } from '../store/options';
import Combo from '../components/Combo';
import { useListNav } from '../components/listnav';
import { DEBIT_NORMAL, TXN_TYPES } from '../store/defaults';
import { money, round2 } from '../lib/format';
import { fmtDate } from '../lib/dates';

const COLS = {
  Bank: ['Payment', 'Deposit'],
  'Credit Card': ['Charge', 'Payment'],
  'Accounts Receivable': ['Charge', 'Payment'],
  'Accounts Payable': ['Billed', 'Paid'],
};

export default function Register({ accountId: initial, winId }) {
  const { ledger, company } = useStore();
  const L = useLookups();
  const O = useOptions();
  const nav = useNav();
  const { setTitle } = useWindows();
  const [accountId, setAccountId] = useState(initial);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const ref = useRef(null);
  const acc = L.accountMap.get(accountId);
  const debitNormal = acc && DEBIT_NORMAL.has(acc.type);
  // "decrease" column first like QuickBooks bank registers
  const [decLabel, incLabel] = COLS[acc?.type] || (debitNormal ? ['Decrease', 'Increase'] : ['Increase', 'Decrease']);

  const rows = useMemo(() => {
    if (!acc) return [];
    let bal = 0;
    const byTxn = new Map();
    ledger.lines.forEach((l) => {
      if (!byTxn.has(l.txnId)) byTxn.set(l.txnId, []);
      byTxn.get(l.txnId).push(l);
    });
    const out = [];
    for (const l of ledger.lines) {
      if (l.accountId !== accountId) continue;
      const v = debitNormal ? l.amount : -l.amount;
      bal = round2(bal + v);
      const others = [...new Set((byTxn.get(l.txnId) || []).filter((x) => x.accountId !== accountId).map((x) => x.accountId))];
      const t = ledger.txnById.get(l.txnId);
      out.push({
        id: l.txnId + ':' + out.length,
        txnId: l.txnId,
        date: l.date,
        num: l.num,
        payee: L.nameOf(l.nameId),
        type: TXN_TYPES[l.type]?.label,
        split: others.length === 1 ? L.accountLabel(others[0]) : others.length ? '-SPLIT-' : '',
        memo: l.memo || t?.memo || '',
        dec: (debitNormal ? l.amount < 0 : l.amount > 0) ? Math.abs(l.amount) : '',
        inc: (debitNormal ? l.amount > 0 : l.amount < 0) ? Math.abs(l.amount) : '',
        bal,
        name: L.nameOf(l.nameId),
      });
    }
    const ql = q.trim().toLowerCase();
    return ql ? out.filter((r) => [r.payee, r.memo, r.num, r.type, r.split].some((x) => String(x || '').toLowerCase().includes(ql))) : out;
  }, [acc, accountId, ledger, L, q, debitNormal]);

  const { keys } = useListNav(rows, sel, setSel, { containerRef: ref, getLabel: (r) => r.payee });
  useWindowKeys({
    ...keys,
    enter: () => {
      const r = rows.find((x) => x.id === sel);
      if (r) nav.openTxn(r.txnId);
    },
    'ctrl+q': () => acc && nav.report('quickreport', { accountId }),
  });

  const ending = rows.length ? rows[rows.length - 1].bal : 0;

  return (
    <div className="win">
      <div className="toolbar flat">
        <List size={18} />
        <b style={{ fontSize: 15 }}>Register</b>
        <div style={{ width: 320 }}>
          <Combo
            value={accountId}
            options={O.accountOpts(null).filter((o) => !['Income', 'Expense', 'Cost of Goods Sold', 'Other Income', 'Other Expense'].includes(o.sub))}
            onChange={(id) => {
              setAccountId(id);
              setTitle(winId, 'Register: ' + (L.accountMap.get(id)?.name || ''));
            }}
          />
        </div>
        <span className="tb-sep" />
        {acc?.type === 'Bank' && (
          <>
            <button className="btn sm" onClick={() => nav.open('check')}>
              Write Check
            </button>
            <button className="btn sm" onClick={() => nav.open('deposit')}>
              Make Deposit
            </button>
            <button className="btn sm" onClick={() => nav.open('transfer')}>
              Transfer
            </button>
          </>
        )}
        <button className="btn sm" onClick={() => nav.report('quickreport', { accountId })}>
          QuickReport
        </button>
        <input className="sp" placeholder="Find in register…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
      </div>
      <div className="win-body tbl-wrap" ref={ref}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 100 }}>Date</th>
              <th style={{ width: 90 }}>Number</th>
              <th>Payee</th>
              <th style={{ width: 130 }}>Type</th>
              <th>Account</th>
              <th>Memo</th>
              <th className="r" style={{ width: 120 }}>
                {decLabel}
              </th>
              <th className="r" style={{ width: 120 }}>
                {incLabel}
              </th>
              <th className="r" style={{ width: 130 }}>
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-id={r.id} className={r.id === sel ? 'sel' : ''} onClick={() => setSel(r.id)} onDoubleClick={() => nav.openTxn(r.txnId)}>
                <td>{fmtDate(r.date, company.dateStyle)}</td>
                <td>{r.num}</td>
                <td>{r.payee}</td>
                <td>{r.type}</td>
                <td>{r.split}</td>
                <td className="muted">{r.memo}</td>
                <td className="r">{r.dec !== '' ? money(r.dec) : ''}</td>
                <td className="r">{r.inc !== '' ? money(r.inc) : ''}</td>
                <td className={'r' + (r.bal < 0 ? ' neg' : '')}>{money(r.bal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={8}>Ending balance</td>
              <td className="r">{money(ending)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
