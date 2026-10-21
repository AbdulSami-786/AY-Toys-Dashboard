// Shared party ledgers.
// A customer or vendor gets a private link + password to a read-only copy of their ledger.
// The copy ("snapshot") is built here with the real ledger engine, published to the Google Sheet,
// and served to the party by the Apps Script web app (see apps-script/Code.gs, doGet).
// The party's page can only read the snapshot — it has no way to change anything.

import { buildDocContext, FORM_MAP } from './templates';
import { sortTxns, txnTotal } from './ledger';
import { money, num, randomString, round2 } from './format';
import { fmtDate } from './dates';
import { TXN_TYPES } from '../store/defaults';

export const newShareToken = () => randomString(24);
// lowercase + digits without look-alikes (0/o, 1/l/i) so it is easy to type on a phone
export const newSharePassword = () => randomString(8, 'abcdefghjkmnpqrstuvwxyz23456789');
export const MIN_PASSWORD = 4;

export const isShared = (p) => !!(p?.share?.on && p.share.token && p.share.pass);

export function shareLink(sheetUrl, token) {
  if (!sheetUrl || !token) return '';
  try {
    const u = new URL(sheetUrl.trim());
    u.hash = '';
    u.searchParams.set('l', token);
    return u.toString();
  } catch {
    return '';
  }
}

// Wording the party sees (QuickBooks names like "Bill Pmt -Check" mean little to them)
const LABEL = {
  invoice: 'Invoice',
  salesreceipt: 'Sales Receipt',
  creditmemo: 'Credit Memo',
  payment: 'Payment',
  estimate: 'Estimate',
  salesorder: 'Sales Order',
  bill: 'Bill',
  vendorcredit: 'Bill Credit',
  billpayment: 'Payment',
  check: 'Payment Voucher',
  purchaseorder: 'Purchase Order',
};
const labelOf = (type) => LABEL[type] || 'Adjustment';

const TOTAL_LABEL = { subtotal: 'Subtotal', total: 'Total', payments: 'Payments / Credits', balanceDue: 'Balance Due' };

const COLS = {
  sales: ['Item', 'Description', 'Qty', 'Rate', 'Amount'],
  purchase: ['Item / Account', 'Description', 'Qty', 'Cost', 'Amount'],
  payment: ['Applied to', 'Date', '', 'Original Amount', 'Amount Applied'],
  other: ['', 'Description', '', '', 'Amount'],
};

function lookups(data) {
  const m = (list) => new Map((list || []).map((r) => [r.id, r]));
  return { itemMap: m(data.items), customerMap: m(data.customers), vendorMap: m(data.vendors), accountMap: m(data.accounts) };
}

function statusOf(t, total, open) {
  if (t.voided) return 'void';
  if (!TXN_TYPES[t.type]?.posting) return t.closed ? 'closed' : 'pending';
  if (t.type === 'invoice' || t.type === 'bill') {
    if (open === undefined) return '';
    if (Math.abs(open) < 0.005) return 'paid';
    return open < total - 0.004 ? 'partial' : 'open';
  }
  if (t.type === 'payment') return 'received';
  if (t.type === 'creditmemo' || t.type === 'vendorcredit') return 'credit';
  if (t.type === 'salesreceipt' || t.type === 'check' || t.type === 'billpayment') return 'paid';
  return '';
}

