// Report builders. Each returns { columns, rows, notes? }.
// Row: { kind: 'section'|'row'|'subtotal'|'total'|'grand'|'spacer'|'note', level, cells: {colKey: value}, drill?, txnId? }

import { buildLedger, inRange, txnTotal, salesTotals } from './ledger';
import { DEBIT_NORMAL, ACCOUNT_TYPES, TXN_TYPES, isPL } from '../store/defaults';
import { round2, num } from './format';
import { addDays, addMonths, daysBetween, fiscalYearStart, parseISO, toISO, today, monthLabel, fmtDate } from './dates';
import { REPORT_NAMES } from './commands';

export const REPORT_META = {
  pl: { date: 'range', range: 'This Fiscal Year-to-date' },
  pldetail: { date: 'range', range: 'This Fiscal Year-to-date' },
  plmonth: { date: 'range', range: 'This Fiscal Year-to-date' },
  plprev: { date: 'range', range: 'This Fiscal Year-to-date' },
  incsum: { date: 'range', range: 'This Fiscal Year-to-date' },
  incdetail: { date: 'range', range: 'This Fiscal Year-to-date' },
  bs: { date: 'asof', range: 'Today' },
  bsdetail: { date: 'range', range: 'This Fiscal Year-to-date' },
  bsprev: { date: 'asof', range: 'Today' },
  arsum: { date: 'asof', range: 'Today' },
  ardetail: { date: 'asof', range: 'Today' },
  cbs: { date: 'asof', range: 'All' },
  cbd: { date: 'range', range: 'All' },
  openinv: { date: 'asof', range: 'Today' },
  collections: { date: 'asof', range: 'Today' },
  salescust: { date: 'range', range: 'This Fiscal Year-to-date' },
  salescustdetail: { date: 'range', range: 'This Month-to-date' },
  salesitem: { date: 'range', range: 'This Fiscal Year-to-date' },
  salesrep: { date: 'range', range: 'This Fiscal Year-to-date' },
  openso: { date: 'none' },
  estimates: { date: 'range', range: 'All' },
  apsum: { date: 'asof', range: 'Today' },
  apdetail: { date: 'asof', range: 'Today' },
  vbs: { date: 'asof', range: 'All' },
  vbd: { date: 'range', range: 'All' },
  unpaidbills: { date: 'asof', range: 'Today' },
  purchvend: { date: 'range', range: 'This Fiscal Year-to-date' },
  purchitem: { date: 'range', range: 'This Fiscal Year-to-date' },
  openpo: { date: 'none' },
  invval: { date: 'asof', range: 'Today' },
  invvaldetail: { date: 'range', range: 'This Fiscal Year-to-date' },
  stock: { date: 'none' },
  physinv: { date: 'none' },
  lowstock: { date: 'none' },
  deposits: { date: 'range', range: 'This Month-to-date' },
  checks: { date: 'range', range: 'This Month-to-date' },
  missingchecks: { date: 'none' },
  tb: { date: 'asof', range: 'Today' },
  gl: { date: 'range', range: 'This Month-to-date' },
  journal: { date: 'range', range: 'This Month-to-date' },
  txnlist: { date: 'range', range: 'This Month-to-date' },
  salestax: { date: 'range', range: 'This Month' },
  audit: { date: 'range', range: 'Today' },
  acctlist: { date: 'none' },
  custlist: { date: 'none' },
  custphone: { date: 'none' },
  vendlist: { date: 'none' },
  pricelist: { date: 'none' },
  itemlisting: { date: 'none' },
  quickreport: { date: 'range', range: 'All' },
  txndetail: { date: 'range', range: 'This Fiscal Year-to-date' },
  history: { date: 'none' },
};

const sign = (type) => (DEBIT_NORMAL.has(type) ? 1 : -1);
const M = (key, label, extra = {}) => ({ key, label, align: 'right', type: 'money', ...extra });
const T = (key, label, extra = {}) => ({ key, label, align: 'left', type: 'text', ...extra });
const D = (key, label = 'Date') => ({ key, label, align: 'left', type: 'date' });
const Q = (key, label, extra = {}) => ({ key, label, align: 'right', type: 'qty', ...extra });
const P = (key, label) => ({ key, label, align: 'right', type: 'pct' });

function sumCols(rows, cols) {
  const out = {};
  cols.forEach((c) => (out[c] = round2(rows.reduce((s, r) => s + (num(r[c]) || 0), 0))));
  return out;
}

function balances(lines, from, to) {
  const m = new Map();
  for (const l of lines) {
    if (!inRange(l.date, from, to)) continue;
    m.set(l.accountId, (m.get(l.accountId) || 0) + l.amount);
  }
  return m;
}

// Hierarchical account rows (parents, sub-accounts, "Total X")
function accountTree(ctx, accounts, cols, valueOf, level, opts = {}) {
  const ids = new Set(accounts.map((a) => a.id));
  const children = new Map();
  accounts.forEach((a) => {
    const p = a.parentId && ids.has(a.parentId) ? a.parentId : '';
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(a);
  });
  const sorter = (a, b) =>
    ACCOUNT_TYPES.indexOf(a.type) - ACCOUNT_TYPES.indexOf(b.type) ||
    String(a.number || '').localeCompare(String(b.number || '')) ||
    a.name.localeCompare(b.name);
  const label = (a) => (ctx.company?.accountNumbers !== false && a.number ? `${a.number} · ${a.name}` : a.name);
  const rows = [];
  const walk = (acc, lvl) => {
    const kids = (children.get(acc.id) || []).sort(sorter);
    const own = {};
    cols.forEach((c) => (own[c] = round2(valueOf(acc, c))));
    if (!kids.length) {
      const zero = cols.every((c) => Math.abs(own[c]) < 0.005);
      if (zero && !opts.showZero) return null;
      rows.push({ kind: 'row', level: lvl, cells: { label: label(acc), ...own }, drill: { accountId: acc.id } });
      return own;
    }
    const start = rows.length;
    rows.push({ kind: 'section', level: lvl, cells: { label: label(acc) }, drill: { accountId: acc.id } });
    const tots = { ...own };
    let any = cols.some((c) => Math.abs(own[c]) >= 0.005);
    if (any) rows.push({ kind: 'row', level: lvl + 1, cells: { label: label(acc) + ' - Other', ...own }, drill: { accountId: acc.id, own: true } });
    for (const k of kids) {
      const r = walk(k, lvl + 1);
      if (r) {
        any = true;
        cols.forEach((c) => (tots[c] = round2(tots[c] + r[c])));
      }
    }
    if (!any && !opts.showZero) {
      rows.splice(start);
      return null;
    }
    rows.push({ kind: 'subtotal', level: lvl, cells: { label: 'Total ' + label(acc), ...tots }, drill: { accountId: acc.id } });
    return tots;
  };
  const totals = {};
  cols.forEach((c) => (totals[c] = 0));
  for (const a of (children.get('') || []).sort(sorter)) {
    const r = walk(a, level);
    if (r) cols.forEach((c) => (totals[c] = round2(totals[c] + r[c])));
  }
  return { rows, totals };
}

// ---------------- Profit & Loss ----------------
function plBody(ctx, cols, balFor) {
  const accts = ctx.data.accounts;
  const val = (a, c) => sign(a.type) * (balFor[c].get(a.id) || 0);
  const group = (types) => accts.filter((a) => types.includes(a.type));
  const rows = [];
  const zero = Object.fromEntries(cols.map((c) => [c, 0]));
  const block = (title, types, level) => {
    const t = accountTree(ctx, group(types), cols, val, level + 1);
    if (!t.rows.length) return zero;
    rows.push({ kind: 'section', level, cells: { label: title } });
    rows.push(...t.rows);
    rows.push({ kind: 'subtotal', level, cells: { label: 'Total ' + title, ...t.totals } });
    return t.totals;
  };
  const diff = (a, b) => Object.fromEntries(cols.map((c) => [c, round2(a[c] - b[c])]));

  rows.push({ kind: 'section', level: 0, cells: { label: 'Ordinary Income/Expense' } });
  const inc = block('Income', ['Income'], 1);
  const cogs = block('Cost of Goods Sold', ['Cost of Goods Sold'], 1);
  const gp = diff(inc, cogs);
  rows.push({ kind: 'total', level: 1, cells: { label: 'Gross Profit', ...gp } });
  const exp = block('Expense', ['Expense'], 1);
  const noi = diff(gp, exp);
  rows.push({ kind: 'total', level: 0, cells: { label: 'Net Ordinary Income', ...noi } });
  const hasOther = accts.some((a) => ['Other Income', 'Other Expense'].includes(a.type) && cols.some((c) => balFor[c].get(a.id)));
  let net = noi;
  if (hasOther) {
    rows.push({ kind: 'section', level: 0, cells: { label: 'Other Income/Expense' } });
    const oi = block('Other Income', ['Other Income'], 1);
    const oe = block('Other Expense', ['Other Expense'], 1);
    const non = diff(oi, oe);
    rows.push({ kind: 'total', level: 0, cells: { label: 'Net Other Income', ...non } });
    net = Object.fromEntries(cols.map((c) => [c, round2(noi[c] + non[c])]));
  }
  rows.push({ kind: 'grand', level: 0, cells: { label: 'Net Income', ...net } });
  return { rows, net, income: inc, cogs, expense: exp, gross: gp };
}

function changeCols(rows, a, b) {
  rows.forEach((r) => {
    if (r.cells[a] === undefined && r.cells[b] === undefined) return;
    const x = num(r.cells[a]);
    const y = num(r.cells[b]);
    r.cells.chg = round2(x - y);
    r.cells.pct = y ? round2(((x - y) / Math.abs(y)) * 100) : x ? 100 : 0;
  });
}

function profitLoss(ctx) {
  const { from, to } = ctx;
  const b = balances(ctx.ledger.lines, from, to);
  const body = plBody(ctx, ['amt'], { amt: b });
  return { columns: [T('label', ''), M('amt', rangeShort(from, to))], rows: body.rows, colRange: { amt: { from, to } } };
}

