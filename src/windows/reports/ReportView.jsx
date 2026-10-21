import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Printer, Download, RefreshCw, Bookmark, ChevronsDownUp, ChevronsUpDown, ZoomIn } from 'lucide-react';
import { useStore, useLookups } from '../../store/store';
import { useWindowKeys } from '../../store/windows';
import { useNav } from '../../store/nav';
import { useDialog } from '../../components/ui';
import { usePrint } from '../../components/print';
import { DateInput, Field } from '../../components/inputs';
import { buildReport, REPORT_META, reportTitle } from '../../lib/reports';
import { RANGE_OPTIONS, rangeFor, fmtDate, rangeLabel, today } from '../../lib/dates';
import { money, qty as fq, toCSV, downloadFile, num } from '../../lib/format';

function cellText(col, v, dateStyle) {
  if (v === '' || v === undefined || v === null) return '';
  if (col.type === 'money') return typeof v === 'number' ? money(v) : v;
  if (col.type === 'qty') return typeof v === 'number' ? fq(v) : v;
  if (col.type === 'pct') return typeof v === 'number' ? `${v.toFixed(1)}%` : v;
  if (col.type === 'date') return fmtDate(v, dateStyle);
  return String(v);
}

// alignment / wrapping classes and width for a column (header and cells)
const colClass = (c) => (c.align === 'right' ? 'r' : c.align === 'center' ? 'c' : '') + (c.wrap ? ' wrap' : '');
const colStyle = (c) => (c.width ? { width: c.width } : undefined);

const RowBlock = memo(function RowBlock({ rows, cols, dateStyle, sel, onSel, onDrill }) {
  return (
    <tbody>
      {rows.map((r, i) => {
        const drillable = !!(r.txnId || r.drill);
        return (
          <tr
            key={i}
            className={'k-' + r.kind + (drillable ? ' drill' : '') + (sel === r ? ' sel' : '')}
            onClick={() => onSel?.(r)}
            onDoubleClick={(e) => drillable && onDrill?.(r, e)}
            title={drillable ? 'Double-click to QuickZoom' : undefined}
          >
            {cols.map((c, ci) => {
              const v = ci === 0 ? r.cells.label ?? r.cells[c.key] : r.cells[c.key];
              const txt = cellText(ci === 0 && c.key === 'label' ? { type: 'text' } : c, v, dateStyle);
              const neg = (c.type === 'money' || c.type === 'pct' || c.warnNeg) && typeof v === 'number' && v < 0;
              return (
                <td key={c.key} data-col={c.key} className={colClass(c) + (neg ? ' neg' : '')} style={ci === 0 ? { paddingLeft: 10 + (r.level || 0) * 16 } : undefined}>
                  {txt}
                </td>
              );
            })}
          </tr>
        );
      })}
    </tbody>
  );
});

// the rows a report shows with the current Collapse / Hide zero rows settings
export function visibleRows(report, collapsed, hideZero) {
  const cols = report.columns;
  const zeroCols = report.zeroCols ? cols.filter((c) => report.zeroCols.includes(c.key)) : cols.filter((c) => c.type === 'money');
  return report.rows.filter((r) => {
    if (collapsed && r.level >= 2 && r.kind === 'row' && r.txnId) return false;
    if (hideZero && r.kind === 'row') {
      const nums = zeroCols.map((c) => r.cells[c.key]);
      if (nums.length && nums.every((v) => !num(v))) return false;
    }
    return true;
  });
}

// Reports with thousands of lines (General Ledger, Journal for all dates) draw only the rows on screen and a
// margin around them; scrolling draws the next ones. Column widths are measured once from the first rows.
const VIRTUAL_MIN = 2500;
const OVERSCAN = 40;

