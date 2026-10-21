import { useMemo, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { useStore, useLookups } from '../../store/store';
import { useWindows, useWindowKeys } from '../../store/windows';
import { useOptions, listOpts } from '../../store/options';
import { useDialog } from '../../components/ui';
import Combo from '../../components/Combo';
import { Field, DateInput, MoneyInput } from '../../components/inputs';
import { displayBal } from '../../lib/ledger';
import { money, num, round2 } from '../../lib/format';
import { today, fmtDate, addDays } from '../../lib/dates';

export default function PayBills({ prefill, winId }) {
  const { data, ledger, company, nextNum, saveMany } = useStore();
  const L = useLookups();
  const O = useOptions();
  const dlg = useDialog();
  const { close } = useWindows();
  const bank = data.accounts.find((a) => a.sys === 'bank')?.id || data.accounts.find((a) => a.type === 'Bank')?.id;
  const [show, setShow] = useState('all');
  const [vendorFilter, setVendorFilter] = useState(prefill?.vendorId || '');
  const [sel, setSel] = useState(() => (prefill?.billId ? { [prefill.billId]: ledger.open.get(prefill.billId) || 0 } : {}));
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState(bank);
  const [method, setMethod] = useState('Cheque');
  const [useCredits, setUseCredits] = useState(true);

  // who a document is with: bills carry the vendor; journal entries / deposits the one vendor on A/P
  const vendorOf = (t) => (t.type === 'journal' || t.type === 'deposit' ? ledger.openName.get(t.id) : t.vendorId);
  const isVendorDoc = (t) => !!vendorOf(t) && L.vendorMap.has(vendorOf(t));

  // what is owed: bills + journal charges to A/P
  const bills = useMemo(
    () =>
      data.txns
        .filter((t) => !t.voided && (t.type === 'bill' || ((t.type === 'journal' || t.type === 'deposit') && isVendorDoc(t))) && (ledger.open.get(t.id) || 0) > 0.004)
        .filter((t) => !vendorFilter || vendorOf(t) === vendorFilter)
        .filter((t) => show === 'all' || (t.dueDate || t.date) <= addDays(today(), 10))
        .sort((a, b) => ((a.dueDate || a.date) < (b.dueDate || b.date) ? -1 : 1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.txns, ledger, vendorFilter, show, L],
  );

  // credits each vendor has with us: bill credits, earlier overpayments, journal credits
  const creditsBy = useMemo(() => {
    const m = new Map();
    for (const t of data.txns) {
      if (t.voided || !['vendorcredit', 'billpayment', 'journal', 'deposit'].includes(t.type)) continue;
      if ((t.type === 'journal' || t.type === 'deposit') && !isVendorDoc(t)) continue;
      const open = ledger.open.get(t.id);
      if (!(open < -0.004)) continue;
      const v = vendorOf(t);
      if (!m.has(v)) m.set(v, []);
      m.get(v).push({ t, avail: round2(-open) });
    }
    for (const list of m.values()) list.sort((a, b) => (a.t.date < b.t.date ? -1 : 1));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.txns, ledger, L]);

  // per vendor: what is selected, which credits cover part of it, and the cash that is left to pay
  const plan = useMemo(() => {
    const out = new Map();
    for (const b of bills) {
      const v = num(sel[b.id]);
      if (!(v > 0)) continue;
      const vid = vendorOf(b);
      if (!out.has(vid)) out.set(vid, { bills: [], selected: 0, credits: [], creditTotal: 0, cash: 0 });
      const p = out.get(vid);
      p.bills.push(b);
      p.selected = round2(p.selected + v);
    }
    for (const [vid, p] of out) {
      let need = p.selected;
      if (useCredits)
        for (const c of creditsBy.get(vid) || []) {
          if (need <= 0) break;
          const use = round2(Math.min(c.avail, need));
          p.credits.push({ txnId: c.t.id, amount: use, t: c.t });
          p.creditTotal = round2(p.creditTotal + use);
          need = round2(need - use);
        }
      p.cash = round2(p.selected - p.creditTotal);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bills, sel, creditsBy, useCredits]);
  const creditTotal = round2([...plan.values()].reduce((s, p) => s + p.creditTotal, 0));
  const availCredits = round2([...creditsBy.entries()].filter(([v]) => !vendorFilter || v === vendorFilter).reduce((s, [, l]) => s + l.reduce((x, c) => x + c.avail, 0), 0));

  const selectedTotal = round2(Object.values(sel).reduce((s, v) => s + num(v), 0));
  const total = round2(selectedTotal - creditTotal); // cash that leaves the bank
  const acc = L.accountMap.get(accountId);
  const bal = acc ? displayBal(acc, ledger.acctBal.get(accountId) || 0) : 0;

  const pay = async (andClose) => {
    const picked = bills.filter((b) => num(sel[b.id]) > 0);
    if (!picked.length) return dlg.alert('Select at least one bill to pay.');
    for (const b of picked) if (num(sel[b.id]) - (ledger.open.get(b.id) || 0) > 0.004) return dlg.alert(`Payment for bill ${b.num || ''} is more than its amount due.`);
    if (!accountId) return dlg.alert('Choose the payment account.');
    if (acc?.type === 'Bank' && total > bal && !(await dlg.confirm(`Total ${money(total)} is more than the ${acc.name} balance (${money(bal)}). Continue?`))) return;
    let n = nextNum('billpayment', 'BP-1');
    const recs = [];
    for (const [vendorId, p] of plan) {
      const bs = p.bills;
      recs.push({
        type: 'billpayment',
        num: n,
        date,
        vendorId,
        accountId,
        method,
        amount: p.cash,
        total: p.cash,
        memo: [bs.map((b) => b.num).filter(Boolean).join(', '), p.creditTotal ? `credits used ${money(p.creditTotal)}` : ''].filter(Boolean).join(' · '),
        applied: bs.map((b) => ({ txnId: b.id, amount: round2(num(sel[b.id])) })),
        credits: p.credits.map(({ txnId, amount }) => ({ txnId, amount })),
      });
      const m = /^(.*?)(\d+)$/.exec(n);
      n = m ? m[1] + (Number(m[2]) + 1) : n + '-1';
    }
    saveMany('txns', recs);
    dlg.toast(`Paid ${picked.length} bill(s) — ${money(total)}${creditTotal ? ` + ${money(creditTotal)} in credits` : ''}`);
    setSel({});
    if (andClose) close(winId);
  };

  useWindowKeys({ 'alt+a': () => pay(true), 'alt+s': () => pay(false) });

  return (
    <div className="win">
      <div className="win-title">
        <CreditCard size={20} />
        <h1>Pay Bills</h1>
        <span className="sub">{bills.length} bills to pay</span>
      </div>
      <div className="toolbar flat">
        <label className="check small">
          <input type="radio" checked={show === 'due'} onChange={() => setShow('due')} /> Due on or before {fmtDate(addDays(today(), 10), company.dateStyle)}
        </label>
        <label className="check small">
          <input type="radio" checked={show === 'all'} onChange={() => setShow('all')} /> Show all bills
        </label>
        <span className="sp" />
        <span className="small muted">Filter by vendor</span>
        <div style={{ width: 240 }}>
          <Combo value={vendorFilter} onChange={setVendorFilter} options={[{ id: '', label: 'All vendors' }, ...O.vendorOpts]} />
        </div>
        <button className="btn sm" onClick={() => setSel(Object.fromEntries(bills.map((b) => [b.id, ledger.open.get(b.id)])))}>
          Select All Bills
        </button>
        <button className="btn sm" onClick={() => setSel({})}>
          Clear Selections
        </button>
      </div>
      <div className="win-body tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 36 }}>✓</th>
              <th>Date Due</th>
              <th>Vendor</th>
              <th>Ref. No.</th>
              <th>Bill Date</th>
              <th className="r">Amt. Due</th>
              <th className="r" style={{ width: 160 }}>
                Amt. To Pay
              </th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => {
              const due = ledger.open.get(b.id) || 0;
              const overdue = (b.dueDate || b.date) < today();
              return (
                <tr key={b.id} className={sel[b.id] ? 'sel' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!sel[b.id]}
                      onChange={() =>
                        setSel((s) => {
                          const n = { ...s };
                          if (n[b.id]) delete n[b.id];
                          else n[b.id] = due;
                          return n;
                        })
                      }
                    />
                  </td>
                  <td className={overdue ? 'neg b' : ''}>{fmtDate(b.dueDate || b.date, company.dateStyle)}</td>
                  <td>{L.nameOf(vendorOf(b))}</td>
                  <td>{b.type === 'bill' ? b.num : `Journal ${b.num || ''}`}</td>
                  <td>{fmtDate(b.date, company.dateStyle)}</td>
                  <td className="r">{money(due)}</td>
                  <td style={{ padding: 2 }}>
                    <MoneyInput
                      value={sel[b.id] ?? ''}
                      onChange={(v) =>
                        setSel((s) => {
                          const n = { ...s, [b.id]: v };
                          if (!num(v)) delete n[b.id];
                          return n;
                        })
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>Totals</td>
              <td className="r">{money(bills.reduce((s, b) => s + (ledger.open.get(b.id) || 0), 0))}</td>
              <td className="r">{money(selectedTotal)}</td>
            </tr>
          </tfoot>
        </table>
        {!bills.length && <div className="empty">No unpaid bills. 🎉</div>}
      </div>
      <div className="toolbar flat" style={{ borderTop: '1px solid var(--border)', borderBottom: 0 }}>
        <Field label="Payment date" style={{ width: 150 }}>
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label="Method" style={{ width: 160 }}>
          <Combo value={method} allowFree onChange={setMethod} options={listOpts(L.lists.paymentMethods)} />
        </Field>
        <Field label="Payment account" style={{ width: 260 }}>
          <Combo value={accountId} onChange={setAccountId} options={O.bankOpts} />
        </Field>
        <span className="small muted" style={{ alignSelf: 'flex-end', paddingBottom: 6 }}>
          Ending balance <b className={bal - total < 0 ? 'neg' : ''}>{money(bal)}</b>
        </span>
        {availCredits > 0 && (
          <label className="check small" style={{ alignSelf: 'flex-end', paddingBottom: 6 }} title="Bill credits, earlier overpayments and journal credits">
            <input type="checkbox" checked={useCredits} onChange={(e) => setUseCredits(e.target.checked)} /> Use vendor credits ({money(availCredits)} available)
          </label>
        )}
        <span className="sp" />
        <span className="small" style={{ alignSelf: 'flex-end', paddingBottom: 6 }}>
          {creditTotal > 0 && (
            <>
              Credits used <b>{money(creditTotal)}</b> ·{' '}
            </>
          )}
          To pay <b>{money(total)}</b>
        </span>
      </div>
      <div className="txn-actions">
        <span className="sp" />
        <span className="muted small">Alt+A Pay &amp; Close · Alt+S Pay</span>
        <button className="btn primary" onClick={() => pay(true)}>
          Pay Selected Bills
        </button>
        <button className="btn" onClick={() => pay(false)}>
          Pay &amp; New
        </button>
        <button className="btn" onClick={() => close(winId)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
