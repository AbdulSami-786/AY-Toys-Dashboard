import { useMemo, useRef, useState } from 'react';
import { Files, Plus, Pencil, Columns3, LayoutTemplate, Copy, Star, Trash2, RotateCcw, Printer, Download, Upload } from 'lucide-react';
import { useStore } from '../../store/store';
import { useWindowKeys } from '../../store/windows';
import { useNav } from '../../store/nav';
import { useTemplates } from '../../store/templates';
import { useDialog, Modal } from '../../components/ui';
import { Field } from '../../components/inputs';
import { useListNav } from '../../components/listnav';
import { usePrint, TemplatePrint } from '../../components/print';
import { PageSheet, fitScale } from '../../components/TemplateDoc';
import { TEMPLATE_FORMS, FORM_MAP, sampleDoc, newTemplateFrom, isStdId, PAPERS, templateExportPayload, parseTemplateFile } from '../../lib/templates';
import { useWidth } from '../../components/useWidth';
import { downloadFile } from '../../lib/format';
import { TEMPLATE_SIZE_WARN, templateSizeWarning } from '../../store/templates';

export default function Templates({ formType: initialType = '' }) {
  const { company } = useStore();
  const api = useTemplates();
  const nav = useNav();
  const dlg = useDialog();
  const print = usePrint();
  const [filter, setFilter] = useState(initialType || 'all');
  const [sel, setSel] = useState(null);
  const [creating, setCreating] = useState(false);
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const prevRef = useRef(null);
  const pw = useWidth(prevRef);

  const rows = api.list.filter((t) => filter === 'all' || t.formType === filter);
  const cur = rows.find((r) => r.id === sel) || rows[0];
  const ctx = useMemo(() => (cur ? sampleDoc(cur.formType, company, cur) : null), [cur, company]);
  const { keys, onTypeAhead } = useListNav(rows, cur?.id, setSel, { containerRef: listRef });

  const edit = (tab = 'basic', t = cur) => t && nav.open('templateeditor', { templateId: t.id, formType: t.formType, tab, n: Date.now() });
  const duplicate = () => {
    if (!cur) return;
    const copy = newTemplateFrom(cur, 'Copy of ' + cur.name);
    api.save(copy);
    setSel(copy.id);
    dlg.toast(`Created "${copy.name}"`);
  };
  const remove = async () => {
    if (!cur) return;
    if (isStdId(cur.id)) {
      if (!api.isCustomized(cur.id)) return;
      if (await dlg.confirm(`Reset "${cur.name}" to the built-in standard layout?`, { ok: 'Reset', danger: true })) api.remove(cur.id);
      return;
    }
    if (await dlg.confirm(`Delete the template "${cur.name}"?\n\nForms that used it will print with the default ${FORM_MAP[cur.formType].label} template.`, { ok: 'Delete', danger: true })) {
      api.remove(cur.id);
      setSel(null);
    }
  };
  const exportTemplates = (list, fileName) => {
    if (!list.length) return;
    downloadFile(`${fileName.replace(/[^\w]+/g, '_')}.aytemplate.json`, JSON.stringify(templateExportPayload(list), null, 1), 'application/json');
    dlg.toast(list.length === 1 ? `Exported "${list[0].name}"` : `Exported ${list.length} templates`);
  };
  const importFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { templates, skipped } = parseTemplateFile(await file.text());
      if (!templates.length) throw new Error('No usable templates were found in this file.');
      const { size } = api.saveMany(templates);
      setFilter('all');
      setSel(templates[0].id);
      dlg.toast(`Imported ${templates.length} template${templates.length === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped)` : ''}`);
      if (size > TEMPLATE_SIZE_WARN) await dlg.alert(templateSizeWarning(size));
    } catch (err) {
      dlg.alert(err.message || 'Could not import this file.');
    }
  };
  const makeDefault = () => {
    if (!cur) return;
    api.setDefault(cur.formType, cur.id);
    dlg.toast(`"${cur.name}" is now the default ${FORM_MAP[cur.formType].label} template`);
  };

  useWindowKeys({
    ...keys,
    enter: () => edit(),
    'ctrl+e': () => edit(),
    'ctrl+n': () => setCreating(true),
    'ctrl+d': remove,
    'ctrl+p': () => cur && print(<TemplatePrint template={cur} ctx={ctx} />),
  });

  const canDelete = cur && (!isStdId(cur.id) || api.isCustomized(cur.id));

  return (
    <div className="win">
      <div className="win-title">
        <Files size={20} />
        <h1>Templates</h1>
        <span className="sub">Design how invoices, bills, receipts and vouchers look on screen and on paper</span>
      </div>
      <div className="toolbar flat">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 200 }}>
          <option value="all">All forms</option>
          {TEMPLATE_FORMS.map((f) => (
            <option key={f.type} value={f.type}>
              {f.label}
            </option>
          ))}
        </select>
        <button className="btn sm primary" onClick={() => setCreating(true)}>
          <Plus size={13} /> New Template
        </button>
        <button className="btn sm" disabled={!cur} onClick={() => edit('basic')}>
          <Pencil size={13} /> Edit
        </button>
        <button className="btn sm" disabled={!cur} onClick={() => edit('data')}>
          <Columns3 size={13} /> Data Layout
        </button>
        <button className="btn sm" disabled={!cur} onClick={() => edit('designer')}>
          <LayoutTemplate size={13} /> Layout Designer
        </button>
        <button className="btn sm" disabled={!cur} onClick={duplicate}>
          <Copy size={13} /> Duplicate
        </button>
        <button className="btn sm" disabled={!cur || api.defaultId(cur.formType) === cur.id} onClick={makeDefault}>
          <Star size={13} /> Make Default
        </button>
        <button className="btn sm" disabled={!canDelete} onClick={remove}>
          {cur && isStdId(cur.id) ? <RotateCcw size={13} /> : <Trash2 size={13} />} {cur && isStdId(cur.id) ? 'Reset' : 'Delete'}
        </button>
        <span className="sp" />
        <button className="btn sm" onClick={() => fileRef.current?.click()}>
          <Upload size={13} /> Import
        </button>
        <button className="btn sm" disabled={!cur} onClick={() => exportTemplates([cur], cur.name)}>
          <Download size={13} /> Export
        </button>
        <button className="btn sm" disabled={!rows.length} onClick={() => exportTemplates(rows, `${company.name}_templates`)}>
          <Download size={13} /> Export All
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importFile} />
        <button className="btn sm" disabled={!cur} onClick={() => print(<TemplatePrint template={cur} ctx={ctx} />)}>
          <Printer size={13} /> Print Sample
        </button>
      </div>
      <div className="tpl-list">
        <div className="tbl-wrap" ref={listRef} tabIndex={-1} onKeyDown={onTypeAhead}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Template</th>
                <th>Form</th>
                <th>Paper</th>
                <th className="c">Default</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} data-id={t.id} className={t.id === cur?.id ? 'sel' : ''} onClick={() => setSel(t.id)} onDoubleClick={() => edit('basic', t)}>
                  <td>
                    {t.name}
                    {isStdId(t.id) && !api.isCustomized(t.id) && <span className="muted small"> · built-in</span>}
                  </td>
                  <td>{FORM_MAP[t.formType].label}</td>
                  <td className="muted">{(PAPERS[t.page.size]?.label || '').split(' (')[0]}</td>
                  <td className="c">{api.defaultId(t.formType) === t.id && <Star size={13} className="star" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tpl-side" ref={prevRef}>
          {cur && ctx && pw > 0 && (
            <>
              <div className="tpl-side-head">
                <b>{cur.name}</b>
                <span className="muted small">Sample data · double-click a row to edit</span>
              </div>
              <div className="tpl-side-stage" onDoubleClick={() => edit('designer')}>
                <PageSheet template={cur} ctx={ctx} scale={fitScale(cur, pw - 40)} />
              </div>
            </>
          )}
        </div>
      </div>
      {creating && (
        <NewTemplateModal
          initialType={filter !== 'all' ? filter : cur?.formType || 'invoice'}
          list={api.list}
          onClose={() => setCreating(false)}
          onCreate={(draft) => {
            setCreating(false);
            nav.open('templateeditor', { draft, formType: draft.formType, tab: 'basic', n: Date.now() });
          }}
        />
      )}
    </div>
  );
}

function NewTemplateModal({ initialType, list, onClose, onCreate }) {
  const [type, setType] = useState(initialType);
  const options = list.filter((t) => t.formType === type);
  const [baseId, setBaseId] = useState('');
  const base = options.find((t) => t.id === baseId) || options[0];
  const [name, setName] = useState('');
  const create = () => {
    if (!base) return;
    onCreate(newTemplateFrom(base, name.trim() || 'My ' + FORM_MAP[type].label));
  };
  return (
    <Modal
      title="New Template"
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={create}>
            Create &amp; Customize
          </button>
        </>
      }
    >
      <div className="grid2">
        <Field label="Form" className="span2">
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setBaseId('');
            }}
          >
            {TEMPLATE_FORMS.map((f) => (
              <option key={f.type} value={f.type}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start from" className="span2">
          <select value={base?.id || ''} onChange={(e) => setBaseId(e.target.value)}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Template name" className="span2">
          <input autoFocus value={name} placeholder={'My ' + FORM_MAP[type].label} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
        </Field>
      </div>
    </Modal>
  );
}
