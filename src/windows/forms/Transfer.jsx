import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useStore, useLookups } from '../../store/store';
import { useOptions } from '../../store/options';
import { useDialog } from '../../components/ui';
import Combo from '../../components/Combo';
import { Field, DateInput, MoneyInput } from '../../components/inputs';
import { StdRibbon, FormActions, useTxnController } from './common';
import { displayBal } from '../../lib/ledger';
import { money, num, round2 } from '../../lib/format';
import { today } from '../../lib/dates';

export default function Transfer({ txnId, winId }) {
  const { data, ledger, nextNum } = useStore();
  const L = useLookups();
  const O = useOptions();
  const dlg = useDialog();
  const makeNew = (t) => t || { id: undefined, type: 'transfer', num: nextNum('transfer', 'TRF-1'), date: today(), fromId: '', toId: '', amount: '', memo: 'Funds Transfer' };
  const [f, setF] = useState(() => makeNew(data.txns.find((t) => t.id === txnId)));
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const bal = (id) => {
    const a = L.accountMap.get(id);
    return a ? displayBal(a, ledger.acctBal.get(id) || 0) : 0;
  };
  const opts = O.accountOpts(['Bank', 'Credit Card', 'Other Current Asset', 'Other Current Liability', 'Equity']);
  const build = async () => {
    if (!f.fromId || !f.toId || f.fromId === f.toId) {
      await dlg.alert('Choose two different accounts.');
      return null;
    }
    if (!(num(f.amount) > 0)) {
      await dlg.alert('Enter the transfer amount.');
      return null;
    }
    return { ...f, amount: round2(num(f.amount)), total: round2(num(f.amount)) };
  };
  const ctl = useTxnController({ winId, type: 'transfer', txnId, f, setF, makeNew, build });
  return (
    <div className="win">
      <StdRibbon {...ctl.ribbonProps} />
      <div className="txn-scroll">
        <div className="txn-paper tinted" style={{ maxWidth: 820 }}>
          <div className="doc-top">
            <h2 className="doc-title">Transfer Funds</h2>
            <div className="doc-meta">
              <Field label="Date">
                <DateInput value={f.date} onChange={set('date')} />
              </Field>
              <Field label="No.">
                <input value={f.num || ''} onChange={set('num')} />
              </Field>
            </div>
          </div>
          <div className="flex" style={{ alignItems: 'flex-end', gap: 14 }}>
            <Field label="Transfer funds from" style={{ flex: 1 }}>
              <Combo value={f.fromId} options={opts} onChange={set('fromId')} autoFocus={!txnId} />
            </Field>
            <ArrowRight size={20} style={{ marginBottom: 4 }} />
            <Field label="Transfer funds to" style={{ flex: 1 }}>
              <Combo value={f.toId} options={opts} onChange={set('toId')} />
            </Field>
          </div>
          <div className="flex mt muted small" style={{ justifyContent: 'space-between' }}>
            <span>Account balance: {money(bal(f.fromId))}</span>
            <span>Account balance: {money(bal(f.toId))}</span>
          </div>
          <div className="grid3 mt">
            <Field label="Transfer amount">
              <MoneyInput value={f.amount} onChange={set('amount')} />
            </Field>
            <Field label="Memo" className="span2">
              <input value={f.memo || ''} onChange={set('memo')} />
            </Field>
          </div>
        </div>
      </div>
      <FormActions onSaveClose={() => ctl.save('close')} onSaveNew={() => ctl.save('new')} onClear={ctl.isNew ? ctl.reset : () => ctl.load(f.id)} clearLabel={ctl.isNew ? 'Clear' : 'Revert'} />
      {ctl.modals}
    </div>
  );
}