function rangeShort(from, to) {
  if (!from && !to) return 'TOTAL';
  if (!from) return fmtDate(to, 'LONG');
  return `${fmtDate(from, 'LONG').replace(/, \d{4}/, '')} - ${fmtDate(to, 'LONG')}`;
}

function plPrev(ctx) {
  const { from, to } = ctx;
  const pf = from ? addMonths(from, -12) : '';
  const pt = to ? addMonths(to, -12) : '';
  const body = plBody(ctx, ['cur', 'prev'], { cur: balances(ctx.ledger.lines, from, to), prev: balances(ctx.ledger.lines, pf, pt) });
  changeCols(body.rows, 'cur', 'prev');
  return {
    columns: [T('label', ''), M('cur', rangeShort(from, to)), M('prev', rangeShort(pf, pt)), M('chg', '$ Change'), P('pct', '% Change')],
    rows: body.rows,
    colRange: { cur: { from, to }, prev: { from: pf, to: pt } },
  };
}

function plMonth(ctx) {
  let { from, to } = ctx;
  if (!to) to = today();
  if (!from) {
    const first = ctx.ledger.lines.reduce((m, l) => (l.date < m ? l.date : m), to);
    from = first;
  }
  const cols = [];
  const balFor = {};
  const colRange = {};
  let cur = toISO(new Date(parseISO(from).getFullYear(), parseISO(from).getMonth(), 1));
  let guard = 0;
  while (cur <= to && guard++ < 36) {
    const end = toISO(new Date(parseISO(cur).getFullYear(), parseISO(cur).getMonth() + 1, 0));
    const f = cur < from ? from : cur;
    const t = end > to ? to : end;
    const key = 'm' + cols.length;
    cols.push({ key, label: monthLabel(cur) });
    balFor[key] = balances(ctx.ledger.lines, f, t);
    colRange[key] = { from: f, to: t };
    cur = addMonths(cur, 1);
  }
  balFor.tot = balances(ctx.ledger.lines, from, to);
  colRange.tot = { from, to };
  const keys = [...cols.map((c) => c.key), 'tot'];
  const body = plBody(ctx, keys, balFor);
  return { columns: [T('label', ''), ...cols.map((c) => M(c.key, c.label)), M('tot', 'TOTAL')], rows: body.rows, colRange };
}

// ---------------- Balance Sheet ----------------
function bsBody(ctx, cols, asOfs) {
  const accts = ctx.data.accounts;
  const fy = ctx.company?.fyMonth || 1;
  const balFor = {};
  const prior = {};
  const cur = {};
  cols.forEach((c) => {
    const asOf = asOfs[c];
    balFor[c] = balances(ctx.ledger.lines, '', asOf);
    const fyStart = fiscalYearStart(asOf || today(), fy);
    let p = 0;
    let n = 0;
    for (const l of ctx.ledger.lines) {
      const a = ctx.ledger.accMap.get(l.accountId);
      if (!a || !isPL(a.type)) continue;
      if (asOf && l.date > asOf) continue;
      if (l.date < fyStart) p += l.amount;
      else n += l.amount;
    }
    prior[c] = -round2(p);
    cur[c] = -round2(n);
  });
  const RE = accts.find((a) => a.sys === 'retained');
  const val = (a, c) => {
    let v = sign(a.type) * (balFor[c].get(a.id) || 0);
    if (RE && a.id === RE.id) v += prior[c];
    return v;
  };
  const rows = [];
  const zero = Object.fromEntries(cols.map((c) => [c, 0]));
  const add = (x, y) => Object.fromEntries(cols.map((c) => [c, round2(x[c] + y[c])]));
  const block = (title, types, level, opts = {}) => {
    const t = accountTree(
      ctx,
      accts.filter((a) => types.includes(a.type)),
      cols,
      val,
      level + 1,
    );
    if (!t.rows.length && !opts.force) return zero;
    rows.push({ kind: 'section', level, cells: { label: title } });
    rows.push(...t.rows);
    if (opts.extra) opts.extra(t.totals);
    rows.push({ kind: 'subtotal', level, cells: { label: 'Total ' + title, ...t.totals } });
    return t.totals;
  };

  rows.push({ kind: 'section', level: 0, cells: { label: 'ASSETS' } });
  rows.push({ kind: 'section', level: 1, cells: { label: 'Current Assets' } });
  const startCA = rows.length;
  let ca = zero;
  ca = add(ca, block('Checking/Savings', ['Bank'], 2));
  ca = add(ca, block('Accounts Receivable', ['Accounts Receivable'], 2));
  ca = add(ca, block('Other Current Assets', ['Other Current Asset'], 2));
  if (rows.length === startCA) rows.pop();
  else rows.push({ kind: 'subtotal', level: 1, cells: { label: 'Total Current Assets', ...ca } });
  const fa = block('Fixed Assets', ['Fixed Asset'], 1);
  const oa = block('Other Assets', ['Other Asset'], 1);
  const totalAssets = add(add(ca, fa), oa);
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL ASSETS', ...totalAssets } });
  rows.push({ kind: 'spacer', level: 0, cells: {} });

  rows.push({ kind: 'section', level: 0, cells: { label: 'LIABILITIES & EQUITY' } });
  rows.push({ kind: 'section', level: 1, cells: { label: 'Liabilities' } });
  rows.push({ kind: 'section', level: 2, cells: { label: 'Current Liabilities' } });
  let cl = zero;
  cl = add(cl, block('Accounts Payable', ['Accounts Payable'], 3));
  cl = add(cl, block('Credit Cards', ['Credit Card'], 3));
  cl = add(cl, block('Other Current Liabilities', ['Other Current Liability'], 3));
  rows.push({ kind: 'subtotal', level: 2, cells: { label: 'Total Current Liabilities', ...cl } });
  const ltl = block('Long Term Liabilities', ['Long Term Liability'], 2);
  const liab = add(cl, ltl);
  rows.push({ kind: 'subtotal', level: 1, cells: { label: 'Total Liabilities', ...liab } });

  // Equity with Net Income line
  const eqT = accountTree(
    ctx,
    accts.filter((a) => a.type === 'Equity'),
    cols,
    val,
    2,
  );
  rows.push({ kind: 'section', level: 1, cells: { label: 'Equity' } });
  rows.push(...eqT.rows);
  rows.push({ kind: 'row', level: 2, cells: { label: 'Net Income', ...cur }, drill: { netIncome: true } });
  const eq = add(eqT.totals, cur);
  rows.push({ kind: 'subtotal', level: 1, cells: { label: 'Total Equity', ...eq } });
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL LIABILITIES & EQUITY', ...add(liab, eq) } });
  return { rows, totalAssets, liab, eq };
}

function balanceSheet(ctx) {
  const to = ctx.to || today();
  const body = bsBody(ctx, ['amt'], { amt: to });
  return { columns: [T('label', ''), M('amt', fmtDate(to, 'LONG'))], rows: body.rows, colRange: { amt: { from: '', to } } };
}

function bsPrev(ctx) {
  const to = ctx.to || today();
  const prev = addMonths(to, -12);
  const body = bsBody(ctx, ['cur', 'prev'], { cur: to, prev });
  changeCols(body.rows, 'cur', 'prev');
  return {
    columns: [T('label', ''), M('cur', fmtDate(to, 'LONG')), M('prev', fmtDate(prev, 'LONG')), M('chg', '$ Change'), P('pct', '% Change')],
    rows: body.rows,
    colRange: { cur: { from: '', to }, prev: { from: '', to: prev } },
  };
}

// ---------------- detail helpers ----------------
function linesByTxn(ledger) {
  if (ledger._byTxn) return ledger._byTxn;
  const m = new Map();
  for (const l of ledger.lines) {
    if (!m.has(l.txnId)) m.set(l.txnId, []);
    m.get(l.txnId).push(l);
  }
  ledger._byTxn = m;
  return m;
}

function splitOf(ctx, l) {
  const all = linesByTxn(ctx.ledger).get(l.txnId) || [];
  const others = [...new Set(all.filter((x) => x.accountId !== l.accountId && Math.sign(x.amount) !== Math.sign(l.amount)).map((x) => x.accountId))];
  if (others.length === 1) return ctx.L.accountLabel(others[0]);
  if (others.length > 1) return '-SPLIT-';
  return '';
}

const typeLabel = (t) => TXN_TYPES[t]?.label || t;

function detailLine(ctx, l, signed) {
  return {
    kind: 'row',
    level: 2,
    txnId: l.txnId,
    cells: {
      type: typeLabel(l.type),
      date: l.date,
      num: l.num,
      name: ctx.L.nameOf(l.nameId),
      memo: l.memo,
      account: ctx.L.accountLabel(l.accountId),
      split: splitOf(ctx, l),
      debit: l.amount > 0 ? l.amount : '',
      credit: l.amount < 0 ? -l.amount : '',
      amount: signed,
    },
  };
}

const DETAIL_COLS = [T('type', 'Type'), D('date'), T('num', 'Num'), T('name', 'Name'), T('memo', 'Memo'), T('split', 'Split'), M('amount', 'Amount'), M('balance', 'Balance')];

function accountDetail(ctx, accounts, from, to, { beginning = false, cols = DETAIL_COLS } = {}) {
  const rows = [];
  const sorted = [...accounts].sort(
    (a, b) => ACCOUNT_TYPES.indexOf(a.type) - ACCOUNT_TYPES.indexOf(b.type) || String(a.number || '').localeCompare(String(b.number || '')),
  );
  let grand = 0;
  for (const a of sorted) {
    const s = sign(a.type);
    const lines = ctx.ledger.lines.filter((l) => l.accountId === a.id && inRange(l.date, from, to));
    let bal = 0;
    if (beginning && from) {
      bal = s * ctx.ledger.lines.filter((l) => l.accountId === a.id && l.date < from).reduce((x, l) => x + l.amount, 0);
    }
    if (!lines.length && Math.abs(bal) < 0.005) continue;
    rows.push({ kind: 'section', level: 1, cells: { label: ctx.L.accountLabel(a.id), balance: beginning ? round2(bal) : '' }, drill: { accountId: a.id } });
    let tot = 0;
    for (const l of lines) {
      const v = s * l.amount;
      tot += v;
      bal = round2(bal + v);
      const r = detailLine(ctx, l, round2(v));
      r.cells.balance = bal;
      rows.push(r);
    }
    rows.push({
      kind: 'subtotal',
      level: 1,
      cells: {
        label: 'Total ' + ctx.L.accountLabel(a.id),
        amount: round2(tot),
        balance: bal,
        debit: round2(lines.filter((l) => l.amount > 0).reduce((x, l) => x + l.amount, 0)),
        credit: round2(-lines.filter((l) => l.amount < 0).reduce((x, l) => x + l.amount, 0)),
      },
    });
    grand += tot;
  }
  return { rows, grand: round2(grand) };
}