const ReportBody = memo(function ReportBody({ title, company, report, dates, collapsed, hideZero, sel, onSel, onDrill, basis, all }) {
  const cols = report.columns;
  const rows = useMemo(() => visibleRows(report, collapsed, hideZero), [report, collapsed, hideZero]);
  const virtual = !all && rows.length > VIRTUAL_MIN && !cols.some((c) => c.wrap);
  const tableRef = useRef(null);
  const [layout, setLayout] = useState(null); // { widths, rowH } measured from the first rows
  const [range, setRange] = useState([0, 200]);

  useEffect(() => {
    setLayout(null);
    setRange([0, 200]);
  }, [rows, virtual]);

  // measure once the first rows are on screen (the window must be visible to have a size). Each column is as
  // wide as its longest value in the whole report — amounts are never cut; only long text (memos) gets "…".
  useLayoutEffect(() => {
    if (!virtual || layout || !tableRef.current || !tableRef.current.offsetParent) return;
    const ths = [...tableRef.current.querySelectorAll('thead th')];
    const trs = [...tableRef.current.querySelectorAll('tbody tr')].slice(0, 60);
    const td = tableRef.current.querySelector('tbody td');
    if (!ths.length || !trs.length || !td) return;
    const rowH = trs.reduce((sum, tr) => sum + tr.getBoundingClientRect().height, 0) / trs.length;
    const measure = document.createElement('canvas').getContext('2d');
    const css = getComputedStyle(td);
    measure.font = `700 ${css.fontSize} ${css.fontFamily}`; // bold, the widest a row gets (totals)
    const maxLevel = rows.reduce((m, r) => Math.max(m, r.level || 0), 0);
    const widths = cols.map((c, ci) => {
      const col = ci === 0 && c.key === 'label' ? { type: 'text' } : c;
      let longest = '';
      for (const r of rows) {
        const t = cellText(col, ci === 0 ? r.cells.label ?? r.cells[c.key] : r.cells[c.key], company.dateStyle);
        if (t.length > longest.length) longest = t;
      }
      // + room for the table's equal-width digits, which the canvas doesn't use
      const text = measure.measureText(longest).width * (col.type === 'text' ? 1.04 : 1.14);
      let w = Math.ceil(text) + 26 + (ci === 0 ? 10 + maxLevel * 16 : 0);
      if (col.type === 'text') w = Math.min(w, ci === 0 ? 340 : 260);
      return Math.max(ths[ci].getBoundingClientRect().width, w);
    });
    setLayout({ widths, rowH: Math.max(16, rowH) });
  });

  // which rows are on screen
  useEffect(() => {
    if (!virtual || !layout || !tableRef.current) return;
    const scroller = tableRef.current.closest('.report-scroll');
    if (!scroller) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const body = tableRef.current?.tBodies[0];
      if (!body) return;
      const top = scroller.scrollTop - (body.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop);
      const first = Math.max(0, Math.floor(top / layout.rowH) - OVERSCAN);
      const last = Math.min(rows.length, Math.ceil((top + scroller.clientHeight) / layout.rowH) + OVERSCAN);
      setRange((r) => (r[0] === first && r[1] === last ? r : [first, last]));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [virtual, layout, rows.length]);

  const [from, to] = virtual ? (layout ? range : [0, Math.min(rows.length, 200)]) : [0, rows.length];
  const slice = useMemo(() => rows.slice(from, to), [rows, from, to]);
  const spacer = (n) =>
    n > 0 && layout ? (
      <tbody aria-hidden="true">
        <tr style={{ height: n * layout.rowH }}>
          <td colSpan={cols.length} style={{ padding: 0, border: 0 }} />
        </tr>
      </tbody>
    ) : null;

  return (
    <div className="report-paper">
      <div className="report-head">
        <div className="meta">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          <br />
          {fmtDate(today(), company.dateStyle)}
          <br />
          {basis}
        </div>
        <div className="center-h">
          <div className="co">{company.legalName || company.name}</div>
          <div className="title">{title}</div>
          <div className="dates">{dates}</div>
        </div>
        <div />
      </div>
      <table
        className={'rpt' + (virtual && layout ? ' fixed' : '')}
        ref={tableRef}
        style={virtual && layout ? { width: layout.widths.reduce((a, b) => a + b, 0) } : undefined}
        aria-rowcount={rows.length}
      >
        {virtual && layout && (
          <colgroup>
            {layout.widths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={colClass(c)} style={colStyle(c)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        {spacer(from)}
        <RowBlock rows={slice} cols={cols} dateStyle={company.dateStyle} sel={slice.includes(sel) ? sel : null} onSel={onSel} onDrill={onDrill} />
        {spacer(rows.length - to)}
      </table>
      {virtual && <div className="rpt-footnote">{rows.length.toLocaleString()} lines · Print or Excel for all of them on paper / in a file</div>}
      {!rows.length && <div className="empty">No data for this report and date range.</div>}
    </div>
  );
});

export default function ReportView({ reportId, filter = {}, from: f0, to: t0, range: r0 }) {
  const { data, ledger, company, updateCompany } = useStore();
  const L = useLookups();
  const nav = useNav();
  const dlg = useDialog();
  const print = usePrint();
  const meta = REPORT_META[reportId] || { date: 'range', range: 'All' };
  const fy = company.fyMonth || 1;
  const initRange = r0 || (f0 !== undefined || t0 !== undefined ? 'Custom' : meta.range || 'All');
  const initDates = f0 !== undefined || t0 !== undefined ? { from: f0 || '', to: t0 || '' } : rangeFor(initRange, fy) || { from: '', to: '' };
  const [range, setRange] = useState(initRange);
  const [from, setFrom] = useState(meta.date === 'asof' ? '' : initDates.from);
  const [to, setTo] = useState(meta.date === 'asof' ? initDates.to || today() : initDates.to);
  const [collapsed, setCollapsed] = useState(false);
  const [hideZero, setHideZero] = useState(false);
  const [sel, setSel] = useState(null);
  const [tick, setTick] = useState(0);

  const title = reportId === 'quickreport'
    ? `QuickReport: ${filter.accountId ? L.accountMap.get(filter.accountId)?.name : filter.nameId ? L.nameOf(filter.nameId) : filter.itemId ? L.itemMap.get(filter.itemId)?.name : ''}`
    : reportId === 'txndetail' && filter.accountId
      ? `Transaction Detail: ${L.accountMap.get(filter.accountId)?.name || ''}`
      : reportTitle(reportId);

  const report = useMemo(
    () => buildReport(reportId, { data, ledger, company, L, from: meta.date === 'asof' ? '' : from, to, filter }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportId, data, ledger, company, L, from, to, JSON.stringify(filter), tick],
  );

  const dates = meta.date === 'none' ? '' : meta.date === 'asof' ? 'As of ' + fmtDate(to || today(), 'LONG') : rangeLabel(from, to);
  const basis = ['pl', 'pldetail', 'plmonth', 'plprev', 'bs', 'bsdetail', 'bsprev', 'tb', 'gl'].includes(reportId) ? 'Accrual Basis' : '';

  const pickRange = (name) => {
    setRange(name);
    const r = rangeFor(name, fy);
    if (!r) return;
    if (meta.date === 'asof') setTo(r.to || today());
    else {
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const drillRef = useRef(null);
  const onDrill = useCallback((r, e) => drillRef.current?.(r, e), []);
  const drill = (r, e) => {
    if (r.txnId) return nav.openTxn(r.txnId);
    const d = r.drill;
    if (!d) return;
    // which column was double-clicked (for multi-column reports)
    const colKey = e?.target?.closest?.('td')?.dataset?.col;
    const cr = report.colRange?.[colKey] || (report.colRange && Object.values(report.colRange)[0]) || { from: meta.date === 'asof' ? '' : from, to };
    if (d.accountId || d.netIncome) {
      const acc = L.accountMap.get(d.accountId);
      const plAccount = acc && ['Income', 'Cost of Goods Sold', 'Expense', 'Other Income', 'Other Expense'].includes(acc.type);
      return nav.open('report', { reportId: 'txndetail', filter: d, from: plAccount || d.netIncome || meta.date !== 'asof' ? cr.from : '', to: cr.to, force: true });
    }
    if (d.nameId) {
      if (d.incomeDetail) return nav.open('report', { reportId: 'incdetail', filter: { nameId: d.nameId }, from: cr.from, to: cr.to, force: true });
      if (['cbs', 'arsum', 'openinv', 'collections'].includes(reportId)) return nav.open('report', { reportId: 'cbd', filter: { nameId: d.nameId }, from: '', to: to || today(), force: true });
      if (['vbs', 'apsum', 'unpaidbills'].includes(reportId)) return nav.open('report', { reportId: 'vbd', filter: { nameId: d.nameId }, from: '', to: to || today(), force: true });
      return nav.open('report', { reportId: 'quickreport', filter: { nameId: d.nameId, sales: d.sales }, from, to, force: true });
    }
    if (d.itemId) return nav.open('report', { reportId: 'quickreport', filter: { itemId: d.itemId }, from: meta.date === 'none' ? '' : from, to, force: true });
  };

  drillRef.current = drill;

  const exportCsv = () => {
    const rows = [[company.name], [title], [dates], []];
    rows.push(report.columns.map((c) => c.label));
    report.rows.forEach((r) =>
      rows.push(
        report.columns.map((c, ci) => {
          const v = ci === 0 ? r.cells.label ?? r.cells[c.key] : r.cells[c.key];
          if (ci === 0) return '  '.repeat(r.level || 0) + (v ?? '');
          if (c.type === 'date') return fmtDate(v, company.dateStyle);
          return v ?? '';
        }),
      ),
    );
    downloadFile(`${title.replace(/[^\w]+/g, '_')}_${today()}.csv`, toCSV(rows), 'text/csv');
  };

  const doPrint = () =>
    print(<ReportBody title={title} company={company} report={report} dates={dates} collapsed={collapsed} hideZero={hideZero} basis={basis} all />);

  const memorize = () => {
    const list = company.memorizedReports || [];
    const name = title;
    updateCompany(company.id, { memorizedReports: [...list.filter((m) => m.name !== name), { name, reportId, filter, range, from, to }] });
    dlg.toast('Report memorized (Reports › Memorized Reports)');
  };

  useWindowKeys({
    'ctrl+p': doPrint,
    f5: () => setTick((t) => t + 1),
    enter: () => sel && drill(sel),
  });

  return (
    <div className="win">
      <div className="report-toolbar">
        {meta.date !== 'none' && (
          <>
            <Field label="Dates">
              <select value={range} onChange={(e) => pickRange(e.target.value)} style={{ width: 180 }}>
                {RANGE_OPTIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            {meta.date === 'range' && (
              <Field label="From" style={{ width: 130 }}>
                <DateInput
                  value={from}
                  onChange={(v) => {
                    setFrom(v);
                    setRange('Custom');
                  }}
                />
              </Field>
            )}
            <Field label={meta.date === 'asof' ? 'As of' : 'To'} style={{ width: 130 }}>
              <DateInput
                value={to}
                onChange={(v) => {
                  setTo(v);
                  setRange('Custom');
                }}
              />
            </Field>
          </>
        )}
        <button className="btn sm" onClick={() => setTick((t) => t + 1)} title="Refresh (F5)">
          <RefreshCw size={13} /> Refresh
        </button>
        <span className="sp" />
        <label className="check small">
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> Hide zero rows
        </label>
        <button className="btn sm" onClick={() => setCollapsed((c) => !c)} title="Collapse / expand detail rows">
          {collapsed ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />} {collapsed ? 'Expand' : 'Collapse'}
        </button>
        <button className="btn sm" onClick={memorize}>
          <Bookmark size={13} /> Memorize
        </button>
        <button className="btn sm" onClick={doPrint}>
          <Printer size={13} /> Print
        </button>
        <button className="btn sm" onClick={exportCsv}>
          <Download size={13} /> Excel
        </button>
      </div>
      <div className="report-scroll">
        <ReportBody title={title} company={company} report={report} dates={dates} collapsed={collapsed} hideZero={hideZero} sel={sel} onSel={setSel} onDrill={onDrill} basis={basis} />
        <div className="rpt-footnote" style={{ textAlign: 'center' }}>
          <ZoomIn size={11} /> Double-click any amount or row to QuickZoom into the transactions behind it.
        </div>
      </div>
    </div>
  );
}
