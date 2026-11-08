import { useMemo, useRef, useState } from 'react';
import { Sparkles, Upload, Download, Pencil, Trash2, RotateCcw, Play, FileSpreadsheet, SlidersHorizontal, Files } from 'lucide-react';
import { useStore } from '../store/store';
import { useNav } from '../store/nav';
import { useTemplates, TEMPLATE_SIZE_WARN, templateSizeWarning } from '../store/templates';
import { useDialog, Modal, Tabs } from '../components/ui';
import { downloadFile } from '../lib/format';
import { FORM_MAP, PAPERS, isStdId } from '../lib/templates';
import { REPORT_NAMES } from '../lib/commands';
import { describeOptions, isDefaultOptions, normalizeOptions } from '../lib/reportOptions';
import { TEMPLATE_KINDS, KIND_LABEL, SPECS, downloadTemplate, fieldsFor, isCustomTemplate } from '../lib/importTemplates';
import { CUSTOM_EXT, customCounts, customPayload, parseCustomFile } from '../lib/customizations';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * Customized Templates: one list of everything the shop has customized — form templates (invoice, bill…),
 * report settings and Excel import templates — with Export to a file and Import from one (e.g. on another computer).
 */
export default function Customized({ tab: t0 = 'forms' }) {
  const { company, updateCompany } = useStore();
  const api = useTemplates();
  const nav = useNav();
  const dlg = useDialog();
  const [tab, setTab] = useState(t0);
  const [sel, setSel] = useState({}); // selected row id of each tab
  const [showBuiltIn, setShowBuiltIn] = useState(false);
  const [editing, setEditing] = useState(null); // Excel template being customized
  const fileRef = useRef(null);
  const pick = (id) => setSel((s) => ({ ...s, [tab]: id }));

  // ---------------- the three lists
  const formRows = useMemo(() => api.list.filter((t) => showBuiltIn || !isStdId(t.id) || api.isCustomized(t.id)), [api, showBuiltIn]);
  const reportRows = useMemo(() => {
    const saved = Object.entries(company.reportOptions || {})
      .filter(([id, o]) => REPORT_NAMES[id] && !isDefaultOptions(o))
      .map(([id, o]) => ({ id: 'r:' + id, kind: 'Saved for the report', name: REPORT_NAMES[id], reportId: id, options: normalizeOptions(o) }));
    const memo = (company.memorizedReports || [])
      .filter((m) => m.options && !isDefaultOptions(m.options))
      .map((m) => ({ id: 'm:' + m.name, kind: 'Memorized report', name: m.name, reportId: m.reportId, options: normalizeOptions(m.options), memo: m }));
    return [...saved.sort((a, b) => a.name.localeCompare(b.name)), ...memo.sort((a, b) => a.name.localeCompare(b.name))];
  }, [company.reportOptions, company.memorizedReports]);
  const excelRows = TEMPLATE_KINDS.map((k) => ({ id: k, kind: k, name: KIND_LABEL[k], shown: fieldsFor(k, company.importTemplates).length, total: SPECS[k].fields.length, custom: isCustomTemplate(k, company.importTemplates) }));

  const rowsOf = { forms: formRows, reports: reportRows, excel: excelRows }[tab];
  const cur = rowsOf.find((r) => r.id === sel[tab]) || null;
  const fileBase = (company.name || 'shop').replace(/[^\w]+/g, '_');

  // ---------------- export
  const save = (payload, name, what) => {
    downloadFile(`${name.replace(/[^\w]+/g, '_')}${CUSTOM_EXT}`, JSON.stringify(payload, null, 1), 'application/json');
    dlg.toast(`Exported ${what}`);
  };
  const reportPayload = (rows) => customPayload({ reports: rows.filter((r) => !r.memo), memorized: rows.filter((r) => r.memo).map((r) => ({ ...r.memo })) });
  const excelPayload = (rows) => customPayload({ importTemplates: Object.fromEntries(rows.filter((r) => r.custom).map((r) => [r.id, company.importTemplates[r.id]])) });
  const exportRows = (rows, label) => {
    if (!rows.length) return dlg.alert(`There is nothing customized to export in ${label} yet.`);
    if (tab === 'forms') return save(customPayload({ templates: rows }), rows.length === 1 ? rows[0].name : `${fileBase}_form_templates`, plural(rows.length, 'form template'));
    if (tab === 'reports') return save(reportPayload(rows), rows.length === 1 ? rows[0].name : `${fileBase}_report_settings`, plural(rows.length, 'report setting'));
    return save(excelPayload(rows), rows.length === 1 ? rows[0].name + '_import_template' : `${fileBase}_excel_templates`, plural(rows.length, 'Excel template'));
  };
  const exportEverything = () => {
    const payload = customPayload({
      templates: api.list.filter((t) => !isStdId(t.id) || api.isCustomized(t.id)),
      reports: reportRows.filter((r) => !r.memo),
      memorized: reportRows.filter((r) => r.memo).map((r) => ({ ...r.memo })),
      importTemplates: Object.fromEntries(excelRows.filter((r) => r.custom).map((r) => [r.id, company.importTemplates[r.id]])),
    });
    if (Object.keys(payload).length <= 3) return dlg.alert('Nothing has been customized yet.');
    save(payload, `${fileBase}_all_customizations`, 'everything customized');
  };

  // ---------------- import
  const importFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const r = parseCustomFile(await file.text());
      const counts = customCounts(r);
      if (!counts.templates && !counts.reports && !counts.excel) throw new Error('No usable customizations were found in this file.');

      // things that would replace what is here
      const saved = company.reportOptions || {};
      const memoList = company.memorizedReports || [];
      const clashReports = r.reports.filter((x) => saved[x.reportId] && !isDefaultOptions(saved[x.reportId]));
      const clashMemo = r.memorized.filter((m) => memoList.some((e2) => e2.name === m.name));
      const clashExcel = Object.keys(r.importTemplates).filter((k) => isCustomTemplate(k, company.importTemplates));
      let replace = true;
      const clashes = clashReports.length + clashMemo.length + clashExcel.length;
      if (clashes) {
        replace = await dlg.confirm(`${plural(clashes, 'setting')} in this file already exist${clashes === 1 ? 's' : ''} here (${[...clashReports.map((x) => REPORT_NAMES[x.reportId]), ...clashMemo.map((m) => m.name), ...clashExcel.map((k) => KIND_LABEL[k])].slice(0, 6).join(', ')}).\n\nReplace them with the ones in the file? Choose "Keep mine" to import only the new ones.`, {
          ok: 'Replace',
          cancel: 'Keep mine',
        });
      }
      const reports = replace ? r.reports : r.reports.filter((x) => !clashReports.includes(x));
      const memo = replace ? r.memorized : r.memorized.filter((m) => !clashMemo.includes(m));
      const excel = Object.fromEntries(Object.entries(r.importTemplates).filter(([k]) => replace || !clashExcel.includes(k)));

      let size = 0;
      if (r.templates.length) size = api.saveMany(r.templates).size;
      const patch = {};
      if (reports.length) patch.reportOptions = { ...saved, ...Object.fromEntries(reports.map((x) => [x.reportId, x.options])) };
      if (memo.length) {
        const names = new Set(memo.map((m) => m.name));
        patch.memorizedReports = [...memoList.filter((m) => !names.has(m.name)), ...memo];
      }
      if (Object.keys(excel).length) patch.importTemplates = { ...(company.importTemplates || {}), ...excel };
      if (Object.keys(patch).length) updateCompany(company.id, patch);

      setTab(r.templates.length ? 'forms' : reports.length + memo.length ? 'reports' : 'excel');
      if (r.templates.length) setShowBuiltIn(false);
      const got = [
        r.templates.length && plural(r.templates.length, 'form template'),
        reports.length + memo.length && plural(reports.length + memo.length, 'report setting'),
        Object.keys(excel).length && plural(Object.keys(excel).length, 'Excel template'),
      ].filter(Boolean);
      dlg.toast(`Imported ${got.join(', ') || 'nothing new'}${r.skipped ? ` (${r.skipped} skipped)` : ''}`);
      if (size > TEMPLATE_SIZE_WARN) await dlg.alert(templateSizeWarning(size));
    } catch (err) {
      dlg.alert(err.message || 'Could not import this file.');
    }
  };

  // ---------------- row actions
  const openRow = () => {
    if (!cur) return;
    if (tab === 'forms') return nav.open('templateeditor', { templateId: cur.id, formType: cur.formType, tab: 'basic', n: Date.now() });
    if (tab === 'reports') {
      if (cur.memo) return nav.open('report', { reportId: cur.reportId, filter: cur.memo.filter, range: cur.memo.range, from: cur.memo.range === 'Custom' ? cur.memo.from : undefined, to: cur.memo.range === 'Custom' ? cur.memo.to : undefined, options: cur.options, force: true });
      return nav.report(cur.reportId);
    }
    setEditing(cur.id);
  };
  const removeRow = async () => {
    if (!cur) return;
    if (tab === 'forms') {
      const std = isStdId(cur.id);
      const msg = std ? `Reset "${cur.name}" to the built-in standard layout?` : `Delete the template "${cur.name}"?\n\nForms that used it will print with the default ${FORM_MAP[cur.formType].label} template.`;
      if (await dlg.confirm(msg, { ok: std ? 'Reset' : 'Delete', danger: true })) {
        api.remove(cur.id);
        pick(null);
      }
    } else if (tab === 'reports') {
      if (!(await dlg.confirm(`Remove the customization of "${cur.name}"?\n\nThe report goes back to its standard columns and look.${cur.memo ? ' The memorized report itself stays.' : ''}`, { ok: 'Remove', danger: true }))) return;
      if (cur.memo) updateCompany(company.id, { memorizedReports: (company.memorizedReports || []).map((m) => (m.name === cur.memo.name ? (({ options, ...rest }) => rest)(m) : m)) });
      else {
        const kept = { ...(company.reportOptions || {}) };
        delete kept[cur.reportId];
        updateCompany(company.id, { reportOptions: kept });
      }
      pick(null);
    } else {
      if (!cur.custom) return;
      const kept = { ...(company.importTemplates || {}) };
      delete kept[cur.id];
      updateCompany(company.id, { importTemplates: kept });
    }
  };
  const canRemove = cur && (tab === 'forms' ? !isStdId(cur.id) || api.isCustomized(cur.id) : tab === 'reports' ? true : cur.custom);

  const exportAllOfTab = () => exportRows(tab === 'excel' ? excelRows.filter((r) => r.custom) : tab === 'forms' ? formRows.filter((t) => !isStdId(t.id) || api.isCustomized(t.id)) : reportRows, { forms: 'form templates', reports: 'report settings', excel: 'Excel templates' }[tab]);

  return (
    <div className="win">
      <div className="win-title">
        <Sparkles size={20} />
        <h1>Customized Templates</h1>
        <span className="sub">Everything you have customized, in one list — export it to a file, import it on another computer</span>
      </div>
      <div className="toolbar flat">
        <button className="btn sm primary" onClick={() => fileRef.current?.click()} title="Import a file made with Export (form templates, report settings, Excel templates)">
          <Upload size={13} /> Import…
        </button>
        <button className="btn sm" onClick={exportEverything} title="One file with all your form templates, report settings and Excel templates">
          <Download size={13} /> Export Everything
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importFile} />
      </div>
      <Tabs
        tabs={[
          { id: 'forms', label: `Form Templates (${formRows.length})` },
          { id: 'reports', label: `Report Settings (${reportRows.length})` },
          { id: 'excel', label: 'Excel Import Templates' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="toolbar flat">
        <button className="btn sm" disabled={!cur} onClick={openRow}>
          {tab === 'reports' ? <Play size={13} /> : <Pencil size={13} />} {tab === 'reports' ? 'Open Report' : tab === 'excel' ? 'Customize…' : 'Edit'}
        </button>
        {tab === 'excel' && (
          <button className="btn sm" disabled={!cur} onClick={() => cur && downloadTemplate(cur.id, company.importTemplates)}>
            <FileSpreadsheet size={13} /> Download Excel
          </button>
        )}
        <button className="btn sm" disabled={!canRemove} onClick={removeRow}>
          {tab === 'forms' && cur && isStdId(cur.id) ? <RotateCcw size={13} /> : <Trash2 size={13} />} {tab === 'forms' ? (cur && isStdId(cur.id) ? 'Reset' : 'Delete') : tab === 'excel' ? 'Reset' : 'Remove'}
        </button>
        <span className="sp" />
        {tab === 'forms' && (
          <label className="check small">
            <input type="checkbox" checked={showBuiltIn} onChange={(e) => setShowBuiltIn(e.target.checked)} /> Show built-in templates
          </label>
        )}
        <button className="btn sm" disabled={!cur || (tab === 'excel' && !cur.custom)} onClick={() => exportRows([cur], 'this item')}>
          <Download size={13} /> Export
        </button>
        <button className="btn sm" onClick={exportAllOfTab}>
          <Download size={13} /> Export All
        </button>
      </div>

      <div className="win-body tbl-wrap">
        {tab === 'forms' && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Template</th>
                <th>Form</th>
                <th>Paper</th>
                <th>Kind</th>
                <th className="c">Default</th>
              </tr>
            </thead>
            <tbody>
              {formRows.map((t) => (
                <tr key={t.id} className={t.id === sel.forms ? 'sel' : ''} onClick={() => pick(t.id)} onDoubleClick={openRow}>
                  <td>{t.name}</td>
                  <td>{FORM_MAP[t.formType].label}</td>
                  <td className="muted">{(PAPERS[t.page.size]?.label || '').split(' (')[0]}</td>
                  <td className="muted">{isStdId(t.id) ? (api.isCustomized(t.id) ? 'Built-in, changed' : 'Built-in') : 'Your template'}</td>
                  <td className="c">{api.defaultId(t.formType) === t.id ? '★' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'reports' && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Report</th>
                <th>Where</th>
                <th>What is customized</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map((r) => (
                <tr key={r.id} className={r.id === sel.reports ? 'sel' : ''} onClick={() => pick(r.id)} onDoubleClick={openRow}>
                  <td>
                    {r.name}
                    {r.memo && <span className="muted small"> · {REPORT_NAMES[r.reportId]}</span>}
                  </td>
                  <td className="muted">{r.kind}</td>
                  <td>{describeOptions(r.options)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'excel' && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Page</th>
                <th className="r">Columns</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {excelRows.map((r) => (
                <tr key={r.id} className={r.id === sel.excel ? 'sel' : ''} onClick={() => pick(r.id)} onDoubleClick={openRow}>
                  <td>{r.name}</td>
                  <td className="r">
                    {r.shown} of {r.total}
                  </td>
                  <td className="muted">{r.custom ? 'Customized' : 'Standard'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab !== 'excel' && !rowsOf.length && (
          <div className="empty" style={{ padding: 28, textAlign: 'center' }}>
            {tab === 'forms' ? (
              <>
                No customized form templates yet. Make one in <b>Lists › Templates</b>, or Import a file.
              </>
            ) : (
              <>
                No customized reports yet. Open any report and click <SlidersHorizontal size={12} /> <b>Customize</b>, or Import a file.
              </>
            )}
          </div>
        )}
      </div>
      {tab === 'forms' && (
        <div className="muted small" style={{ padding: '6px 14px' }}>
          <Files size={12} /> Full template list with previews: Lists › Templates.
        </div>
      )}
      {editing && (
        <ExcelTemplateModal
          kind={editing}
          cfg={company.importTemplates?.[editing]}
          onClose={() => setEditing(null)}
          onSave={(cfg) => {
            const next = { ...(company.importTemplates || {}) };
            if (cfg) next[editing] = cfg;
            else delete next[editing];
            updateCompany(company.id, { importTemplates: next });
            setEditing(null);
            dlg.toast(`${KIND_LABEL[editing]} template ${cfg ? 'saved' : 'reset to standard'}`);
          }}
        />
      )}
    </div>
  );
}

// Which columns the Excel template has, and what each is called. Required columns can't be left out.
function ExcelTemplateModal({ kind, cfg, onClose, onSave }) {
  const dlg = useDialog();
  const spec = SPECS[kind];
  const [hidden, setHidden] = useState(() => new Set(cfg?.hidden || []));
  const [heads, setHeads] = useState(() => ({ ...(cfg?.heads || {}) }));
  const result = () => {
    const h = {};
    Object.entries(heads).forEach(([k, v]) => v.trim() && (h[k] = v.trim().slice(0, 60)));
    const hid = spec.fields.filter((f) => !f.req && hidden.has(f.key)).map((f) => f.key);
    return hid.length || Object.keys(h).length ? { hidden: hid, heads: h } : null;
  };
  const submit = () => {
    const c = result();
    const names = spec.fields.filter((f) => f.req || !hidden.has(f.key)).map((f) => (c?.heads[f.key] || f.head).toLowerCase());
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) return dlg.alert(`Two columns are both called "${dup}". Give each column its own heading.`);
    onSave(c);
  };
  return (
    <Modal
      title={`Customize ${KIND_LABEL[kind]} template`}
      onClose={onClose}
      width={600}
      footer={
        <>
          <button className="btn ghost" onClick={() => (setHidden(new Set()), setHeads({}))}>
            <RotateCcw size={14} /> Standard
          </button>
          <span className="sp" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            OK
          </button>
        </>
      }
    >
      <div className="muted small" style={{ marginBottom: 8 }}>
        Tick the columns the Excel file should have and type your own heading. Importing still understands the standard headings too. Required columns are always there.
      </div>
      <div className="cr-cols">
        {spec.fields.map((f) => (
          <div key={f.key} className="cr-col">
            <label className="check">
              <input
                type="checkbox"
                checked={f.req || !hidden.has(f.key)}
                disabled={f.req}
                onChange={() =>
                  setHidden((s) => {
                    const n = new Set(s);
                    n.has(f.key) ? n.delete(f.key) : n.add(f.key);
                    return n;
                  })
                }
              />
            </label>
            <input
              value={heads[f.key] ?? ''}
              placeholder={f.head}
              disabled={!f.req && hidden.has(f.key)}
              onChange={(e) => setHeads((h) => ({ ...h, [f.key]: e.target.value }))}
              aria-label={'Heading of ' + f.head}
            />
            {f.req && <span className="cr-tag">required</span>}
          </div>
        ))}
      </div>
    </Modal>
  );
}
