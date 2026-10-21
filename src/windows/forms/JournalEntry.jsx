import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useStore } from '../../store/store';
import { useOptions } from '../../store/options';
import { useDialog } from '../../components/ui';
import Combo from '../../components/Combo';
import { NameCombo } from '../NameModals';
import { Field, DateInput, MoneyInput } from '../../components/inputs';
import { StdRibbon, FormActions, useTxnController, ensureTrailing } from './common';
import { money, num, round2 } from '../../lib/format';
import { today } from '../../lib/dates';
import { memoTemplate } from '../../lib/memorize';

const k = () => Math.random().toString(36).slice(2);
const blank = () => ({ key: k(), accountId: '', debit: '', credit: '', memo: '', nameId: '' });
const empty = (l) => !l.accountId && !num(l.debit) && !num(l.credit) && !l.memo;

export default function JournalEntry({ txnId, winId, template }) {
  const { data, ledger, nextNum } = useStore();
  const O = useOptions();
  const dlg = useDialog();
  const makeNew = (t) =>
    t
      ? { ...t, lines: ensureTrailing((t.lines || []).map((l) => ({ ...blank(), ...l, key: k() })), blank, empty) }
      : { id: undefined, type: 'journal', num: nextNum('journal', '1'), date: today(), memo: '', adjusting: false, lines: [blank(), blank()] };
  const [f, setF] = useState(() => {
    const t = data.txns.find((x) => x.id === txnId);
    if (t) return makeNew(t);
    const n = makeNew(null);
    return template ? makeNew({ ...memoTemplate(template), id: undefined, num: n.num, date: n.date }) : n;
  });
  const set = (key) => (v) => setF((x) => ({ ...x, [key]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }));
  const dr = round2(f.lines.reduce((s, l) => s + num(l.debit), 0));
  const cr = round2(f.lines.reduce((s, l) => s + num(l.credit), 0));

  const setLine = (i, patch) =>
    setF((x) => {
      const lines = [...x.lines];
      let l = { ...lines[i], ...patch };
      if ('debit' in patch && num(patch.debit)) l.credit = '';
      if ('credit' in patch && num(patch.credit)) l.debit = '';
      // QuickBooks pre-fills the balancing amount on the next line
      if ('accountId' in patch && !num(l.debit) && !num(l.credit)) {
        const others = lines.filter((_, j) => j !== i);
        const d = others.reduce((s, x) => s + num(x.debit), 0);
        const c = others.reduce((s, x) => s + num(x.credit), 0);
        if (d > c) l.credit = round2(d - c);
        else if (c > d) l.debit = round2(c - d);
      }
      if (!l.memo && i > 0 && 'accountId' in patch) l.memo = lines[0].memo || '';
      lines[i] = l;
      return { ...x, lines: ensureTrailing(lines, blank, empty) };
    });

  const build = async () => {
    const lines = f.lines.filter((l) => !empty(l)).map(({ key, ...l }) => ({ ...l, debit: round2(num(l.debit)), credit: round2(num(l.credit)) }));
    if (lines.length < 2) {
      await dlg.alert('A journal entry needs at least two lines.');
      return null;
    }
    if (lines.some((l) => !l.accountId)) {
      await dlg.alert('Every line needs an account.');
      return null;
    }
    if (Math.abs(dr - cr) > 0.004) {
      await dlg.alert(`Debits (${money(dr)}) and credits (${money(cr)}) must be equal.`);
      return null;
    }
    const AR = ledger.sys.AR;
    const AP = ledger.sys.AP;
    if (lines.some((l) => (l.accountId === AR || l.accountId === AP) && !l.nameId)) {
      await dlg.alert('Lines that use Accounts Receivable or Accounts Payable need a customer or vendor name.');
      return null;
    }
    return { ...f, lines, total: dr };
  };
  const ctl = useTxnController({ winId, type: 'journal', txnId, f, setF, makeNew, build });

  return (
    <div className="win">
      <StdRibbon {...ctl.ribbonProps} />
      <div className="txn-scroll">
        <div className="txn-paper">
          <div className="doc-top">
            <h2 className="doc-title">General Journal Entry</h2>
            <div className="flex">
              <Field label="Date" style={{ width: 150 }}>
                <DateInput value={f.date} onChange={set('date')} />
              </Field>
              <Field label="Entry No." style={{ width: 110 }}>
                <input value={f.num || ''} onChange={set('num')} />
              </Field>
              <label className="check small" style={{ alignSelf: 'flex-end', paddingBottom: 6 }}>
                <input type="checkbox" checked={!!f.adjusting} onChange={set('adjusting')} /> Adjusting entry
              </label>
            </div>
          </div>
          <div className="lines">
            <table>
              <colgroup>
                <col style={{ width: 280 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
                <col />
                <col style={{ width: 200 }} />
                <col style={{ width: 30 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="r">Debit</th>
                  <th className="r">Credit</th>
                  <th>Memo</th>
                  <th>Name</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {f.lines.map((l, i) => (
                  <tr key={l.key}>
                    <td>
                      <Combo value={l.accountId} options={O.accountOpts(null)} onChange={(v) => setLine(i, { accountId: v })} dropWidth={380} autoFocus={i === 0 && !txnId} />
                    </td>
                    <td>
                      <MoneyInput value={l.debit} onChange={(v) => setLine(i, { debit: v })} />
                    </td>
                    <td>
                      <MoneyInput value={l.credit} onChange={(v) => setLine(i, { credit: v })} />
                    </td>
                    <td>
                      <input value={l.memo || ''} onChange={(e) => setLine(i, { memo: e.target.value })} />
                    </td>
                    <td>
                      <NameCombo which="name" value={l.nameId} onChange={(v) => setLine(i, { nameId: v })} />
                    </td>
                    <td className="del-cell">
                      {!empty(l) && (
                        <button className="icon-btn" tabIndex={-1} onClick={() => setF((x) => ({ ...x, lines: ensureTrailing(x.lines.filter((_, j) => j !== i), blank, empty) }))}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="ro" style={{ textAlign: 'left', fontWeight: 600 }}>
                    Totals
                  </td>
                  <td className="ro b">{money(dr)}</td>
                  <td className="ro b">{money(cr)}</td>
                  <td colSpan={3} className="ro" style={{ textAlign: 'left' }}>
                    {Math.abs(dr - cr) > 0.004 ? <span className="neg b">Out of balance by {money(Math.abs(dr - cr))}</span> : <span className="pos-ok">Balanced</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <Field label="Memo" className="mt">
            <input value={f.memo || ''} onChange={set('memo')} />
          </Field>
        </div>
      </div>
      <FormActions onSaveClose={() => ctl.save('close')} onSaveNew={() => ctl.save('new')} onClear={ctl.isNew ? ctl.reset : () => ctl.load(f.id)} clearLabel={ctl.isNew ? 'Clear' : 'Revert'} />
      {ctl.modals}
    </div>
  );
}