function plDetail(ctx) {
  const accts = ctx.data.accounts.filter((a) => isPL(a.type));
  const { rows } = accountDetail(ctx, accts, ctx.from, ctx.to);
  const b = balances(ctx.ledger.lines, ctx.from, ctx.to);
  const net = -round2(accts.reduce((s, a) => s + (b.get(a.id) || 0), 0));
  rows.push({ kind: 'grand', level: 0, cells: { label: 'Net Income', amount: net } });
  return { columns: [T('label', ''), ...DETAIL_COLS], rows };
}

function bsDetail(ctx) {
  const accts = ctx.data.accounts.filter((a) => !isPL(a.type));
  const { rows } = accountDetail(ctx, accts, ctx.from, ctx.to, { beginning: true });
  return { columns: [T('label', ''), ...DETAIL_COLS], rows };
}

function generalLedger(ctx) {
  const cols = [T('type', 'Type'), D('date'), T('num', 'Num'), T('name', 'Name'), T('memo', 'Memo'), T('split', 'Split'), M('debit', 'Debit'), M('credit', 'Credit'), M('balance', 'Balance')];
  const { rows } = accountDetail(ctx, ctx.data.accounts, ctx.from, ctx.to, { beginning: true, cols });
  const lines = ctx.ledger.lines.filter((l) => inRange(l.date, ctx.from, ctx.to));
  rows.push({
    kind: 'grand',
    level: 0,
    cells: {
      label: 'TOTAL',
      debit: round2(lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0)),
      credit: round2(-lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0)),
    },
  });
  return { columns: [T('label', ''), ...cols], rows };
}

function trialBalance(ctx) {
  const to = ctx.to || today();
  const fyStart = fiscalYearStart(to, ctx.company?.fyMonth || 1);
  const bal = new Map();
  let priorPL = 0;
  for (const l of ctx.ledger.lines) {
    if (l.date > to) continue;
    const a = ctx.ledger.accMap.get(l.accountId);
    if (!a) continue;
    if (isPL(a.type) && l.date < fyStart) {
      priorPL += l.amount;
      continue;
    }
    bal.set(a.id, (bal.get(a.id) || 0) + l.amount);
  }
  const RE = ctx.data.accounts.find((a) => a.sys === 'retained');
  if (RE && Math.abs(priorPL) > 0.004) bal.set(RE.id, (bal.get(RE.id) || 0) + priorPL);
  const rows = [];
  let dr = 0;
  let cr = 0;
  const accts = [...ctx.data.accounts].sort(
    (a, b) => ACCOUNT_TYPES.indexOf(a.type) - ACCOUNT_TYPES.indexOf(b.type) || String(a.number || '').localeCompare(String(b.number || '')),
  );
  for (const a of accts) {
    const v = round2(bal.get(a.id) || 0);
    if (Math.abs(v) < 0.005) continue;
    if (v > 0) dr += v;
    else cr -= v;
    rows.push({ kind: 'row', level: 1, cells: { label: ctx.L.accountLabel(a.id), debit: v > 0 ? v : '', credit: v < 0 ? -v : '' }, drill: { accountId: a.id } });
  }
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', debit: round2(dr), credit: round2(cr) } });
  return { columns: [T('label', ''), M('debit', 'Debit'), M('credit', 'Credit')], rows, colRange: { debit: { from: '', to }, credit: { from: '', to } } };
}

function journal(ctx) {
  const by = linesByTxn(ctx.ledger);
  const txns = ctx.data.txns.filter((t) => !t.voided && TXN_TYPES[t.type]?.posting && inRange(t.date, ctx.from, ctx.to));
  txns.sort((a, b) => (a.date === b.date ? String(a.createdAt).localeCompare(String(b.createdAt)) : a.date < b.date ? -1 : 1));
  const rows = [];
  let dr = 0;
  let cr = 0;
  let n = 0;
  for (const t of txns) {
    const ls = by.get(t.id) || [];
    if (!ls.length) continue;
    n++;
    ls.forEach((l, i) => {
      if (l.amount > 0) dr += l.amount;
      else cr -= l.amount;
      rows.push({
        kind: 'row',
        level: 1,
        txnId: t.id,
        cells: {
          trans: i === 0 ? n : '',
          type: i === 0 ? typeLabel(t.type) : '',
          date: i === 0 ? t.date : '',
          num: i === 0 ? t.num : '',
          name: ctx.L.nameOf(l.nameId),
          memo: l.memo,
          account: ctx.L.accountLabel(l.accountId),
          debit: l.amount > 0 ? l.amount : '',
          credit: l.amount < 0 ? -l.amount : '',
        },
      });
    });
    const tdr = round2(ls.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0));
    rows.push({ kind: 'subtotal', level: 1, cells: { debit: tdr, credit: tdr } });
  }
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', debit: round2(dr), credit: round2(cr) } });
  return {
    columns: [
      T('label', ''),
      T('trans', 'Trans #'),
      T('type', 'Type'),
      D('date'),
      T('num', 'Num'),
      T('name', 'Name'),
      T('memo', 'Memo'),
      T('account', 'Account'),
      M('debit', 'Debit'),
      M('credit', 'Credit'),
    ],
    rows,
  };
}

function txnDetail(ctx) {
  const f = ctx.filter || {};
  let accounts = ctx.data.accounts;
  if (f.accountId) {
    const ids = new Set([f.accountId]);
    if (!f.own) {
      let grew = true;
      while (grew) {
        grew = false;
        ctx.data.accounts.forEach((a) => {
          if (a.parentId && ids.has(a.parentId) && !ids.has(a.id)) {
            ids.add(a.id);
            grew = true;
          }
        });
      }
    }
    accounts = accounts.filter((a) => ids.has(a.id));
  }
  if (f.netIncome) accounts = accounts.filter((a) => isPL(a.type));
  const cols = [T('type', 'Type'), D('date'), T('num', 'Num'), T('name', 'Name'), T('memo', 'Memo'), T('account', 'Account'), T('split', 'Split'), M('amount', 'Amount'), M('balance', 'Balance')];
  const { rows, grand } = accountDetail(ctx, accounts, ctx.from, ctx.to, { cols });
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', amount: grand } });
  return { columns: [T('label', ''), ...cols], rows };
}

// ---------------- Customers / Vendors ----------------
function partyBalances(ctx, which, to) {
  const acct = which === 'customer' ? ctx.ledger.sys.AR : ctx.ledger.sys.AP;
  const s = which === 'customer' ? 1 : -1;
  const m = new Map();
  for (const l of ctx.ledger.lines) {
    if (l.accountId !== acct || (to && l.date > to)) continue;
    m.set(l.nameId, round2((m.get(l.nameId) || 0) + s * l.amount));
  }
  return m;
}

function balanceSummary(ctx, which) {
  const m = partyBalances(ctx, which, ctx.to);
  const list = which === 'customer' ? ctx.data.customers : ctx.data.vendors;
  const rows = [];
  let tot = 0;
  [...list]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((p) => {
      const v = m.get(p.id) || 0;
      if (Math.abs(v) < 0.005) return;
      tot += v;
      rows.push({ kind: 'row', level: 1, cells: { label: p.name, amt: v }, drill: { nameId: p.id } });
    });
  const nn = m.get('') || 0;
  if (Math.abs(nn) >= 0.005) {
    tot += nn;
    rows.push({ kind: 'row', level: 1, cells: { label: 'No name', amt: nn } });
  }
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', amt: round2(tot) } });
  return { columns: [T('label', ''), M('amt', fmtDate(ctx.to || today(), 'LONG'))], rows, quick: true };
}

function balanceDetail(ctx, which) {
  const acct = which === 'customer' ? ctx.ledger.sys.AR : ctx.ledger.sys.AP;
  const s = which === 'customer' ? 1 : -1;
  const list = which === 'customer' ? ctx.data.customers : ctx.data.vendors;
  const rows = [];
  let grand = 0;
  for (const p of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
    if (ctx.filter?.nameId && ctx.filter.nameId !== p.id) continue;
    const all = ctx.ledger.lines.filter((l) => l.accountId === acct && l.nameId === p.id && (!ctx.to || l.date <= ctx.to));
    const lines = all.filter((l) => !ctx.from || l.date >= ctx.from);
    let bal = round2(s * all.filter((l) => ctx.from && l.date < ctx.from).reduce((x, l) => x + l.amount, 0));
    if (!lines.length && !bal) continue;
    rows.push({ kind: 'section', level: 1, cells: { label: p.name, balance: ctx.from ? bal : '' }, drill: { nameId: p.id } });
    for (const l of lines) {
      const v = round2(s * l.amount);
      bal = round2(bal + v);
      const t = ctx.ledger.txnById.get(l.txnId);
      rows.push({
        kind: 'row',
        level: 2,
        txnId: l.txnId,
        cells: { type: typeLabel(l.type), date: l.date, num: l.num, memo: t?.memo || '', account: ctx.L.accountLabel(l.accountId), amount: v, balance: bal },
      });
    }
    rows.push({ kind: 'subtotal', level: 1, cells: { label: 'Total ' + p.name, amount: round2(lines.reduce((x, l) => x + s * l.amount, 0)), balance: bal } });
    grand += bal;
  }
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', balance: round2(grand) } });
  return {
    columns: [T('label', ''), T('type', 'Type'), D('date'), T('num', 'Num'), T('memo', 'Memo'), T('account', 'Account'), M('amount', 'Amount'), M('balance', 'Balance')],
    rows,
  };
}

