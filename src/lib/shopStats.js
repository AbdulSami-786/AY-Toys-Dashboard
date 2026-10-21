// Figures for the start screen: each shop's sales, expenses, profit and cash, and reports across all shops.
// Everything comes from the ledger engine (lib/ledger.js), so the numbers match the shop's own reports.

import { balancesFor, displayBal, sysAccount } from './ledger';
import { rangeFor, today } from './dates';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
  { id: 'all', label: 'All Time' },
];

export function periodRange(id, fyMonth = 1) {
  const t = today();
  if (id === 'today') return { from: t, to: t };
  if (id === 'month') return rangeFor('This Month-to-date', fyMonth) || { from: t.slice(0, 8) + '01', to: t };
  if (id === 'year') return rangeFor('This Fiscal Year-to-date', fyMonth) || { from: t.slice(0, 5) + '01-01', to: t };
  return { from: '', to: t };
}

const PL_KEY = { Income: 'sales', 'Cost of Goods Sold': 'cogs', Expense: 'expenses', 'Other Income': 'otherIncome', 'Other Expense': 'otherExpense' };
const SALE_TYPES = new Set(['invoice', 'salesreceipt']);

/** One shop over a period: sales, expenses, profit, plus today's cash, bank, receivables, payables and stock. */
export function shopStats(books, range) {
  const { ledger, data } = books;
  const accounts = data.accounts || [];
  const accMap = new Map(accounts.map((a) => [a.id, a]));
  const s = { sales: 0, cogs: 0, expenses: 0, otherIncome: 0, otherExpense: 0 };
  for (const [id, raw] of balancesFor(ledger, range.from, range.to)) {
    const a = accMap.get(id);
    const k = a && PL_KEY[a.type];
    if (k) s[k] += displayBal(a, raw);
  }
  const now = balancesFor(ledger, '', today());
  const UF = sysAccount(accounts, 'undeposited'); // ids
  let cash = 0;
  let bank = 0;
  for (const [id, raw] of now) {
    const a = accMap.get(id);
    if (!a || a.type !== 'Bank') continue;
    if (a.sys === 'cash' || /cash/i.test(a.name)) cash += raw;
    else bank += raw;
  }
  const notDeposited = UF ? now.get(UF) || 0 : 0;
  const { AR, AP, INV } = ledger.sys || {};
  let count = 0;
  for (const t of data.txns || []) if (SALE_TYPES.has(t.type) && !t.voided && (!range.from || t.date >= range.from) && (!range.to || t.date <= range.to)) count++;
  const r = (n) => Math.round(n * 100) / 100;
  return {
    sales: r(s.sales),
    salesCount: count,
    cogs: r(s.cogs),
    grossProfit: r(s.sales - s.cogs),
    expenses: r(s.expenses + s.otherExpense),
    otherIncome: r(s.otherIncome),
    netProfit: r(s.sales + s.otherIncome - s.cogs - s.expenses - s.otherExpense),
    // cash in the shop: the cash account(s) plus payments received but not yet deposited
    cashInHand: r(cash + notDeposited),
    notDeposited: r(notDeposited),
    bank: r(bank),
    receivables: r(AR ? now.get(AR) || 0 : 0),
    payables: r(AP ? -(now.get(AP) || 0) : 0),
    stock: r(INV ? now.get(INV) || 0 : 0),
  };
}

/** The figures of every period, sent to the Google Sheet so other computers can show them without the books. */
export function shopSummary(books, fyMonth) {
  const out = { at: new Date().toISOString(), day: today() };
  for (const p of PERIODS) out[p.id] = shopStats(books, periodRange(p.id, fyMonth));
  return out;
}

export const SUMMARY_FIELDS = [
  { key: 'sales', label: 'Sales' },
  { key: 'cogs', label: 'Cost of goods sold' },
  { key: 'grossProfit', label: 'Gross profit' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'netProfit', label: 'Net profit', strong: true },
  { key: 'cashInHand', label: 'Cash in hand', strong: true },
  { key: 'bank', label: 'Bank' },
  { key: 'receivables', label: 'Receivables (customers owe)' },
  { key: 'payables', label: 'Payables (you owe vendors)' },
  { key: 'stock', label: 'Stock value' },
];

// ---------------- reports across shops: one column per shop + Total ----------------
// Accounts are matched by name, so "Rent Expense" in every shop lands on one line.

const sumRow = (values) => Math.round(values.reduce((a, b) => a + (b || 0), 0) * 100) / 100;
const row = (kind, label, values) => ({ kind, label, values, total: sumRow(values) });

