import { evalAmount, uid, round2, num } from './format';
import { ITEM_TYPES, ACCOUNT_TYPES } from '../store/defaults';
import { salesTotals } from './ledger';
import { dueFromTerms } from './dates';
import { readXlsx, serialToISO } from './xlsx';
import { SPECS, headMap, KIND_LABEL, LIST_KINDS, TXN_KINDS } from './importTemplates';

export { KIND_LABEL, LIST_KINDS, TXN_KINDS };
// everything a file can hold, in the order it is saved (lists first, so transactions can point at them)
export const KINDS = [...LIST_KINDS, ...TXN_KINDS];

// a heading as typed in a template: "Name *" → "name"
const normHead = (h) => String(h ?? '').replace(/\*/g, '').trim().toLowerCase();

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
  pkg: ['pkg', 'packing', 'pack', 'pcs per carton', 'pcs/ctn', 'pieces per carton', 'carton size'],
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
  const hi = rows.findIndex((r) => r.some((h) => FIELD_OF[normHead(h)] === 'name'));
  if (hi < 0) return { objs: [], first: '' };
  const head = rows[hi].map((h) => FIELD_OF[normHead(h)] || '');
  const first = normHead(rows[hi].find((h) => FIELD_OF[normHead(h)] === 'name'));
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
    if (TXN_KINDS.includes(kind)) continue; // see buildAll
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
          id: uid(),
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
          pkg: amount(r.pkg),
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
          id: uid(),
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

// ---------- invoices & bills (one row per item line) ----------
const pad2 = (n) => String(n).padStart(2, '0');

// "2025-11-30", "30/11/2025" (or 11/30/2025 when the shop uses month first) or an Excel serial → "2025-11-30" ('' = not a date)
export function parseImportDate(v, style = 'DMY') {
  const s = String(v ?? '').trim();
  if (!s) return '';
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  let y;
  let mo;
  let d;
  if (m) [y, mo, d] = [m[1], m[2], m[3]];
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s))) {
    [y, mo, d] = style === 'MDY' ? [m[3], m[1], m[2]] : [m[3], m[2], m[1]];
    if (y.length === 2) y = '20' + y;
  } else if (/^\d{5}(\.\d+)?$/.test(s)) return serialToISO(s);
  else return '';
  const iso = `${y}-${pad2(mo)}-${pad2(d)}`;
  const t = new Date(iso + 'T00:00:00Z');
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : '';
}

// "14:30", "2:30 PM" or an Excel time fraction → "14:30" ('' = no time)
export function parseImportTime(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^(0?\.\d+|1)$/.test(s)) {
    const mins = Math.round(Number(s) * 1440) % 1440;
    return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
  }
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(s);
  if (!m) return '';
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0);
  return h < 24 && Number(m[2]) < 60 ? `${pad2(h)}:${m[2]}` : '';
}

// rows of an invoices / bills sheet → [{ num, date, customer, … }]
export function rowsToTxnObjects(rows, kind) {
  const map = headMap(kind);
  const hi = rows.findIndex((r) => r.some((h) => map[normHead(h)] === 'num'));
  if (hi < 0) return [];
  const head = rows[hi].map((h) => map[normHead(h)] || '');
  return rows
    .slice(hi + 1)
    .map((r) => {
      const o = {};
      head.forEach((k, i) => {
        if (k && o[k] === undefined) o[k] = String(r[i] ?? '').trim();
      });
      return o;
    })
    .filter((o) => Object.values(o).some(Boolean));
}

// 'invoices' | 'bills' | null — which transaction template these rows are
export function detectTxnKind(rows) {
  for (const kind of ['invoices', 'bills']) {
    const map = headMap(kind);
    const hi = rows.findIndex((r) => r.some((h) => map[normHead(h)] === 'num'));
    if (hi >= 0 && rows[hi].some((h) => ['customer', 'vendor'].includes(map[normHead(h)]))) {
      const keys = rows[hi].map((h) => map[normHead(h)]);
      if (kind === 'invoices' ? keys.includes('customer') : keys.includes('vendor')) return kind;
    }
  }
  return null;
}