// Everything still open on A/R (customers) or A/P (vendors): invoices / bills, credits, unapplied payments,
// and journal entries / deposits posted to A/R or A/P — so the totals always equal the A/R and A/P balances.
function openDocs(ctx, which, asOf) {
  const out = [];
  const types = which === 'customer' ? ['invoice', 'creditmemo', 'payment'] : ['bill', 'vendorcredit', 'billpayment'];
  const ctrl = which === 'customer' ? ctx.ledger.sys.AR : ctx.ledger.sys.AP;
  const at = asOf || today();
  const push = (t, open, partyId) => {
    const due = t.dueDate || t.date;
    out.push({ t, open, due, aging: Math.max(0, daysBetween(due, at)), partyId });
  };
  const withCtrl = new Set(ctx.ledger.lines.filter((l) => l.accountId === ctrl).map((l) => l.txnId));
  for (const t of ctx.data.txns) {
    if (t.voided || (asOf && t.date > asOf)) continue;
    const named = (t.type === 'journal' || t.type === 'deposit') && ctx.ledger.openName.has(t.id) && withCtrl.has(t.id);
    if (!types.includes(t.type) && !named) continue;
    const open = ctx.ledger.open.get(t.id);
    if (open === undefined || Math.abs(open) < 0.005) continue;
    push(t, open, named ? ctx.ledger.openName.get(t.id) : which === 'customer' ? t.customerId : t.vendorId);
  }
  // journal entries naming several customers / vendors: each name's part stays open
  const s = which === 'customer' ? 1 : -1;
  const parts = new Map();
  for (const l of ctx.ledger.lines) {
    if (l.accountId !== ctrl || types.includes(l.type) || ctx.ledger.openName.has(l.txnId) || (asOf && l.date > asOf)) continue;
    const k = l.txnId + '|' + l.nameId;
    parts.set(k, round2((parts.get(k) || 0) + s * l.amount));
  }
  for (const [k, amt] of parts) {
    if (Math.abs(amt) < 0.005) continue;
    const [txnId, nameId] = k.split('|');
    const t = ctx.ledger.txnById.get(txnId);
    if (t) push(t, amt, nameId);
  }
  return out.sort((a, b) => (a.t.date < b.t.date ? -1 : 1));
}

const BUCKETS = [
  ['cur', 'Current', (d) => d <= 0],
  ['b30', '1 - 30', (d) => d >= 1 && d <= 30],
  ['b60', '31 - 60', (d) => d >= 31 && d <= 60],
  ['b90', '61 - 90', (d) => d >= 61 && d <= 90],
  ['b91', '> 90', (d) => d > 90],
];

function agingSummary(ctx, which) {
  const asOf = ctx.to || today();
  const docs = openDocs(ctx, which, asOf);
  const list = which === 'customer' ? ctx.data.customers : ctx.data.vendors;
  const rows = [];
  const keys = [...BUCKETS.map((b) => b[0]), 'tot'];
  const all = [];
  for (const p of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
    const mine = docs.filter((d) => d.partyId === p.id);
    if (!mine.length) continue;
    const cells = { label: p.name };
    keys.forEach((k) => (cells[k] = 0));
    for (const d of mine) {
      const b = d.open < 0 ? BUCKETS[0] : BUCKETS.find((x) => x[2](d.aging));
      cells[b[0]] = round2(cells[b[0]] + d.open);
      cells.tot = round2(cells.tot + d.open);
    }
    all.push(cells);
    rows.push({ kind: 'row', level: 1, cells, drill: { nameId: p.id } });
  }
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', ...sumCols(all, keys) } });
  return { columns: [T('label', ''), ...BUCKETS.map(([k, l]) => M(k, l)), M('tot', 'TOTAL')], rows, quick: true };
}

function agingDetail(ctx, which) {
  const asOf = ctx.to || today();
  const docs = openDocs(ctx, which, asOf);
  const rows = [];
  let grand = 0;
  for (const [k, label, test] of BUCKETS) {
    const mine = docs.filter((d) => (d.open < 0 ? k === 'cur' : test(d.aging)));
    if (!mine.length) continue;
    rows.push({ kind: 'section', level: 1, cells: { label } });
    let tot = 0;
    for (const d of mine) {
      tot += d.open;
      rows.push({
        kind: 'row',
        level: 2,
        txnId: d.t.id,
        cells: { type: typeLabel(d.t.type), date: d.t.date, num: d.t.num, name: ctx.L.nameOf(d.partyId), terms: d.t.terms || '', due: d.due, aging: d.aging || '', open: d.open },
      });
    }
    rows.push({ kind: 'subtotal', level: 1, cells: { label: 'Total ' + label, open: round2(tot) } });
    grand += tot;
  }
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', open: round2(grand) } });
  return {
    columns: [T('label', ''), T('type', 'Type'), D('date'), T('num', 'Num'), T('name', 'Name'), T('terms', 'Terms'), D('due', 'Due Date'), Q('aging', 'Aging'), M('open', 'Open Balance')],
    rows,
  };
}

function openByParty(ctx, which, { overdueOnly = false } = {}) {
  const asOf = ctx.to || today();
  const docs = openDocs(ctx, which, asOf).filter((d) => (overdueOnly ? d.aging > 0 && d.open > 0 : true));
  const list = which === 'customer' ? ctx.data.customers : ctx.data.vendors;
  const rows = [];
  let grand = 0;
  for (const p of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
    const mine = docs.filter((d) => d.partyId === p.id);
    if (!mine.length) continue;
    rows.push({ kind: 'section', level: 1, cells: { label: p.name + (overdueOnly && p.phone ? '   ' + p.phone : '') }, drill: { nameId: p.id } });
    let tot = 0;
    for (const d of mine) {
      tot += d.open;
      rows.push({
        kind: 'row',
        level: 2,
        txnId: d.t.id,
        cells: { type: typeLabel(d.t.type), date: d.t.date, num: d.t.num, ref: d.t.poNumber || d.t.ref || '', terms: d.t.terms || '', due: d.due, aging: d.aging || '', open: d.open },
      });
    }
    rows.push({ kind: 'subtotal', level: 1, cells: { label: 'Total ' + p.name, open: round2(tot) } });
    grand += tot;
  }
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', open: round2(grand) } });
  return {
    columns: [
      T('label', ''),
      T('type', 'Type'),
      D('date'),
      T('num', 'Num'),
      T('ref', which === 'customer' ? 'P. O. #' : 'Ref No.'),
      T('terms', 'Terms'),
      D('due', 'Due Date'),
      Q('aging', 'Aging'),
      M('open', 'Open Balance'),
    ],
    rows,
  };
}

// ---------------- Sales ----------------
function salesLines(ctx) {
  // income postings from sales forms, positive = sale
  const SALES_TYPES = new Set(['invoice', 'salesreceipt', 'creditmemo']);
  return ctx.ledger.lines.filter((l) => {
    if (!SALES_TYPES.has(l.type) || !inRange(l.date, ctx.from, ctx.to)) return false;
    const a = ctx.ledger.accMap.get(l.accountId);
    return a && (a.type === 'Income' || a.type === 'Other Income');
  });
}

