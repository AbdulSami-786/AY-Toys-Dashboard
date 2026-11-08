import { useRef, useState } from 'react';
import { SlidersHorizontal, RotateCcw, ArrowUp, ArrowDown, Trash2, Plus, Calculator, Square, Download, Upload } from 'lucide-react';
import { Modal, Tabs, useDialog } from '../../components/ui';
import { downloadFile } from '../../lib/format';
import { CUSTOM_EXT, customPayload, parseCustomFile } from '../../lib/customizations';
import { Field } from '../../components/inputs';
import { DEFAULT_REPORT_OPTIONS, TEXT_SIZES, normalizeOptions, orderColumns } from '../../lib/reportOptions';
import { CALC_OPS, NUMBER_TYPES, availableFields, extraColumnDefs, fieldKey } from '../../lib/reportFields';

const newId = () => 'x_' + Math.random().toString(36).slice(2, 8);
const OP_SIGN = { '+': '+', '-': '−', '*': '×', '/': '÷', '%': '% of' };

/**
 * Customize Report (QuickBooks): Display (columns), Header/Footer, Fonts & Numbers.
 * value: current options; report: the report as built (its own columns, before the user's extra ones);
 * onApply(options, remember) — remember = also use these every time this report is opened (null when not offered).
 */
export default function CustomizeReport({ value, report, reportId, reportName, canRemember, onApply, onClose }) {
  const dlg = useDialog();
  const fileRef = useRef(null);
  const [tab, setTab] = useState('display');
  const [o, setO] = useState(() => normalizeOptions(value));
  const [remember, setRemember] = useState(!!canRemember);
  const [calc, setCalc] = useState(null); // the "Calculated column" form while it is open
  const set = (patch) => setO((x) => ({ ...x, ...patch }));
  const bool = (k) => ({ checked: !!o[k], onChange: (e) => set({ [k]: e.target.checked }) });

  // the report's own columns, then the ones the user added, in the order wanted; the first column holds the row names
  const allCols = [...report.columns, ...extraColumnDefs(report, o.extraCols)];
  const ordered = orderColumns(allCols, o.colOrder);
  const toggleable = ordered.slice(1);
  const nameOf = (c) => (c ? o.colLabels[c.key] || c.label || c.key : '');
  const operands = allCols.filter((c) => NUMBER_TYPES.includes(c.type) && c.extra !== 'calc');

  const shown = (key) => !o.hiddenCols.includes(key);
  const toggleCol = (key) => set({ hiddenCols: shown(key) ? [...o.hiddenCols, key] : o.hiddenCols.filter((k) => k !== key) });
  const setLabel = (key, text) => {
    const next = { ...o.colLabels };
    if (text.trim()) next[key] = text;
    else delete next[key];
    set({ colLabels: next });
  };
  const move = (key, dir) => {
    const keys = toggleable.map((c) => c.key);
    const i = keys.indexOf(key);
    const j = i + dir;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    set({ colOrder: keys });
  };

  // share these settings as a file / take them from one (the same file the Customized Templates window uses)
  const exportSettings = () => {
    const name = String(reportName || 'report').replace(/[^\w]+/g, '_');
    downloadFile(name + '_settings' + CUSTOM_EXT, JSON.stringify(customPayload({ reports: [{ reportId, options: normalizeOptions(o) }] }), null, 1), 'application/json');
    dlg.toast('Report settings exported');
  };
  const importSettings = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const r = parseCustomFile(await file.text());
      const hit = r.reports.find((x) => x.reportId === reportId) || r.reports[0];
      if (!hit) throw new Error('This file has no report settings in it.');
      setO(normalizeOptions(hit.options));
      dlg.toast(hit.reportId === reportId ? 'Settings loaded — press OK to use them' : 'Loaded the settings of another report — press OK to use them');
    } catch (err) {
      dlg.alert(err.message || 'Could not read this file.');
    }
  };

  const addExtra = (x) => set({ extraCols: [...o.extraCols, x] });
  // removing a column also removes the calculated columns built on it
  const removeExtra = (id) => {
    const gone = new Set([id]);
    let rest = o.extraCols;
    for (let again = true; again; ) {
      const keep = rest.filter((x) => !gone.has(x.id) && !(x.kind === 'calc' && (gone.has(x.a) || gone.has(x.b))));
      again = keep.length !== rest.length;
      rest.forEach((x) => !keep.includes(x) && gone.add(x.id));
      rest = keep;
    }
    const labels = { ...o.colLabels };
    gone.forEach((k) => delete labels[k]);
    set({
      extraCols: rest,
      colOrder: o.colOrder.filter((k) => !gone.has(k)),
      hiddenCols: o.hiddenCols.filter((k) => !gone.has(k)),
      colLabels: labels,
    });
  };

  const groups = availableFields(report)
    .map((g) => ({ ...g, fields: g.fields.filter((x) => !o.extraCols.some((e) => e.id === fieldKey(x.id))) }))
    .filter((g) => g.fields.length);
  const openCalc = () => setCalc({ label: '', a: operands[0]?.key || '', op: operands.length > 1 ? '-' : '+', b: (operands[1] || operands[0])?.key || '' });
  const addCalc = () => {
    const col = (k) => allCols.find((c) => c.key === k);
    const label = calc.label.trim() || `${nameOf(col(calc.a))} ${OP_SIGN[calc.op]} ${nameOf(col(calc.b))}`;
    addExtra({ id: newId(), kind: 'calc', op: calc.op, a: calc.a, b: calc.b, label });
    setCalc(null);
  };

  return (
    <Modal
      title="Customize Report"
      icon={<SlidersHorizontal size={16} />}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn ghost" onClick={() => setO(normalizeOptions(DEFAULT_REPORT_OPTIONS))} title="Back to the standard look of this report">
            <RotateCcw size={14} /> Reset to Default
          </button>
          {canRemember && (
            <>
              <button className="btn ghost" onClick={exportSettings} title="Save these settings as a file">
                <Download size={14} /> Export
              </button>
              <button className="btn ghost" onClick={() => fileRef.current?.click()} title="Load settings from a file">
                <Upload size={14} /> Import
              </button>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importSettings} />
            </>
          )}
          <span className="sp" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onApply(normalizeOptions(o), canRemember ? remember : null)}>
            OK
          </button>
        </>
      }
    >
      <Tabs
        tabs={[
          { id: 'display', label: 'Display' },
          { id: 'header', label: 'Header / Footer' },
          { id: 'fonts', label: 'Fonts & Numbers' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div style={{ paddingTop: 12, minHeight: 280 }}>
        {tab === 'display' && (
          <>
            <div className="muted small" style={{ marginBottom: 8 }}>
              Tick the columns to show, type in the box to give a column your own heading, and use the arrows to change the order.
            </div>
            {toggleable.length ? (
              <div className="cr-cols">
                {toggleable.map((c, i) => (
                  <div key={c.key} className="cr-col">
                    <label className="check">
                      <input type="checkbox" checked={shown(c.key)} onChange={() => toggleCol(c.key)} />
                    </label>
                    <input
                      value={o.colLabels[c.key] ?? ''}
                      placeholder={c.label || c.key}
                      disabled={!shown(c.key)}
                      onChange={(e) => setLabel(c.key, e.target.value)}
                      aria-label={'Heading of ' + (c.label || c.key)}
                    />
                    {c.extra && <span className="cr-tag">{c.extra === 'field' ? 'added' : c.extra === 'calc' ? 'calculated' : 'blank'}</span>}
                    <button className="btn sm ghost" disabled={i === 0} onClick={() => move(c.key, -1)} title="Move up (left on the report)" aria-label="Move left">
                      <ArrowUp size={13} />
                    </button>
                    <button className="btn sm ghost" disabled={i === toggleable.length - 1} onClick={() => move(c.key, 1)} title="Move down (right on the report)" aria-label="Move right">
                      <ArrowDown size={13} />
                    </button>
                    {c.extra ? (
                      <button className="btn sm ghost" onClick={() => removeExtra(c.key)} title="Remove this column" aria-label="Remove this column">
                        <Trash2 size={13} />
                      </button>
                    ) : (
                      <span className="cr-spacer" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">This report has a single column of amounts. You can still add columns to it below.</div>
            )}

            <div className="cr-add">
              <b>Add a column</b>
              {groups.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && addExtra({ id: fieldKey(e.target.value), kind: 'field', field: e.target.value })}
                  aria-label="Add a data field"
                >
                  <option value="">Add a data field…</option>
                  {groups.map((g) => (
                    <optgroup key={g.id} label={g.label}>
                      {g.fields.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              <button className="btn sm" onClick={openCalc} disabled={!operands.length} title="A number worked out from two columns, e.g. Amount − Cost">
                <Calculator size={13} /> Calculated column
              </button>
              <button className="btn sm" onClick={() => addExtra({ id: newId(), kind: 'blank', label: 'Notes' })} title="An empty column to write in on the printout">
                <Square size={13} /> Blank column
              </button>
            </div>
            {!groups.length && (
              <div className="muted small" style={{ marginTop: 6 }}>
                The lines of this report are totals, with no single record behind each one, so there are no more data fields to take from. You can still add a calculated or blank column.
              </div>
            )}

            {calc && (
              <div className="cr-calc">
                <Field label="Heading (blank = made from the two columns)">
                  <input value={calc.label} onChange={(e) => setCalc({ ...calc, label: e.target.value })} placeholder="e.g. Profit" />
                </Field>
                <div className="cr-calc-row">
                  <select value={calc.a} onChange={(e) => setCalc({ ...calc, a: e.target.value })} aria-label="First column (A)">
                    {operands.map((c) => (
                      <option key={c.key} value={c.key}>
                        {nameOf(c)}
                      </option>
                    ))}
                  </select>
                  <select value={calc.op} onChange={(e) => setCalc({ ...calc, op: e.target.value })} aria-label="Operation" style={{ width: 130, flex: 'none' }}>
                    {CALC_OPS.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <select value={calc.b} onChange={(e) => setCalc({ ...calc, b: e.target.value })} aria-label="Second column (B)">
                    {operands.map((c) => (
                      <option key={c.key} value={c.key}>
                        {nameOf(c)}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn sm" onClick={() => setCalc(null)}>
                    Cancel
                  </button>
                  <button className="btn sm primary" disabled={!calc.a || !calc.b} onClick={addCalc}>
                    <Plus size={13} /> Add column
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'header' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="cr-checks">
              <label className="check">
                <input type="checkbox" {...bool('showCompany')} /> Company name
              </label>
              <label className="check">
                <input type="checkbox" {...bool('showTitle')} /> Report title
              </label>
              <label className="check">
                <input type="checkbox" {...bool('showDates')} /> Date range
              </label>
              <label className="check">
                <input type="checkbox" {...bool('showTime')} /> Time and date printed
              </label>
              <label className="check">
                <input type="checkbox" {...bool('showBasis')} /> Accrual Basis
              </label>
            </div>
            <Field label="Company name (blank = shop name)">
              <input value={o.companyText} onChange={(e) => set({ companyText: e.target.value })} />
            </Field>
            <Field label="Report title (blank = standard title)">
              <input value={o.titleText} onChange={(e) => set({ titleText: e.target.value })} />
            </Field>
            <Field label="Subtitle (extra line under the dates)">
              <input value={o.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
            </Field>
            <Field label="Footer (line under the report, also printed)">
              <input value={o.footer} onChange={(e) => set({ footer: e.target.value })} />
            </Field>
          </div>
        )}

        {tab === 'fonts' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Text size">
              <select value={o.size} onChange={(e) => set({ size: e.target.value })} style={{ width: 200 }}>
                {TEXT_SIZES.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <label className="check">
              <input type="checkbox" {...bool('wholeNumbers')} /> Show amounts without cents (rounded to whole numbers)
            </label>
            <Field label="Negative amounts">
              <select value={o.negative} onChange={(e) => set({ negative: e.target.value })} style={{ width: 200 }}>
                <option value="minus">-1,234.00</option>
                <option value="brackets">(1,234.00)</option>
              </select>
            </Field>
            <label className="check">
              <input type="checkbox" {...bool('redNegatives')} /> Show negative amounts in red
            </label>
          </div>
        )}
      </div>
      {canRemember && (
        <label className="check" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Use these settings every time I open this report
        </label>
      )}
    </Modal>
  );
}
