import { evalAmount } from './format';
import { ITEM_TYPES, ACCOUNT_TYPES } from '../store/defaults';

export const KINDS = ['customers', 'vendors', 'items', 'accounts'];
export const KIND_LABEL = { customers: 'Customers', vendors: 'Vendors', items: 'Items', accounts: 'Chart of Accounts' };

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

// column heading (ours, or as QuickBooks exports it) → field
const ALIASES = {
  name: ['name', 'customer', 'customer name', 'vendor', 'vendor name', 'item', 'item name', 'item name/number', 'account', 'account name', 'full name'],
  sku: ['sku', 'item code', 'code'],
  type: ['type', 'item type', 'account type'],
  category: ['category'],
  description: ['description', 'sales description', 'desc'],
  uom: ['u/m', 'uom', 'unit', 'unit of measure'],
  cost: ['cost', 'purchase cost'],
  price: ['price', 'sales price', 'rate'],
  reorderpoint: ['reorder point', 'reorder pt (min)', 'reorder pt'],
  barcode: ['barcode'],
  company: ['company', 'company name'],
  contact: ['contact', 'contact name'],
  phone: ['phone', 'main phone', 'phone numbers'],
  email: ['email', 'main email'],
  address: ['address', 'bill to', 'bill to 1', 'street'],
  city: ['city'],
  terms: ['terms'],
  creditlimit: ['credit limit'],
  ntn: ['ntn', 'tax id', 'tax number'],
  number: ['number', 'account number', 'account #'],
};
const FIELD_OF = Object.fromEntries(Object.entries(ALIASES).flatMap(([k, list]) => list.map((a) => [a, k])));

// CSV rows → [{ name, phone, … }]. QuickBooks puts title rows and blank columns above the real headings, so find them first.
export function rowsToObjects(rows) {
  const hi = rows.findIndex((r) => r.some((h) => FIELD_OF[h.trim().toLowerCase()] === 'name'));
  if (hi < 0) return { objs: [], first: '' };
  const head = rows[hi].map((h) => FIELD_OF[h.trim().toLowerCase()] || '');
  const first = rows[hi].find((h) => FIELD_OF[h.trim().toLowerCase()] === 'name').trim().toLowerCase();
  const objs = rows
    .slice(hi + 1)
    .map((r) => {
      const o = {};
      head.forEach((k, i) => {
        if (k && o[k] === undefined) o[k] = (r[i] || '').trim();
      });
      return o;
    })
    .filter((o) => o.name && !/^total\b/i.test(o.name));
  return { objs, first };
}

export function detectKind({ objs, first }) {
  if (objs.some((o) => ACCOUNT_TYPES.some((t) => t.toLowerCase() === (o.type || '').toLowerCase()))) return 'accounts';
  if (first === 'vendor' || first === 'vendor name') return 'vendors';
  if (first === 'customer' || first === 'customer name') return 'customers';
  if (first === 'item' || first.startsWith('item name') || objs.some((o) => o.sku || o.price || o.cost || o.reorderpoint)) return 'items';
  if (first === 'account' || first === 'account name') return 'accounts';
  return null;
}

// ---------- QuickBooks IIF ----------
const IIF_ACCOUNT = {
  BANK: 'Bank',
  AR: 'Accounts Receivable',
  OCASSET: 'Other Current Asset',
  FIXASSET: 'Fixed Asset',
  OASSET: 'Other Asset',
  AP: 'Accounts Payable',
  CCARD: 'Credit Card',
  OCLIAB: 'Other Current Liability',
  LTLIAB: 'Long Term Liability',
  EQUITY: 'Equity',
  INC: 'Income',
  COGS: 'Cost of Goods Sold',
  EXP: 'Expense',
  EXINC: 'Other Income',
  EXEXP: 'Other Expense',
};
const IIF_ITEM = { INVENTORY: 'Inventory Part', PART: 'Inventory Part', NONINV: 'Non-inventory Part', SERV: 'Service', OTHC: 'Other Charge', DISC: 'Discount' };

export function parseIIF(text) {
  const heads = {};
  const lists = {};
  let txnLines = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.split('\t');
    const tag = cells[0].trim();
    if (tag.startsWith('!')) {
      heads[tag.slice(1)] = cells.map((c) => c.trim().toUpperCase());
      continue;
    }
    if (tag === 'TRNS') txnLines++;
    if (!['ACCNT', 'CUST', 'VEND', 'INVITEM'].includes(tag) || !heads[tag]) continue;
    const r = {};
    heads[tag].forEach((h, i) => {
      if (i) r[h] = (cells[i] || '').trim();
    });
    (lists[tag] ||= []).push(r);
  }
  const addr = (r, p) =>
    [1, 2, 3, 4, 5]
      .map((i) => r[p + i])
      .filter((x) => x && x !== r.NAME && x !== r.COMPANYNAME)
      .join(', ');
  const party = (r, p) => ({
    name: r.NAME,
    company: r.COMPANYNAME,
    contact: r.CONT1 || [r.FIRSTNAME, r.LASTNAME].filter(Boolean).join(' '),
    phone: r.PHONE1,
    email: r.EMAIL,
    address: addr(r, p),
    terms: r.TERMS,
    creditlimit: r.CRLIMIT,
    ntn: r.TAXID || r.VTAXID,
  });
  const objs = {
    accounts: (lists.ACCNT || []).filter((r) => IIF_ACCOUNT[r.ACCNTTYPE]).map((r) => ({ name: r.NAME, number: r.ACCNUM, type: IIF_ACCOUNT[r.ACCNTTYPE], description: r.DESC })),
    customers: (lists.CUST || []).map((r) => party(r, 'BADDR')),
    vendors: (lists.VEND || []).map((r) => party(r, 'ADDR')),
    items: (lists.INVITEM || [])
      .filter((r) => IIF_ITEM[r.INVITEMTYPE])
      .map((r) => ({ name: r.NAME, type: IIF_ITEM[r.INVITEMTYPE], description: r.DESC, price: r.PRICE, cost: r.COST, reorderpoint: r.REORDERPOINT })),
  };
  return { objs, txnLines };
}

