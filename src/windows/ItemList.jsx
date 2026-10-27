import { useMemo, useRef, useState } from 'react';
import { Package, Plus, Pencil, Trash2, FileBarChart, Boxes, ClipboardList, AlertTriangle, Download, Table2, Upload } from 'lucide-react';
import { useStore, useLookups } from '../store/store';
import { useWindowKeys } from '../store/windows';
import { useNav } from '../store/nav';
import { useOptions } from '../store/options';
import { useDialog, Modal, useContextMenu } from '../components/ui';
import { Field, Select, DateInput, MoneyInput, QtyInput } from '../components/inputs';
import Combo from '../components/Combo';
import { ITEM_TYPES } from '../store/defaults';
import { money, num, qty as fq, toCSV, downloadFile } from '../lib/format';
import { today } from '../lib/dates';
import { readItemImage } from '../lib/itemImage';
import { useListNav } from '../components/listnav';
import { AccountModal } from './ChartOfAccounts';
import { NameCombo } from './NameModals';

export function ItemModal({ initial, onClose, onSaved }) {
  const { data, saveRecord, nextNum, ledger } = useStore();
  const L = useLookups();
  const O = useOptions();
  const dlg = useDialog();
  const isNew = !initial?.id;
  const [f, setF] = useState(() => ({
    type: 'Inventory Part',
    name: '',
    sku: '',
    barcode: '',
    category: '',
    uom: 'pcs',
    pkg: '',
    cost: '',
    price: '',
    percent: '',
    incomeAccountId: data.accounts.find((a) => a.sys === 'sales')?.id || '',
    cogsAccountId: data.accounts.find((a) => a.sys === 'cogs')?.id || '',
    assetAccountId: data.accounts.find((a) => a.sys === 'inventory')?.id || '',
    expenseAccountId: '',
    preferredVendorId: '',
    reorderPoint: '',
    taxable: true,
    active: true,
    openQty: '',
    openCost: '',
    openDate: today(),
    ...initial,
    // an empty description takes the other one, so the two start out in step
    description: initial?.description || initial?.purchaseDescription || '',
    purchaseDescription: initial?.purchaseDescription || initial?.description || '',
  }));
  const [sub, setSub] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }));
  const imageFile = useRef(null);
  const pickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      set('image')(await readItemImage(file));
    } catch (err) {
      dlg.alert(err.message);
    }
  };
  // purchase and sales descriptions stay the same while this is ticked (like QuickBooks); untick to word them differently
  const [sameDesc, setSameDesc] = useState(() => f.description === f.purchaseDescription);
  const setDesc = (k) => (e) => {
    const v = e.target.value;
    setF((x) => (sameDesc ? { ...x, description: v, purchaseDescription: v } : { ...x, [k]: v }));
  };
  const toggleSameDesc = (on) => {
    setSameDesc(on);
    if (on) setF((x) => ({ ...x, description: x.purchaseDescription || x.description, purchaseDescription: x.purchaseDescription || x.description }));
  };
  const inv = f.type === 'Inventory Part';
  const isDisc = f.type === 'Discount';
  const used = !isNew && ledger.lines.some((l) => l.itemId === f.id);
  const categories = [...new Set(data.items.map((i) => i.category).filter(Boolean))];

  const save = async () => {
    if (!f.name.trim()) return dlg.alert('Item name is required.');
    if (data.items.find((i) => i.id !== f.id && i.name.toLowerCase() === f.name.trim().toLowerCase())) return dlg.alert('An item with this name already exists.');
    if (f.sku && data.items.find((i) => i.id !== f.id && i.sku && i.sku.toLowerCase() === f.sku.toLowerCase())) return dlg.alert('This SKU is already used by another item.');
    const { openQty, openCost, openDate, ...rec } = f;
    rec.name = rec.name.trim();
    rec.cost = num(rec.cost);
    rec.pkg = num(rec.pkg);
    rec.price = num(rec.price);
    rec.reorderPoint = num(rec.reorderPoint);
    rec.percent = num(rec.percent);
    if (!rec.purchaseDescription) rec.purchaseDescription = rec.description;
    const saved = saveRecord('items', rec);
    if (isNew && inv && num(openQty)) {
      const obe = data.accounts.find((a) => a.sys === 'obe')?.id;
      const unit = num(openCost) || rec.cost;
      saveRecord('txns', {
        type: 'invadjust',
        num: nextNum('invadjust', 1),
        date: openDate || today(),
        accountId: obe,
        memo: 'Opening stock',
        lines: [{ itemId: saved.id, qtyDiff: num(openQty), valueDiff: Math.round(num(openQty) * unit * 100) / 100, memo: 'Opening stock' }],
      });
    }
    onSaved?.(saved);
    onClose();
  };

  return (
    <Modal
      title={isNew ? 'New Item' : 'Edit Item'}
      onClose={onClose}
      width={820}
      footer={
        <>
          <span className="sp muted small">{inv && !isNew ? `On hand: ${fq(ledger.itemStat(f.id).qty)} ${f.uom || ''} · Avg cost ${money(ledger.itemStat(f.id).avgCost)}` : ''}</span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            OK
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid4">
          <Field label="Type">
            <Select value={f.type} onChange={set('type')} options={ITEM_TYPES} disabled={used} />
          </Field>
          <Field label="Item name / number" className="span2">
            <input autoFocus value={f.name} onChange={set('name')} />
          </Field>
          <Field label="SKU / Code">
            <input value={f.sku} onChange={set('sku')} />
          </Field>
          <Field label="Category">
            <Combo value={f.category} allowFree onChange={set('category')} options={categories.map((c) => ({ id: c, label: c }))} placeholder="e.g. Dolls" />
          </Field>
          <Field label="U/M">
            <Combo value={f.uom} allowFree onChange={set('uom')} options={L.lists.uom.map((u) => ({ id: u, label: u }))} />
          </Field>
          <Field label="Pkg (pcs in 1 carton)">
            <QtyInput value={f.pkg} onChange={set('pkg')} />
          </Field>
          <Field label="Barcode">
            <input value={f.barcode} onChange={set('barcode')} />
          </Field>
          <Field label="Preferred vendor">
            <NameCombo which="vendor" value={f.preferredVendorId} onChange={(id) => set('preferredVendorId')(id)} />
          </Field>
          <Field label="Product image (can be printed on invoices)" className="span4">
            <div className="logo-row">
              <div className="logo-thumb item-thumb">{f.image ? <img src={f.image} alt="Product" /> : <span className="muted small">No image</span>}</div>
              <div className="flex" style={{ flexWrap: 'wrap' }}>
                <button type="button" className="btn sm" onClick={() => imageFile.current?.click()}>
                  <Upload size={13} /> {f.image ? 'Change image…' : 'Choose image…'}
                </button>
                {f.image && (
                  <button type="button" className="btn sm" onClick={() => set('image')('')}>
                    <Trash2 size={13} /> Remove
                  </button>
                )}
                <span className="muted small">Pick a picture from this computer (JPG or PNG). It is made small automatically and saved with the item.</span>
              </div>
            </div>
            <input ref={imageFile} type="file" accept="image/*" hidden onChange={pickImage} />
          </Field>
        </div>

        {!isDisc && (
          <>
            <div className="section-title">Purchase information</div>
            <div className="grid4">
              <Field label="Description on purchase transactions" className="span2">
                <input value={f.purchaseDescription} onChange={setDesc('purchaseDescription')} />
              </Field>
              <Field label="Cost">
                <MoneyInput value={f.cost} onChange={set('cost')} />
              </Field>
              {inv ? (
                <Field label="COGS account">
                  <Combo value={f.cogsAccountId} onChange={set('cogsAccountId')} options={O.accountOpts(['Cost of Goods Sold'])} />
                </Field>
              ) : (
                <Field label="Expense account">
                  <Combo
                    value={f.expenseAccountId}
                    onChange={set('expenseAccountId')}
                    options={O.accountOpts(['Cost of Goods Sold', 'Expense', 'Other Expense', 'Other Current Asset'])}
                    onAddNew={(name) => setSub({ kind: 'account', name, field: 'expenseAccountId', type: 'Expense' })}
                  />
                </Field>
              )}
            </div>
          </>
        )}

        <div className="section-title">Sales information</div>
        <div className="grid4">
          <div className="span2">
            <Field label="Description on sales transactions">
              <input value={f.description} onChange={setDesc('description')} />
            </Field>
            {!isDisc && (
              <label className="check small desc-link">
                <input type="checkbox" checked={sameDesc} onChange={(e) => toggleSameDesc(e.target.checked)} /> Same as purchase description
              </label>
            )}
          </div>
          {isDisc ? (
            <Field label="Discount %">
              <MoneyInput value={f.percent} onChange={set('percent')} plain />
            </Field>
          ) : (
            <Field label="Sales price">
              <MoneyInput value={f.price} onChange={set('price')} />
            </Field>
          )}
          <Field label="Income account">
            <Combo
              value={f.incomeAccountId}
              onChange={set('incomeAccountId')}
              options={O.accountOpts(['Income', 'Other Income', 'Other Current Liability'])}
              onAddNew={(name) => setSub({ kind: 'account', name, field: 'incomeAccountId', type: 'Income' })}
            />
          </Field>
        </div>
        <label className="check mt">
          <input type="checkbox" checked={!!f.taxable} onChange={set('taxable')} /> Taxable item
        </label>
        {num(f.cost) > 0 && num(f.price) > 0 && (
          <span className="muted small" style={{ marginLeft: 16 }}>
            Markup {Math.round(((num(f.price) - num(f.cost)) / num(f.cost)) * 100)}% · Margin {Math.round(((num(f.price) - num(f.cost)) / num(f.price)) * 100)}%
          </span>
        )}

        {inv && (
          <>
            <div className="section-title">Inventory information</div>
            <div className="grid4">
              <Field label="Asset account">
                <Combo value={f.assetAccountId} onChange={set('assetAccountId')} options={O.accountOpts(['Other Current Asset'])} />
              </Field>
              <Field label="Reorder point (min)">
                <QtyInput value={f.reorderPoint} onChange={set('reorderPoint')} />
              </Field>
              {isNew && (
                <>
                  <Field label="Opening qty on hand">
                    <QtyInput value={f.openQty} onChange={set('openQty')} />
                  </Field>
                  <Field label="Unit cost of opening qty">
                    <MoneyInput value={f.openCost} onChange={set('openCost')} placeholder={money(f.cost || 0)} />
                  </Field>
                  <Field label="As of">
                    <DateInput value={f.openDate} onChange={set('openDate')} />
                  </Field>
                </>
              )}
            </div>
          </>
        )}
        {!isNew && (
          <label className="check mt">
            <input type="checkbox" checked={f.active === false} onChange={(e) => set('active')(!e.target.checked)} /> Item is inactive
          </label>
        )}
        <button type="submit" hidden />
      </form>
      {sub?.kind === 'account' && (
        <AccountModal initial={{ name: sub.name }} defaultType={sub.type} onClose={() => setSub(null)} onSaved={(a) => set(sub.field)(a.id)} />
      )}
    </Modal>
  );
}

