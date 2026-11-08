// Extra columns a user can add to any report (Customize Report › Display › Add a field).
//  - field: a detail of the record a row stands for. A row that links to a transaction can show its terms, due date,
//    P.O. number…; a customer / vendor row its phone, email…; an item row its SKU, category…; an account row its number…
//  - calc: a number worked out from two number columns of the report (A + B, A − B, A × B, A ÷ B, A as % of B)
//  - blank: an empty column for writing by hand on the printout
// The report builders (reports.js) are untouched: this runs on their finished result.

import { txnTotal } from './ledger';
import { DEBIT_NORMAL, TXN_TYPES, isPL } from '../store/defaults';
import { num, round2 } from './format';

const ALIGN = { money: 'right', qty: 'right', pct: 'right', text: 'left', date: 'left' };
const f = (id, label, type, get) => ({ id, label, type, get });
const oneLine = (s) => String(s ?? '').replace(/\s*\n\s*/g, ', ');

// each group: which rows it applies to, how to find the record, and the fields it offers.
// get(record, env, id) -> value; env = { L, ledger, data }
export const FIELD_GROUPS = [
  {
    id: 'txn',
    label: 'Transaction details',
    record: (r, env) => (r.txnId ? env.ledger.txnById.get(r.txnId) : null),
    fields: [
      f('txn.type', 'Type', 'text', (t) => TXN_TYPES[t.type]?.label || t.type || ''),
      f('txn.date', 'Date', 'date', (t) => t.date || ''),
      f('txn.num', 'Num', 'text', (t) => t.num || ''),
      f('txn.name', 'Name', 'text', (t, env) => env.L.nameOf(t.customerId || t.vendorId)),
      f('txn.memo', 'Memo', 'text', (t) => t.memo || ''),
      f('txn.due', 'Due Date', 'date', (t) => t.dueDate || ''),
      f('txn.terms', 'Terms', 'text', (t) => t.terms || ''),
      f('txn.po', 'P.O. Number', 'text', (t) => t.poNumber || ''),
      f('txn.rep', 'Sales Rep', 'text', (t) => t.rep || ''),
      f('txn.shipDate', 'Ship Date', 'date', (t) => t.shipDate || ''),
      f('txn.via', 'Ship Via', 'text', (t) => t.via || ''),
      f('txn.method', 'Payment Method', 'text', (t) => t.method || ''),
      f('txn.total', 'Transaction Total', 'money', (t, env) => txnTotal(t, env.ledger)),
      f('txn.open', 'Open Balance', 'money', (t, env) => {
        const o = env.ledger.open.get(t.id);
        return o === undefined ? '' : round2(o);
      }),
      f('txn.status', 'Status', 'text', (t, env) => {
        if (t.voided) return 'Voided';
        const o = env.ledger.open.get(t.id);
        return o === undefined ? '' : Math.abs(o) > 0.005 ? 'Open' : 'Paid';
      }),
      f('txn.entered', 'Entered On', 'date', (t) => String(t.createdAt || '').slice(0, 10)),
      f('txn.modified', 'Last Modified', 'text', (t) => (t.updatedAt || t.createdAt ? new Date(t.updatedAt || t.createdAt).toLocaleString() : '')),
    ],
  },
  {
    id: 'name',
    label: 'Customer / Vendor details',
    record: (r, env) => {
      const id = r.drill?.nameId;
      if (!id) return null;
      const c = env.L.customerMap.get(id);
      if (c) return { p: c, kind: 'customer' };
      const v = env.L.vendorMap.get(id);
      return v ? { p: v, kind: 'vendor' } : null;
    },
    fields: [
      f('name.contact', 'Contact', 'text', ({ p }) => p.contact || ''),
      f('name.phone', 'Phone', 'text', ({ p }) => p.phone || ''),
      f('name.alt', 'Alt. Phone', 'text', ({ p }) => p.altPhone || ''),
      f('name.email', 'Email', 'text', ({ p }) => p.email || ''),
      f('name.addr', 'Address', 'text', ({ p, kind }) => oneLine((kind === 'customer' ? p.billTo : p.address) || p.address || '')),
      f('name.city', 'City', 'text', ({ p }) => p.city || ''),
      f('name.terms', 'Default Terms', 'text', ({ p }) => p.terms || ''),
      f('name.limit', 'Credit Limit', 'money', ({ p }) => (num(p.creditLimit) ? num(p.creditLimit) : '')),
      f('name.ntn', 'NTN', 'text', ({ p }) => p.ntn || ''),
      f('name.type', 'Customer / Vendor Type', 'text', ({ p }) => p.type || ''),
      f('name.notes', 'Name Notes', 'text', ({ p }) => oneLine(p.notes)),
      f('name.bal', 'Current Balance', 'money', ({ p, kind }, env) => (kind === 'customer' ? env.ledger.custBal : env.ledger.vendBal).get(p.id) || 0),
    ],
  },
  {
    id: 'item',
    label: 'Item details',
    record: (r, env) => (r.drill?.itemId ? env.L.itemMap.get(r.drill.itemId) : null),
    fields: [
      f('item.sku', 'SKU', 'text', (i) => i.sku || ''),
      f('item.barcode', 'Barcode', 'text', (i) => i.barcode || ''),
      f('item.category', 'Category', 'text', (i) => i.category || ''),
      f('item.desc', 'Item Description', 'text', (i) => oneLine(i.description)),
      f('item.type', 'Item Type', 'text', (i) => i.type || ''),
      f('item.uom', 'Unit', 'text', (i) => i.uom || ''),
      f('item.cost', 'Cost', 'money', (i) => num(i.cost)),
      f('item.price', 'Price', 'money', (i) => num(i.price)),
      f('item.vendor', 'Preferred Vendor', 'text', (i, env) => env.L.vendorMap.get(i.preferredVendorId)?.name || ''),
      f('item.reorder', 'Reorder Point', 'qty', (i) => (i.type === 'Inventory Part' && num(i.reorderPoint) ? num(i.reorderPoint) : '')),
      f('item.onhand', 'Qty On Hand', 'qty', (i, env) => (i.type === 'Inventory Part' ? env.ledger.itemStat(i.id).qty : '')),
      f('item.onpo', 'Qty On PO', 'qty', (i, env) => (i.type === 'Inventory Part' ? env.ledger.itemStat(i.id).onPO || '' : '')),
      f('item.value', 'Stock Value', 'money', (i, env) => (i.type === 'Inventory Part' ? round2(env.ledger.itemStat(i.id).value) : '')),
    ],
  },
  {
    id: 'account',
    label: 'Account details',
    record: (r, env) => (r.drill?.accountId ? env.L.accountMap.get(r.drill.accountId) : null),
    fields: [
      f('account.number', 'Account Number', 'text', (a) => a.number || ''),
      f('account.type', 'Account Type', 'text', (a) => a.type || ''),
      f('account.desc', 'Account Description', 'text', (a) => a.description || ''),
      f('account.bal', 'Account Balance', 'money', (a, env) => (isPL(a.type) ? '' : round2((DEBIT_NORMAL.has(a.type) ? 1 : -1) * (env.ledger.acctBal.get(a.id) || 0)))),
    ],
  },
];

