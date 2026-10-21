import { useMemo, useState } from 'react';
import { Trash2, PackageCheck, CreditCard, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useStore, useLookups } from '../../store/store';
import { useNav } from '../../store/nav';
import { useOptions, listOpts } from '../../store/options';
import { useDialog, Tabs } from '../../components/ui';
import { usePrint, TxnPrint } from '../../components/print';
import Combo from '../../components/Combo';
import { Field, DateInput, MoneyInput, QtyInput } from '../../components/inputs';
import { StdRibbon, FormActions, useTxnController, ensureTrailing, SideCard, TB, TemplatePicker } from './common';
import { useFormTemplate } from '../../store/templates';
import { NameCombo } from '../NameModals';
import { ItemModal } from '../ItemList';
import { AccountModal } from '../ChartOfAccounts';
import { displayBal, txnTotal } from '../../lib/ledger';
import { money, num, round2, qty as fq } from '../../lib/format';
import { today, dueFromTerms, fmtDate } from '../../lib/dates';
import { TXN_TYPES } from '../../store/defaults';
import { memoTemplate } from '../../lib/memorize';

const META = {
  bill: { title: 'Bill', numLabel: 'Ref. No.', start: '' },
  check: { title: 'Check', numLabel: 'No.', start: '1' },
  vendorcredit: { title: 'Credit', numLabel: 'Ref. No.', start: '' },
  purchaseorder: { title: 'Purchase Order', numLabel: 'P.O. No.', start: 'PO-1' },
};

const k = () => Math.random().toString(36).slice(2);
const blankExp = () => ({ key: k(), accountId: '', amount: '', memo: '', customerId: '' });
const blankItem = () => ({ key: k(), itemId: '', description: '', qty: '', uom: '', cost: '', amount: '', customerId: '' });
const emptyExp = (l) => !l.accountId && !num(l.amount) && !l.memo;
const emptyItem = (l) => !l.itemId && !l.description && !num(l.amount);

