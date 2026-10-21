import { useState } from 'react';
import { useStore, useLookups } from '../../store/store';
import { useOptions, listOpts } from '../../store/options';
import { useNav } from '../../store/nav';
import { useDialog } from '../../components/ui';
import { usePrint, TxnPrint } from '../../components/print';
import Combo from '../../components/Combo';
import { Field, DateInput, MoneyInput } from '../../components/inputs';
import { StdRibbon, FormActions, useTxnController } from './common';
import { money, num, round2 } from '../../lib/format';
import { fmtDate, today } from '../../lib/dates';

// Edit an existing bill payment (new ones are created from Pay Bills)
export default function BillPayment({ txnId, winId }) {
  const { data, ledger, company } = useStore();
  const L = useLookups();
  const O = useOptions();
  const nav = useNav();
  const dlg = useDialog();
  const print = usePrint();
  const makeNew = (t) => (t ? { ...t, appliedMap: Object.fromEntries((t.applied || []).map((a) => [a.txnId, num(a.amount)])) } : { id: undefined, type: 'billpayment', date: today(), appliedMap: {}, amount: 0 });
  const [f, setF] = useState(() => makeNew(data.txns.find((t) => t.id === txnId)));
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const appliedTotal = round2(Object.values(f.appliedMap).reduce((s, v) => s + num(v), 0));
  // credits (bill credits, overpayments) used by this payment cover part of the bills; the rest is cash
  const creditTotal = round2((f.credits || []).reduce((s, c) => s + num(c.amount), 0));
  const amount = round2(Math.max(0, appliedTotal - creditTotal));

  const build = async () => {
    if (!f.id) {
      nav.open('paybills');
      return null;
    }
    if (creditTotal - appliedTotal > 0.004) {
      await dlg.alert(`This payment uses ${money(creditTotal)} of credits, so at least that much must stay applied to bills.`);
      return null;
    }
    for (const [id, v] of Object.entries(f.appliedMap)) {
      const own = (data.txns.find((t) => t.id === f.id)?.applied || []).find((a) => a.txnId === id);
      const max = (ledger.open.get(id) || 0) + num(own?.amount);
      if (num(v) - max > 0.004) {
        await dlg.alert('A payment amount is more than the bill’s amount due.');
        return null;
      }
    }
    const { appliedMap, ...rest } = f;
    return { ...rest, amount, total: amount, applied: Object.entries(appliedMap).filter(([, v]) => num(v) > 0).map(([txnId, v]) => ({ txnId, amount: round2(num(v)) })) };
  };
  const saved = data.txns.find((t) => t.id === f.id);
  const ctl = useTxnController({ winId, type: 'billpayment', txnId, f, setF, makeNew, build, printNode: () => saved && print(<TxnPrint txn={{ ...saved, templateId: f.templateId }} company={company} L={L} ledger={ledger} />) });

  if (!f.id)
    return (
      <div className="empty">
        Bill payments are created from <button className="btn" onClick={() => nav.open('paybills')}>Pay Bills</button>
      </div>
    );

  return (
    <div className="win">
      <StdRibbon {...ctl.ribbonProps} onCopy={undefined} onNew={() => nav.open('paybills')} />
      <div className="txn-scroll">
        <div className="txn-paper tinted">
          <div className="doc-top">
            <div className="flex" style={{ gap: 18 }}>
              <h2 className="doc-title">Bill Payment</h2>
              {f.voided && <span className="void-stamp">VOID</span>}
            </div>
            <div className="bal-box">
              <div className="lbl">Amount</div>
              <div className="val">{money(amount)}</div>
              {creditTotal > 0 && <div className="small muted">+ {money(creditTotal)} in credits</div>}
            </div>
          </div>
          <div className="grid4">
            <Field label="Vendor">
              <input disabled value={L.nameOf(f.vendorId)} />
            </Field>
            <Field label="Date">
              <DateInput value={f.date} onChange={set('date')} />
            </Field>
            <Field label="No.">
              <input value={f.num || ''} onChange={set('num')} />
            </Field>
            <Field label="Method">
              <Combo value={f.method} allowFree onChange={set('method')} options={listOpts(L.lists.paymentMethods)} />
            </Field>
            <Field label="Paid from account" className="span2">
              <Combo value={f.accountId} onChange={set('accountId')} options={O.bankOpts} />
            </Field>
            <Field label="Memo" className="span2">
              <input value={f.memo || ''} onChange={set('memo')} />
            </Field>
          </div>
          <div className="section-title">Bills paid</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Bill date</th>
                <th>Ref. No.</th>
                <th className="r">Bill amount</th>
                <th className="r" style={{ width: 160 }}>
                  Paid
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(f.appliedMap).map((id) => {
                const b = ledger.txnById.get(id);
                return (
                  <tr key={id} onDoubleClick={() => nav.openTxn(id)}>
                    <td>{fmtDate(b?.date, company.dateStyle)}</td>
                    <td>{b?.num}</td>
                    <td className="r">{money(b?.total)}</td>
                    <td style={{ padding: 2 }}>
                      <MoneyInput value={f.appliedMap[id]} onChange={(v) => setF((x) => ({ ...x, appliedMap: { ...x.appliedMap, [id]: v } }))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <FormActions onSaveClose={() => ctl.save('close')} onSaveNew={() => ctl.save('stay')} onClear={() => ctl.load(f.id)} clearLabel="Revert" />
      {ctl.modals}
    </div>
  );
}
