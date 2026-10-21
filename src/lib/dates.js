// Date helpers. All dates are stored as 'YYYY-MM-DD' strings.

const pad = (n) => String(n).padStart(2, '0');

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseISO = (s) => {
  if (!s) return new Date();
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const today = () => toISO(new Date());

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonths(iso, n) {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}

export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// dd/mm/yyyy display (common in Pakistan); configurable per company
export function fmtDate(iso, style = 'DMY') {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (style === 'MDY') return `${m}/${d}/${y}`;
  if (style === 'LONG') return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
  return `${d}/${m}/${y}`;
}

export const monthLabel = (iso) => {
  const d = parseISO(iso);
  return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
};

// Parse what a user typed into a date box (dd/mm/yyyy, d/m, yyyy-mm-dd)
export function parseTyped(str, style = 'DMY') {
  const s = String(str || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return toISO(parseISO(s));
  const parts = s.split(/[/.\-\s]+/).map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  const now = new Date();
  let d, m, y;
  if (style === 'MDY') [m, d, y] = parts;
  else [d, m, y] = parts;
  if (!m) m = now.getMonth() + 1;
  if (!y) y = now.getFullYear();
  if (y < 100) y += 2000;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  return toISO(dt);
}

// QuickBooks date-field keyboard shortcuts
export function dateShortcut(key, iso) {
  const d = parseISO(iso || today());
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (key) {
    case '+':
    case '=':
      return addDays(toISO(d), 1);
    case '-':
      return addDays(toISO(d), -1);
    case 't':
    case 'T':
      return today();
    case 'w':
    case 'W':
      return addDays(toISO(d), -d.getDay());
    case 'k':
    case 'K':
      return addDays(toISO(d), 6 - d.getDay());
    case 'm':
    case 'M':
      return toISO(new Date(y, m, 1));
    case 'h':
    case 'H':
      return toISO(new Date(y, m + 1, 0));
    case 'y':
    case 'Y':
      return toISO(new Date(y, 0, 1));
    case 'r':
    case 'R':
      return toISO(new Date(y, 11, 31));
    case '[':
      return addDays(toISO(d), -7);
    case ']':
      return addDays(toISO(d), 7);
    case ';':
      return addMonths(toISO(d), -1);
    case "'":
      return addMonths(toISO(d), 1);
    default:
      return null;
  }
}

export function fiscalYearStart(iso, fyMonth = 1) {
  const d = parseISO(iso);
  let y = d.getFullYear();
  if (d.getMonth() + 1 < fyMonth) y -= 1;
  return toISO(new Date(y, fyMonth - 1, 1));
}

// QuickBooks report date ranges
export const RANGE_OPTIONS = [
  'All',
  'Today',
  'This Week',
  'This Week-to-date',
  'This Month',
  'This Month-to-date',
  'This Fiscal Quarter',
  'This Fiscal Quarter-to-date',
  'This Fiscal Year',
  'This Fiscal Year-to-date',
  'Yesterday',
  'Last Week',
  'Last Month',
  'Last Fiscal Quarter',
  'Last Fiscal Year',
  'Last 30 Days',
  'Last 90 Days',
  'Last 365 Days',
  'Custom',
];

export function rangeFor(name, fyMonth = 1) {
  const t = today();
  const d = parseISO(t);
  const y = d.getFullYear();
  const m = d.getMonth();
  const fyStart = parseISO(fiscalYearStart(t, fyMonth));
  const qIndex = Math.floor(((m - (fyMonth - 1) + 12) % 12) / 3);
  const qStart = new Date(fyStart.getFullYear(), fyStart.getMonth() + qIndex * 3, 1);
  const weekStart = addDays(t, -d.getDay());
  switch (name) {
    case 'All':
      return { from: '', to: '' };
    case 'Today':
      return { from: t, to: t };
    case 'Yesterday':
      return { from: addDays(t, -1), to: addDays(t, -1) };
    case 'This Week':
      return { from: weekStart, to: addDays(weekStart, 6) };
    case 'This Week-to-date':
      return { from: weekStart, to: t };
    case 'Last Week':
      return { from: addDays(weekStart, -7), to: addDays(weekStart, -1) };
    case 'This Month':
      return { from: toISO(new Date(y, m, 1)), to: toISO(new Date(y, m + 1, 0)) };
    case 'This Month-to-date':
      return { from: toISO(new Date(y, m, 1)), to: t };
    case 'Last Month':
      return { from: toISO(new Date(y, m - 1, 1)), to: toISO(new Date(y, m, 0)) };
    case 'This Fiscal Quarter':
      return { from: toISO(qStart), to: toISO(new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0)) };
    case 'This Fiscal Quarter-to-date':
      return { from: toISO(qStart), to: t };
    case 'Last Fiscal Quarter': {
      const s = new Date(qStart.getFullYear(), qStart.getMonth() - 3, 1);
      return { from: toISO(s), to: toISO(new Date(s.getFullYear(), s.getMonth() + 3, 0)) };
    }
    case 'This Fiscal Year':
      return { from: toISO(fyStart), to: toISO(new Date(fyStart.getFullYear() + 1, fyStart.getMonth(), 0)) };
    case 'This Fiscal Year-to-date':
      return { from: toISO(fyStart), to: t };
    case 'Last Fiscal Year':
      return {
        from: toISO(new Date(fyStart.getFullYear() - 1, fyStart.getMonth(), 1)),
        to: toISO(new Date(fyStart.getFullYear(), fyStart.getMonth(), 0)),
      };
    case 'Last 30 Days':
      return { from: addDays(t, -29), to: t };
    case 'Last 90 Days':
      return { from: addDays(t, -89), to: t };
    case 'Last 365 Days':
      return { from: addDays(t, -364), to: t };
    default:
      return null;
  }
}

export function rangeLabel(from, to, style) {
  if (!from && !to) return 'All Transactions';
  if (!from) return 'As of ' + fmtDate(to, 'LONG');
  if (from === to) return fmtDate(from, 'LONG');
  return `${fmtDate(from, 'LONG')} through ${fmtDate(to, 'LONG')}`;
}

export function dueFromTerms(date, terms) {
  if (!terms) return date;
  const m = /net\s*(\d+)/i.exec(terms);
  if (m) return addDays(date, Number(m[1]));
  if (/receipt/i.test(terms)) return date;
  const e = /(\d+)\s*days?/i.exec(terms);
  if (e) return addDays(date, Number(e[1]));
  return date;
}