function salesByCustomer(ctx) {
  const m = new Map();
  for (const l of salesLines(ctx)) m.set(l.nameId, round2((m.get(l.nameId) || 0) - l.amount));
  const rows = [];
  let tot = 0;
  [...m.entries()]
    .map(([id, v]) => ({ id, name: ctx.L.nameOf(id) || 'No name', v }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((r) => {
      tot += r.v;
      rows.push({ kind: 'row', level: 1, cells: { label: r.name, amt: r.v }, drill: { nameId: r.id, sales: true } });
    });
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', amt: round2(tot) } });
  return { columns: [T('label', ''), M('amt', rangeShort(ctx.from, ctx.to))], rows, quick: true };
}

function salesByCustomerDetail(ctx) {
  const lines = salesLines(ctx);
  const by = new Map();
  lines.forEach((l) => {
    if (!by.has(l.nameId)) by.set(l.nameId, []);
    by.get(l.nameId).push(l);
  });
  const rows = [];
  let grand = 0;
  [...by.entries()]
    .sort((a, b) => (ctx.L.nameOf(a[0]) || '').localeCompare(ctx.L.nameOf(b[0]) || ''))
    .forEach(([id, ls]) => {
      rows.push({ kind: 'section', level: 1, cells: { label: ctx.L.nameOf(id) || 'No name' } });
      let bal = 0;
      ls.forEach((l) => {
        const v = round2(-l.amount);
        bal = round2(bal + v);
        rows.push({
          kind: 'row',
          level: 2,
          txnId: l.txnId,
          cells: {
            type: typeLabel(l.type),
            date: l.date,
            num: l.num,
            memo: l.memo,
            item: ctx.L.itemMap.get(l.itemId)?.name || '',
            qty: l.qty ? (l.type === 'creditmemo' ? -l.qty : l.qty) : '',
            price: l.qty ? round2(Math.abs(v / l.qty)) : '',
            amount: v,
            balance: bal,
          },
        });
      });
      rows.push({ kind: 'subtotal', level: 1, cells: { label: 'Total ' + (ctx.L.nameOf(id) || 'No name'), amount: bal, balance: bal } });
      grand += bal;
    });
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', amount: round2(grand), balance: round2(grand) } });
  return {
    columns: [T('label', ''), T('type', 'Type'), D('date'), T('num', 'Num'), T('memo', 'Memo'), T('item', 'Item'), Q('qty', 'Qty'), M('price', 'Sales Price'), M('amount', 'Amount'), M('balance', 'Balance')],
    rows,
  };
}

// ---------------- Income by Customer (Company & Financial) ----------------
// Net income from a customer = income minus cost of goods sold posted with that customer's name,
// as on the Profit & Loss — so the TOTAL equals Gross Profit. Lines without a customer go under "No name".
const NO_NAME = '__none';
const custName = (ctx, id) => (id === NO_NAME ? 'No name' : ctx.L.nameOf(id) || 'No name');
const byCustName = (ctx) => (a, b) => (a === NO_NAME) - (b === NO_NAME) || custName(ctx, a).localeCompare(custName(ctx, b));

function incomeLines(ctx) {
  const customers = new Set(ctx.data.customers.map((c) => c.id));
  const out = [];
  for (const l of ctx.ledger.lines) {
    if (!inRange(l.date, ctx.from, ctx.to)) continue;
    const a = ctx.ledger.accMap.get(l.accountId);
    if (!a || (a.type !== 'Income' && a.type !== 'Cost of Goods Sold')) continue;
    // v: effect on net income (income credit → +, cost debit → −)
    out.push({ l, income: a.type === 'Income', cust: customers.has(l.nameId) ? l.nameId : NO_NAME, v: round2(-l.amount) });
  }
  return out;
}

function incomeByCustomer(ctx) {
  const m = new Map();
  for (const x of incomeLines(ctx)) {
    if (!m.has(x.cust)) m.set(x.cust, { inc: 0, cogs: 0 });
    if (x.income) m.get(x.cust).inc += x.v;
    else m.get(x.cust).cogs -= x.v;
  }
  const cells = (label, inc, cogs) => {
    const net = round2(inc - cogs);
    return { label, inc: round2(inc), cogs: round2(cogs), net, margin: Math.abs(inc) >= 0.005 ? round2((net / inc) * 100) : '' };
  };
  const rows = [];
  let inc = 0;
  let cogs = 0;
  [...m.keys()].sort(byCustName(ctx)).forEach((id) => {
    const r = m.get(id);
    if (Math.abs(r.inc) < 0.005 && Math.abs(r.cogs) < 0.005) return;
    inc += r.inc;
    cogs += r.cogs;
    rows.push({ kind: 'row', level: 1, cells: cells(custName(ctx, id), r.inc, r.cogs), drill: { nameId: id, incomeDetail: true } });
  });
  rows.push({ kind: 'grand', level: 0, cells: cells('TOTAL', inc, cogs) });
  return { columns: [T('label', ''), M('inc', 'Income'), M('cogs', 'Cost of Goods Sold'), M('net', 'Net Income'), P('margin', 'Margin')], rows, quick: true };
}

function incomeByCustomerDetail(ctx) {
  const by = new Map();
  for (const x of incomeLines(ctx)) {
    if (ctx.filter?.nameId && ctx.filter.nameId !== x.cust) continue;
    if (!by.has(x.cust)) by.set(x.cust, []);
    by.get(x.cust).push(x);
  }
  const rows = [];
  let grand = 0;
  for (const id of [...by.keys()].sort(byCustName(ctx))) {
    const name = custName(ctx, id);
    rows.push({ kind: 'section', level: 1, cells: { label: name } });
    let bal = 0;
    for (const [part, isIncome] of [
      ['Income', true],
      ['Cost of Goods Sold', false],
    ]) {
      const list = by.get(id).filter((x) => x.income === isIncome);
      if (!list.length) continue;
      rows.push({ kind: 'section', level: 2, cells: { label: part } });
      let sub = 0;
      for (const x of list) {
        sub += x.v;
        bal = round2(bal + x.v);
        rows.push({
          kind: 'row',
          level: 3,
          txnId: x.l.txnId,
          cells: {
            type: typeLabel(x.l.type),
            date: x.l.date,
            num: x.l.num,
            memo: x.l.memo || ctx.ledger.txnById.get(x.l.txnId)?.memo || '',
            account: ctx.L.accountLabel(x.l.accountId),
            amount: x.v,
            balance: bal,
          },
        });
      }
      rows.push({ kind: 'subtotal', level: 2, cells: { label: 'Total ' + part, amount: round2(sub) } });
    }
    rows.push({ kind: 'subtotal', level: 1, cells: { label: 'Net Income: ' + name, amount: bal, balance: bal } });
    grand += bal;
  }
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', amount: round2(grand), balance: round2(grand) } });
  return {
    columns: [
      T('label', ''),
      T('type', 'Type'),
      D('date'),
      T('num', 'Num'),
      T('memo', 'Memo', { wrap: true, width: 220 }),
      T('account', 'Account', { wrap: true, width: 150 }),
      M('amount', 'Amount'),
      M('balance', 'Balance'),
    ],
    rows,
  };
}

function salesByItem(ctx) {
  const lines = salesLines(ctx);
  const cogs = new Map();
  for (const l of ctx.ledger.lines) {
    if (!l.itemId || !inRange(l.date, ctx.from, ctx.to)) continue;
    if (!['invoice', 'salesreceipt', 'creditmemo'].includes(l.type)) continue;
    const a = ctx.ledger.accMap.get(l.accountId);
    if (a?.type === 'Cost of Goods Sold') cogs.set(l.itemId, (cogs.get(l.itemId) || 0) + l.amount);
  }
  const m = new Map();
  for (const l of lines) {
    const k = l.itemId || '';
    const r = m.get(k) || { qty: 0, amt: 0 };
    r.qty += l.type === 'creditmemo' ? -l.qty : l.qty;
    r.amt += -l.amount;
    m.set(k, r);
  }
  const total = [...m.values()].reduce((s, r) => s + r.amt, 0);
  const rows = [];
  const groups = ['Inventory Part', 'Non-inventory Part', 'Service', 'Other Charge', 'Discount', ''];
  const gName = { 'Inventory Part': 'Inventory', 'Non-inventory Part': 'Non-inventory Parts', Service: 'Service', 'Other Charge': 'Other Charges', Discount: 'Discounts', '': 'No item' };
  const all = [];
  for (const g of groups) {
    const entries = [...m.entries()].filter(([id]) => (ctx.L.itemMap.get(id)?.type || '') === g);
    if (!entries.length) continue;
    rows.push({ kind: 'section', level: 1, cells: { label: gName[g] } });
    const part = [];
    entries
      .sort((a, b) => (ctx.L.itemMap.get(a[0])?.name || '').localeCompare(ctx.L.itemMap.get(b[0])?.name || ''))
      .forEach(([id, r]) => {
        const c = round2(cogs.get(id) || 0);
        const cells = {
          label: ctx.L.itemMap.get(id)?.name || 'No item',
          qty: round2(r.qty),
          amt: round2(r.amt),
          pct: total ? round2((r.amt / total) * 100) : 0,
          avg: r.qty ? round2(r.amt / r.qty) : '',
          cogs: c,
          avgcogs: r.qty && c ? round2(c / r.qty) : '',
          gm: round2(r.amt - c),
          gmp: r.amt ? round2(((r.amt - c) / r.amt) * 100) : 0,
        };
        part.push(cells);
        all.push(cells);
        rows.push({ kind: 'row', level: 2, cells, drill: { itemId: id } });
      });
    const s = sumCols(part, ['qty', 'amt', 'pct', 'cogs', 'gm']);
    rows.push({ kind: 'subtotal', level: 1, cells: { label: 'Total ' + gName[g], ...s, gmp: s.amt ? round2((s.gm / s.amt) * 100) : 0 } });
  }
  const s = sumCols(all, ['qty', 'amt', 'pct', 'cogs', 'gm']);
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', ...s, gmp: s.amt ? round2((s.gm / s.amt) * 100) : 0 } });
  return {
    columns: [T('label', ''), Q('qty', 'Qty'), M('amt', 'Amount'), P('pct', '% of Sales'), M('avg', 'Avg Price'), M('cogs', 'COGS'), M('avgcogs', 'Avg COGS'), M('gm', 'Gross Margin'), P('gmp', 'Gross Margin %')],
    rows,
  };
}

function salesByRep(ctx) {
  const m = new Map();
  for (const l of salesLines(ctx)) {
    const rep = ctx.ledger.txnById.get(l.txnId)?.rep || 'No Rep';
    m.set(rep, round2((m.get(rep) || 0) - l.amount));
  }
  const rows = [...m.entries()].sort().map(([rep, v]) => ({ kind: 'row', level: 1, cells: { label: rep, amt: v } }));
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', amt: round2([...m.values()].reduce((s, v) => s + v, 0)) } });
  return { columns: [T('label', ''), M('amt', rangeShort(ctx.from, ctx.to))], rows };
}

function openDocsList(ctx, type, partyKey) {
  const docs = ctx.data.txns.filter((t) => t.type === type && !t.voided && !t.closed && (ctx.meta.date === 'none' || inRange(t.date, ctx.from, ctx.to)));
  const by = new Map();
  docs.forEach((t) => {
    const k = t[partyKey] || '';
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(t);
  });
  const rows = [];
  let grand = 0;
  [...by.entries()]
    .sort((a, b) => ctx.L.nameOf(a[0]).localeCompare(ctx.L.nameOf(b[0])))
    .forEach(([id, ts]) => {
      rows.push({ kind: 'section', level: 1, cells: { label: ctx.L.nameOf(id) || 'No name' } });
      let tot = 0;
      ts.sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((t) => {
        tot += num(t.total);
        rows.push({ kind: 'row', level: 2, txnId: t.id, cells: { type: typeLabel(t.type), date: t.date, num: t.num, memo: t.memo || '', due: t.dueDate || t.shipDate || '', amount: num(t.total) } });
      });
      rows.push({ kind: 'subtotal', level: 1, cells: { label: 'Total ' + (ctx.L.nameOf(id) || 'No name'), amount: round2(tot) } });
      grand += tot;
    });
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', amount: round2(grand) } });
  return { columns: [T('label', ''), T('type', 'Type'), D('date'), T('num', 'Num'), T('memo', 'Memo'), D('due', type === 'estimate' ? 'Expires' : 'Ship / Due'), M('amount', 'Amount')], rows };
}

// ---------------- Purchases ----------------
function purchaseLines(ctx) {
  const out = [];
  for (const t of ctx.data.txns) {
    if (t.voided || !['bill', 'check', 'vendorcredit'].includes(t.type) || !inRange(t.date, ctx.from, ctx.to)) continue;
    const s = t.type === 'vendorcredit' ? -1 : 1;
    for (const l of t.itemLines || []) out.push({ t, itemId: l.itemId, qty: s * num(l.qty), amount: s * num(l.amount) });
  }
  return out;
}

function purchasesByVendor(ctx) {
  const m = new Map();
  purchaseLines(ctx).forEach((p) => m.set(p.t.vendorId || '', round2((m.get(p.t.vendorId || '') || 0) + p.amount)));
  const rows = [...m.entries()]
    .map(([id, v]) => ({ id, name: ctx.L.nameOf(id) || 'No name', v }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => ({ kind: 'row', level: 1, cells: { label: r.name, amt: r.v }, drill: { nameId: r.id } }));
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', amt: round2([...m.values()].reduce((s, v) => s + v, 0)) } });
  return { columns: [T('label', ''), M('amt', rangeShort(ctx.from, ctx.to))], rows };
}

function purchasesByItem(ctx) {
  const m = new Map();
  purchaseLines(ctx).forEach((p) => {
    const r = m.get(p.itemId) || { qty: 0, amt: 0 };
    r.qty += p.qty;
    r.amt += p.amount;
    m.set(p.itemId, r);
  });
  const rows = [...m.entries()]
    .sort((a, b) => (ctx.L.itemMap.get(a[0])?.name || '').localeCompare(ctx.L.itemMap.get(b[0])?.name || ''))
    .map(([id, r]) => ({
      kind: 'row',
      level: 1,
      cells: { label: ctx.L.itemMap.get(id)?.name || 'No item', qty: round2(r.qty), amt: round2(r.amt), avg: r.qty ? round2(r.amt / r.qty) : '' },
      drill: { itemId: id },
    }));
  const tot = sumCols(rows.map((r) => r.cells), ['qty', 'amt']);
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', ...tot } });
  return { columns: [T('label', ''), Q('qty', 'Qty'), M('amt', 'Amount'), M('avg', 'Avg Cost')], rows };
}

function openPOs(ctx) {
  const rows = [];
  let grand = 0;
  const pos = ctx.data.txns.filter((t) => t.type === 'purchaseorder' && !t.voided && !t.closed).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const t of pos) {
    rows.push({ kind: 'section', level: 1, txnId: t.id, cells: { label: `${t.num} — ${ctx.L.nameOf(t.vendorId)} (${fmtDate(t.date, ctx.company?.dateStyle)})` } });
    let tot = 0;
    for (const l of t.itemLines || []) {
      const rec = num(l.received);
      const back = num(l.qty) - rec;
      const amt = round2(back * num(l.cost));
      tot += amt;
      rows.push({
        kind: 'row',
        level: 2,
        txnId: t.id,
        cells: { item: ctx.L.itemMap.get(l.itemId)?.name || l.description, qty: num(l.qty), rec, back, amount: amt, deliv: t.expectedDate || '' },
      });
    }
    rows.push({ kind: 'subtotal', level: 1, cells: { label: 'Total ' + t.num, amount: round2(tot) } });
    grand += tot;
  }
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', amount: round2(grand) } });
  return {
    columns: [T('label', ''), T('item', 'Item'), Q('qty', 'Ordered'), Q('rec', 'Received'), Q('back', 'Backordered'), D('deliv', 'Deliv Date'), M('amount', 'Open Amount')],
    rows,
  };
}

// ---------------- Inventory ----------------
function invItems(ctx) {
  return ctx.data.items.filter((i) => i.type === 'Inventory Part').sort((a, b) => a.name.localeCompare(b.name));
}

function inventoryValuation(ctx) {
  const to = ctx.to || today();
  const lg = buildLedger({ ...ctx.data, txns: ctx.data.txns.filter((t) => t.date <= to) });
  const items = invItems(ctx);
  let totVal = 0;
  let totRetail = 0;
  const data = items.map((i) => {
    const s = lg.itemStat(i.id);
    const retail = round2(s.qty * num(i.price));
    totVal += s.value;
    totRetail += retail;
    return { i, s, retail };
  });
  const rows = data
    .filter((d) => d.s.qty || d.s.value || ctx.showZero)
    .map(({ i, s, retail }) => ({
      kind: 'row',
      level: 1,
      cells: {
        label: i.name,
        desc: i.description,
        qty: s.qty,
        avg: s.qty ? round2(s.value / s.qty) : 0,
        value: s.value,
        pv: totVal ? round2((s.value / totVal) * 100) : 0,
        price: num(i.price),
        retail,
        pr: totRetail ? round2((retail / totRetail) * 100) : 0,
      },
      drill: { itemId: i.id },
    }));
  const tq = round2(data.reduce((s, d) => s + d.s.qty, 0));
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', qty: tq, value: round2(totVal), pv: 100, retail: round2(totRetail), pr: 100 } });
  return {
    columns: [T('label', 'Item'), T('desc', 'Description'), Q('qty', 'On Hand'), M('avg', 'Avg Cost'), M('value', 'Asset Value'), P('pv', '% of Tot Asset'), M('price', 'Sales Price'), M('retail', 'Retail Value'), P('pr', '% of Tot Retail')],
    rows,
    quick: true,
  };
}

function inventoryValuationDetail(ctx) {
  const INV = ctx.ledger.sys.INV;
  const rows = [];
  for (const i of invItems(ctx)) {
    const all = ctx.ledger.lines.filter((l) => l.itemId === i.id && l.accountId === (i.assetAccountId || INV));
    const before = all.filter((l) => ctx.from && l.date < ctx.from);
    let q = before.reduce((s, l) => s + l.qty, 0);
    let v = before.reduce((s, l) => s + l.amount, 0);
    const lines = all.filter((l) => inRange(l.date, ctx.from, ctx.to));
    if (!lines.length && !q) continue;
    rows.push({ kind: 'section', level: 1, cells: { label: i.name, onhand: ctx.from ? round2(q) : '', value: ctx.from ? round2(v) : '' }, drill: { itemId: i.id } });
    for (const l of lines) {
      q += l.qty;
      v += l.amount;
      rows.push({
        kind: 'row',
        level: 2,
        txnId: l.txnId,
        cells: { type: typeLabel(l.type), date: l.date, name: ctx.L.nameOf(l.nameId), num: l.num, qty: l.qty, cost: round2(l.amount), onhand: round2(q), avg: q ? round2(v / q) : '', value: round2(v) },
      });
    }
    rows.push({ kind: 'subtotal', level: 1, cells: { label: 'Total ' + i.name, onhand: round2(q), value: round2(v) } });
  }
  return {
    columns: [T('label', ''), T('type', 'Type'), D('date'), T('name', 'Name'), T('num', 'Num'), Q('qty', 'Qty'), M('cost', 'Cost'), Q('onhand', 'On Hand'), M('avg', 'Avg Cost'), M('value', 'Asset Value')],
    rows,
  };
}

// earliest expected delivery of each item still on an open purchase order
function nextDeliveries(ctx) {
  const m = new Map();
  for (const t of ctx.data.txns) {
    if (t.type !== 'purchaseorder' || t.closed || t.voided) continue;
    const when = t.expectedDate || t.date;
    for (const l of t.itemLines || []) {
      if (!l.itemId || num(l.qty) - num(l.received) <= 0) continue;
      if (!m.has(l.itemId) || when < m.get(l.itemId)) m.set(l.itemId, when);
    }
  }
  return m;
}

function stockStatus(ctx, onlyLow = false) {
  const rows = [];
  const next = nextDeliveries(ctx);
  for (const i of invItems(ctx)) {
    const s = ctx.ledger.itemStat(i.id);
    // inactive items only while they still have stock or open orders
    if (i.active === false && !s.qty && !s.onSO && !s.onPO) continue;
    const avail = round2(s.qty - s.onSO);
    const reorder = num(i.reorderPoint);
    const order = reorder && avail + s.onPO <= reorder;
    if (onlyLow && !(reorder && s.qty <= reorder)) continue;
    rows.push({
      kind: 'row',
      level: 1,
      cells: {
        label: i.name + (i.active === false ? ' (inactive)' : ''),
        desc: i.description,
        vendor: ctx.L.vendorMap.get(i.preferredVendorId)?.name || '',
        uom: i.uom || '',
        reorder: reorder || '',
        onhand: s.qty,
        onso: s.onSO || '',
        avail,
        order: order ? '✓' : '',
        onpo: s.onPO || '',
        next: next.get(i.id) || '',
        suggest: order ? Math.max(0, round2(reorder * 2 - avail - s.onPO)) : '',
      },
      drill: { itemId: i.id },
    });
  }
  const narrow = { wrap: true, width: 66 };
  return {
    columns: [
      T('label', 'Item', { wrap: true, width: 180 }),
      T('desc', 'Description', { wrap: true, width: 200 }),
      T('vendor', 'Pref Vendor', { wrap: true, width: 130 }),
      T('uom', 'U/M'),
      Q('reorder', 'Reorder Pt', narrow),
      Q('onhand', 'On Hand', { ...narrow, warnNeg: true }),
      Q('onso', 'On Sales Order', narrow),
      Q('avail', 'Available', { ...narrow, warnNeg: true }),
      T('order', 'Order', { align: 'center' }),
      Q('onpo', 'On PO', narrow),
      D('next', 'Next Deliv'),
      Q('suggest', 'Suggested Qty', narrow),
    ],
    rows,
    // "Hide zero rows" hides items with nothing on hand or on order
    zeroCols: ['onhand', 'onso', 'onpo'],
  };
}

function physicalInventory(ctx) {
  const rows = invItems(ctx).map((i) => ({
    kind: 'row',
    level: 1,
    cells: { label: i.name, sku: i.sku || '', desc: i.description, vendor: ctx.L.vendorMap.get(i.preferredVendorId)?.name || '', onhand: ctx.ledger.itemStat(i.id).qty, count: '____________' },
  }));
  return { columns: [T('label', 'Item'), T('sku', 'SKU'), T('desc', 'Description'), T('vendor', 'Pref Vendor'), Q('onhand', 'On Hand'), T('count', 'Physical Count')], rows };
}

// ---------------- Banking ----------------
function depositDetail(ctx) {
  const rows = [];
  let grand = 0;
  ctx.data.txns
    .filter((t) => t.type === 'deposit' && !t.voided && inRange(t.date, ctx.from, ctx.to))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .forEach((t) => {
      const amt = txnTotal(t, ctx.ledger);
      grand += amt;
      rows.push({ kind: 'section', level: 1, txnId: t.id, cells: { type: 'Deposit', date: t.date, num: t.num, account: ctx.L.accountLabel(t.accountId), amount: amt } });
      for (const id of t.payments || []) {
        const p = ctx.ledger.txnById.get(id);
        if (!p) continue;
        rows.push({ kind: 'row', level: 2, txnId: p.id, cells: { type: typeLabel(p.type), date: p.date, num: p.num, name: ctx.L.nameOf(p.customerId), account: 'Undeposited Funds', amount: -txnTotal(p) } });
      }
      for (const l of t.otherLines || []) {
        rows.push({ kind: 'row', level: 2, txnId: t.id, cells: { type: '', name: ctx.L.nameOf(l.nameId), memo: l.memo, account: ctx.L.accountLabel(l.accountId), amount: -num(l.amount) } });
      }
    });
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', amount: round2(grand) } });
  return { columns: [T('label', ''), T('type', 'Type'), D('date'), T('num', 'Num'), T('name', 'Name'), T('memo', 'Memo'), T('account', 'Account'), M('amount', 'Amount')], rows };
}

function checkDetail(ctx) {
  const rows = [];
  let grand = 0;
  ctx.data.txns
    .filter((t) => ['check', 'billpayment'].includes(t.type) && !t.voided && inRange(t.date, ctx.from, ctx.to))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .forEach((t) => {
      const amt = txnTotal(t);
      grand += amt;
      rows.push({ kind: 'row', level: 1, txnId: t.id, cells: { type: typeLabel(t.type), date: t.date, num: t.num, name: ctx.L.nameOf(t.vendorId), memo: t.memo || '', account: ctx.L.accountLabel(t.accountId), amount: amt } });
    });
  rows.push({ kind: 'grand', level: 0, cells: { label: 'TOTAL', amount: round2(grand) } });
  return { columns: [T('label', ''), T('type', 'Type'), D('date'), T('num', 'Num'), T('name', 'Name'), T('memo', 'Memo'), T('account', 'Account'), M('amount', 'Paid Amount')], rows };
}

function missingChecks(ctx) {
  const checks = ctx.data.txns
    .filter((t) => ['check', 'billpayment'].includes(t.type))
    .map((t) => ({ t, n: Number(/(\d+)$/.exec(t.num || '')?.[1]) }))
    .filter((x) => Number.isFinite(x.n))
    .sort((a, b) => a.n - b.n);
  const rows = [];
  checks.forEach((c, i) => {
    if (i > 0) {
      const prev = checks[i - 1].n;
      if (c.n === prev) rows.push({ kind: 'note', level: 1, cells: { label: '*** Duplicate document numbers ***' } });
      else if (c.n > prev + 1) rows.push({ kind: 'note', level: 1, cells: { label: `*** Missing numbers here (${prev + 1}${c.n - 1 > prev + 1 ? '–' + (c.n - 1) : ''}) ***` } });
    }
    rows.push({ kind: 'row', level: 1, txnId: c.t.id, cells: { type: typeLabel(c.t.type), date: c.t.date, num: c.t.num, name: ctx.L.nameOf(c.t.vendorId), account: ctx.L.accountLabel(c.t.accountId), amount: txnTotal(c.t) } });
  });
  return { columns: [T('label', ''), T('type', 'Type'), D('date'), T('num', 'Num'), T('name', 'Name'), T('account', 'Account'), M('amount', 'Amount')], rows };
}

// ---------------- Taxes / Audit / Lists ----------------
function salesTaxLiability(ctx) {
  let total = 0;
  let taxable = 0;
  let tax = 0;
  for (const t of ctx.data.txns) {
    if (t.voided || !['invoice', 'salesreceipt', 'creditmemo'].includes(t.type) || !inRange(t.date, ctx.from, ctx.to)) continue;
    const s = t.type === 'creditmemo' ? -1 : 1;
    const c = salesTotals(t.lines, t.taxRate, ctx.L.itemMap);
    total += s * c.subtotal;
    taxable += s * c.lines.filter((l) => l.taxable).reduce((x, l) => x + l.amount, 0);
    tax += s * c.tax;
  }
  const TAX = ctx.ledger.sys.TAX;
  const payable = -round2(ctx.ledger.lines.filter((l) => l.accountId === TAX && (!ctx.to || l.date <= ctx.to)).reduce((s, l) => s + l.amount, 0));
  const rows = [
    { kind: 'row', level: 1, cells: { label: 'Total Sales', amt: round2(total) } },
    { kind: 'row', level: 1, cells: { label: 'Non-Taxable Sales', amt: round2(total - taxable) } },
    { kind: 'row', level: 1, cells: { label: 'Taxable Sales', amt: round2(taxable) } },
    { kind: 'row', level: 1, cells: { label: `${ctx.company?.taxName || 'Sales Tax'} Rate`, amt: '', text: `${num(ctx.company?.taxRate)}%` } },
    { kind: 'subtotal', level: 1, cells: { label: 'Tax Collected', amt: round2(tax) }, drill: { accountId: TAX } },
    { kind: 'grand', level: 0, cells: { label: 'Sales Tax Payable as of ' + fmtDate(ctx.to || today(), 'LONG'), amt: payable }, drill: { accountId: TAX } },
  ];
  return { columns: [T('label', ''), T('text', ''), M('amt', 'Amount')], rows };
}

function auditTrail(ctx) {
  const rows = ctx.data.txns
    .filter((t) => inRange(String(t.updatedAt || t.createdAt || '').slice(0, 10), ctx.from, ctx.to))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
    .map((t) => ({
      kind: 'row',
      level: 1,
      txnId: t.id,
      cells: {
        modified: new Date(t.updatedAt || t.createdAt).toLocaleString(),
        state: t.voided ? 'Voided' : t.updatedAt && t.updatedAt !== t.createdAt ? 'Changed' : 'Entered',
        type: typeLabel(t.type),
        date: t.date,
        num: t.num,
        name: ctx.L.nameOf(t.customerId || t.vendorId),
        memo: t.memo || '',
        amount: txnTotal(t, ctx.ledger),
      },
    }));
  return {
    columns: [T('label', ''), T('modified', 'Last Modified'), T('state', 'State'), T('type', 'Type'), D('date'), T('num', 'Num'), T('name', 'Name'), T('memo', 'Memo'), M('amount', 'Amount')],
    rows,
  };
}

function txnList(ctx) {
  const by = linesByTxn(ctx.ledger);
  const rows = ctx.data.txns
    .filter((t) => inRange(t.date, ctx.from, ctx.to))
    .sort((a, b) => (a.date === b.date ? String(a.createdAt).localeCompare(String(b.createdAt)) : a.date < b.date ? -1 : 1))
    .map((t) => {
      const ls = by.get(t.id) || [];
      const main = ls[ls.length - 1];
      return {
        kind: 'row',
        level: 1,
        txnId: t.id,
        cells: {
          type: typeLabel(t.type) + (t.voided ? ' (VOID)' : ''),
          date: t.date,
          num: t.num,
          name: ctx.L.nameOf(t.customerId || t.vendorId),
          memo: t.memo || '',
          account: main ? ctx.L.accountLabel(main.accountId) : '',
          split: main ? splitOf(ctx, main) : '',
          amount: txnTotal(t, ctx.ledger),
        },
      };
    });
  return { columns: [T('label', ''), T('type', 'Type'), D('date'), T('num', 'Num'), T('name', 'Name'), T('memo', 'Memo'), T('account', 'Account'), T('split', 'Split'), M('amount', 'Amount')], rows };
}

function accountListing(ctx) {
  const rows = [...ctx.data.accounts]
    .sort((a, b) => ACCOUNT_TYPES.indexOf(a.type) - ACCOUNT_TYPES.indexOf(b.type) || String(a.number || '').localeCompare(String(b.number || '')))
    .map((a) => ({
      kind: 'row',
      level: 1,
      cells: {
        label: ctx.L.accountLabel(a.id),
        type: a.type,
        bal: isPL(a.type) ? '' : round2(sign(a.type) * (ctx.ledger.acctBal.get(a.id) || 0)),
        desc: a.description || '',
        active: a.active === false ? 'Inactive' : '',
      },
      drill: { accountId: a.id },
    }));
  return { columns: [T('label', 'Account'), T('type', 'Type'), M('bal', 'Balance Total'), T('desc', 'Description'), T('active', 'Status')], rows };
}

function contactList(ctx, which, phoneOnly) {
  const list = which === 'customer' ? ctx.data.customers : ctx.data.vendors;
  const bal = which === 'customer' ? ctx.ledger.custBal : ctx.ledger.vendBal;
  const pl = (id) => (ctx.company?.lists?.priceLevels || []).find((p) => p.id === id)?.name || '';
  const rows = [...list]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({
      kind: 'row',
      level: 1,
      cells: phoneOnly
        ? { label: p.name, phone: p.phone || '', alt: p.altPhone || '' }
        : {
            label: p.name,
            contact: p.contact || '',
            phone: p.phone || '',
            email: p.email || '',
            addr: (which === 'customer' ? p.billTo : p.address) || p.city || '',
            terms: p.terms || '',
            pl: which === 'customer' ? pl(p.priceLevelId) : p.type || '',
            bal: bal.get(p.id) || 0,
          },
      drill: { nameId: p.id },
    }));
  if (phoneOnly) return { columns: [T('label', which === 'customer' ? 'Customer' : 'Vendor'), T('phone', 'Phone'), T('alt', 'Alt. Phone')], rows };
  return {
    columns: [
      T('label', which === 'customer' ? 'Customer' : 'Vendor'),
      T('contact', 'Contact'),
      T('phone', 'Phone'),
      T('email', 'Email'),
      T('addr', which === 'customer' ? 'Bill to' : 'Address'),
      T('terms', 'Terms'),
      T('pl', which === 'customer' ? 'Price Level' : 'Type'),
      M('bal', 'Balance Total'),
    ],
    rows,
  };
}

function priceList(ctx) {
  const levels = ctx.company?.lists?.priceLevels || [];
  const rows = [...ctx.data.items]
    .filter((i) => i.active !== false && i.type !== 'Discount')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => {
      const cells = { label: i.name, sku: i.sku || '', desc: i.description || '', uom: i.uom || '', price: num(i.price) };
      levels.forEach((l) => (cells['pl_' + l.id] = round2(num(i.price) * (1 + num(l.percent) / 100))));
      return { kind: 'row', level: 1, cells, drill: { itemId: i.id } };
    });
  return {
    columns: [T('label', 'Item'), T('sku', 'SKU'), T('desc', 'Description'), T('uom', 'U/M'), M('price', 'Base Price'), ...levels.map((l) => M('pl_' + l.id, l.name))],
    rows,
  };
}