export default function ItemList() {
  const { data, ledger, deleteRecord, saveRecord, company } = useStore();
  const L = useLookups();
  const nav = useNav();
  const dlg = useDialog();
  const ctx = useContextMenu();
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('All');
  const [showInactive, setShowInactive] = useState(false);
  const [lowOnly, setLowOnly] = useState(false);
  const [modal, setModal] = useState(null);
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const ref = useRef(null);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const list = data.items
      .filter((i) => showInactive || i.active !== false)
      .filter((i) => type === 'All' || i.type === type)
      .filter((i) => !ql || [i.name, i.sku, i.description, i.category, i.barcode].some((x) => String(x || '').toLowerCase().includes(ql)))
      .map((i) => {
        const s = ledger.itemStat(i.id);
        const low = i.type === 'Inventory Part' && num(i.reorderPoint) > 0 && s.qty <= num(i.reorderPoint);
        return { ...i, onHand: s.qty, onPO: s.onPO, onSO: s.onSO, avg: s.avgCost || num(i.cost), value: s.value, low };
      })
      .filter((i) => !lowOnly || i.low);
    const k = sort.key;
    return list.sort((a, b) => {
      const x = a[k] ?? '';
      const y = b[k] ?? '';
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [data.items, ledger, q, type, showInactive, lowOnly, sort]);

  const selected = rows.find((r) => r.id === sel);
  const { keys, onTypeAhead } = useListNav(rows, sel, setSel, { containerRef: ref });
  const clean = (i) => {
    const { onHand, onPO, onSO, avg, value, low, ...rest } = i;
    return rest;
  };
  const del = async (i) => {
    if (!i) return;
    const used = data.txns.some((t) => [...(t.lines || []), ...(t.itemLines || [])].some((l) => l.itemId === i.id));
    if (used) {
      if (await dlg.confirm(`"${i.name}" is used in transactions and can't be deleted.\n\nMake it inactive instead?`, { ok: 'Make Inactive' }))
        saveRecord('items', { ...clean(i), active: false });
      return;
    }
    if (await dlg.confirm(`Delete item "${i.name}"?`, { ok: 'Delete', danger: true })) deleteRecord('items', i.id);
  };

  useWindowKeys({
    ...keys,
    enter: () => selected && setModal(clean(selected)),
    'ctrl+n': () => setModal({}),
    'ctrl+e': () => selected && setModal(clean(selected)),
    'ctrl+d': () => del(selected),
    'ctrl+q': () => selected && nav.report('quickreport', { itemId: selected.id }),
  });

  const totals = rows.reduce((s, r) => ({ value: s.value + (r.type === 'Inventory Part' ? r.value : 0), qty: s.qty + (r.type === 'Inventory Part' ? r.onHand : 0) }), { value: 0, qty: 0 });
  const lowCount = rows.filter((r) => r.low).length;
  const th = (key, label, cls = '', style) => (
    <th className={'sortable ' + cls} style={style} onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>
      {label} {sort.key === key ? (sort.dir > 0 ? '▲' : '▼') : ''}
    </th>
  );
  const exportCsv = () => {
    const out = [['Item', 'SKU', 'Type', 'Category', 'Description', 'U/M', 'Cost', 'Price', 'On Hand', 'Avg Cost', 'Asset Value', 'Reorder Point', 'Preferred Vendor']];
    rows.forEach((r) =>
      out.push([r.name, r.sku, r.type, r.category, r.description, r.uom, r.cost, r.price, r.onHand, r.avg, r.value, r.reorderPoint, L.vendorMap.get(r.preferredVendorId)?.name || '']),
    );
    downloadFile(`${company.name}_items.csv`, toCSV(out), 'text/csv');
  };

  const menu = (i) => [
    { label: 'New Item', key: 'Ctrl+N', onClick: () => setModal({}) },
    { label: 'Edit Item', key: 'Ctrl+E', onClick: () => setModal(clean(i)) },
    { label: 'Duplicate Item', onClick: () => setModal({ ...clean(i), id: undefined, name: i.name + ' (copy)', sku: '' }) },
    { label: 'Delete Item', key: 'Ctrl+D', onClick: () => del(i) },
    { label: i.active === false ? 'Make Active' : 'Make Inactive', onClick: () => saveRecord('items', { ...clean(i), active: i.active === false }) },
    '-',
    { label: 'QuickReport: ' + i.name, key: 'Ctrl+Q', onClick: () => nav.report('quickreport', { itemId: i.id }) },
    { label: 'Create Invoice', onClick: () => nav.open('invoice', { prefill: { itemId: i.id } }) },
    { label: 'Create Purchase Order', onClick: () => nav.open('purchaseorder', { prefill: { itemId: i.id, vendorId: i.preferredVendorId } }) },
    { label: 'Adjust Quantity/Value On Hand', disabled: i.type !== 'Inventory Part', onClick: () => nav.open('invadjust', { prefill: { itemId: i.id } }) },
  ];

  return (
    <div className="win" onKeyDown={onTypeAhead}>
      <div className="win-title">
        <Package size={20} />
        <h1>Item List</h1>
        <span className="sub">
          {rows.length} items · Inventory value {company.currency} {money(totals.value)}
        </span>
        {lowCount > 0 && (
          <button className="badge warn sp" style={{ border: 0, cursor: 'pointer' }} onClick={() => setLowOnly((v) => !v)}>
            <AlertTriangle size={11} /> {lowCount} below reorder point
          </button>
        )}
      </div>
      <div className="toolbar flat">
        <button className="btn sm primary" onClick={() => setModal({})}>
          <Plus size={13} /> New Item
        </button>
        <button className="btn sm" disabled={!selected} onClick={() => setModal(clean(selected))}>
          <Pencil size={13} /> Edit
        </button>
        <button className="btn sm" disabled={!selected} onClick={() => del(selected)}>
          <Trash2 size={13} />
        </button>
        <button className="btn sm" onClick={() => nav.open('bulkitems')} title="Add or edit many items at once, or paste them from Excel">
          <Table2 size={13} /> Add Multiple
        </button>
        <span className="tb-sep" />
        <button className="btn sm" disabled={!selected} onClick={() => nav.report('quickreport', { itemId: selected.id })}>
          <FileBarChart size={13} /> QuickReport
        </button>
        <button className="btn sm" onClick={() => nav.open('invadjust', selected ? { prefill: { itemId: selected.id } } : {})}>
          <Boxes size={13} /> Adjust Qty
        </button>
        <button className="btn sm" onClick={() => nav.open('purchaseorder', selected ? { prefill: { itemId: selected.id, vendorId: selected.preferredVendorId } } : {})}>
          <ClipboardList size={13} /> Create PO
        </button>
        <button className="btn sm" onClick={() => nav.report('stock')}>
          Stock Status
        </button>
        <button className="btn sm" onClick={() => nav.report('invval')}>
          Valuation
        </button>
        <button className="btn sm" onClick={exportCsv} title="Export to Excel (CSV)">
          <Download size={13} />
        </button>
        <span className="sp" />
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 150 }}>
          <option>All</option>
          {ITEM_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input placeholder="Search name, SKU, barcode…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        <label className="check small">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock
        </label>
        <label className="check small">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Inactive
        </label>
      </div>
      <div className="win-body tbl-wrap" ref={ref}>
        <table className="tbl">
          <thead>
            <tr>
              <th className="pic" />
              {th('name', 'Name')}
              {th('sku', 'SKU')}
              {th('description', 'Description')}
              {th('type', 'Type', '', { width: 120 })}
              {th('category', 'Category')}
              {th('onHand', 'On Hand', 'r')}
              {th('onSO', 'On S.O.', 'r')}
              {th('onPO', 'On P.O.', 'r')}
              {th('reorderPoint', 'Reorder', 'r')}
              {th('avg', 'Avg Cost', 'r')}
              {th('price', 'Price', 'r')}
              {th('value', 'Asset Value', 'r')}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr
                key={i.id}
                data-id={i.id}
                className={(i.id === sel ? 'sel ' : '') + (i.active === false ? 'inactive' : '')}
                onClick={() => setSel(i.id)}
                onDoubleClick={() => setModal(clean(i))}
                onContextMenu={(e) => {
                  setSel(i.id);
                  ctx.show(e, menu(i));
                }}
              >
                <td className="pic">{i.image && <img src={i.image} alt="" loading="lazy" decoding="async" />}</td>
                <td className="b">{i.name}</td>
                <td>{i.sku}</td>
                <td className="muted">{i.description}</td>
                <td>{i.type}</td>
                <td>{i.category}</td>
                <td className={'r' + (i.low ? ' neg b' : '')}>
                  {i.type === 'Inventory Part' ? (
                    <>
                      {i.low && <AlertTriangle size={11} style={{ verticalAlign: -1, marginRight: 3 }} />}
                      {fq(i.onHand)} {i.uom}
                    </>
                  ) : (
                    ''
                  )}
                </td>
                <td className="r">{i.onSO ? fq(i.onSO) : ''}</td>
                <td className="r">{i.onPO ? fq(i.onPO) : ''}</td>
                <td className="r">{i.type === 'Inventory Part' && i.reorderPoint ? fq(i.reorderPoint) : ''}</td>
                <td className="r">{i.type === 'Inventory Part' ? money(i.avg) : money(i.cost)}</td>
                <td className="r">{i.type === 'Discount' ? `${num(i.percent)}%` : money(i.price)}</td>
                <td className="r">{i.type === 'Inventory Part' ? money(i.value) : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>Total</td>
              <td className="r">{fq(totals.qty)}</td>
              <td colSpan={5} />
              <td className="r">{money(totals.value)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {modal && <ItemModal initial={modal.id || modal.name ? modal : undefined} onClose={() => setModal(null)} onSaved={(i) => setSel(i.id)} />}
      {ctx.node}
    </div>
  );
}