// ---------- records for the dashboard ----------
// Names that already exist are skipped. Returns { customers: { recs, skipped }, … } for the kinds given.
export function buildRecords(byKind, data) {
  const out = {};
  const amount = (v) => {
    const x = evalAmount(String(v ?? ''));
    return typeof x === 'number' ? x : 0;
  };
  const skus = new Set((data.items || []).map((i) => String(i.sku || '').trim().toLowerCase()).filter(Boolean));
  for (const kind of Object.keys(byKind)) {
    const existing = new Set((data[kind] || []).map((x) => x.name.toLowerCase()));
    const recs = [];
    const skipped = [];
    for (const r of byKind[kind]) {
      const name = r.name;
      if (!name) continue;
      if (existing.has(name.toLowerCase())) {
        skipped.push(name);
        continue;
      }
      if (kind === 'items') {
        const sku = r.sku || '';
        if (sku && skus.has(sku.toLowerCase())) {
          skipped.push(`${name} (SKU ${sku} already used)`);
          continue;
        }
        if (sku) skus.add(sku.toLowerCase());
      }
      existing.add(name.toLowerCase());
      if (kind === 'items') {
        const type = ITEM_TYPES.find((t) => t.toLowerCase() === (r.type || '').toLowerCase()) || 'Inventory Part';
        recs.push({
          name,
          sku: r.sku || '',
          type,
          category: r.category || '',
          description: r.description || '',
          purchaseDescription: r.description || '',
          uom: r.uom || 'pcs',
          cost: amount(r.cost),
          price: amount(r.price),
          reorderPoint: amount(r.reorderpoint),
          barcode: r.barcode || '',
          incomeAccountId: data.accounts.find((a) => a.sys === 'sales')?.id,
          cogsAccountId: data.accounts.find((a) => a.sys === 'cogs')?.id,
          assetAccountId: data.accounts.find((a) => a.sys === 'inventory')?.id,
          taxable: true,
          active: true,
        });
      } else if (kind === 'accounts') {
        const type = ACCOUNT_TYPES.find((t) => t.toLowerCase() === (r.type || '').toLowerCase());
        if (!type) {
          skipped.push(name + ' (unknown type)');
          continue;
        }
        recs.push({ id: 'acc-' + Math.random().toString(36).slice(2, 10), number: r.number || '', name, type, description: r.description || '', parentId: '', active: true });
      } else {
        const bill = [r.company || name, r.address, r.city].filter(Boolean).join('\n');
        recs.push({
          name,
          company: r.company || '',
          contact: r.contact || '',
          phone: r.phone || '',
          email: r.email || '',
          address: r.address || '',
          city: r.city || '',
          billTo: bill,
          shipTo: bill,
          terms: r.terms || 'Net 30',
          creditLimit: amount(r.creditlimit),
          ntn: r.ntn || '',
          active: true,
        });
      }
    }
    out[kind] = { recs, skipped };
  }
  return out;
}

// One uploaded file → what it holds. kind: forced list kind for a plain CSV ('' = work it out).
// Returns { format: 'backup', json } | { format: 'lists', byKind, txnLines } | { error } | { needKind: true }.
export async function readDataFile(file, kind = '') {
  const name = file.name.toLowerCase();
  if (/\.(qbb|qbw|qbm|qbx)$/.test(name))
    return {
      error:
        'This is a QuickBooks company/backup file. Only QuickBooks itself can open it (the data inside is encrypted).\n\nIn QuickBooks: restore the file, then File › Utilities › Export › Lists to IIF Files (or export the Customer, Vendor, Item and Account lists to Excel/CSV) and upload that file here.',
    };
  if (/\.(xlsx|xls)$/.test(name)) return { error: 'Excel files cannot be read directly. In Excel use File › Save As › CSV UTF-8, then upload the .csv file.' };
  const text = (await file.text()).replace(/^﻿/, '');
  if (name.endsWith('.json')) {
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return { error: 'That file is not valid JSON.' };
    }
    if (!json.data?.accounts) return { error: 'This JSON file is not an AY Toys backup.' };
    return { format: 'backup', json };
  }
  if (name.endsWith('.iif') || /^!(ACCNT|CUST|VEND|INVITEM|TRNS)\t/m.test(text)) {
    const { objs, txnLines } = parseIIF(text);
    const byKind = Object.fromEntries(KINDS.filter((k) => objs[k].length).map((k) => [k, objs[k]]));
    if (!Object.keys(byKind).length) return { error: 'No customers, vendors, items or accounts were found in this IIF file.' };
    return { format: 'lists', byKind, txnLines };
  }
  const parsed = rowsToObjects(parseCSV(text));
  if (!parsed.objs.length) return { error: 'No data rows found. The file needs a heading row with a "Name" (or Customer / Vendor / Item / Account) column.' };
  const k = kind || detectKind(parsed);
  if (!k) return { needKind: true };
  return { format: 'lists', byKind: { [k]: parsed.objs }, txnLines: 0 };
}