// The printable details of one document (lines, totals, addresses) — values already formatted
function docDetail({ t, company, L, ledger, ctrlLines, paidBy, open }) {
  const ds = company.dateStyle;
  const pays = (paidBy.get(t.id) || []).map((p) => [`${labelOf(p.type)}${p.num ? ' #' + p.num : ''}`, fmtDate(p.date, ds), money(p.amount)]);

  if (!FORM_MAP[t.type]) {
    const lines = ctrlLines.map((l) => ['', l.memo || t.memo || 'Adjustment', '', '', money(Math.abs(l.amount))]);
    const tot = round2(ctrlLines.reduce((s, l) => s + Math.abs(l.amount), 0));
    return { title: 'ADJUSTMENT', cols: COLS.other, lines, totals: [['Total', money(tot), 1]], meta: [['Date', fmtDate(t.date, ds)]], memo: t.memo || '', pays };
  }

  const c = buildDocContext({ txn: t, company, L, ledger, template: null });
  const v = c.values;
  const cat = FORM_MAP[t.type].cat;
  const meta = [
    ['Date', v.date],
    ['Due date', v.dueDate],
    ['Terms', v.terms],
    ['P.O. No.', v.poNumber],
    ['Expected', v.expectedDate],
    ['Ship date', v.shipDate],
    ['Ship via', v.via],
    ['Rep', v.rep],
    ['Method', v.method],
    ['Reference', v.ref],
  ].filter(([, x]) => x);
  const to = [];
  if (cat === 'sales') {
    if (v.billTo) to.push(['Bill to', v.billTo]);
    if (v.shipTo) to.push(['Ship to', v.shipTo]);
  } else if (cat === 'purchase') {
    if (v.billTo) to.push(['Vendor', v.billTo]);
    if (v.shipTo) to.push(['Ship to', v.shipTo]);
  } else if (v.billTo) to.push([t.type === 'payment' ? 'Received from' : 'Paid to', v.billTo]);

  const totals = c.totals.map((x) => [x.label || TOTAL_LABEL[x.field] || x.field, x.value, x.strong ? 1 : 0]);
  if (t.type === 'payment' && open < -0.004) totals.push(['Unapplied credit', money(-open), 0]);

  return {
    title: v.title,
    meta,
    to,
    cols: COLS[cat] || COLS.other,
    lines: c.lines.map((l) => [l.item, l.desc, l.qty && l.uom && !String(l.qty).includes(l.uom) ? `${l.qty} ${l.uom}` : l.qty, l.rate, l.amount]),
    totals,
    note: v.message || '',
    memo: v.memo || '',
    words: v.amountWords || '',
    pays,
  };
}

// Group transactions and A/R / A/P lines by party once, so publishing many ledgers stays fast
export function shareIndex(data, ledger) {
  const add = (m, k, v) => {
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(v);
  };
  const txnsBy = new Map();
  for (const t of data.txns) {
    add(txnsBy, t.customerId, t);
    if (t.vendorId !== t.customerId) add(txnsBy, t.vendorId, t);
  }
  const linesBy = new Map();
  for (const l of ledger.lines) if (l.accountId === ledger.sys.AR || l.accountId === ledger.sys.AP) add(linesBy, l.nameId, l);
  return { txnsBy, linesBy, L: lookups(data) };
}

/**
 * Read-only ledger of one customer or vendor, as the party will see it.
 * Rows are in date order. dr / cr follow the company's books (customers: invoice = Dr, payment = Cr;
 * vendors: bill = Cr, payment = Dr). Cash sales and direct payments show on both sides, so they
 * appear in the list without changing the balance.
 */