const FIELD_BY_ID = new Map(FIELD_GROUPS.flatMap((g) => g.fields.map((x) => [x.id, { ...x, group: g }])));
export const fieldKey = (fieldId) => 'x_' + fieldId.replace(/\./g, '_');

export const CALC_OPS = [
  ['+', 'A + B'],
  ['-', 'A − B'],
  ['*', 'A × B'],
  ['/', 'A ÷ B'],
  ['%', 'A as % of B'],
];
export const NUMBER_TYPES = ['money', 'qty', 'pct'];

// Which groups the rows of this report can feed, and which of their fields are not already a column of the report
export function availableFields(report) {
  const has = new Set();
  for (const r of report.rows) {
    if (r.txnId) has.add('txn');
    if (r.drill?.nameId) has.add('name');
    if (r.drill?.itemId) has.add('item');
    if (r.drill?.accountId) has.add('account');
    if (has.size === FIELD_GROUPS.length) break;
  }
  const taken = new Set(report.columns.map((c) => String(c.label || '').trim().toLowerCase()));
  return FIELD_GROUPS.filter((g) => has.has(g.id))
    .map((g) => ({ id: g.id, label: g.label, fields: g.fields.filter((x) => !taken.has(x.label.toLowerCase())) }))
    .filter((g) => g.fields.length);
}

