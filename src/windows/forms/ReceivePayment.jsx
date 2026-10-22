import { useMemo, useState } from 'react';
import { useStore, useLookups } from '../../store/store';
import { useOptions, listOpts } from '../../store/options';
import { useDialog } from '../../components/ui';
import { usePrint, TxnPrint } from '../../components/print';
import Combo from '../../components/Combo';
import { NameCombo } from '../NameModals';
import { Field, DateInput, MoneyInput } from '../../components/inputs';
import { StdRibbon, FormActions, useTxnController } from './common';
import { money, num, round2 } from '../../lib/format';
import { today, fmtDate } from '../../lib/dates';
import { TXN_TYPES } from '../../store/defaults';

const sum = (map) => round2(Object.values(map || {}).reduce((s, v) => s + num(v), 0));
const docLabel = (t) => `${TXN_TYPES[t.type]?.label || t.type}${t.num ? ' ' + t.num : ''}`;

export default function ReceivePayment({ txnId, prefill, winId }) {
  const { data, ledger, company, nextNum } = useStore();
  const L = useLookups();
  const O = useOptions();
  const dlg = useDialog();
  const print = usePrint();
  const UF = ledger.sys.UF;

  const makeNew = (t) =>
    t
      ? {
          ...t,
          appliedMap: Object.fromEntries((t.applied || []).map((a) => [a.txnId, num(a.amount)])),
          creditMap: Object.fromEntries((t.credits || []).map((c) => [c.txnId, num(c.amount)])),
        }
      : {
          id: undefined,
          type: 'payment',
          num: nextNum('payment', 'RCV-1'),
          date: today(),
          customerId: '',
          amount: '',
          method: 'Cash',
          ref: '',
          depositTo: company.defaultDepositTo || UF,
          memo: '',
          appliedMap: {},
          creditMap: {},
        };

  // what this customer still owes (invoices, journal charges) and the credits they have
  // (credit memos, earlier overpayments, journal credits). Editing a payment adds its own amounts back.
  const openFor = (customerId, f) => {
    if (!customerId) return { charges: [], credits: [] };
    const mine = f?.id ? data.txns.find((t) => t.id === f.id) : null;
    const ownPaid = new Map((mine?.applied || []).map((a) => [a.txnId, num(a.amount)]));
    const ownUsed = new Map((mine?.credits || []).map((c) => [c.txnId, num(c.amount)]));
    const charges = [];
    const credits = [];
    for (const t of data.txns) {
      if (t.voided || t.id === f?.id) continue;
      const party = t.type === 'journal' || t.type === 'deposit' ? ledger.openName.get(t.id) : t.customerId;
      if (party !== customerId) continue;
      const open = ledger.open.get(t.id);
      if (open === undefined) continue;
      if (t.type === 'invoice' || ((t.type === 'journal' || t.type === 'deposit') && open > 0)) {
        const due = round2(open + (ownPaid.get(t.id) || 0));
        if (due > 0.004 || ownPaid.has(t.id)) charges.push({ t, due, orig: round2(open + (ledger.applied.get(t.id) || 0)) });
      } else if (['creditmemo', 'payment', 'journal', 'deposit'].includes(t.type) && open <= 0) {
        const avail = round2(-open + (ownUsed.get(t.id) || 0));
        if (avail > 0.004 || ownUsed.has(t.id)) credits.push({ t, avail, orig: round2(-open + (ledger.creditUsed.get(t.id) || 0)) });
      }
    }
    const byDate = (a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : 0);
    return { charges: charges.sort(byDate), credits: credits.sort(byDate) };
  };

  // spread cash + chosen credits over the charges: an invoice for exactly the payment amount first
  // (QuickBooks does the same), otherwise oldest first
  const autoApply = (f, amount, creditMap = f.creditMap) => {
    const { charges } = openFor(f.customerId, f);
    const cash = num(amount);
    let left = round2(cash + sum(creditMap));
    const map = {};
    const exact = !sum(creditMap) && cash > 0 ? charges.find((x) => Math.abs(x.due - cash) < 0.005) : null;
    if (exact) return { [exact.t.id]: exact.due };
    for (const x of charges) {
      if (left <= 0) break;
      const a = round2(Math.min(left, x.due));
      map[x.t.id] = a;
      left = round2(left - a);
    }
    return map;
  };

  const [f, setF] = useState(() => {
    if (txnId) {
      const t = data.txns.find((x) => x.id === txnId);
      if (t) return makeNew(t);
    }
    const n = makeNew(null);
    if (prefill?.customerId) {
      n.customerId = prefill.customerId;
      if (prefill.invoiceId) {
        const due = ledger.open.get(prefill.invoiceId) || 0;
        n.amount = due;
        n.appliedMap = { [prefill.invoiceId]: due };
      }
    }
    return n;
  });

  const { charges: rows, credits } = useMemo(() => openFor(f.customerId, f), [f.customerId, f.id, data.txns, ledger]);
  const applied = sum(f.appliedMap);
  const creditsUsed = sum(f.creditMap);
  const unapplied = round2(num(f.amount) + creditsUsed - applied);
  const dueTotal = round2(rows.reduce((s, r) => s + r.due, 0));
  const creditTotal = round2(credits.reduce((s, c) => s + c.avail, 0));
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));

  const build = async () => {
    if (!f.customerId) {
      await dlg.alert('Choose the customer who is paying.');
      return null;
    }
    if (num(f.amount) < 0) {
      await dlg.alert('The payment amount cannot be negative.');
      return null;
    }
    if (!(num(f.amount) > 0) && !(creditsUsed > 0)) {
      await dlg.alert('Enter the payment amount (or choose credits to apply).');
      return null;
    }
    if (applied - num(f.amount) - creditsUsed > 0.004) {
      await dlg.alert(`You applied ${money(applied)} but the payment${creditsUsed ? ' plus credits' : ''} is only ${money(num(f.amount) + creditsUsed)}.`);
      return null;
    }
    if (creditsUsed - applied > 0.004) {
      await dlg.alert(`Credits of ${money(creditsUsed)} are chosen but only ${money(applied)} is applied to invoices. Apply the credits to an invoice or use less credit.`);
      return null;
    }
    for (const r of rows) {
      if (num(f.appliedMap[r.t.id]) - r.due > 0.004) {
        await dlg.alert(`${docLabel(r.t)}: applied amount is more than the amount due.`);
        return null;
      }
    }
    for (const c of credits) {
      if (num(f.creditMap[c.t.id]) - c.avail > 0.004) {
        await dlg.alert(`${docLabel(c.t)}: more credit used than is available.`);
        return null;
      }
    }
    const { appliedMap, creditMap, ...rest } = f;
    const list = (m) =>
      Object.entries(m || {})
        .filter(([, v]) => num(v) > 0)
        .map(([id, v]) => ({ txnId: id, amount: round2(num(v)) }));
    return { ...rest, amount: round2(num(f.amount)), total: round2(num(f.amount)), applied: list(appliedMap), credits: list(creditMap) };
  };
  const beforeSave = async () => {
    if (unapplied > 0.004)
      return dlg.confirm(`${money(unapplied)} is not applied to any invoice.\nIt will stay as a credit on ${L.nameOf(f.customerId)}'s account.`, { ok: 'Leave as credit' });
    return true;
  };

  const saved = data.txns.find((t) => t.id === f.id);
  const ctl = useTxnController({
    winId,
    type: 'payment',
    txnId,
    f,
    setF,
    makeNew,
    build,
    beforeSave,
    printNode: (txn) => print(<TxnPrint txn={{ ...txn, templateId: f.templateId }} company={company} L={L} ledger={ledger} />),
  });

  const toggle = (r) =>
    setF((x) => {
      const map = { ...x.appliedMap };
      if (map[r.t.id]) delete map[r.t.id];
      else {
        const left = Math.max(0, num(x.amount) + sum(x.creditMap) - sum(map));
        map[r.t.id] = round2(num(x.amount) || sum(x.creditMap) ? Math.min(r.due, left || r.due) : r.due);
      }
      const need = round2(sum(map) - sum(x.creditMap));
      return { ...x, appliedMap: map, amount: num(x.amount) < need ? need : x.amount };
    });

  const toggleCredit = (c) =>
    setF((x) => {
      const cm = { ...x.creditMap };
      if (cm[c.t.id]) delete cm[c.t.id];
      else {
        // use as much of the credit as the invoices still need
        const stillDue = Math.max(0, round2(dueTotal - sum(cm) - num(x.amount)));
        cm[c.t.id] = round2(Math.min(c.avail, stillDue || c.avail));
      }
      return { ...x, creditMap: cm, appliedMap: autoApply(x, x.amount, cm) };
    });

  const applyAllCredits = () =>
    setF((x) => {
      const cm = {};
      let need = Math.max(0, round2(dueTotal - num(x.amount)));
      for (const c of credits) {
        if (need <= 0) break;
        const use = round2(Math.min(c.avail, need));
        cm[c.t.id] = use;
        need = round2(need - use);
      }
      return { ...x, creditMap: cm, appliedMap: autoApply(x, x.amount, cm) };
    });

  return (
    <div className="win">
      <StdRibbon {...ctl.ribbonProps} onCopy={undefined} onVoid={ctl.ribbonProps.onVoid} />
      <div className="txn-scroll">
        <div className="txn-paper tinted">
          <div className="doc-top">
            <div className="flex" style={{ gap: 18 }}>
              <h2 className="doc-title">Customer Payment</h2>
              {f.voided && <span className="void-stamp">VOID</span>}
            </div>
            <div className="bal-box">
              <div className="lbl">Customer balance</div>
              <div className="val">{money(ledger.custBal.get(f.customerId) || 0)}</div>
            </div>
          </div>
          <div className="grid4">
            <Field label="Received from" className="span2">
              <NameCombo
                which="customer"
                value={f.customerId}
                autoFocus={!txnId}
                onChange={(id) => setF((x) => ({ ...x, customerId: id, appliedMap: {}, creditMap: {} }))}
                placeholder="Choose customer…"
              />
            </Field>
            <Field label="Payment amount">
              <MoneyInput value={f.amount} onChange={(v) => setF((x) => ({ ...x, amount: v, appliedMap: autoApply(x, v) }))} />
            </Field>
            <Field label="Date">
              <DateInput value={f.date} onChange={set('date')} />
            </Field>
            <Field label="Payment method">
              <Combo value={f.method} allowFree onChange={set('method')} options={listOpts(L.lists.paymentMethods)} />
            </Field>
            <Field label="Reference / Cheque #">
              <input value={f.ref || ''} onChange={set('ref')} />
            </Field>
            <Field label="Deposit to">
              <Combo value={f.depositTo} onChange={set('depositTo')} options={[{ id: UF, label: 'Undeposited Funds' }, ...O.bankOpts]} />
            </Field>
            <Field label="Receipt #">
              <input value={f.num || ''} onChange={set('num')} />
            </Field>
            <Field label="Memo" className="span3">
              <input value={f.memo || ''} onChange={set('memo')} />
            </Field>
          </div>

          <div className="flex mt mb">
            <b>Open invoices</b>
            <span className="sp" />
            <button className="btn sm" onClick={() => setF((x) => ({ ...x, appliedMap: autoApply(x, num(x.amount) || Math.max(0, dueTotal - sum(x.creditMap))), amount: num(x.amount) || Math.max(0, round2(dueTotal - sum(x.creditMap))) }))}>
              Auto Apply Payment
            </button>
            <button className="btn sm" onClick={() => setF((x) => ({ ...x, appliedMap: {}, creditMap: {} }))}>
              Un-Apply Payment
            </button>
          </div>
          <div className="lines" style={{ maxHeight: '36vh' }}>
            <table>
              <colgroup>
                <col style={{ width: 40 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 170 }} />
                <col />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 150 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>✓</th>
                  <th>Date</th>
                  <th>Number</th>
                  <th>Due date</th>
                  <th className="r">Orig. Amt.</th>
                  <th className="r">Amt. Due</th>
                  <th className="r">Payment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.t.id}>
                    <td className="cb">
                      <input type="checkbox" checked={!!f.appliedMap[r.t.id]} onChange={() => toggle(r)} aria-label={'Apply to ' + docLabel(r.t)} />
                    </td>
                    <td className="ro" style={{ textAlign: 'left' }}>
                      {fmtDate(r.t.date, company.dateStyle)}
                    </td>
                    <td className="ro" style={{ textAlign: 'left' }}>
                      {r.t.type === 'invoice' ? r.t.num : docLabel(r.t)}
                    </td>
                    <td className="ro" style={{ textAlign: 'left' }}>
                      {fmtDate(r.t.dueDate || r.t.date, company.dateStyle)}
                    </td>
                    <td className="ro">{money(r.orig)}</td>
                    <td className="ro">{money(r.due)}</td>
                    <td>
                      <MoneyInput
                        value={f.appliedMap[r.t.id] ?? ''}
                        onChange={(v) =>
                          setF((x) => {
                            const map = { ...x.appliedMap, [r.t.id]: v };
                            if (!num(v)) delete map[r.t.id];
                            const need = round2(sum(map) - sum(x.creditMap));
                            return { ...x, appliedMap: map, amount: num(x.amount) < need ? need : x.amount };
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <div className="empty">{f.customerId ? 'This customer has no open invoices. The payment will be a credit.' : 'Choose a customer to see open invoices.'}</div>}
          </div>

          {(credits.length > 0 || creditsUsed > 0) && (
            <>
              <div className="flex mt mb">
                <b>Credits</b>
                <span className="muted small">credit memos, earlier overpayments and journal credits — {money(creditTotal)} available</span>
                <span className="sp" />
                <button className="btn sm" onClick={applyAllCredits} disabled={!rows.length}>
                  Apply Credits
                </button>
              </div>
              <div className="lines" style={{ maxHeight: '24vh' }}>
                <table>
                  <colgroup>
                    <col style={{ width: 40 }} />
                    <col style={{ width: 110 }} />
                    <col />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 150 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>✓</th>
                      <th>Date</th>
                      <th>Credit</th>
                      <th className="r">Orig. Credit</th>
                      <th className="r">Available</th>
                      <th className="r">Use</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credits.map((c) => (
                      <tr key={c.t.id}>
                        <td className="cb">
                          <input type="checkbox" checked={!!f.creditMap[c.t.id]} onChange={() => toggleCredit(c)} aria-label={'Use ' + docLabel(c.t)} />
                        </td>
                        <td className="ro" style={{ textAlign: 'left' }}>
                          {fmtDate(c.t.date, company.dateStyle)}
                        </td>
                        <td className="ro" style={{ textAlign: 'left' }}>
                          {docLabel(c.t)}
                        </td>
                        <td className="ro">{money(c.orig)}</td>
                        <td className="ro">{money(c.avail)}</td>
                        <td>
                          <MoneyInput
                            value={f.creditMap[c.t.id] ?? ''}
                            onChange={(v) =>
                              setF((x) => {
                                const cm = { ...x.creditMap, [c.t.id]: v };
                                if (!num(v)) delete cm[c.t.id];
                                return { ...x, creditMap: cm, appliedMap: autoApply(x, x.amount, cm) };
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="txn-bottom">
            <div className="muted small">
              Payments go to <b>{f.depositTo === UF ? 'Undeposited Funds' : L.accountLabel(f.depositTo)}</b>.{' '}
              {f.depositTo === UF && 'Use Banking › Make Deposits to move them to the bank.'}
            </div>
            <div className="totals">
              <span className="lbl">Amount due</span>
              <span className="v">{money(dueTotal)}</span>
              {creditsUsed > 0 && (
                <>
                  <span className="lbl">Credits used</span>
                  <span className="v">{money(creditsUsed)}</span>
                </>
              )}
              <span className="lbl">Applied</span>
              <span className="v">{money(applied)}</span>
              <span className="sep" />
              <span className="lbl b">Amount to credit</span>
              <span className={'v b' + (unapplied > 0 ? ' neg' : '')}>{money(Math.max(0, unapplied))}</span>
            </div>
          </div>
        </div>
      </div>
      <FormActions onSaveClose={() => ctl.save('close')} onSaveNew={() => ctl.save('new')} onClear={ctl.isNew ? ctl.reset : () => ctl.load(f.id)} clearLabel={ctl.isNew ? 'Clear' : 'Revert'} />
      {ctl.modals}
    </div>
  );
}

export { TXN_TYPES };