export default function PurchaseForm({ type, txnId, prefill, template, fromId, winId }) {
  const { data, ledger, company, nextNum } = useStore();
  const L = useLookups();
  const O = useOptions();
  const nav = useNav();
  const dlg = useDialog();
  const print = usePrint();
  const meta = META[type];
  const isPO = type === 'purchaseorder';
  const [tab, setTab] = useState(isPO ? 'items' : 'expenses');
  const [side, setSide] = useState(true);
  const [sub, setSub] = useState(null);
  const defaultBank = data.accounts.find((a) => a.sys === 'bank')?.id || data.accounts.find((a) => a.type === 'Bank')?.id || '';

  const lastCost = (itemId, vendorId) => {
    const ts = data.txns.filter((t) => t.vendorId === vendorId && ['bill', 'check'].includes(t.type) && !t.voided).sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const t of ts) {
      const l = (t.itemLines || []).find((x) => x.itemId === itemId);
      if (l) return num(l.cost);
    }
    return null;
  };

  const itemLine = (it, vendorId, q = 1) => {
    const cost = lastCost(it.id, vendorId) ?? num(it.cost);
    return { ...blankItem(), itemId: it.id, description: it.purchaseDescription || it.description || it.name, qty: q, uom: it.uom || '', cost, amount: round2(q * cost) };
  };

  const vendorDefaults = (base, vid, vObj) => {
    const v = vObj || L.vendorMap.get(vid);
    if (!v) return { ...base, vendorId: vid };
    const terms = v.terms || base.terms;
    return { ...base, vendorId: vid, terms, dueDate: type === 'bill' ? dueFromTerms(base.date, terms) : base.dueDate, address: [v.company || v.name, v.address, v.city].filter(Boolean).join('\n') };
  };

  const withLines = (t) => ({
    ...t,
    expenseLines: ensureTrailing((t.expenseLines || []).map((l) => ({ ...blankExp(), ...l, key: k() })), blankExp, emptyExp),
    itemLines: ensureTrailing((t.itemLines || []).map((l) => ({ ...blankItem(), ...l, key: k() })), blankItem, emptyItem),
  });

  const makeNew = (t) => {
    if (t) return withLines(t);
    const date = today();
    return withLines({
      id: undefined,
      type,
      num: meta.start ? nextNum(type, meta.start) : '',
      date,
      dueDate: date,
      vendorId: '',
      address: '',
      terms: '',
      accountId: defaultBank,
      memo: '',
      expectedDate: '',
      closed: false,
      voided: false,
    });
  };

  const [f, setF] = useState(() => {
    if (txnId) {
      const t = data.txns.find((x) => x.id === txnId);
      if (t) return makeNew(t);
    }
    let n = makeNew(null);
    if (template) {
      n = withLines({ ...n, ...memoTemplate(template), type, num: n.num, date: n.date });
      if (type === 'bill') n.dueDate = dueFromTerms(n.date, n.terms);
    }
    if (fromId) {
      const po = data.txns.find((x) => x.id === fromId);
      if (po) {
        n = vendorDefaults({ ...n, vendorId: po.vendorId }, po.vendorId);
        n.itemLines = (po.itemLines || [])
          .map((l) => ({ ...blankItem(), ...l, key: k(), qty: num(l.qty) - num(l.received), amount: round2((num(l.qty) - num(l.received)) * num(l.cost)), received: undefined }))
          .filter((l) => l.qty > 0);
        n = withLines(n);
        n.sourceId = po.id;
        n.memo = `Received against ${po.num}`;
      }
    }
    if (prefill?.vendorId) n = vendorDefaults(n, prefill.vendorId);
    if (prefill?.itemId) {
      const it = L.itemMap.get(prefill.itemId);
      if (it) n.itemLines = ensureTrailing([itemLine(it, n.vendorId, Math.max(1, num(it.reorderPoint) || 1))], blankItem, emptyItem);
    }
    return n;
  });

  // template: which fields / columns show on screen and what they are called
  const tpl = useFormTemplate(type, f.templateId);
  const scr = (key) => tpl.screen?.[key] !== false;
  const lbl = (key, d) => tpl.labels?.[key] || d;
  const col = (key) => tpl.columns.find((c) => c.key === key) || {};
  const colOn = (key) => col(key).screen !== false;
  const colLbl = (key, d) => col(key).label || d;

  const expTotal = round2(f.expenseLines.reduce((s, l) => s + num(l.amount), 0));
  const itemTotal = round2(f.itemLines.reduce((s, l) => s + num(l.amount), 0));
  const total = round2(expTotal + itemTotal);
  const vendor = L.vendorMap.get(f.vendorId) || L.customerMap.get(f.vendorId);
  const saved = data.txns.find((t) => t.id === f.id);
  const open = f.id ? ledger.open.get(f.id) : undefined;

  const set = (key) => (v) =>
    setF((x) => {
      const n = { ...x, [key]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v };
      if ((key === 'date' || key === 'terms') && type === 'bill') n.dueDate = dueFromTerms(n.date, n.terms);
      return n;
    });

  const setExp = (i, patch) =>
    setF((x) => {
      const lines = [...x.expenseLines];
      lines[i] = { ...lines[i], ...patch };
      return { ...x, expenseLines: ensureTrailing(lines, blankExp, emptyExp) };
    });
  const setItem = (i, patch) =>
    setF((x) => {
      const lines = [...x.itemLines];
      let l = { ...lines[i], ...patch };
      if ('itemId' in patch) {
        const it = L.itemMap.get(patch.itemId);
        if (it) l = { ...itemLine(it, x.vendorId, num(lines[i].qty) || 1), key: lines[i].key, customerId: lines[i].customerId };
      } else if ('qty' in patch || 'cost' in patch) {
        l.amount = round2((l.qty === '' ? 1 : num(l.qty)) * num(l.cost));
      } else if ('amount' in patch && num(l.qty)) {
        l.cost = Math.round((num(l.amount) / num(l.qty)) * 1e5) / 1e5; // precise, so qty × cost gives the amount back
      }
      lines[i] = l;
      return { ...x, itemLines: ensureTrailing(lines, blankItem, emptyItem) };
    });
  const removeLine = (which, i) =>
    setF((x) =>
      which === 'exp'
        ? { ...x, expenseLines: ensureTrailing(x.expenseLines.filter((_, j) => j !== i), blankExp, emptyExp) }
        : { ...x, itemLines: ensureTrailing(x.itemLines.filter((_, j) => j !== i), blankItem, emptyItem) },
    );

  const build = async () => {
    if (type !== 'check' && !f.vendorId) {
      await dlg.alert('Please choose a vendor.');
      return null;
    }
    if (type === 'check' && !f.accountId) {
      await dlg.alert('Choose the bank account this check is drawn on.');
      return null;
    }
    const expenseLines = f.expenseLines.filter((l) => !emptyExp(l)).map(({ key, ...l }) => ({ ...l, amount: round2(num(l.amount)) }));
    const itemLines = f.itemLines.filter((l) => !emptyItem(l)).map(({ key, ...l }) => ({ ...l, qty: num(l.qty), cost: num(l.cost), amount: round2(num(l.amount)) }));
    if (expenseLines.some((l) => !l.accountId)) {
      await dlg.alert('Every expense line needs an account.');
      return null;
    }
    if (!expenseLines.length && !itemLines.length) {
      await dlg.alert('Enter at least one expense or item line.');
      return null;
    }
    const rec = { ...f, expenseLines, itemLines, total: round2(expenseLines.reduce((s, l) => s + l.amount, 0) + itemLines.reduce((s, l) => s + l.amount, 0)) };
    if (type !== 'check') delete rec.accountId;
    return rec;
  };

  const beforeSave = async () => {
    if (type === 'check') {
      const acc = L.accountMap.get(f.accountId);
      const bal = displayBal(acc, ledger.acctBal.get(f.accountId) || 0) + (saved ? num(saved.total) : 0);
      if (acc?.type === 'Bank' && total > bal && !(await dlg.confirm(`This check (${money(total)}) is more than the balance in ${acc.name} (${money(bal)}). Save anyway?`, { ok: 'Save anyway' })))
        return false;
    }
    return true;
  };

  // receiving against a purchase order updates its received quantities — done for every save,
  // void and delete by useTxnController (lib/orders.js)
  const ctl = useTxnController({
    winId,
    type,
    txnId,
    f,
    setF,
    makeNew,
    build,
    beforeSave,
    printNode: () => saved && print(<TxnPrint txn={{ ...saved, templateId: f.templateId }} company={company} L={L} ledger={ledger} />),
  });

  const openPOs = useMemo(
    () => (type === 'bill' && f.vendorId && ctl.isNew ? data.txns.filter((t) => t.type === 'purchaseorder' && t.vendorId === f.vendorId && !t.closed && !t.voided) : []),
    [type, f.vendorId, data.txns, ctl.isNew],
  );
  const recent = useMemo(
    () => (f.vendorId ? data.txns.filter((t) => t.vendorId === f.vendorId && t.id !== f.id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6) : []),
    [data.txns, f.vendorId, f.id],
  );

  const pullPO = (po) => {
    setF((x) => {
      const lines = (po.itemLines || [])
        .map((l) => ({ ...blankItem(), ...l, key: k(), qty: num(l.qty) - num(l.received), amount: round2((num(l.qty) - num(l.received)) * num(l.cost)), received: undefined }))
        .filter((l) => l.qty > 0);
      return { ...x, sourceId: po.id, memo: x.memo || `Received against ${po.num}`, itemLines: ensureTrailing(lines, blankItem, emptyItem) };
    });
    setTab('items');
  };

  const extra = (
    <>
      {isPO && (
        <TB
          icon={PackageCheck}
          label="Receive & Bill"
          disabled={ctl.isNew || f.closed}
          onClick={() => nav.open('bill', { fromId: f.id, n: Date.now() })}
        />
      )}
      {type === 'bill' && <TB icon={CreditCard} label="Pay Bill" disabled={ctl.isNew || !(open > 0)} onClick={() => nav.open('paybills', { prefill: { vendorId: f.vendorId, billId: f.id } })} />}
    </>
  );

  const bankAcc = L.accountMap.get(f.accountId);
  const bankBal = bankAcc ? displayBal(bankAcc, ledger.acctBal.get(f.accountId) || 0) : 0;
  const expenseAccOpts = O.accountOpts(null).filter((o) => !['Accounts Receivable', 'Accounts Payable'].includes(o.sub));

  const expenseGrid = (
    <div className="lines">
      <table>
        <colgroup>
          <col style={{ width: 280 }} />
          <col style={{ width: 130 }} />
          <col />
          <col style={{ width: 200 }} />
          <col style={{ width: 30 }} />
        </colgroup>
        <thead>
          <tr>
            <th>Account</th>
            <th className="r">Amount</th>
            <th>Memo</th>
            <th>Customer:Job</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {f.expenseLines.map((l, i) => (
            <tr key={l.key}>
              <td>
                <Combo value={l.accountId} options={expenseAccOpts} onChange={(id) => setExp(i, { accountId: id })} onAddNew={(name) => setSub({ kind: 'account', name, line: i })} dropWidth={380} />
              </td>
              <td>
                <MoneyInput value={l.amount} onChange={(v) => setExp(i, { amount: v })} />
              </td>
              <td>
                <input value={l.memo || ''} onChange={(e) => setExp(i, { memo: e.target.value })} />
              </td>
              <td>
                <NameCombo which="customer" value={l.customerId} onChange={(id) => setExp(i, { customerId: id })} />
              </td>
              <td className="del-cell">
                {!emptyExp(l) && (
                  <button className="icon-btn" tabIndex={-1} onClick={() => removeLine('exp', i)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const itemGrid = (
    <div className="lines">
      <table>
        <colgroup>
          <col style={{ width: colOn('desc') ? 210 : undefined }} />
          {colOn('desc') && <col />}
          <col style={{ width: 80 }} />
          {colOn('uom') && <col style={{ width: 64 }} />}
          <col style={{ width: 110 }} />
          <col style={{ width: 120 }} />
          {isPO ? <col style={{ width: 80 }} /> : <col style={{ width: 170 }} />}
          <col style={{ width: 30 }} />
        </colgroup>
        <thead>
          <tr>
            <th>Item</th>
            {colOn('desc') && <th>{colLbl('desc', 'Description')}</th>}
            <th className="r">{colLbl('qty', 'Qty')}</th>
            {colOn('uom') && <th>{colLbl('uom', 'U/M')}</th>}
            <th className="r">{colLbl('rate', 'Cost')}</th>
            <th className="r">{colLbl('amount', 'Amount')}</th>
            {isPO ? <th className="r">Rcv'd</th> : <th>Customer:Job</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {f.itemLines.map((l, i) => (
            <tr key={l.key}>
              <td>
                <Combo value={l.itemId} options={O.itemOpts} onChange={(id) => setItem(i, { itemId: id })} onAddNew={(name) => setSub({ kind: 'item', name, line: i })} dropWidth={460} />
              </td>
              {colOn('desc') && (
                <td>
                  <input value={l.description || ''} onChange={(e) => setItem(i, { description: e.target.value })} />
                </td>
              )}
              <td>
                <QtyInput value={l.qty} onChange={(v) => setItem(i, { qty: v })} />
              </td>
              {colOn('uom') && (
                <td>
                  <input value={l.uom || ''} onChange={(e) => setItem(i, { uom: e.target.value })} />
                </td>
              )}
              <td>
                <MoneyInput value={l.cost} onChange={(v) => setItem(i, { cost: v })} />
              </td>
              <td>
                <MoneyInput value={l.amount} onChange={(v) => setItem(i, { amount: v })} />
              </td>
              {isPO ? (
                <td className="ro">{l.received ? fq(l.received) : ''}</td>
              ) : (
                <td>
                  <NameCombo which="customer" value={l.customerId} onChange={(id) => setItem(i, { customerId: id })} />
                </td>
              )}
              <td className="del-cell">
                {!emptyItem(l) && (
                  <button className="icon-btn" tabIndex={-1} onClick={() => removeLine('item', i)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="txn-form">
      <div className="txn-main">
        <StdRibbon {...ctl.ribbonProps} extra={extra} />
        <div className="txn-scroll">
          <div className="txn-head">
            {type === 'check' && (
              <>
                <Field label="Bank account" style={{ width: 280 }}>
                  <Combo value={f.accountId} options={O.bankOpts} onChange={set('accountId')} />
                </Field>
                <span className="muted">
                  Ending balance <b className={bankBal < 0 ? 'neg' : ''}>{money(bankBal)}</b>
                </span>
              </>
            )}
            <TemplatePicker formType={type} value={f.templateId} onChange={(id) => setF((x) => ({ ...x, templateId: id }))} />
          </div>
          <div className="txn-paper tinted">
            <div className="doc-top">
              <div className="flex" style={{ gap: 18 }}>
                <h2 className="doc-title">{meta.title}</h2>
                {f.voided && <span className="void-stamp">VOID</span>}
                {type === 'bill' && open !== undefined && Math.abs(open) < 0.005 && total > 0 && <span className="paid-stamp">PAID</span>}
                {isPO && f.closed && <span className="badge ok">Closed / Received</span>}
                {type === 'vendorcredit' && (
                  <span className="badge pri" style={{ height: 22 }}>
                    Credit
                  </span>
                )}
              </div>
              <div className="doc-meta">
                <Field label="Date">
                  <DateInput value={f.date} onChange={set('date')} />
                </Field>
                <Field label={lbl('num', meta.numLabel)}>
                  <input value={f.num || ''} onChange={set('num')} />
                </Field>
              </div>
            </div>
            <div className="addr-row">
              <Field label={type === 'check' ? 'Pay to the order of' : 'Vendor'} style={{ width: 300 }}>
                <NameCombo
                  which={type === 'check' ? 'name' : 'vendor'}
                  prefer="vendor"
                  value={f.vendorId}
                  autoFocus={!txnId && type !== 'check'}
                  onChange={(id, rec) => setF((x) => vendorDefaults(x, id, rec))}
                  placeholder="Choose a vendor…"
                />
              </Field>
              {scr('billTo') && (
                <Field label="Address">
                  <textarea value={f.address || ''} onChange={set('address')} style={{ height: 60 }} />
                </Field>
              )}
              <div className="flex" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, width: 220 }}>
                {type === 'bill' && (
                  <>
                    {scr('terms') && (
                      <Field label={lbl('terms', 'Terms')}>
                        <Combo value={f.terms} allowFree onChange={set('terms')} options={listOpts(L.lists.terms)} />
                      </Field>
                    )}
                    {scr('dueDate') && (
                      <Field label={lbl('dueDate', 'Bill due')}>
                        <DateInput value={f.dueDate} onChange={set('dueDate')} />
                      </Field>
                    )}
                  </>
                )}
                {isPO && scr('expectedDate') && (
                  <Field label={lbl('expectedDate', 'Expected delivery')}>
                    <DateInput value={f.expectedDate} onChange={set('expectedDate')} />
                  </Field>
                )}
              </div>
              <div className="bal-box" style={{ minWidth: 190, alignSelf: 'flex-start' }}>
                <div className="lbl">{type === 'check' ? 'Amount' : type === 'vendorcredit' ? 'Credit amount' : isPO ? 'Total' : 'Amount due'}</div>
                <div className="val">
                  {company.currency} {money(total)}
                </div>
                {type === 'bill' && open !== undefined && !ctl.dirty && open !== total && <div className="small muted mt">Open balance {money(open)}</div>}
              </div>
            </div>
            {scr('memo') && (
              <Field label={lbl('memo', 'Memo')} style={{ marginBottom: 10 }}>
                <input value={f.memo || ''} onChange={set('memo')} />
              </Field>
            )}

            {!isPO && (
              <Tabs
                tabs={[
                  { id: 'expenses', label: `Expenses  ${money(expTotal)}` },
                  { id: 'items', label: `Items  ${money(itemTotal)}` },
                ]}
                value={tab}
                onChange={setTab}
                className="mb"
              />
            )}
            {tab === 'expenses' && !isPO ? expenseGrid : itemGrid}
            <div className="line-tools">
              {isPO ? 'Inventory items you order show as "On P.O." until received.' : 'Use Items for stock you buy (updates inventory & average cost); Expenses for rent, freight, utilities, etc.'}
              {isPO && (
                <label className="check sp">
                  <input type="checkbox" checked={!!f.closed} onChange={(e) => setF((x) => ({ ...x, closed: e.target.checked, autoClosed: false }))} /> Closed
                </label>
              )}
            </div>
          </div>
        </div>
        <FormActions onSaveClose={() => ctl.save('close')} onSaveNew={() => ctl.save('new')} onClear={ctl.isNew ? ctl.reset : () => ctl.load(f.id)} clearLabel={ctl.isNew ? 'Clear' : 'Revert'} />
      </div>
      <aside className={'txn-side' + (side ? '' : ' closed')}>
        <button className="icon-btn" onClick={() => setSide((s) => !s)} style={{ alignSelf: side ? 'flex-end' : 'center' }}>
          {side ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        </button>
        {side && (
          <>
            {vendor ? (
              <SideCard title="Vendor">
                <div className="b">{vendor.name}</div>
                <div className="side-row">
                  <span className="l">Phone</span>
                  <span>{vendor.phone || '—'}</span>
                </div>
                <div className="side-row">
                  <span className="l">Balance</span>
                  <span className="b">{money(ledger.vendBal.get(vendor.id) || 0)}</span>
                </div>
                <button className="side-link" onClick={() => nav.report('quickreport', { nameId: vendor.id })}>
                  QuickReport
                </button>
                <button className="side-link" onClick={() => nav.open('paybills', { prefill: { vendorId: vendor.id } })}>
                  Pay bills
                </button>
              </SideCard>
            ) : (
              <SideCard title="Vendor">
                <span className="muted small">Choose a vendor to see balance and open purchase orders.</span>
              </SideCard>
            )}
            {openPOs.length > 0 && (
              <SideCard title="Open purchase orders">
                {openPOs.map((po) => (
                  <div key={po.id} className="side-txn" onClick={() => pullPO(po)} title="Click to receive this PO into the bill">
                    <span>{po.num}</span>
                    <span>{money(po.total)}</span>
                    <small>{fmtDate(po.date, company.dateStyle)} · click to add</small>
                  </div>
                ))}
              </SideCard>
            )}
            {recent.length > 0 && (
              <SideCard title="Recent transactions">
                {recent.map((t) => (
                  <div key={t.id} className="side-txn" onClick={() => nav.openTxn(t)}>
                    <span>
                      {TXN_TYPES[t.type]?.label} {t.num}
                    </span>
                    <span>{money(txnTotal(t, ledger))}</span>
                    <small>{fmtDate(t.date, company.dateStyle)}</small>
                  </div>
                ))}
              </SideCard>
            )}
          </>
        )}
      </aside>
      {ctl.modals}
      {sub?.kind === 'account' && <AccountModal initial={{ name: sub.name }} defaultType="Expense" onClose={() => setSub(null)} onSaved={(a) => setExp(sub.line, { accountId: a.id })} />}
      {sub?.kind === 'item' && (
        <ItemModal
          initial={{ name: sub.name }}
          onClose={() => setSub(null)}
          onSaved={(it) => {
            const line = sub.line;
            setF((x) => {
              const lines = [...x.itemLines];
              const q = num(lines[line]?.qty) || 1;
              lines[line] = { ...blankItem(), itemId: it.id, description: it.purchaseDescription || it.name, qty: q, uom: it.uom, cost: num(it.cost), amount: round2(q * num(it.cost)) };
              return { ...x, itemLines: ensureTrailing(lines, blankItem, emptyItem) };
            });
          }}
        />
      )}
    </div>
  );
}