function byAccount(shops, types, pick) {
  const lines = new Map(); // name → { number, values[] }
  shops.forEach((shop, i) => {
    const accMap = new Map((shop.books.data.accounts || []).map((a) => [a.id, a]));
    for (const [id, raw] of pick(shop)) {
      const a = accMap.get(id);
      if (!a || !types.includes(a.type) || !raw) continue;
      const k = a.name;
      if (!lines.has(k)) lines.set(k, { number: a.number || '', type: types.indexOf(a.type), values: shops.map(() => 0) });
      lines.get(k).values[i] += displayBal(a, raw);
    }
  });
  return [...lines.entries()]
    .sort((x, y) => x[1].type - y[1].type || String(x[1].number).localeCompare(String(y[1].number)) || x[0].localeCompare(y[0]))
    .map(([name, l]) => row('row', name, l.values.map((v) => Math.round(v * 100) / 100)))
    .filter((r) => r.values.some((v) => Math.abs(v) >= 0.005));
}

function section(rows, title, lines, totalLabel, n) {
  rows.push({ kind: 'section', label: title });
  rows.push(...lines);
  const t = row('subtotal', totalLabel, Array.from({ length: n }, (_, i) => sumRow(lines.map((l) => l.values[i]))));
  rows.push(t);
  return t.values;
}

export function profitAndLoss(shops, rangeOf) {
  const n = shops.length;
  const pick = (shop) => balancesFor(shop.books.ledger, rangeOf(shop).from, rangeOf(shop).to);
  const rows = [];
  const inc = section(rows, 'Income', byAccount(shops, ['Income'], pick), 'Total Income', n);
  const cogs = section(rows, 'Cost of Goods Sold', byAccount(shops, ['Cost of Goods Sold'], pick), 'Total Cost of Goods Sold', n);
  const gp = inc.map((v, i) => v - cogs[i]);
  rows.push(row('total', 'Gross Profit', gp));
  const exp = section(rows, 'Expenses', byAccount(shops, ['Expense'], pick), 'Total Expenses', n);
  const otherInc = byAccount(shops, ['Other Income'], pick);
  const otherExp = byAccount(shops, ['Other Expense'], pick);
  let oi = Array(n).fill(0);
  let oe = Array(n).fill(0);
  if (otherInc.length) oi = section(rows, 'Other Income', otherInc, 'Total Other Income', n);
  if (otherExp.length) oe = section(rows, 'Other Expenses', otherExp, 'Total Other Expenses', n);
  rows.push(row('grand', 'Net Profit', gp.map((v, i) => Math.round((v - exp[i] + oi[i] - oe[i]) * 100) / 100)));
  return rows;
}

const ASSETS = ['Bank', 'Accounts Receivable', 'Other Current Asset', 'Fixed Asset', 'Other Asset'];
const LIABILITIES = ['Accounts Payable', 'Credit Card', 'Other Current Liability', 'Long Term Liability'];
const PL_TYPES = Object.keys(PL_KEY);

export function balanceSheet(shops, asOf) {
  const n = shops.length;
  const pick = (shop) => balancesFor(shop.books.ledger, '', asOf);
  const rows = [];
  const assets = section(rows, 'Assets', byAccount(shops, ASSETS, pick), 'Total Assets', n);
  const liab = section(rows, 'Liabilities', byAccount(shops, LIABILITIES, pick), 'Total Liabilities', n);
  const eqLines = byAccount(shops, ['Equity'], pick);
  // profit not yet closed into Retained Earnings
  const earnings = shops.map((shop) => {
    const accMap = new Map((shop.books.data.accounts || []).map((a) => [a.id, a]));
    let s = 0;
    for (const [id, raw] of pick(shop)) if (PL_TYPES.includes(accMap.get(id)?.type)) s -= raw;
    return Math.round(s * 100) / 100;
  });
  if (earnings.some((v) => Math.abs(v) >= 0.005)) eqLines.push(row('row', 'Net Income (to date)', earnings));
  const eq = section(rows, 'Equity', eqLines, 'Total Equity', n);
  rows.push(row('grand', 'Total Liabilities & Equity', liab.map((v, i) => Math.round((v + eq[i]) * 100) / 100)));
  rows.check = assets.map((v, i) => Math.abs(v - liab[i] - eq[i]) < 0.05);
  return rows;
}

export function salesByMonth(shops, range) {
  const months = [];
  const start = range.from || today().slice(0, 4) + '-01-01';
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const end = (range.to || today()).slice(0, 7);
  for (let k = 0; k < 24; k++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > end) break;
    months.push(key);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  const values = months.map(() => shops.map(() => 0));
  shops.forEach((shop, i) => {
    const accMap = new Map((shop.books.data.accounts || []).map((a) => [a.id, a]));
    for (const l of shop.books.ledger.lines) {
      if (l.date < start || (range.to && l.date > range.to)) continue;
      const a = accMap.get(l.accountId);
      if (a?.type !== 'Income') continue;
      const mi = months.indexOf(l.date.slice(0, 7));
      if (mi >= 0) values[mi][i] -= l.amount;
    }
  });
  const rows = months.map((key, mi) => row('row', MONTHS[Number(key.slice(5)) - 1] + ' ' + key.slice(0, 4), values[mi].map((v) => Math.round(v * 100) / 100)));
  rows.push(row('grand', 'Total', shops.map((_, i) => sumRow(values.map((v) => v[i])))));
  return rows;
}