function itemListing(ctx) {
  const rows = [...ctx.data.items]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => {
      const s = ctx.ledger.itemStat(i.id);
      return {
        kind: 'row',
        level: 1,
        cells: {
          label: i.name,
          sku: i.sku || '',
          desc: i.description || '',
          type: i.type,
          cost: num(i.cost),
          price: num(i.price),
          vendor: ctx.L.vendorMap.get(i.preferredVendorId)?.name || '',
          reorder: i.type === 'Inventory Part' ? num(i.reorderPoint) || '' : '',
          qty: i.type === 'Inventory Part' ? s.qty : '',
          onpo: i.type === 'Inventory Part' ? s.onPO || '' : '',
        },
        drill: { itemId: i.id },
      };
    });
  return {
    columns: [T('label', 'Item'), T('sku', 'SKU'), T('desc', 'Description'), T('type', 'Type'), M('cost', 'Cost'), M('price', 'Price'), T('vendor', 'Preferred Vendor'), Q('reorder', 'Reorder Pt'), Q('qty', 'Qty On Hand'), Q('onpo', 'On PO')],
    rows,
  };
}

// QuickReport: everything for a name / item / account
function quickReport(ctx) {
  const f = ctx.filter || {};
  if (f.accountId) return txnDetail(ctx);
  const rows = [];
  if (f.nameId) {
    const txns = ctx.data.txns
      .filter((t) => (t.customerId === f.nameId || t.vendorId === f.nameId) && inRange(t.date, ctx.from, ctx.to))
      .sort((a, b) => (a.date === b.date ? String(a.createdAt).localeCompare(String(b.createdAt)) : a.date < b.date ? -1 : 1));
    if (f.sales) {
      const sales = txns.filter((t) => ['invoice', 'salesreceipt', 'creditmemo'].includes(t.type));
      txns.length = 0;
      txns.push(...sales);
    }
    rows.push({ kind: 'section', level: 1, cells: { label: ctx.L.nameOf(f.nameId) } });
    let tot = 0;
    for (const t of txns) {
      const amt = txnTotal(t, ctx.ledger);
      const posting = TXN_TYPES[t.type]?.posting && !t.voided;
      if (posting) tot += ['creditmemo', 'payment', 'vendorcredit', 'billpayment'].includes(t.type) ? -amt : amt;
      const open = ctx.ledger.open.get(t.id);
      rows.push({
        kind: 'row',
        level: 2,
        txnId: t.id,
        cells: {
          type: typeLabel(t.type) + (t.voided ? ' (VOID)' : ''),
          date: t.date,
          num: t.num,
          memo: t.memo || '',
          status: !posting ? (t.closed ? 'Closed' : 'Open') : open !== undefined ? (Math.abs(open) < 0.005 ? 'Paid' : 'Open') : '',
          open: open !== undefined ? open : '',
          amount: amt,
        },
      });
    }
    rows.push({ kind: 'subtotal', level: 1, cells: { label: 'Total ' + ctx.L.nameOf(f.nameId), amount: round2(tot) } });
    return { columns: [T('label', ''), T('type', 'Type'), D('date'), T('num', 'Num'), T('memo', 'Memo'), T('status', 'Status'), M('open', 'Open Balance'), M('amount', 'Amount')], rows };
  }
  if (f.itemId) {
    const it = ctx.L.itemMap.get(f.itemId);
    rows.push({ kind: 'section', level: 1, cells: { label: it?.name || 'Item' } });
    let q = 0;
    const txns = ctx.data.txns
      .filter((t) => !t.voided && inRange(t.date, ctx.from, ctx.to))
      .sort((a, b) => (a.date === b.date ? String(a.createdAt).localeCompare(String(b.createdAt)) : a.date < b.date ? -1 : 1));
    for (const t of txns) {
      const ls = [...(t.lines || []), ...(t.itemLines || [])].filter((l) => l.itemId === f.itemId);
      for (const l of ls) {
        let dq = 0;
        const qn = num(l.qty ?? l.qtyDiff);
        if (['bill', 'check'].includes(t.type)) dq = qn;
        else if (['invoice', 'salesreceipt', 'vendorcredit'].includes(t.type)) dq = -qn;
        else if (t.type === 'creditmemo') dq = qn;
        else if (t.type === 'invadjust') dq = num(l.qtyDiff);
        q += dq;
        rows.push({
          kind: 'row',
          level: 2,
          txnId: t.id,
          cells: {
            type: typeLabel(t.type),
            date: t.date,
            num: t.num,
            name: ctx.L.nameOf(t.customerId || t.vendorId),
            qty: t.type === 'invadjust' ? num(l.qtyDiff) : qn,
            price: num(l.rate ?? l.cost),
            amount: num(l.amount) || num(l.valueDiff),
            onhand: TXN_TYPES[t.type]?.posting ? round2(q) : '',
          },
        });
      }
    }
    return {
      columns: [T('label', ''), T('type', 'Type'), D('date'), T('num', 'Num'), T('name', 'Name'), Q('qty', 'Qty'), M('price', 'Price / Cost'), M('amount', 'Amount'), Q('onhand', 'On Hand')],
      rows,
    };
  }
  return txnList(ctx);
}

