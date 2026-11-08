// Customize Report settings (QuickBooks "Customize Report"): which columns show and what they are called,
// what the page header and footer say, text size and how amounts are written.

export const DEFAULT_REPORT_OPTIONS = {
  hiddenCols: [], // column keys left out of the screen, print and Excel
  colLabels: {}, // column key -> own heading
  colOrder: [], // column keys in the order wanted (the first column always stays first)
  extraCols: [], // columns added by the user: { id, kind: 'field' | 'calc' | 'blank', ... } — see reportFields.js
  showCompany: true,
  showTitle: true,
  showDates: true,
  showTime: true, // the time and date the report was run (top left)
  showBasis: true, // "Accrual Basis"
  companyText: '', // '' = the company name
  titleText: '', // '' = the report's own title
  subtitle: '', // extra line under the dates
  footer: '', // line under the report (also printed)
  size: 'normal', // small | normal | large | xlarge
  wholeNumbers: false, // amounts without cents
  negative: 'minus', // minus | brackets
  redNegatives: true,
};

export const TEXT_SIZES = [
  ['small', 'Small', 0.9],
  ['normal', 'Normal', 1],
  ['large', 'Large', 1.15],
  ['xlarge', 'Extra large', 1.3],
];
export const sizeScale = (size) => TEXT_SIZES.find((s) => s[0] === size)?.[2] || 1;

const EXTRA_KINDS = ['field', 'calc', 'blank'];
const CALC_OPS = ['+', '-', '*', '/', '%'];
function cleanExtraCols(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const c of list) {
    if (!c || typeof c.id !== 'string' || !c.id.startsWith('x_') || !EXTRA_KINDS.includes(c.kind) || seen.has(c.id)) continue;
    if (c.kind === 'field' && typeof c.field !== 'string') continue;
    if (c.kind === 'calc' && !CALC_OPS.includes(c.op)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

// Columns in the user's order. The first column (row names) stays first; any column not in the saved order goes last.
export function orderColumns(cols, order) {
  if (!order?.length || cols.length < 3) return cols;
  const rank = new Map(order.map((k, i) => [k, i]));
  const at = (c) => (rank.has(c.key) ? rank.get(c.key) : order.length);
  const [first, ...rest] = cols;
  return [first, ...rest.map((c, i) => [c, i]).sort((a, b) => at(a[0]) - at(b[0]) || a[1] - b[1]).map((x) => x[0])];
}

// Saved options may be missing newer keys or hold junk (older copy, hand-edited sheet): fill in from the defaults
export function normalizeOptions(o) {
  const x = o && typeof o === 'object' ? o : {};
  const d = DEFAULT_REPORT_OPTIONS;
  return {
    ...d,
    ...x,
    hiddenCols: Array.isArray(x.hiddenCols) ? x.hiddenCols : [],
    colLabels: x.colLabels && typeof x.colLabels === 'object' ? x.colLabels : {},
    colOrder: Array.isArray(x.colOrder) ? x.colOrder.filter((k) => typeof k === 'string') : [],
    extraCols: cleanExtraCols(x.extraCols),
    size: TEXT_SIZES.some((s) => s[0] === x.size) ? x.size : d.size,
    negative: x.negative === 'brackets' ? 'brackets' : 'minus',
  };
}

export const isDefaultOptions = (o) => JSON.stringify(normalizeOptions(o)) === JSON.stringify(DEFAULT_REPORT_OPTIONS);

// Reports whose title / columns depend on what was clicked or the dates: their settings are kept only by Memorize
export const SESSION_ONLY_REPORTS = new Set(['quickreport', 'txndetail', 'history']);

const WHOLE_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const CENTS_FMT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatAmount(n, o) {
  const v = o.wholeNumbers ? Math.round(n) : Math.round(n * 100) / 100;
  const s = (o.wholeNumbers ? WHOLE_FMT : CENTS_FMT).format(Math.abs(v));
  if (v >= 0) return s;
  return o.negative === 'brackets' ? `(${s})` : '-' + s;
}

// What a saved customization changes, in a few words (shown in the Customized Templates list)
export function describeOptions(o) {
  const x = normalizeOptions(o);
  const d = DEFAULT_REPORT_OPTIONS;
  const n = (k) => x.extraCols.filter((c) => c.kind === k).length;
  const plural = (c, w) => `${c} ${w}${c === 1 ? '' : 's'}`;
  const parts = [];
  if (x.hiddenCols.length) parts.push(plural(x.hiddenCols.length, 'hidden column'));
  if (n('field')) parts.push(plural(n('field'), 'added field'));
  if (n('calc')) parts.push(plural(n('calc'), 'calculated column'));
  if (n('blank')) parts.push(plural(n('blank'), 'blank column'));
  const renamed = Object.keys(x.colLabels).length;
  if (renamed) parts.push(plural(renamed, 'renamed heading'));
  if (x.colOrder.length) parts.push('column order');
  const headFoot = ['showCompany', 'showTitle', 'showDates', 'showTime', 'showBasis'].some((k) => x[k] !== d[k]) || ['companyText', 'titleText', 'subtitle', 'footer'].some((k) => x[k].trim());
  if (headFoot) parts.push('header / footer');
  if (x.size !== d.size) parts.push('text size');
  if (x.wholeNumbers || x.negative !== d.negative || x.redNegatives !== d.redNegatives) parts.push('number style');
  return parts.join(' · ') || 'Standard';
}