function buildTxns(kind, objs, data, lookups, opts) {
  const isInv = kind === 'invoices';
  const type = isInv ? 'invoice' : 'bill';
  const partyKey = isInv ? 'customer' : 'vendor';
  const costKey = isInv ? 'rate' : 'cost';
  const existingNums = new Set((data.txns || []).filter((t) => t.type === type).map((t) => String(t.num ?? '').trim().toLowerCase()));
  const groups = new Map();
  objs.forEach((o) => {
    const key = (o.num || '').trim();
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  const recs = [];
  const skipped = [];
  const label = isInv ? 'Invoice' : 'Bill';
  for (const [numText, rows] of groups) {
    const first = rows[0];
    const why = (m) => skipped.push(`${label} ${numText}: ${m}`);
    if (existingNums.has(numText.toLowerCase())) {
      skipped.push(`${label} ${numText} (already there)`);
      continue;
    }
    const date = parseImportDate(first.date, opts.dateStyle);
    if (!date) {
      why(`date "${first.date || ''}" is missing or not a date`);
      continue;
    }
    const who = lookups[partyKey].get((first[partyKey] || '').toLowerCase());
    if (!who) {
      why(`${partyKey} "${first[partyKey] || ''}" not found`);
      continue;
    }
    const lines = [];
    let bad = '';
    for (const r of rows) {
      const it = lookups.item.get((r.item || '').toLowerCase());
      if (!it) {
        bad = `item "${r.item || ''}" not found`;
        break;
      }
      const qty = evalAmount(r.qty || '');
      const price = evalAmount(r[costKey] || '');
      if (typeof qty !== 'number' || typeof price !== 'number') {
        bad = `${it.name}: Qty or ${isInv ? 'Rate' : 'Cost'} is missing or not a number`;
        break;
      }
      lines.push({ itemId: it.id, description: r.description || (isInv ? it.description : it.purchaseDescription || it.description) || it.name, qty, uom: it.uom || '', [costKey]: price, amount: round2(qty * price) });
    }
    if (bad) {
      why(bad);
      continue;
    }
    const terms = first.terms || who.terms || '';
    const dueDate = parseImportDate(first.duedate, opts.dateStyle) || dueFromTerms(date, terms);
    const time = parseImportTime(first.time);
    if (isInv) {
      const taxRate = num(first.taxrate);
      const c = salesTotals(
        lines.map((l) => ({ ...l, taxable: taxRate > 0 && lookups.itemById.get(l.itemId)?.taxable !== false })),
        taxRate,
        lookups.itemById,
      );
      recs.push({
        id: uid(),
        type,
        num: numText,
        date,
        ...(time ? { time } : {}),
        customerId: who.id,
        billTo: who.billTo || who.name,
        shipTo: who.shipTo || '',
        terms,
        dueDate,
        poNumber: first.po || '',
        rep: '',
        shipDate: '',
        via: '',
        depositTo: opts.depositTo || '',
        method: 'Cash',
        ref: '',
        lines: c.lines,
        message: '',
        memo: first.memo || '',
        taxRate,
        subtotal: c.subtotal,
        tax: c.tax,
        total: c.total,
        voided: false,
        closed: false,
      });
    } else {
      recs.push({
        id: uid(),
        type,
        num: numText,
        date,
        ...(time ? { time } : {}),
        dueDate,
        vendorId: who.id,
        address: [who.company || who.name, who.address, who.city].filter(Boolean).join('\n'),
        terms,
        memo: first.memo || '',
        expenseLines: [],
        itemLines: lines,
        total: round2(lines.reduce((s, l) => s + l.amount, 0)),
        closed: false,
        voided: false,
      });
    }
  }
  return { recs, skipped, table: 'txns' };
}

// Lists (customers, vendors, items, accounts) and transactions (bills, invoices) in one go.
// Transactions may point at customers / vendors / items that are only in the same file.
// → { customers: { recs, skipped }, …, bills: { recs, skipped, table: 'txns' } }
export function buildAll(byKind, data, opts = {}) {
  const out = buildRecords(byKind, data);
  const txnKinds = TXN_KINDS.filter((k) => byKind[k]);
  if (!txnKinds.length) return out;
  const index = (list) => new Map(list.map((x) => [x.name.toLowerCase(), x]));
  const customers = [...(data.customers || []), ...(out.customers?.recs || [])];
  const vendors = [...(data.vendors || []), ...(out.vendors?.recs || [])];
  const items = [...(data.items || []), ...(out.items?.recs || [])];
  const itemIdx = index(items);
  items.forEach((i) => i.sku && itemIdx.set(String(i.sku).toLowerCase(), i));
  const lookups = { customer: index(customers), vendor: index(vendors), item: itemIdx, itemById: new Map(items.map((i) => [i.id, i])) };
  const depositTo = opts.depositTo || data.accounts?.find((a) => a.sys === 'undeposited')?.id || '';
  for (const k of txnKinds) out[k] = buildTxns(k, byKind[k], data, lookups, { dateStyle: opts.dateStyle || 'DMY', depositTo });
  return out;
}

// A backup must hold the book tables as lists — anything else would break the whole app once loaded
const BOOK_TABLES = ['accounts', 'items', 'customers', 'vendors', 'txns', 'memorized'];
export function backupProblem(json) {
  const d = json?.data;
  if (!d || typeof d !== 'object' || !Array.isArray(d.accounts)) return 'This JSON file is not an AY Toys backup.';
  for (const t of BOOK_TABLES) {
    if (d[t] === undefined) continue;
    if (!Array.isArray(d[t]) || d[t].some((r) => !r || typeof r !== 'object' || Array.isArray(r))) return `This backup is damaged (the "${t}" list is not readable).`;
  }
  return '';
}

// An Excel workbook: every sheet that is one of our templates (or looks like a list) is read.
async function readExcelLists(file, forcedKind = '') {
  let sheets;
  try {
    sheets = await readXlsx(await file.arrayBuffer());
  } catch (e) {
    return { error: e.message || 'This Excel file could not be read.' };
  }
  const sheetKind = (name) => KINDS.find((k) => [SPECS[k].sheet, KIND_LABEL[k]].some((n) => n.toLowerCase() === name.trim().toLowerCase()));
  const byKind = {};
  const unknown = [];
  for (const sh of sheets) {
    if (/^instructions?$/i.test(sh.name.trim())) continue;
    const rows = sh.rows.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some(Boolean));
    if (rows.length < 2) continue;
    let k = sheetKind(sh.name) || detectTxnKind(rows) || '';
    if (!k) {
      const parsed = rowsToObjects(rows);
      k = parsed.objs.length ? detectKind(parsed) || '' : '';
      if (!k) {
        if (parsed.objs.length) unknown.push(rows);
        continue;
      }
    }
    const objs = TXN_KINDS.includes(k) ? rowsToTxnObjects(rows, k) : rowsToObjects(rows).objs;
    if (objs.length) byKind[k] = [...(byKind[k] || []), ...objs];
  }
  if (!Object.keys(byKind).length) {
    if (unknown.length === 1 && forcedKind) {
      const k = forcedKind;
      const objs = TXN_KINDS.includes(k) ? rowsToTxnObjects(unknown[0], k) : rowsToObjects(unknown[0]).objs;
      if (objs.length) return { format: 'lists', byKind: { [k]: objs }, txnLines: 0 };
    }
    if (unknown.length === 1) return { needKind: true };
    return { error: 'No data rows were found. Use the template from "Download template" — it needs a heading row (e.g. "Name *") and the records below it.' };
  }
  return { format: 'lists', byKind, txnLines: 0 };
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
  if (/\.xls$/.test(name)) return { error: 'This is an old Excel (.xls) file. In Excel use File › Save As › Excel Workbook (.xlsx) — or CSV UTF-8 — and upload that file.' };
  if (/\.xlsx$/.test(name)) return readExcelLists(file, kind);
  const text = (await file.text()).replace(/^﻿/, '');
  if (name.endsWith('.json')) {
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return { error: 'That file is not valid JSON.' };
    }
    const bad = backupProblem(json);
    if (bad) return { error: bad };
    return { format: 'backup', json };
  }
  if (name.endsWith('.iif') || /^!(ACCNT|CUST|VEND|INVITEM|TRNS)\t/m.test(text)) {
    const { objs, txnLines } = parseIIF(text);
    const byKind = Object.fromEntries(LIST_KINDS.filter((k) => objs[k].length).map((k) => [k, objs[k]]));
    if (!Object.keys(byKind).length) return { error: 'No customers, vendors, items or accounts were found in this IIF file.' };
    return { format: 'lists', byKind, txnLines };
  }
  const csvRows = parseCSV(text);
  const txnKind = kind ? (TXN_KINDS.includes(kind) ? kind : null) : detectTxnKind(csvRows);
  if (txnKind) {
    const objs = rowsToTxnObjects(csvRows, txnKind);
    if (!objs.length) return { error: `No ${KIND_LABEL[txnKind].toLowerCase()} rows found in this file.` };
    return { format: 'lists', byKind: { [txnKind]: objs }, txnLines: 0 };
  }
  const parsed = rowsToObjects(csvRows);
  if (!parsed.objs.length) return { error: 'No data rows found. The file needs a heading row with a "Name" (or Customer / Vendor / Item / Account) column.' };
  const k = kind || detectKind(parsed);
  if (!k) return { needKind: true };
  return { format: 'lists', byKind: { [k]: parsed.objs }, txnLines: 0 };
}
