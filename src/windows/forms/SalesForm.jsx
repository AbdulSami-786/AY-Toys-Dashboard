import { useEffect, useMemo, useState } from 'react';
import { Trash2, Wallet, FileOutput, PanelRightClose, PanelRightOpen, AlertTriangle } from 'lucide-react';
import { useStore, useLookups } from '../../store/store';
import { useNav } from '../../store/nav';
import { useOptions, listOpts } from '../../store/options';
import { useDialog } from '../../components/ui';
import { usePrint, TxnPrint } from '../../components/print';
import Combo from '../../components/Combo';
import { Field, DateInput, MoneyInput, QtyInput } from '../../components/inputs';
import { StdRibbon, FormActions, useTxnController, blankLine, ensureTrailing, SideCard, TB, TemplatePicker } from './common';
import { useFormTemplate } from '../../store/templates';
import { NameCombo } from '../NameModals';
import { ItemModal } from '../ItemList';
import { salesTotals, txnTotal } from '../../lib/ledger';
import { cartonTotals } from '../../lib/templates';
import { money, num, round2, qty as fq } from '../../lib/format';
import { today, dueFromTerms, fmtDate } from '../../lib/dates';
import { TXN_TYPES } from '../../store/defaults';
import { memoTemplate } from '../../lib/memorize';

const META = {
  invoice: { title: 'Invoice', start: '1001', numLabel: 'Invoice #' },
  salesreceipt: { title: 'Sales Receipt', start: 'SR-1', numLabel: 'Sale No.' },
  creditmemo: { title: 'Credit Memo', start: 'CM-1', numLabel: 'Credit No.' },
  estimate: { title: 'Estimate', start: 'EST-1', numLabel: 'Estimate #' },
  salesorder: { title: 'Sales Order', start: 'SO-1', numLabel: 'S.O. No.' },
};

const isEmptyLine = (l) => !l.itemId && !l.description && (l.amount === '' || l.amount === undefined || l.amount === null);