const calcType = (x, cols) => {
  const ta = cols.get(x.a)?.type;
  const tb = cols.get(x.b)?.type;
  if (x.op === '%') return 'pct';
  if (x.op === '*') return ta === 'money' || tb === 'money' ? 'money' : 'qty';
  if (x.op === '/') return ta === 'money' && tb !== 'money' ? 'money' : 'qty';
  return ta || 'money';
};

// The column definitions of the user's extra columns (same shape as the report builders' columns)
export function extraColumnDefs(report, extraCols) {
  const out = [];
  const byKey = new Map(report.columns.map((c) => [c.key, c]));
  for (const x of extraCols || []) {
    let c = null;
    if (x.kind === 'field') {
      const d = FIELD_BY_ID.get(x.field);
      if (d) c = { key: x.id, label: d.label, type: d.type, align: ALIGN[d.type] };
    } else if (x.kind === 'calc') {
      const type = calcType(x, byKey);
      c = { key: x.id, label: x.label || 'Calculated', type, align: 'right' };
    } else {
      c = { key: x.id, label: x.label || 'Notes', type: 'text', align: 'left', width: 140 };
    }
    if (c) {
      c.extra = x.kind;
      out.push(c);
      byKey.set(c.key, c);
    }
  }
  return out;
}

function calcValue(x, cells, kind) {
  const a = cells[x.a];
  const b = cells[x.b];
  if (typeof a !== 'number' || typeof b !== 'number') return '';
  let v;
  if (x.op === '+') v = a + b;
  else if (x.op === '-') v = a - b;
  else if (x.op === '*') v = kind === 'row' ? a * b : ''; // a product of two totals means nothing
  else if (x.op === '/') v = b ? a / b : '';
  else v = b ? (a / b) * 100 : '';
  return v === '' ? '' : Math.round(v * 100000) / 100000;
}

// The report with the user's extra columns appended (every row gets a value for each)
export function withExtraColumns(report, extraCols, env) {
  if (!extraCols?.length) return report;
  const defs = extraColumnDefs(report, extraCols);
  if (!defs.length) return report;
  const byId = new Map(extraCols.map((x) => [x.id, x]));
  const fields = defs.filter((c) => c.extra === 'field').map((c) => FIELD_BY_ID.get(byId.get(c.key).field));
  const fieldCols = defs.filter((c) => c.extra === 'field');
  const calcs = defs.filter((c) => c.extra === 'calc').map((c) => byId.get(c.key));
  const rows = report.rows.map((r) => {
    const add = {};
    const found = new Map(); // the record of each group, looked up once per row
    fields.forEach((d, i) => {
      if (!found.has(d.group.id)) found.set(d.group.id, d.group.record(r, env));
      const rec = found.get(d.group.id);
      add[fieldCols[i].key] = rec ? d.get(rec, env) : '';
    });
    const cells = { ...r.cells, ...add };
    for (const x of calcs) cells[x.id] = calcValue(x, cells, r.kind);
    return { ...r, cells };
  });
  return { ...report, columns: [...report.columns, ...defs], rows };
}
