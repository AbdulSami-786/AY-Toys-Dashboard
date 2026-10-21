import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useStore, useLookups } from '../../store/store';
import { useOptions } from '../../store/options';
import { useDialog } from '../../components/ui';
import Combo from '../../components/Combo';
import { Field, DateInput, MoneyInput, QtyInput, Select } from '../../components/inputs';
import { StdRibbon, FormActions, useTxnController, ensureTrailing } from './common';
import { money, num, round2, qty as fq } from '../../lib/format';
import { today } from '../../lib/dates';

const k = () => Math.random().toString(36).slice(2);
const blank = () => ({ key: k(), itemId: '', newQty: '', qtyDiff: '', newValue: '', valueDiff: '', memo: '' });
const empty = (l) => !l.itemId;

export default function InventoryAdjust({ txnId, winId, prefill }) {
  const { data, ledger, nextNum } = useStore();
  const L = useLookups();
  const O = useOptions();
  const dlg = useDialog();
  const shrink = data.accounts.find((a) => a.sys === 'shrink')?.id || data.accounts.find((a) => a.sys === 'cogs')?.id;
  const [mode, setMode] = useState('qty');
  const saved = data.txns.find((t) => t.id === txnId);

  // current qty/value excluding this adjustment's own effect
  const base = (itemId) => {
    const s = ledger.itemStat(itemId);
    let q = s.qty;
    let v = s.value;
    if (saved && !saved.voided)
      (saved.lines || []).forEach((l) => {
        if (l.itemId !== itemId) return;
        q -= num(l.qtyDiff);
        v -= ledger.lines.filter((x) => x.txnId === saved.id && x.itemId === itemId && x.accountId === (L.itemMap.get(itemId)?.assetAccountId || ledger.sys.INV)).reduce((s2, x) => s2 + x.amount, 0);
      });
    return { qty: q, value: round2(v), avg: q > 0 ? v / q : num(L.itemMap.get(itemId)?.cost) };
  };

  const makeNew = (t) =>
    t
      ? { ...t, lines: ensureTrailing((t.lines || []).map((l) => ({ ...blank(), ...l, key: k(), newQty: round2(base(l.itemId).qty + num(l.qtyDiff)) })), blank, empty) }
      : { id: undefined, type: 'invadjust', num: nextNum('invadjust', 'ADJ-1'), date: today(), accountId: shrink, memo: '', lines: [blank()] };

  const [f, setF] = useState(() => {
    if (saved) return makeNew(saved);
    const n = makeNew(null);
    if (prefill?.itemId) {
      const b = base(prefill.itemId);
      n.lines = ensureTrailing([{ ...blank(), itemId: prefill.itemId, newQty: b.qty, qtyDiff: 0 }], blank, empty);
    }
    return n;
  });
  const set = (key) => (v) => setF((x) => ({ ...x, [key]: v?.target ? v.target.value : v }));

  const setLine = (i, patch) =>
    setF((x) => {
      const lines = [...x.lines];
      const l = { ...lines[i], ...patch };
      const b = l.itemId ? base(l.itemId) : { qty: 0, value: 0, avg: 0 };
      if ('itemId' in patch) {
        l.newQty = b.qty;
        l.qtyDiff = 0;
        l.newValue = b.value;
        l.valueDiff = '';
      }
      if ('newQty' in patch) l.qtyDiff = round2(num(l.newQty) - b.qty);
      if ('qtyDiff' in patch) l.newQty = round2(b.qty + num(l.qtyDiff));
      if ('newValue' in patch) l.valueDiff = round2(num(l.newValue) - b.value);
      lines[i] = l;
      return { ...x, lines: ensureTrailing(lines, blank, empty) };
    });

  const valueOf = (l) => (mode === 'value' || (l.valueDiff !== '' && l.valueDiff !== undefined) ? num(l.valueDiff) : round2(num(l.qtyDiff) * base(l.itemId).avg));
  const totalValue = round2(f.lines.filter((l) => l.itemId).reduce((s, l) => s + valueOf(l), 0));

  const build = async () => {
    const lines = f.lines
      .filter((l) => l.itemId && (num(l.qtyDiff) || num(l.valueDiff)))
      .map(({ key, newQty, newValue, ...l }) => ({ ...l, qtyDiff: num(l.qtyDiff), valueDiff: mode === 'value' || (l.valueDiff !== '' && l.valueDiff !== undefined) ? num(l.valueDiff) : '' }));
    if (!lines.length) {
      await dlg.alert('Enter a new quantity (or value) for at least one item.');
      return null;
    }
    if (!f.accountId) {
      await dlg.alert('Choose an adjustment account.');
      return null;
    }
    return { ...f, lines, total: totalValue };
  };
  const ctl = useTxnController({ winId, type: 'invadjust', txnId, f, setF, makeNew, build });
  const invOpts = O.itemOpts.filter((o) => L.itemMap.get(o.id)?.type === 'Inventory Part');

  return (
    <div className="win">
      <StdRibbon {...ctl.ribbonProps} />
      <div className="txn-scroll">
        <div className="txn-paper">
          <div className="doc-top">
            <h2 className="doc-title">Adjust Quantity/Value on Hand</h2>
            <Field label="Adjustment type" style={{ width: 220 }}>
              <Select
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'qty', label: 'Quantity' },
                  { value: 'value', label: 'Quantity and Total Value' },
                ]}
              />
            </Field>
          </div>
          <div className="grid4 mb">
            <Field label="Adjustment date">
              <DateInput value={f.date} onChange={set('date')} />
            </Field>
            <Field label="Reference no.">
              <input value={f.num || ''} onChange={set('num')} />
            </Field>
            <Field label="Adjustment account" className="span2">
              <Combo value={f.accountId} onChange={set('accountId')} options={O.accountOpts(['Cost of Goods Sold', 'Expense', 'Other Expense', 'Equity', 'Income', 'Other Income'])} />
            </Field>
          </div>
          <div className="lines">
            <table>
              <colgroup>
                <col style={{ width: 230 }} />
                <col />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                {mode === 'value' && (
                  <>
                    <col style={{ width: 120 }} />
                    <col style={{ width: 120 }} />
                  </>
                )}
                <col style={{ width: 130 }} />
                <col style={{ width: 30 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Memo</th>
                  <th className="r">Current Qty</th>
                  <th className="r">New Qty</th>
                  <th className="r">Qty Difference</th>
                  {mode === 'value' && (
                    <>
                      <th className="r">Current Value</th>
                      <th className="r">New Value</th>
                    </>
                  )}
                  <th className="r">Value change</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {f.lines.map((l, i) => {
                  const b = l.itemId ? base(l.itemId) : null;
                  return (
                    <tr key={l.key}>
                      <td>
                        <Combo value={l.itemId} options={invOpts} onChange={(v) => setLine(i, { itemId: v })} dropWidth={420} autoFocus={i === 0 && !txnId && !prefill} />
                      </td>
                      <td>
                        <input value={l.memo || ''} onChange={(e) => setLine(i, { memo: e.target.value })} />
                      </td>
                      <td className="ro">{b ? fq(b.qty) : ''}</td>
                      <td>
                        <QtyInput value={l.newQty} onChange={(v) => setLine(i, { newQty: v })} disabled={!l.itemId} />
                      </td>
                      <td>
                        <QtyInput value={l.qtyDiff} onChange={(v) => setLine(i, { qtyDiff: v })} disabled={!l.itemId} />
                      </td>
                      {mode === 'value' && (
                        <>
                          <td className="ro">{b ? money(b.value) : ''}</td>
                          <td>
                            <MoneyInput value={l.newValue} onChange={(v) => setLine(i, { newValue: v })} disabled={!l.itemId} />
                          </td>
                        </>
                      )}
                      <td className={'ro' + (valueOf(l) < 0 ? ' neg' : '')}>{l.itemId ? money(valueOf(l)) : ''}</td>
                      <td className="del-cell">
                        {l.itemId && (
                          <button className="icon-btn" tabIndex={-1} onClick={() => setF((x) => ({ ...x, lines: ensureTrailing(x.lines.filter((_, j) => j !== i), blank, empty) }))}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="txn-bottom">
            <Field label="Memo">
              <input value={f.memo || ''} onChange={set('memo')} />
            </Field>
            <div className="totals">
              <span className="lbl">Number of item adjustments</span>
              <span className="v">{f.lines.filter((l) => l.itemId).length}</span>
              <span className="lbl b">Total value of adjustment</span>
              <span className={'v big' + (totalValue < 0 ? ' neg' : '')}>{money(totalValue)}</span>
            </div>
          </div>
        </div>
      </div>
      <FormActions onSaveClose={() => ctl.save('close')} onSaveNew={() => ctl.save('new')} onClear={ctl.isNew ? ctl.reset : () => ctl.load(f.id)} clearLabel={ctl.isNew ? 'Clear' : 'Revert'} />
      {ctl.modals}
    </div>
  );
}
