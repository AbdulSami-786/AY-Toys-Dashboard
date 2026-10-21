// Add/Edit Multiple Items — like QuickBooks' "Add/Edit Multiple List Entries": a spreadsheet of items.
// Type or paste many rows from Excel, change existing items right in the grid, then Save Changes once.
import { useMemo, useRef, useState } from 'react';
import { Package, Save, Columns3, X, Info } from 'lucide-react';
import { useStore, useLookups } from '../store/store';
import { useWindows } from '../store/windows';
import { useOptions } from '../store/options';
import { useDialog, Modal } from '../components/ui';
import { DateInput } from '../components/inputs';
import { ensureTrailing } from './forms/common';
import { ITEM_TYPES } from '../store/defaults';
import { num, qty as fq, uid, round2 } from '../lib/format';
import { today } from '../lib/dates';

const LS_COLS = 'ay.bulkItemCols';
const LS_LIST = 'ay.bulkItemList';
const read = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* only a convenience */
  }
};

// kind: text | num | yn | list (a datalist of allowed names) · w = width in px
const COLS = [
  { key: 'name', label: 'Item Name/Number', w: 190, req: true, alias: ['name', 'item', 'item name', 'item number', 'product', 'product name'] },
  { key: 'type', label: 'Type', w: 130, list: 'bi-types', alias: ['item type'] },
  { key: 'sku', label: 'SKU / Code', w: 110, alias: ['sku', 'code', 'item code'] },
  { key: 'category', label: 'Category', w: 120, list: 'bi-cats' },
  { key: 'uom', label: 'U/M', w: 70, list: 'bi-uom', alias: ['uom', 'unit'] },
  { key: 'pkg', label: 'Pkg (pcs/carton)', w: 100, kind: 'num', alias: ['pkg', 'packing', 'pack', 'pcs per carton', 'carton size'] },
  { key: 'description', label: 'Sales Description', w: 220, alias: ['description', 'desc'] },
  { key: 'purchaseDescription', label: 'Purchase Description', w: 200 },
  { key: 'cost', label: 'Cost', w: 90, kind: 'num', alias: ['purchase price', 'buy price', 'unit cost'] },
  { key: 'price', label: 'Sales Price', w: 90, kind: 'num', alias: ['price', 'sale price', 'selling price', 'rate'] },
  { key: 'vendor', label: 'Preferred Vendor', w: 150, list: 'bi-vendors', alias: ['vendor', 'supplier'] },
  { key: 'barcode', label: 'Barcode', w: 120 },
  { key: 'reorderPoint', label: 'Reorder Point', w: 90, kind: 'num', alias: ['reorder', 'min', 'reorder level'] },
  { key: 'qty', label: 'Qty on Hand', w: 90, kind: 'num', alias: ['qty', 'quantity', 'stock', 'on hand', 'opening qty'] },
  { key: 'openCost', label: 'Unit Cost of Qty', w: 100, kind: 'num' },
  { key: 'income', label: 'Income Account', w: 170, list: 'bi-income' },
  { key: 'cogs', label: 'COGS / Expense Account', w: 180, list: 'bi-cogs' },
  { key: 'asset', label: 'Asset Account', w: 170, list: 'bi-asset' },
  { key: 'taxable', label: 'Taxable', w: 70, list: 'bi-yn' },
  { key: 'active', label: 'Active', w: 70, list: 'bi-yn' },
];
const COL = Object.fromEntries(COLS.map((c) => [c.key, c]));
const DEFAULT_COLS = ['name', 'type', 'sku', 'category', 'uom', 'pkg', 'description', 'cost', 'price', 'reorderPoint', 'qty'];
const LISTS = ['All Items', ...ITEM_TYPES];

