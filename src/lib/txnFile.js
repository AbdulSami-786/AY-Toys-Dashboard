// Export / Import of ONE invoice (or bill) from its own form. The Excel / CSV file is the same layout as the
// "Invoices" / "Bills (purchases)" import template (Import / Export Lists window): one row per item line, the invoice's
// number, date, customer, terms… repeated on each row. So a file exported here can be imported again here, in another
// shop, or with File › Utilities › Import Lists from CSV. Columns and headings follow Customized Templates.

import { downloadXlsx, XS } from './xlsx';
import { SPECS, fieldsFor, headLabel, setImportCustom } from './importTemplates';
import { readDataFile, buildAll } from './importData';
import { num } from './format';

// the import template that matches each form
export const KIND_OF = {
  invoice: 'invoices',
  salesreceipt: 'invoices',
  creditmemo: 'invoices',
  estimate: 'invoices',
  salesorder: 'invoices',
  bill: 'bills',
  vendorcredit: 'bills',
  purchaseorder: 'bills',
};
export const KIND_WORD = { invoices: 'invoice', bills: 'bill' };

const TEXT_KEYS = new Set(['num', 'date', 'customer', 'vendor', 'item', 'time', 'terms', 'duedate', 'po', 'description', 'memo']);

/**
 * The sheet to save. doc: { num, date, time, party, terms, dueDate, po, taxRate, memo, lines: [{ item, description, qty, price }] } 
 */
export function txnSheet(kind, doc, company) {
  const fields = fieldsFor(kind, company?.importTemplates);
  const partyKey = kind === 'invoices' ? 'customer' : 'vendor';
  const priceKey = kind === 'invoices' ? 'rate' : 'cost';
  const head = (l) => ({
    num: doc.num,
    date: doc.date,
    [partyKey]: doc.party,
    item: l.item,
    qty: num(l.qty),
    [priceKey]: num(l.price),
    time: doc.time || '',
    terms: doc.terms || '',
    duedate: doc.dueDate || '',
    po: doc.po || '',
    taxrate: num(doc.taxRate) || '',
    description: l.description || '',
    memo: doc.memo || '',
  });
  const rows = [fields.map((f) => ({ v: headLabel(f), s: f.req ? XS.required : XS.optional }))];
  doc.lines.forEach((l) => {
    const v = head(l);
    rows.push(fields.map((f) => (TEXT_KEYS.has(f.key) ? { v: String(v[f.key] ?? ''), s: XS.text } : v[f.key])));
  });
  const widths = fields.map((f) => Math.max(14, f.head.length + 6, f.key === 'description' || f.key === 'memo' ? 30 : 0, ['customer', 'vendor', 'item'].includes(f.key) ? 26 : 0));
  return { name: SPECS[kind].sheet, freeze: 1, heights: [30], widths, rows };
}

export function exportTxnFile(kind, doc, company, fileLabel) {
  const name = `${fileLabel}_${String(doc.num || 'new').replace(/[^\w-]+/g, '_')}.xlsx`;
  downloadXlsx(name, [txnSheet(kind, doc, company)]);
  return name;
}

/**
 * Read an Excel / CSV file → { docs: [{ num, rows }] } (rows of the same number are one document) or { error }.
 */
export async function readTxnFile(file, kind, company) {
  setImportCustom(company?.importTemplates); // the user's own column headings are understood too
  const r = await readDataFile(file, kind);
  if (r.error) return { error: r.error };
  if (r.needKind) return { error: `I could not tell what this file is. Use a file made with Export on an ${KIND_WORD[kind]}, or the ${KIND_WORD[kind]} template.` };
  if (r.format !== 'lists') return { error: `This is a backup file, not an ${KIND_WORD[kind]} file.` };
  const rows = r.byKind[kind];
  if (!rows?.length) {
    const other = Object.keys(r.byKind)[0];
    return { error: other ? `This file holds ${other}, not ${kind}. Open the matching form to import it.` : `No ${KIND_WORD[kind]} rows were found in this file.` };
  }
  const groups = new Map();
  rows.forEach((o) => {
    const key = (o.num || '').trim();
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  if (!groups.size) return { error: `The file has no ${KIND_WORD[kind]} number column filled in, so the lines can't be grouped. Use the template: it needs "${SPECS[kind].fields[0].head}".` };
  return { docs: [...groups].map(([n, rs]) => ({ num: n, rows: rs })) };
}

const buildOpts = (company) => ({ dateStyle: company.dateStyle, depositTo: company.defaultDepositTo });

// One document of the file → the record it would be (for filling the open form). Numbers already in the books are fine here.
// → { rec } or { problem }
export function buildOneFromFile(kind, doc, data, company) {
  const recType = kind === 'invoices' ? 'invoice' : 'bill';
  const books = { ...data, txns: (data.txns || []).filter((t) => t.type !== recType) };
  const built = buildAll({ [kind]: doc.rows }, books, buildOpts(company))[kind];
  const rec = built?.recs[0];
  return rec ? { rec } : { problem: built?.skipped[0] || 'This document could not be read.' };
}

// Every document of the file as new records (numbers already in the books are skipped)
export function buildAllFromFile(kind, docs, data, company) {
  const built = buildAll({ [kind]: docs.flatMap((d) => d.rows) }, data, buildOpts(company))[kind];
  return { recs: built?.recs || [], skipped: built?.skipped || [] };
}