function history(ctx) {
  const id = ctx.filter?.txnId;
  const t = ctx.ledger.txnById.get(id);
  const rows = [];
  if (!t) return { columns: [T('label', '')], rows };
  const add = (x, rel, amt) =>
    rows.push({ kind: 'row', level: 1, txnId: x.id, cells: { rel, type: typeLabel(x.type), date: x.date, num: x.num, name: ctx.L.nameOf(x.customerId || x.vendorId), amount: amt ?? txnTotal(x, ctx.ledger) } });
  add(t, 'This transaction');
  for (const x of ctx.data.txns) {
    if (x.id === t.id) continue;
    const ap = (x.applied || []).find((a) => a.txnId === t.id);
    if (ap) add(x, 'Payment applied', num(ap.amount));
    if ((t.applied || []).some((a) => a.txnId === x.id)) add(x, 'Applied to', num(t.applied.find((a) => a.txnId === x.id).amount));
    const cu = (x.credits || []).find((c) => c.txnId === t.id);
    if (cu) add(x, 'Credit used by', num(cu.amount));
    if ((t.credits || []).some((c) => c.txnId === x.id)) add(x, 'Credit taken from', num(t.credits.find((c) => c.txnId === x.id).amount));
    if (x.sourceId === t.id) add(x, 'Created from this');
    if (t.sourceId === x.id) add(x, 'Source document');
    if ((x.payments || []).includes(t.id)) add(x, 'Deposited in');
  }
  const open = ctx.ledger.open.get(t.id);
  if (open !== undefined) rows.push({ kind: 'grand', level: 0, cells: { label: 'Open balance', amount: open } });
  return { columns: [T('label', ''), T('rel', 'Relationship'), T('type', 'Type'), D('date'), T('num', 'Num'), T('name', 'Name'), M('amount', 'Amount')], rows };
}