export default function SalesForm({ type, txnId, prefill, template, fromId, winId }) {
  const { data, ledger, company, nextNum } = useStore();
  const L = useLookups();
  const O = useOptions();
  const nav = useNav();
  const dlg = useDialog();
  const print = usePrint();
  const meta = META[type];
  const UF = ledger.sys.UF;
  const [side, setSide] = useState(true);
  const [cur, setCur] = useState(0);
  const [sub, setSub] = useState(null);

  const priceFor = (item, customerId) => {
    const c = L.customerMap.get(customerId);
    const pl = L.lists.priceLevels.find((p) => p.id === c?.priceLevelId);
    return round2(num(item.price) * (1 + num(pl?.percent) / 100));
  };

  const customerDefaults = (base, cid, cObj) => {
    const c = cObj || L.customerMap.get(cid);
    if (!c) return { ...base, customerId: cid };
    const terms = c.terms || base.terms;
    return {
      ...base,
      customerId: cid,
      billTo: c.billTo || c.name,
      shipTo: c.shipTo || c.billTo || c.name,
      terms,
      dueDate: type === 'estimate' ? base.dueDate : dueFromTerms(base.date, terms),
      rep: c.rep || base.rep,
      lines: base.lines.map((l) => {
        const it = L.itemMap.get(l.itemId);
        return it ? { ...l, taxable: !!(it.taxable && c.taxable) } : l;
      }),
    };
  };

  // Pkg = pieces in one carton (set on the item). A line is sold as cartons + loose pieces: qty = ctn × pkg + pcs.
  const lineFor = (item, customerId, prev) => {
    const c = L.customerMap.get(customerId);
    if (item.type === 'Discount') return { ...blankLine(), itemId: item.id, description: item.description || item.name, qty: '', rate: `${num(item.percent)}%`, amount: 0, taxable: false };
    const rate = priceFor(item, customerId);
    const pkg = num(item.pkg);
    let ctn = '';
    let pcs = 1;
    if (prev && prev.qty !== '' && prev.qty !== undefined) {
      // changing the item keeps the cartons and pieces already typed
      ctn = pkg > 0 && num(prev.ctn) ? num(prev.ctn) : '';
      pcs = pkg > 0 && num(prev.ctn) ? num(prev.pcs) : num(prev.qty);
    } else if (pkg > 0) {
      ctn = 1;
      pcs = 0;
    }
    const qty = num(ctn) * pkg + num(pcs);
    return { ...blankLine(), itemId: item.id, description: item.description || item.name, pkg: pkg || '', ctn, pcs, qty, uom: item.uom || '', rate, amount: round2(qty * rate), taxable: !!(item.taxable && c?.taxable) };
  };
  // lines saved before cartons existed have only a qty: show it as loose pieces
  const withCartons = (l) => (l.itemId && l.qty !== '' && l.qty !== undefined && l.ctn === undefined && l.pcs === undefined ? { ...l, ctn: '', pcs: l.qty } : l);

  const makeNew = (t) => {
    if (t) {
      return {
        ...t,
        lines: ensureTrailing(
          (t.lines || []).map((l) => withCartons({ ...blankLine(), ...l, key: Math.random().toString(36).slice(2) })),
          blankLine,
          isEmptyLine,
        ),
      };
    }
    const date = today();
    return {
      id: undefined,
      type,
      num: nextNum(type, meta.start),
      date,
      customerId: '',
      billTo: '',
      shipTo: '',
      terms: '',
      dueDate: type === 'estimate' ? '' : date,
      poNumber: '',
      rep: '',
      shipDate: '',
      via: '',
      depositTo: company.defaultDepositTo || UF,
      method: 'Cash',
      ref: '',
      lines: [blankLine()],
      message: company.defaultMessage || '',
      memo: '',
      taxRate: num(company.taxRate),
      voided: false,
      closed: false,
    };
  };

  const [f, setF] = useState(() => {
    if (txnId) {
      const t = data.txns.find((x) => x.id === txnId);
      if (t) return makeNew(t);
    }
    let n = makeNew(null);
    if (template) {
      const tpl = memoTemplate(template);
      n = { ...n, ...tpl, type, num: n.num, date: n.date, lines: ensureTrailing((tpl.lines || []).map((l) => withCartons({ ...blankLine(), ...l })), blankLine, isEmptyLine) };
      if (type !== 'estimate') n.dueDate = dueFromTerms(n.date, n.terms);
    }
    if (fromId) {
      const src = data.txns.find((x) => x.id === fromId);
      if (src) {
        n = customerDefaults({ ...n, customerId: src.customerId }, src.customerId);
        n.lines = ensureTrailing(
          (src.lines || []).map((l) => withCartons({ ...blankLine(), ...l, key: Math.random().toString(36).slice(2) })),
          blankLine,
          isEmptyLine,
        );
        n.poNumber = src.poNumber || '';
        n.sourceId = src.id;
        n.memo = `From ${TXN_TYPES[src.type].label} ${src.num}`;
      }
    }
    if (prefill?.customerId) n = customerDefaults(n, prefill.customerId);
    if (prefill?.itemId) {
      const it = L.itemMap.get(prefill.itemId);
      if (it) n.lines = ensureTrailing([lineFor(it, n.customerId)], blankLine, isEmptyLine);
    }
    return n;
  });

  // template: which fields / columns show on screen and what they are called
  const tpl = useFormTemplate(type, f.templateId);
  const scr = (k) => tpl.screen?.[k] !== false;
  const lbl = (k, d) => tpl.labels?.[k] || d;
  const col = (k) => tpl.columns.find((c) => c.key === k) || {};
  const colOn = (k) => col(k).screen !== false;
  const colLbl = (k, d) => col(k).label || d;

  const calc = useMemo(() => salesTotals(f.lines.filter((l) => !isEmptyLine(l)), f.taxRate, L.itemMap), [f.lines, f.taxRate, L.itemMap]);
  const calcByKey = useMemo(() => new Map(calc.lines.map((l) => [l.key, l])), [calc]);
  const customer = L.customerMap.get(f.customerId);
  const cartons = useMemo(() => cartonTotals(f.lines.filter((l) => !isEmptyLine(l))), [f.lines]);
  const saved = data.txns.find((t) => t.id === f.id);
  const showTax = num(company.taxRate) > 0 || num(f.taxRate) > 0 || f.lines.some((l) => l.taxable);
  const sells = type === 'invoice' || type === 'salesreceipt';

  // quantity available (adds back this transaction's own saved quantities)
  const available = (itemId) => {
    let q = ledger.itemStat(itemId).qty;
    if (saved && sells && !saved.voided) (saved.lines || []).forEach((l) => l.itemId === itemId && (q += num(l.qty)));
    return q;
  };
  const shortLines = sells
    ? f.lines.filter((l) => {
        const it = L.itemMap.get(l.itemId);
        if (!it || it.type !== 'Inventory Part') return false;
        const want = f.lines.filter((x) => x.itemId === l.itemId).reduce((s, x) => s + num(x.qty), 0);
        return want > available(l.itemId);
      })
    : [];

  const set = (k) => (v) =>
    setF((x) => {
      const n = { ...x, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v };
      if (k === 'date' && type !== 'estimate' && x.terms) n.dueDate = dueFromTerms(n.date, x.terms);
      if (k === 'terms') n.dueDate = dueFromTerms(n.date, n.terms);
      return n;
    });

  const setLine = (i, patch) =>
    setF((x) => {
      const lines = [...x.lines];
      let l = { ...lines[i], ...patch };
      if ('itemId' in patch) {
        const it = L.itemMap.get(patch.itemId);
        if (it) {
          const fresh = lineFor(it, x.customerId, lines[i]);
          l = { ...fresh, key: lines[i].key };
        }
      } else if ('ctn' in patch || 'pcs' in patch || 'qty' in patch || 'rate' in patch) {
        const it = L.itemMap.get(l.itemId);
        if (it?.type === 'Discount') {
          if (!String(l.rate).includes('%')) l.amount = -Math.abs(num(l.rate));
        } else {
          const pkg = num(l.pkg) || num(it?.pkg);
          if (pkg) l.pkg = pkg;
          if ('ctn' in patch || 'pcs' in patch) {
            l.qty = l.ctn === '' && l.pcs === '' ? '' : Math.round((num(l.ctn) * pkg + num(l.pcs)) * 1000) / 1000;
          } else if ('qty' in patch) {
            // typing the total: the cartons stay, the rest becomes loose pieces
            const q = num(l.qty);
            const whole = pkg > 0 && q >= num(l.ctn) * pkg;
            l.ctn = whole ? l.ctn : '';
            l.pcs = l.qty === '' ? '' : Math.round((q - (whole ? num(l.ctn) * pkg : 0)) * 1000) / 1000;
          }
          const q = l.qty === '' || l.qty === undefined ? 1 : num(l.qty);
          l.amount = round2(q * num(l.rate));
        }
      } else if ('amount' in patch) {
        const q = num(l.qty);
        if (q) l.rate = Math.round((num(l.amount) / q) * 1e5) / 1e5; // precise, so qty × rate gives the amount back
      }
      lines[i] = l;
      return { ...x, lines: ensureTrailing(lines, blankLine, isEmptyLine) };
    });

  const gridKeys = (e) => {
    if (e.ctrlKey && e.key === 'Insert') {
      e.preventDefault();
      setF((x) => {
        const lines = [...x.lines];
        lines.splice(cur, 0, blankLine());
        return { ...x, lines };
      });
    } else if (e.ctrlKey && e.key === 'Delete') {
      e.preventDefault();
      removeLine(cur);
    }
  };
  const removeLine = (i) =>
    setF((x) => {
      const lines = x.lines.filter((_, j) => j !== i);
      return { ...x, lines: ensureTrailing(lines, blankLine, isEmptyLine) };
    });

  const build = async () => {
    if (type !== 'salesreceipt' && !f.customerId) {
      await dlg.alert('Please choose a customer.');
      return null;
    }
    const lines = f.lines.filter((l) => !isEmptyLine(l));
    if (!lines.length) {
      await dlg.alert('Add at least one line item.');
      return null;
    }
    if (!f.date) {
      await dlg.alert('Enter a date.');
      return null;
    }
    const c = salesTotals(lines, f.taxRate, L.itemMap);
    const { key, ...rest } = f;
    return {
      ...rest,
      lines: c.lines.map(({ key: k, ...l }) => ({ ...l, qty: l.qty === '' ? '' : num(l.qty), ...(l.ctn !== undefined || l.pcs !== undefined ? { ctn: l.ctn === '' ? '' : num(l.ctn), pcs: l.pcs === '' ? '' : num(l.pcs), pkg: num(l.pkg) || '' } : {}), amount: round2(l.amount) })),
      subtotal: c.subtotal,
      tax: c.tax,
      taxRate: num(f.taxRate),
      total: c.total,
      dueDate: type === 'invoice' && !f.dueDate ? dueFromTerms(f.date, f.terms) : f.dueDate,
    };
  };

  const beforeSave = async (rec) => {
    if (shortLines.length && company.warnNegativeStock !== false) {
      const names = [...new Set(shortLines.map((l) => L.itemMap.get(l.itemId)?.name))];
      const msg = names.map((n) => {
        const it = data.items.find((i) => i.name === n);
        return `• ${n}: only ${fq(available(it.id))} ${it.uom || ''} available`;
      });
      if (!(await dlg.confirm(`You don't have enough quantity on hand:\n\n${msg.join('\n')}\n\nSave anyway? (on-hand will go negative)`, { ok: 'Save anyway' }))) return false;
    }
    if (type === 'invoice' && customer && num(customer.creditLimit) > 0 && company.warnCreditLimit !== false) {
      const bal = (ledger.custBal.get(customer.id) || 0) - (saved && !saved.voided ? num(saved.total) : 0) + rec.total;
      if (bal > num(customer.creditLimit) && !(await dlg.confirm(`This invoice puts ${customer.name} at ${money(bal)}, over their credit limit of ${money(customer.creditLimit)}.\n\nSave anyway?`, { ok: 'Save anyway' })))
        return false;
    }
    return true;
  };

  // an invoice made from an estimate / sales order closes it (and reopens it if voided or deleted) —
  // done by useTxnController (lib/orders.js)
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

  useEffect(() => {
    if (cur >= f.lines.length) setCur(Math.max(0, f.lines.length - 1));
  }, [f.lines.length, cur]);

  const open = f.id ? ledger.open.get(f.id) : undefined;
  const paid = type === 'invoice' && open !== undefined && Math.abs(open) < 0.005 && calc.total > 0;

  const convert = async () => {
    let id = f.id;
    if (ctl.isNew || ctl.dirty) {
      const s = await ctl.save('stay');
      if (!s) return;
      id = s.id;
    }
    nav.open('invoice', { fromId: id, n: Date.now() });
  };

  const extra = (
    <>
      {type === 'invoice' && (
        <TB icon={Wallet} label="Receive Pmt" disabled={ctl.isNew || !open} onClick={() => nav.open('payment', { prefill: { customerId: f.customerId, invoiceId: f.id } })} />
      )}
      {(type === 'estimate' || type === 'salesorder') && <TB icon={FileOutput} label="Create Invoice" onClick={convert} disabled={f.closed} />}
    </>
  );

  // side panel data
  const recent = useMemo(
    () =>
      f.customerId
        ? data.txns
            .filter((t) => t.customerId === f.customerId && t.id !== f.id)
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .slice(0, 6)
        : [],
    [data.txns, f.customerId, f.id],
  );
  const curItem = L.itemMap.get(f.lines[cur]?.itemId);
  const lastPrice = useMemo(() => {
    if (!curItem || !f.customerId) return null;
    const ts = data.txns
      .filter((t) => t.customerId === f.customerId && t.id !== f.id && ['invoice', 'salesreceipt'].includes(t.type) && !t.voided)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const t of ts) {
      const l = (t.lines || []).find((x) => x.itemId === curItem.id);
      if (l) return { rate: l.rate, date: t.date, num: t.num };
    }
    return null;
  }, [curItem, f.customerId, f.id, data.txns]);

  const depositOpts = [{ id: UF, label: 'Undeposited Funds' }, ...O.bankOpts];

  return (
    <div className="txn-form">
      <div className="txn-main">
        <StdRibbon {...ctl.ribbonProps} extra={extra} />
        <div className="txn-scroll">
          <div className="txn-head">
            <Field label="Customer:Job" style={{ width: 300 }}>
              <NameCombo
                which="customer"
                value={f.customerId}
                autoFocus={!txnId}
                onChange={(id, rec) => setF((x) => customerDefaults(x, id, rec))}
                placeholder="Choose a customer…"
              />
            </Field>
            {type === 'salesreceipt' && (
              <>
                <Field label="Payment method" style={{ width: 160 }}>
                  <Combo value={f.method} allowFree onChange={set('method')} options={listOpts(L.lists.paymentMethods)} />
                </Field>
                <Field label="Check / Ref no." style={{ width: 130 }}>
                  <input value={f.ref || ''} onChange={set('ref')} />
                </Field>
                <Field label="Deposit to" style={{ width: 220 }}>
                  <Combo value={f.depositTo} onChange={set('depositTo')} options={depositOpts} />
                </Field>
              </>
            )}
            {customer && num(customer.creditLimit) > 0 && (ledger.custBal.get(customer.id) || 0) > num(customer.creditLimit) && (
              <span className="badge err">
                <AlertTriangle size={11} /> Over credit limit
              </span>
            )}
            <TemplatePicker formType={type} value={f.templateId} onChange={(id) => setF((x) => ({ ...x, templateId: id }))} />
          </div>

          <div className="txn-paper tinted">
            <div className="doc-top">
              <div className="flex" style={{ gap: 18 }}>
                <h2 className="doc-title">{meta.title}</h2>
                {f.voided && <span className="void-stamp">VOID</span>}
                {paid && <span className="paid-stamp">PAID</span>}
                {f.closed && <span className="badge ok">Closed</span>}
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
              {scr('billTo') && (
                <Field label={lbl('billTo', type === 'salesreceipt' ? 'Sold to' : 'Bill to')}>
                  <textarea value={f.billTo || ''} onChange={set('billTo')} />
                </Field>
              )}
              {type !== 'salesreceipt' && type !== 'creditmemo' && scr('shipTo') && (
                <Field label={lbl('shipTo', 'Ship to')}>
                  <textarea value={f.shipTo || ''} onChange={set('shipTo')} />
                </Field>
              )}
            </div>

            <div className="strip">
              {type !== 'salesreceipt' && scr('poNumber') && (
                <Field label={lbl('poNumber', 'P.O. Number')}>
                  <input value={f.poNumber || ''} onChange={set('poNumber')} />
                </Field>
              )}
              {(type === 'invoice' || type === 'salesorder' || type === 'estimate') && scr('terms') && (
                <Field label={lbl('terms', 'Terms')}>
                  <Combo value={f.terms} allowFree onChange={set('terms')} options={listOpts(L.lists.terms)} />
                </Field>
              )}
              {type === 'invoice' && scr('dueDate') && (
                <Field label={lbl('dueDate', 'Due Date')}>
                  <DateInput value={f.dueDate} onChange={set('dueDate')} />
                </Field>
              )}
              {type === 'estimate' && scr('dueDate') && (
                <Field label={lbl('dueDate', 'Expiration Date')}>
                  <DateInput value={f.dueDate} onChange={set('dueDate')} />
                </Field>
              )}
              {scr('rep') && (
                <Field label={lbl('rep', 'Rep')}>
                  <Combo value={f.rep} allowFree onChange={set('rep')} options={listOpts(L.lists.reps)} />
                </Field>
              )}
              {(type === 'invoice' || type === 'salesorder') && (
                <>
                  {scr('shipDate') && (
                    <Field label={lbl('shipDate', 'Ship Date')}>
                      <DateInput value={f.shipDate} onChange={set('shipDate')} />
                    </Field>
                  )}
                  {scr('via') && (
                    <Field label={lbl('via', 'Via')}>
                      <Combo value={f.via} allowFree onChange={set('via')} options={listOpts(L.lists.shipVia)} />
                    </Field>
                  )}
                </>
              )}
            </div>

            <div className="lines" onKeyDown={gridKeys}>
              <table>
                <colgroup>
                  <col style={{ width: 34 }} />
                  <col style={{ width: colOn('desc') ? 190 : undefined }} />
                  {colOn('desc') && <col />}
                  {colOn('pkg') && <col style={{ width: 56 }} />}
                  {colOn('ctn') && <col style={{ width: 60 }} />}
                  {colOn('pcs') && <col style={{ width: 60 }} />}
                  <col style={{ width: 72 }} />
                  {colOn('uom') && <col style={{ width: 56 }} />}
                  <col style={{ width: 96 }} />
                  <col style={{ width: 110 }} />
                  {showTax && <col style={{ width: 44 }} />}
                  <col style={{ width: 30 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{colLbl('item', 'Item')}</th>
                    {colOn('desc') && <th>{colLbl('desc', 'Description')}</th>}
                    {colOn('pkg') && <th className="r">{colLbl('pkg', 'Pkg')}</th>}
                    {colOn('ctn') && <th className="r">{colLbl('ctn', 'Ctn')}</th>}
                    {colOn('pcs') && <th className="r">{colLbl('pcs', 'Pcs')}</th>}
                    <th className="r">{colLbl('qty', 'T/Qty')}</th>
                    {colOn('uom') && <th>{colLbl('uom', 'U/M')}</th>}
                    <th className="r">{colLbl('rate', 'Rate')}</th>
                    <th className="r">{colLbl('amount', 'Amount')}</th>
                    {showTax && <th>Tax</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {f.lines.map((l, i) => {
                    const it = L.itemMap.get(l.itemId);
                    const short = shortLines.includes(l);
                    const computed = calcByKey.get(l.key);
                    return (
                      <tr key={l.key} className={(i === cur ? 'cur ' : '') + (short ? 'warn' : '')} onFocus={() => setCur(i)}>
                        <td className="ro" style={{ textAlign: 'center' }}>
                          {isEmptyLine(l) ? '' : i + 1}
                        </td>
                        <td>
                          <Combo
                            value={l.itemId}
                            options={O.itemOpts}
                            onChange={(id) => setLine(i, { itemId: id })}
                            onAddNew={(name) => setSub({ kind: 'item', name, line: i })}
                            dropWidth={460}
                          />
                        </td>
                        {colOn('desc') && (
                          <td>
                            <input value={l.description || ''} onChange={(e) => setLine(i, { description: e.target.value })} />
                          </td>
                        )}
                        {colOn('pkg') && <td className="ro">{num(l.pkg) || num(it?.pkg) ? fq(num(l.pkg) || num(it?.pkg)) : ''}</td>}
                        {colOn('ctn') && (
                          <td>
                            {it?.type === 'Discount' || !(num(l.pkg) || num(it?.pkg)) ? <input disabled /> : <QtyInput value={l.ctn ?? ''} onChange={(v) => setLine(i, { ctn: v })} />}
                          </td>
                        )}
                        {colOn('pcs') && <td>{it?.type === 'Discount' ? <input disabled /> : <QtyInput value={l.pcs ?? ''} onChange={(v) => setLine(i, { pcs: v })} />}</td>}
                        <td className={short ? 'ro qtywarn' : ''} style={short ? { padding: 0 } : undefined}>
                          {it?.type === 'Discount' ? <input disabled /> : <QtyInput value={l.qty} onChange={(v) => setLine(i, { qty: v })} />}
                        </td>
                        {colOn('uom') && (
                          <td>
                            <input value={l.uom || ''} onChange={(e) => setLine(i, { uom: e.target.value })} />
                          </td>
                        )}
                        <td>
                          {it?.type === 'Discount' ? (
                            <input className="num" value={l.rate ?? ''} onChange={(e) => setLine(i, { rate: e.target.value })} title="Type 5% for a percent discount, or an amount" />
                          ) : (
                            <MoneyInput value={l.rate} onChange={(v) => setLine(i, { rate: v })} />
                          )}
                        </td>
                        <td>
                          {it?.type === 'Discount' ? (
                            <input className="num" disabled value={computed ? money(computed.amount) : ''} />
                          ) : (
                            <MoneyInput value={l.amount} onChange={(v) => setLine(i, { amount: v })} />
                          )}
                        </td>
                        {showTax && (
                          <td className="cb">
                            <input type="checkbox" checked={!!l.taxable} onChange={(e) => setLine(i, { taxable: e.target.checked })} tabIndex={-1} />
                          </td>
                        )}
                        <td className="del-cell">
                          {!isEmptyLine(l) && (
                            <button className="icon-btn" tabIndex={-1} onClick={() => removeLine(i)} title="Delete line (Ctrl+Del)">
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
            <div className="line-tools">
              {cartons && (
                <span className="b" title="Total cartons · loose pieces · total quantity">
                  Total: {fq(cartons.ctn)} Ctn · {fq(cartons.pcs)} Pcs · {fq(cartons.qty)} Qty
                </span>
              )}
              <span>Ctrl+Ins insert line · Ctrl+Del delete line · type in Item to search by name/SKU</span>
              {shortLines.length > 0 && (
                <span className="badge err sp">
                  <AlertTriangle size={11} /> Not enough stock for {new Set(shortLines.map((l) => l.itemId)).size} item(s)
                </span>
              )}
            </div>

            <div className="txn-bottom">
              <div>
                <div className="grid2">
                  {scr('message') && (
                    <Field label={lbl('message', 'Customer message')} className="span2">
                      <Combo value={f.message} allowFree onChange={set('message')} options={listOpts(L.lists.messages)} />
                    </Field>
                  )}
                  {scr('memo') && (
                    <Field label={lbl('memo', 'Memo (internal)')} className="span2">
                      <input value={f.memo || ''} onChange={set('memo')} />
                    </Field>
                  )}
                </div>
                {(type === 'estimate' || type === 'salesorder') && (
                  <label className="check mt">
                    <input type="checkbox" checked={!!f.closed} onChange={(e) => setF((x) => ({ ...x, closed: e.target.checked, autoClosed: false }))} /> Mark as closed
                  </label>
                )}
              </div>
              <div className="totals">
                <span className="lbl">Subtotal</span>
                <span className="v">{money(calc.subtotal)}</span>
                {showTax && (
                  <>
                    <span className="lbl flex" style={{ justifyContent: 'flex-end' }}>
                      {company.taxName || 'Tax'}
                      <input className="num" style={{ width: 60, height: 24 }} value={f.taxRate} onChange={set('taxRate')} />%
                    </span>
                    <span className="v">{money(calc.tax)}</span>
                  </>
                )}
                <span className="sep" />
                <span className="lbl b">Total</span>
                <span className="v big">
                  {company.currency} {money(calc.total)}
                </span>
                {type === 'invoice' && open !== undefined && !ctl.dirty && (
                  <>
                    <span className="lbl">Payments applied</span>
                    <span className="v">{money(calc.total - open)}</span>
                    <span className="lbl b">Balance due</span>
                    <span className={'v b' + (open > 0 ? ' neg' : '')}>{money(open)}</span>
                  </>
                )}
                {type === 'creditmemo' && (
                  <>
                    <span className="lbl">Remaining credit</span>
                    <span className="v">{money(calc.total)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <FormActions onSaveClose={() => ctl.save('close')} onSaveNew={() => ctl.save('new')} onClear={ctl.isNew ? ctl.reset : () => ctl.load(f.id)} clearLabel={ctl.isNew ? 'Clear' : 'Revert'} />
      </div>

      <aside className={'txn-side' + (side ? '' : ' closed')}>
        <button className="icon-btn" onClick={() => setSide((s) => !s)} title="Toggle panel" style={{ alignSelf: side ? 'flex-end' : 'center' }}>
          {side ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        </button>
        {side && (
          <>
            {customer ? (
              <SideCard title="Customer" action={<button className="side-link" style={{ width: 'auto' }} onClick={() => nav.open('customers')}>Center</button>}>
                <div className="b">{customer.name}</div>
                <div className="side-row">
                  <span className="l">Phone</span>
                  <span>{customer.phone || '—'}</span>
                </div>
                <div className="side-row">
                  <span className="l">Open balance</span>
                  <span className="b">{money(ledger.custBal.get(customer.id) || 0)}</span>
                </div>
                <div className="side-row">
                  <span className="l">Credit limit</span>
                  <span>{num(customer.creditLimit) ? money(customer.creditLimit) : '—'}</span>
                </div>
                <div className="side-row">
                  <span className="l">Price level</span>
                  <span>{L.lists.priceLevels.find((p) => p.id === customer.priceLevelId)?.name || 'Base'}</span>
                </div>
                <button className="side-link" onClick={() => nav.report('quickreport', { nameId: customer.id })}>
                  QuickReport
                </button>
                <button className="side-link" onClick={() => nav.open('payment', { prefill: { customerId: customer.id } })}>
                  Receive payment
                </button>
                {customer.notes && <div className="note small mt">{customer.notes}</div>}
              </SideCard>
            ) : (
              <SideCard title="Customer">
                <span className="muted small">Choose a customer to see their balance and history.</span>
              </SideCard>
            )}
            {curItem && (
              <SideCard title="Item">
                <div className="b">{curItem.name}</div>
                {curItem.type === 'Inventory Part' && (
                  <>
                    <div className="side-row">
                      <span className="l">On hand</span>
                      <span className={available(curItem.id) <= num(curItem.reorderPoint) ? 'neg b' : ''}>
                        {fq(available(curItem.id))} {curItem.uom}
                      </span>
                    </div>
                    <div className="side-row">
                      <span className="l">On sales orders</span>
                      <span>{fq(ledger.itemStat(curItem.id).onSO)}</span>
                    </div>
                    <div className="side-row">
                      <span className="l">On purchase orders</span>
                      <span>{fq(ledger.itemStat(curItem.id).onPO)}</span>
                    </div>
                    <div className="side-row">
                      <span className="l">Avg cost</span>
                      <span>{money(ledger.itemStat(curItem.id).avgCost || curItem.cost)}</span>
                    </div>
                  </>
                )}
                <div className="side-row">
                  <span className="l">Base price</span>
                  <span>{money(curItem.price)}</span>
                </div>
                {lastPrice && (
                  <div className="side-row">
                    <span className="l">Last price to customer</span>
                    <span title={`#${lastPrice.num} on ${fmtDate(lastPrice.date, company.dateStyle)}`}>{money(lastPrice.rate)}</span>
                  </div>
                )}
                {curItem.type === 'Inventory Part' && num(f.lines[cur]?.rate) > 0 && (
                  <div className="side-row">
                    <span className="l">Margin on this line</span>
                    <span>{Math.round(((num(f.lines[cur].rate) - (ledger.itemStat(curItem.id).avgCost || num(curItem.cost))) / num(f.lines[cur].rate)) * 100)}%</span>
                  </div>
                )}
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
      {sub?.kind === 'item' && (
        <ItemModal
          initial={{ name: sub.name }}
          onClose={() => setSub(null)}
          onSaved={(it) => {
            const line = sub.line;
            setTimeout(() => setF((x) => {
              const lines = [...x.lines];
              lines[line] = { ...lineFor(it, x.customerId, lines[line]), key: lines[line]?.key || Math.random().toString(36).slice(2) };
              return { ...x, lines: ensureTrailing(lines, blankLine, isEmptyLine) };
            }), 0);
          }}
        />
      )}
    </div>
  );
}
