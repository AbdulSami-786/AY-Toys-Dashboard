import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useStore, useLookups } from '../../store/store';
import { useOptions } from '../../store/options';
import { useDialog } from '../../components/ui';
import Combo from '../../components/Combo';
import { NameCombo } from '../NameModals';
import { Field, DateInput, MoneyInput } from '../../components/inputs';
import { StdRibbon, FormActions, useTxnController, ensureTrailing } from './common';
import { money, num, round2 } from '../../lib/format';
import { today, fmtDate } from '../../lib/dates';
import { TXN_TYPES } from '../../store/defaults';

const k = () => Math.random().toString(36).slice(2);
const blank = () => ({ key: k(), accountId: '', nameId: '', memo: '', amount: '' });
const empty = (l) => !l.accountId && !num(l.amount) && !l.memo;

export default function Deposit({ txnId, winId }) {
  const { data, ledger, nextNum } = useStore();
  const L = useLookups();
  const O = useOptions();
  const dlg = useDialog();
  const bank = data.accounts.find((a) => a.sys === 'bank')?.id || '';
  const makeNew = (t) =>
    t
      ? { ...t, otherLines: ensureTrailing((t.otherLines || []).map((l) => ({ ...blank(), ...l, key: k() })), blank, empty) }
      : { id: undefined, type: 'deposit', num: nextNum('deposit', 'DEP-1'), date: today(), accountId: bank, memo: '', payments: [], otherLines: [blank()] };
  const [f, setF] = useState(() => makeNew(data.txns.find((t) => t.id === txnId)));
  const set = (key) => (v) => setF((x) => ({ ...x, [key]: v?.target ? v.target.value : v }));

  const candidates = useMemo(() => {
    const own = new Set(data.txns.find((t) => t.id === f.id)?.payments || []);
    const list = [...ledger.undeposited, ...data.txns.filter((t) => own.has(t.id))];
    return [...new Map(list.map((t) => [t.id, t])).values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [ledger.undeposited, data.txns, f.id]);

  const amt = (t) => (t.type === 'payment' ? num(t.amount) : num(t.total));
  const payTotal = round2(candidates.filter((t) => f.payments.includes(t.id)).reduce((s, t) => s + amt(t), 0));
  const otherTotal = round2(f.otherLines.reduce((s, l) => s + num(l.amount), 0));
  const total = round2(payTotal + otherTotal);

  const setLine = (i, patch) =>
    setF((x) => {
      const lines = [...x.otherLines];
      lines[i] = { ...lines[i], ...patch };
      return { ...x, otherLines: ensureTrailing(lines, blank, empty) };
    });

  const build = async () => {
    if (!f.accountId) {
      await dlg.alert('Choose the bank account to deposit to.');
      return null;
    }
    const otherLines = f.otherLines.filter((l) => !empty(l)).map(({ key, ...l }) => ({ ...l, amount: round2(num(l.amount)) }));
    if (otherLines.some((l) => !l.accountId)) {
      await dlg.alert('Each "other deposit" line needs a From Account.');
      return null;
    }
    if (!f.payments.length && !otherLines.length) {
      await dlg.alert('Select payments to deposit or add a deposit line.');
      return null;
    }
    return { ...f, otherLines, total };
  };
  const ctl = useTxnController({ winId, type: 'deposit', txnId, f, setF, makeNew, build });

  return (
    <div className="win">
      <StdRibbon {...ctl.ribbonProps} />
      <div className="txn-scroll">
        <div className="txn-paper tinted">
          <div className="doc-top">
            <h2 className="doc-title">Make Deposits</h2>
            <div className="bal-box">
              <div className="lbl">Deposit total</div>
              <div className="val">{money(total)}</div>
            </div>
          </div>
          <div className="grid4">
            <Field label="Deposit to" className="span2">
              <Combo value={f.accountId} onChange={set('accountId')} options={O.bankOpts} />
            </Field>
            <Field label="Date">
              <DateInput value={f.date} onChange={set('date')} />
            </Field>
            <Field label="Memo">
              <input value={f.memo || ''} onChange={set('memo')} />
            </Field>
          </div>
          <div className="flex mt mb">
            <b>Payments to deposit (from Undeposited Funds)</b>
            <span className="sp" />
            <button className="btn sm" onClick={() => setF((x) => ({ ...x, payments: candidates.map((t) => t.id) }))}>
              Select All
            </button>
            <button className="btn sm" onClick={() => setF((x) => ({ ...x, payments: [] }))}>
              Select None
            </button>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}>✓</th>
                <th>Date</th>
                <th>Type</th>
                <th>No.</th>
                <th>Payment method</th>
                <th>Name</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((t) => (
                <tr key={t.id} className={f.payments.includes(t.id) ? 'sel' : ''} onClick={() => setF((x) => ({ ...x, payments: x.payments.includes(t.id) ? x.payments.filter((p) => p !== t.id) : [...x.payments, t.id] }))}>
                  <td>
                    <input type="checkbox" readOnly checked={f.payments.includes(t.id)} />
                  </td>
                  <td>{fmtDate(t.date)}</td>
                  <td>{TXN_TYPES[t.type]?.label}</td>
                  <td>{t.num}</td>
                  <td>{t.method}</td>
                  <td>{L.nameOf(t.customerId)}</td>
                  <td className="r">{money(amt(t))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!candidates.length && <div className="empty">No undeposited payments.</div>}

          <div className="section-title">Other deposits (owner capital, loans, interest…)</div>
          <div className="lines" style={{ minHeight: 100 }}>
            <table>
              <colgroup>
                <col style={{ width: 200 }} />
                <col style={{ width: 260 }} />
                <col />
                <col style={{ width: 130 }} />
                <col style={{ width: 30 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Received from</th>
                  <th>From account</th>
                  <th>Memo</th>
                  <th className="r">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {f.otherLines.map((l, i) => (
                  <tr key={l.key}>
                    <td>
                      <NameCombo which="name" value={l.nameId} onChange={(v) => setLine(i, { nameId: v })} />
                    </td>
                    <td>
                      <Combo value={l.accountId} options={O.accountOpts(null)} onChange={(v) => setLine(i, { accountId: v })} dropWidth={360} />
                    </td>
                    <td>
                      <input value={l.memo} onChange={(e) => setLine(i, { memo: e.target.value })} />
                    </td>
                    <td>
                      <MoneyInput value={l.amount} onChange={(v) => setLine(i, { amount: v })} />
                    </td>
                    <td className="del-cell">
                      {!empty(l) && (
                        <button className="icon-btn" tabIndex={-1} onClick={() => setF((x) => ({ ...x, otherLines: ensureTrailing(x.otherLines.filter((_, j) => j !== i), blank, empty) }))}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="txn-bottom">
            <div />
            <div className="totals">
              <span className="lbl">Payments</span>
              <span className="v">{money(payTotal)}</span>
              <span className="lbl">Other deposits</span>
              <span className="v">{money(otherTotal)}</span>
              <span className="sep" />
              <span className="lbl b">Deposit total</span>
              <span className="v big">{money(total)}</span>
            </div>
          </div>
        </div>
      </div>
      <FormActions onSaveClose={() => ctl.save('close')} onSaveNew={() => ctl.save('new')} onClear={ctl.isNew ? ctl.reset : () => ctl.load(f.id)} clearLabel={ctl.isNew ? 'Clear' : 'Revert'} />
      {ctl.modals}
    </div>
  );
}