const blankVals = () => Object.fromEntries(COLS.map((c) => [c.key, '']));
const newRow = (vals = {}) => ({ key: uid(), id: '', orig: blankVals(), vals: { ...blankVals(), ...vals } });
const isBlank = (r) => !r.id && !isTouched(r); // a new row nobody has typed in
const isTouched = (r) => COLS.some((c) => String(r.vals[c.key] ?? '') !== String(r.orig[c.key] ?? ''));
const yn = (b) => (b === false ? 'No' : 'Yes');
const parseYN = (s) => {
  const v = String(s).trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'taxable'].includes(v)) return true;
  if (['no', 'n', 'false', '0', 'non', 'non-taxable'].includes(v)) return false;
  return null;
};
const numText = (v) => (v === '' || v === undefined || v === null ? '' : String(v));
const isNum = (s) => s === '' || Number.isFinite(Number(String(s).replace(/,/g, '')));

export default function BulkItems({ winId }) {
  const { close: closeWin } = useWindows();
  const { data, ledger, saveMany, saveRecord, nextNum } = useStore();
  const L = useLookups();
  const O = useOptions();
  const dlg = useDialog();
  const [list, setList] = useState(() => (LISTS.includes(read(LS_LIST, '')) ? read(LS_LIST, '') : 'All Items'));
  const [view, setView] = useState('active');
  const [shown, setShown] = useState(() => {
    const s = read(LS_COLS, null);
    return Array.isArray(s) && s.includes('name') ? s.filter((k) => COL[k]) : DEFAULT_COLS;
  });
  const [asOf, setAsOf] = useState(today());
  const [colsOpen, setColsOpen] = useState(false);
  const [errors, setErrors] = useState({}); // row key → { column key → message }
  const [saved, setSaved] = useState(0);
  const gridRef = useRef(null);

  // the columns on screen (the Type column is pointless when only one type is listed)
  const cols = useMemo(() => COLS.filter((c) => shown.includes(c.key) && (c.key !== 'type' || list === 'All Items')), [shown, list]);
  const typeFor = (r) => (list === 'All Items' ? r.vals.type : list);

  const rowOf = (i) => {
    const vals = {
      name: i.name || '',
      type: i.type || 'Inventory Part',
      sku: i.sku || '',
      category: i.category || '',
      uom: i.uom || '',
      pkg: numText(i.pkg),
      description: i.description || '',
      purchaseDescription: i.purchaseDescription || '',
      cost: numText(i.cost),
      price: numText(i.price),
      vendor: L.vendorMap.get(i.preferredVendorId)?.name || '',
      barcode: i.barcode || '',
      reorderPoint: numText(i.reorderPoint),
      qty: '',
      openCost: '',
      income: L.accountMap.get(i.incomeAccountId)?.name || '',
      cogs: L.accountMap.get(i.type === 'Inventory Part' ? i.cogsAccountId : i.expenseAccountId)?.name || '',
      asset: L.accountMap.get(i.assetAccountId)?.name || '',
      taxable: yn(i.taxable),
      active: yn(i.active),
    };
    return { key: i.id, id: i.id, orig: vals, vals: { ...vals } };
  };
  const loadRows = (listName, viewName) =>
    ensureTrailing(
      data.items
        .filter((i) => (listName === 'All Items' || i.type === listName) && (viewName === 'all' || (viewName === 'active') === (i.active !== false)))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(rowOf),
      newRow,
      isBlank,
    );
  const [rows, setRows] = useState(() => loadRows(list, view));

  const dirtyRows = rows.filter(isTouched);
  const dirty = dirtyRows.length;

  const reload = async (listName, viewName) => {
    if (dirty && !(await dlg.confirm(`You have ${dirty} unsaved change${dirty === 1 ? '' : 's'}. Discard them?`, { ok: 'Discard', danger: true }))) return;
    setList(listName);
    setView(viewName);
    write(LS_LIST, listName);
    setErrors({});
    setRows(loadRows(listName, viewName));
  };

  const setCell = (ri, key, v) => setRows((rs) => ensureTrailing(rs.map((r, i) => (i === ri ? { ...r, vals: { ...r.vals, [key]: v } } : r)), newRow, isBlank));
  const removeRow = (ri) => setRows((rs) => ensureTrailing(rs.filter((_, i) => i !== ri), newRow, isBlank));

  const editable = (r, c) => !(c.key === 'qty' && r.id); // on-hand of an existing item changes by Adjust Quantity, not here
  const focusCell = (ri, ci) => gridRef.current?.querySelector(`[data-r="${ri}"][data-c="${ci}"]`)?.focus();

  const onKeyDown = (e, ri, ci) => {
    const go = (dr) => {
      e.preventDefault();
      focusCell(ri + dr, ci);
    };
    if (e.key === 'Enter' || (e.key === 'ArrowDown' && !e.altKey)) go(1);
    else if (e.key === 'ArrowUp') go(-1);
  };

  // paste a block copied from Excel: it fills the grid from the clicked cell, adding rows as needed.
  // A first line that is just column headings (e.g. "Item Name", "Sales Price") lines the columns up by name.
  const onPaste = (e, ri, ci) => {
    const text = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return; // a single value pastes normally
    e.preventDefault();
    let table = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    let target = cols.slice(ci);
    const heads = table[0].map((h) => COLS.find((c) => [c.label, c.key, ...(c.alias || [])].some((a) => a.toLowerCase() === h.trim().toLowerCase())));
    if (heads.filter(Boolean).length >= 2 || heads[0]?.key === 'name') {
      table = table.slice(1);
      target = heads.map((h) => h || null);
    }
    setRows((rs) => {
      let next = [...rs];
      table.forEach((cells, k) => {
        const idx = ri + k;
        while (idx >= next.length) next.push(newRow());
        const r = next[idx];
        const vals = { ...r.vals };
        cells.forEach((v, j) => {
          const c = target[j];
          if (c && editable(r, c)) vals[c.key] = v.trim();
        });
        next[idx] = { ...r, vals };
      });
      return ensureTrailing(next, newRow, isBlank);
    });
  };

  const toggleCol = (key) => {
    if (key === 'name') return;
    const next = shown.includes(key) ? shown.filter((k) => k !== key) : COLS.map((c) => c.key).filter((k) => k === key || shown.includes(k));
    setShown(next);
    write(LS_COLS, next);
  };

  // ---- Save Changes: every changed row is checked; the good ones are saved, the others stay marked
  const save = async () => {
    if (!dirty) return dlg.alert('There is nothing to save yet.');
    const acct = (name, types) => {
      const n = name.trim().toLowerCase();
      return O.accounts.find((a) => (!types || types.includes(a.type)) && [a.name, L.accountLabel(a.id), a.number && `${a.number} ${a.name}`, a.number].some((x) => x && String(x).toLowerCase() === n));
    };
    const used = new Set(ledger.lines.map((l) => l.itemId));
    const names = new Map();
    const skus = new Map();
    data.items.forEach((i) => {
      names.set(i.name.trim().toLowerCase(), i.id);
      if (i.sku) skus.set(String(i.sku).trim().toLowerCase(), i.id);
    });
    // rows that change a name / SKU free the old one first
    dirtyRows.forEach((r) => {
      if (r.id) {
        names.delete(String(r.orig.name).trim().toLowerCase());
        if (r.orig.sku) skus.delete(String(r.orig.sku).trim().toLowerCase());
      }
    });
    const errs = {};
    const items = [];
    const openLines = [];
    const savedKeys = new Set();
    const obe = data.accounts.find((a) => a.sys === 'obe')?.id;
    for (const r of dirtyRows) {
      const v = r.vals;
      const bad = {};
      const type = ITEM_TYPES.find((t) => t.toLowerCase() === String(typeFor(r)).trim().toLowerCase()) || (!String(typeFor(r)).trim() && !r.id ? 'Inventory Part' : null);
      const name = v.name.trim();
      if (!name) bad.name = 'Enter the item name.';
      else if (names.has(name.toLowerCase())) bad.name = 'An item with this name already exists.';
      if (!type) bad.type = `Type must be one of: ${ITEM_TYPES.join(', ')}.`;
      else if (r.id && used.has(r.id) && type !== data.items.find((i) => i.id === r.id)?.type) bad.type = 'The type cannot change: this item is used in transactions.';
      const sku = v.sku.trim();
      if (sku && skus.has(sku.toLowerCase())) bad.sku = 'This SKU is used by another item.';
      for (const c of cols) if (c.kind === 'num' && !isNum(v[c.key])) bad[c.key] = 'Enter a number.';
      let vendor = null;
      if (v.vendor.trim()) {
        vendor = data.vendors.find((x) => x.name.toLowerCase() === v.vendor.trim().toLowerCase());
        if (!vendor) bad.vendor = 'No vendor with this name. Add the vendor first.';
      }
      const inv = type === 'Inventory Part';
      const income = v.income.trim() ? acct(v.income, ['Income', 'Other Income', 'Other Current Liability']) : null;
      if (v.income.trim() && !income) bad.income = 'No such income account.';
      const cogs = v.cogs.trim() ? acct(v.cogs, inv ? ['Cost of Goods Sold'] : ['Cost of Goods Sold', 'Expense', 'Other Expense', 'Other Current Asset']) : null;
      if (v.cogs.trim() && !cogs) bad.cogs = inv ? 'No such Cost of Goods Sold account.' : 'No such expense account.';
      const asset = v.asset.trim() ? acct(v.asset, ['Other Current Asset']) : null;
      if (v.asset.trim() && !asset) bad.asset = 'No such asset account.';
      const taxable = v.taxable.trim() ? parseYN(v.taxable) : true;
      if (taxable === null) bad.taxable = 'Type Yes or No.';
      const active = v.active.trim() ? parseYN(v.active) : true;
      if (active === null) bad.active = 'Type Yes or No.';
      if (!r.id && num(v.qty) < 0) bad.qty = 'Opening quantity cannot be negative.';
      if (Object.keys(bad).length) {
        errs[r.key] = bad;
        continue;
      }
      names.set(name.toLowerCase(), r.id || r.key);
      if (sku) skus.set(sku.toLowerCase(), r.id || r.key);

      const old = r.id ? data.items.find((i) => i.id === r.id) : null;
      // a column that is not on screen keeps what the item already has (a new item gets the usual defaults)
      const has = (k) => cols.some((c) => c.key === k);
      const sysAcc = (s) => data.accounts.find((a) => a.sys === s)?.id || '';
      const rec = {
        ...(old || { taxable: true, active: true, uom: 'pcs', incomeAccountId: sysAcc('sales'), cogsAccountId: sysAcc('cogs'), assetAccountId: sysAcc('inventory'), expenseAccountId: '', preferredVendorId: '', reorderPoint: 0, cost: 0, price: 0, percent: 0 }),
        id: r.id || uid(),
        name,
        type,
      };
      if (has('sku')) rec.sku = sku;
      if (has('category')) rec.category = v.category.trim();
      if (has('uom')) rec.uom = v.uom.trim() || 'pcs';
      if (has('pkg')) rec.pkg = num(v.pkg);
      if (has('barcode')) rec.barcode = v.barcode.trim();
      if (has('description')) rec.description = v.description.trim();
      if (has('purchaseDescription')) rec.purchaseDescription = v.purchaseDescription.trim();
      if (!r.id) {
        // an empty description takes the other one, like the Item window
        rec.description = rec.description || rec.purchaseDescription || '';
        rec.purchaseDescription = rec.purchaseDescription || rec.description;
      }
      if (has('cost')) rec.cost = num(v.cost);
      if (has('price')) rec.price = type === 'Discount' ? old?.price || 0 : num(v.price);
      if (type === 'Discount' && has('price')) rec.percent = num(v.price);
      if (has('reorderPoint')) rec.reorderPoint = num(v.reorderPoint);
      if (has('vendor')) rec.preferredVendorId = vendor?.id || '';
      if (has('income') && income) rec.incomeAccountId = income.id;
      if (has('cogs') && cogs) rec[inv ? 'cogsAccountId' : 'expenseAccountId'] = cogs.id;
      if (has('asset') && asset) rec.assetAccountId = asset.id;
      if (has('taxable')) rec.taxable = taxable;
      if (has('active')) rec.active = active;
      items.push(rec);
      savedKeys.add(r.key);
      if (!r.id && inv && num(v.qty) > 0) {
        const unit = num(v.openCost) || rec.cost;
        openLines.push({ itemId: rec.id, qtyDiff: num(v.qty), valueDiff: round2(num(v.qty) * unit), memo: 'Opening stock' });
      }
    }
    if (items.length) {
      saveMany('items', items);
      // all the opening quantities go in as one inventory adjustment
      if (openLines.length) saveRecord('txns', { type: 'invadjust', num: nextNum('invadjust', 1), date: asOf || today(), accountId: obe, memo: 'Opening stock', lines: openLines });
    }
    setErrors(errs);
    setSaved(items.length);
    const failed = Object.keys(errs).length;
    // saved rows become plain rows of the grid; the failed ones stay as typed, marked
    setRows((rs) => {
      const done = new Map(items.map((it) => [it.id, it]));
      const kept = rs.filter((r) => !savedKeys.has(r.key) || r.id).map((r) => (r.id && done.has(r.id) ? rowOf(done.get(r.id)) : r));
      const fresh = items.filter((it) => !rs.some((r) => r.id === it.id)).map(rowOf);
      const failedNew = kept.filter((r) => !r.id && isTouched(r));
      const existing = kept.filter((r) => r.id);
      return ensureTrailing([...existing, ...fresh, ...failedNew].sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || a.vals.name.localeCompare(b.vals.name)), newRow, isBlank);
    });
    if (failed) dlg.alert(`${items.length ? `${items.length} item${items.length === 1 ? '' : 's'} saved. ` : ''}${failed} row${failed === 1 ? ' was' : 's were'} not saved. They are marked in red: point at a red cell to see what to fix.`);
    else dlg.toast(`${items.length} item${items.length === 1 ? '' : 's'} saved`);
  };

  const close = async () => {
    if (dirty && !(await dlg.confirm(`You have ${dirty} unsaved change${dirty === 1 ? '' : 's'}. Close without saving?`, { ok: 'Close', danger: true }))) return;
    closeWin(winId);
  };

  const categories = [...new Set(data.items.map((i) => i.category).filter(Boolean))];
  const accountNames = (types) => O.accounts.filter((a) => types.includes(a.type)).map((a) => a.name);
  const widthSum = 34 + cols.reduce((s, c) => s + c.w, 0);

  return (
    <div className="win">
      <div className="win-title">
        <Package size={20} />
        <h1>Add/Edit Multiple Items</h1>
        <span className="sub">{dirty ? `${dirty} row${dirty === 1 ? '' : 's'} changed — not saved yet` : saved ? `${saved} saved` : 'Type or paste from Excel'}</span>
      </div>
      <div className="toolbar flat">
        <label className="small">
          List{' '}
          <select value={list} onChange={(e) => reload(e.target.value, view)} style={{ width: 160 }}>
            {LISTS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="small">
          View{' '}
          <select value={view} onChange={(e) => reload(list, e.target.value)} style={{ width: 130 }}>
            <option value="active">Active items</option>
            <option value="inactive">Inactive items</option>
            <option value="all">All items</option>
          </select>
        </label>
        <label className="small" title="Date of the opening quantities typed for new inventory items">
          Qty as of <DateInput value={asOf} onChange={setAsOf} />
        </label>
        <span className="sp" />
        <button className="btn sm" onClick={() => setColsOpen(true)}>
          <Columns3 size={13} /> Customize Columns
        </button>
        <button className="btn sm primary" onClick={save} disabled={!dirty}>
          <Save size={13} /> Save Changes
        </button>
        <button className="btn sm" onClick={close}>
          Close
        </button>
      </div>
      <div className="note" style={{ margin: '8px 12px 0' }}>
        <Info size={13} style={{ verticalAlign: -2 }} /> Tip: copy rows in Excel and paste them into the grid (Ctrl+V). Choose <b>Customize Columns</b> to match your sheet. Existing items are changed right here; a new
        item's <b>Qty on Hand</b> becomes its opening stock.
      </div>
      <div className="win-body pad" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="lines" ref={gridRef} style={{ maxHeight: 'none', flex: 1 }}>
          <table style={{ width: widthSum, minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: 34 }} />
              {cols.map((c) => (
                <col key={c.key} style={{ width: c.w }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th />
                {cols.map((c) => (
                  <th key={c.key} className={c.kind === 'num' ? 'r' : ''}>
                    {c.label}
                    {c.req ? ' *' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={r.key} className={isTouched(r) ? 'cur' : ''}>
                  <td className="del-cell">{!r.id && isTouched(r) && <button title="Remove this row" onClick={() => removeRow(ri)} style={{ opacity: 1 }}><X size={13} /></button>}</td>
                  {cols.map((c, ci) => {
                    const err = errors[r.key]?.[c.key];
                    if (c.key === 'qty' && r.id) {
                      const inv = r.vals.type === 'Inventory Part' || (list !== 'All Items' && list === 'Inventory Part');
                      return (
                        <td key={c.key} className="ro" title="Change the quantity with Adjust Quantity/Value on Hand">
                          {inv ? fq(ledger.itemStat(r.id).qty) : ''}
                        </td>
                      );
                    }
                    return (
                      <td key={c.key} style={err ? { background: 'var(--danger-bg, #fde8e8)', boxShadow: 'inset 0 0 0 1px var(--danger)' } : undefined} title={err || undefined}>
                        <input
                          data-r={ri}
                          data-c={ci}
                          value={r.vals[c.key]}
                          list={c.list}
                          onChange={(e) => setCell(ri, c.key, e.target.value)}
                          onKeyDown={(e) => onKeyDown(e, ri, ci)}
                          onPaste={(e) => onPaste(e, ri, ci)}
                          onFocus={(e) => e.target.select()}
                          style={c.kind === 'num' ? { textAlign: 'right' } : undefined}
                          spellCheck={false}
                          autoComplete="off"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <datalist id="bi-types">{ITEM_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
        <datalist id="bi-cats">{categories.map((t) => <option key={t} value={t} />)}</datalist>
        <datalist id="bi-uom">{L.lists.uom.map((t) => <option key={t} value={t} />)}</datalist>
        <datalist id="bi-vendors">{data.vendors.filter((v) => v.active !== false).map((v) => <option key={v.id} value={v.name} />)}</datalist>
        <datalist id="bi-income">{accountNames(['Income', 'Other Income', 'Other Current Liability']).map((t) => <option key={t} value={t} />)}</datalist>
        <datalist id="bi-cogs">{accountNames(['Cost of Goods Sold', 'Expense', 'Other Expense', 'Other Current Asset']).map((t) => <option key={t} value={t} />)}</datalist>
        <datalist id="bi-asset">{accountNames(['Other Current Asset']).map((t) => <option key={t} value={t} />)}</datalist>
        <datalist id="bi-yn">
          <option value="Yes" />
          <option value="No" />
        </datalist>
      </div>
      {colsOpen && (
        <Modal
          title="Customize Columns"
          onClose={() => setColsOpen(false)}
          width={420}
          footer={
            <>
              <button
                className="btn"
                onClick={() => {
                  setShown(DEFAULT_COLS);
                  write(LS_COLS, DEFAULT_COLS);
                }}
              >
                Default
              </button>
              <button className="btn primary" onClick={() => setColsOpen(false)}>
                OK
              </button>
            </>
          }
        >
          <p className="muted small" style={{ marginTop: 0 }}>
            Choose the columns to show, in the same order as your Excel sheet is easiest. Columns that are hidden keep what the item already has.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {COLS.filter((c) => c.key !== 'type' || true).map((c) => (
              <label key={c.key} className="check small">
                <input type="checkbox" checked={shown.includes(c.key)} disabled={c.key === 'name'} onChange={() => toggleCol(c.key)} /> {c.label}
              </label>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