export function buildPartySnapshot({ data, ledger, company, which, party, index }) {
  const isC = which === 'customer';
  const ctrl = isC ? ledger.sys.AR : ledger.sys.AP;
  const ix = index || shareIndex(data, ledger);
  const L = ix.L;

  // effect of every transaction on this party's receivable / payable
  const effect = new Map();
  const ctrlLines = new Map();
  for (const l of ix.linesBy.get(party.id) || []) {
    if (l.accountId !== ctrl) continue;
    effect.set(l.txnId, round2((effect.get(l.txnId) || 0) + l.amount));
    if (!ctrlLines.has(l.txnId)) ctrlLines.set(l.txnId, []);
    ctrlLines.get(l.txnId).push(l);
  }
  const byId = new Map((ix.txnsBy.get(party.id) || []).filter((t) => (isC ? t.customerId : t.vendorId) === party.id).map((t) => [t.id, t]));
  for (const id of effect.keys()) if (!byId.has(id) && ledger.txnById.get(id)) byId.set(id, ledger.txnById.get(id));
  const mine = [...byId.values()];

  // which payments settled each invoice / bill
  const paidBy = new Map();
  for (const t of mine) {
    if (t.voided || (t.type !== 'payment' && t.type !== 'billpayment')) continue;
    for (const a of t.applied || []) {
      if (!num(a.amount)) continue;
      if (!paidBy.has(a.txnId)) paidBy.set(a.txnId, []);
      paidBy.get(a.txnId).push({ type: t.type, num: t.num, date: t.date, amount: num(a.amount) });
    }
  }

  const rows = [];
  const orders = [];
  for (const t of sortTxns(mine)) {
    const total = round2(txnTotal(t, ledger));
    const open = ledger.open.get(t.id);
    let dr = 0;
    let cr = 0;
    if (effect.has(t.id)) {
      const e = effect.get(t.id);
      if (e > 0) dr = e;
      else cr = -e;
    } else if (!t.voided && (t.type === 'salesreceipt' || t.type === 'check')) {
      dr = total;
      cr = total;
    }
    const row = {
      t: t.type,
      l: labelOf(t.type),
      n: t.num || '',
      d: t.date,
      due: t.type === 'invoice' || t.type === 'bill' ? t.dueDate || '' : '',
      ref: t.poNumber || t.ref || '',
      memo: t.memo || '',
      dr: round2(dr),
      cr: round2(cr),
      tot: total,
      open: (t.type === 'invoice' || t.type === 'bill') && open !== undefined && !t.voided ? round2(open) : null,
      st: statusOf(t, total, open),
      doc: docDetail({ t, company, L, ledger, ctrlLines: ctrlLines.get(t.id) || [], paidBy, open }),
    };
    if (TXN_TYPES[t.type]?.posting === false) orders.push(row);
    else rows.push(row);
  }

  const bal = (isC ? ledger.custBal : ledger.vendBal).get(party.id) || 0;
  return {
    v: 1,
    kind: which,
    co: {
      name: company.legalName || company.name,
      address: [company.address, company.city].filter(Boolean).join(', '),
      phone: company.phone || '',
      email: company.email || '',
      ntn: company.ntn || '',
      web: company.website || '',
      cur: company.currency || '',
      ds: company.dateStyle || 'DMY',
      color: company.theme?.primary || '#2ca01c',
      logo: String(company.logo || '').startsWith('data:image/') ? company.logo : '',
    },
    p: {
      name: party.name,
      company: party.company || '',
      contact: party.contact || '',
      phone: [party.phone, party.altPhone].filter(Boolean).join(' / '),
      email: party.email || '',
      // bill-to usually repeats the name on its first line
      address: ((isC ? party.billTo : [party.address, party.city].filter(Boolean).join('\n')) || party.city || '')
        .split('\n')
        .filter((line, i) => !(i === 0 && [party.name, party.company].includes(line.trim())))
        .join('\n'),
      terms: party.terms || '',
      ntn: party.ntn || '',
      limit: isC && num(party.creditLimit) ? num(party.creditLimit) : 0,
    },
    bal: round2(bal),
    rows,
    orders,
  };
}

// cyrb53 — a fast 53-bit string hash, used only to notice when a snapshot changed
export function hashString(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Everything the Apps Script needs to publish one party's ledger, plus a signature to skip unchanged ones. */
export function sharePayload({ data, ledger, company, which, party, index }) {
  const snap = buildPartySnapshot({ data, ledger, company, which, party, index });
  const body = JSON.stringify(snap);
  const sig = hashString([body, party.share.pass, party.name].join('\u0001'));
  return {
    sig,
    upsert: {
      token: party.share.token,
      pass: party.share.pass,
      partyId: party.id,
      kind: which,
      name: party.name,
      color: snap.co.color,
      data: JSON.stringify({ ...snap, at: new Date().toISOString() }),
    },
  };
}
