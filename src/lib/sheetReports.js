// The reports shown on the Google Sheet's "Reports" tab. They are built here with the same report engine as the
// app's Report Center (so the numbers always match) and sent to the sheet, where Code.gs lays them out.

import { buildReport, REPORT_META, reportTitle } from './reports';
import { rangeFor, rangeLabel, fmtDate, today } from './dates';
import { makeLookups } from './lookups';

export const SHEET_REPORTS = [
  'pl',
  'bs',
  'plmonth',
  'tb',
  'arsum',
  'openinv',
  'cbs',
  'apsum',
  'unpaidbills',
  'vbs',
  'salescust',
  'incsum',
  'salesitem',
  'purchvend',
  'invval',
  'stock',
  'lowstock',
];
const MAX_ROWS = 5000; // per report; a longer one says so and points to the app
const BASIS = ['pl', 'plmonth', 'bs', 'tb'];
const pause = () => new Promise((r) => setTimeout(r, 0));

function datesFor(id, fy) {
  const meta = REPORT_META[id] || { date: 'none' };
  if (meta.date === 'none') return { from: '', to: '', label: '' };
  const r = rangeFor(meta.range || 'All', fy) || { from: '', to: '' };
  if (meta.date === 'asof') {
    const to = r.to || today();
    return { from: '', to, label: 'As of ' + fmtDate(to, 'LONG') };
  }
  return { from: r.from || '', to: r.to || '', label: rangeLabel(r.from, r.to) };
}

// One report → { id, title, dates, cols: [{ label, type }], rows: [{ k: kind, l: level, v: [values] }] }
// Money / quantity / percent cells stay numbers so they can be added up in the sheet; dates become text.
function compact(id, report, company, dates) {
  const cols = report.columns.map((c) => ({ label: c.label || '', type: c.type || 'text' }));
  const rows = [];
  for (const r of report.rows) {
    if (rows.length >= MAX_ROWS) {
      rows.push({ k: 'note', l: 0, v: [`… ${report.rows.length - MAX_ROWS} more lines — open this report in AY Toys to see them all.`] });
      break;
    }
    const v = report.columns.map((c) => {
      const x = r.cells?.[c.key];
      if (x === null || x === undefined) return '';
      if (c.type === 'date') return x ? fmtDate(x, company.dateStyle) : '';
      if (typeof x === 'number') return Math.round(x * 100000) / 100000;
      return String(x);
    });
    rows.push({ k: r.kind || 'row', l: r.level || 0, v });
  }
  return { id, title: reportTitle(id), dates: [dates.label, BASIS.includes(id) ? 'Accrual Basis' : ''].filter(Boolean).join(' · '), cols, rows };
}

/** All sheet reports of one company. Yields to the browser between reports so typing stays smooth. */
export async function buildSheetReports({ data, ledger, company }) {
  const L = makeLookups(data, company);
  const fy = company.fyMonth || 1;
  const out = [];
  for (const id of SHEET_REPORTS) {
    await pause();
    const d = datesFor(id, fy);
    try {
      const report = buildReport(id, { data, ledger, company, L, from: d.from, to: d.to, filter: {} });
      out.push(compact(id, report, company, d));
    } catch (e) {
      out.push({ id, title: reportTitle(id), dates: d.label, cols: [{ label: '', type: 'text' }], rows: [{ k: 'note', l: 0, v: ['Could not build this report: ' + e.message] }] });
    }
  }
  return out;
}

// Cheap fingerprint so unchanged reports are not sent again
export function reportsSig(reports) {
  const s = JSON.stringify(reports);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return s.length + ':' + h;
}