const BUILDERS = {
  pl: profitLoss,
  pldetail: plDetail,
  plmonth: plMonth,
  plprev: plPrev,
  incsum: incomeByCustomer,
  incdetail: incomeByCustomerDetail,
  bs: balanceSheet,
  bsdetail: bsDetail,
  bsprev: bsPrev,
  arsum: (c) => agingSummary(c, 'customer'),
  ardetail: (c) => agingDetail(c, 'customer'),
  cbs: (c) => balanceSummary(c, 'customer'),
  cbd: (c) => balanceDetail(c, 'customer'),
  openinv: (c) => openByParty(c, 'customer'),
  collections: (c) => openByParty(c, 'customer', { overdueOnly: true }),
  salescust: salesByCustomer,
  salescustdetail: salesByCustomerDetail,
  salesitem: salesByItem,
  salesrep: salesByRep,
  openso: (c) => openDocsList(c, 'salesorder', 'customerId'),
  estimates: (c) => openDocsList(c, 'estimate', 'customerId'),
  apsum: (c) => agingSummary(c, 'vendor'),
  apdetail: (c) => agingDetail(c, 'vendor'),
  vbs: (c) => balanceSummary(c, 'vendor'),
  vbd: (c) => balanceDetail(c, 'vendor'),
  unpaidbills: (c) => openByParty(c, 'vendor'),
  purchvend: purchasesByVendor,
  purchitem: purchasesByItem,
  openpo: openPOs,
  invval: inventoryValuation,
  invvaldetail: inventoryValuationDetail,
  stock: (c) => stockStatus(c),
  lowstock: (c) => stockStatus(c, true),
  physinv: physicalInventory,
  deposits: depositDetail,
  checks: checkDetail,
  missingchecks: missingChecks,
  tb: trialBalance,
  gl: generalLedger,
  journal,
  txnlist: txnList,
  salestax: salesTaxLiability,
  audit: auditTrail,
  acctlist: accountListing,
  custlist: (c) => contactList(c, 'customer'),
  custphone: (c) => contactList(c, 'customer', true),
  vendlist: (c) => contactList(c, 'vendor'),
  pricelist: priceList,
  itemlisting: itemListing,
  quickreport: quickReport,
  txndetail: txnDetail,
  history,
};

export function buildReport(id, ctx) {
  const fn = BUILDERS[id];
  if (!fn) return { columns: [T('label', '')], rows: [{ kind: 'note', level: 0, cells: { label: 'Unknown report' } }] };
  return fn({ ...ctx, meta: REPORT_META[id] || {} });
}

export const reportTitle = (id) => REPORT_NAMES[id] || id;

export { addDays };
