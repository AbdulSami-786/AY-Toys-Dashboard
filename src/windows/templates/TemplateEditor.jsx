import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutTemplate, Printer, RotateCcw, Save, Upload, Trash2, ArrowUp, ArrowDown, Plus, PenLine, Type } from 'lucide-react';
import { useStore, useLookups } from '../../store/store';
import { useWindows, useWindowKeys } from '../../store/windows';
import { useTemplates, readLogo, SHEET_CELL_LIMIT } from '../../store/templates';
import { useDialog, Tabs } from '../../components/ui';
import { Field } from '../../components/inputs';
import { usePrint, TemplatePrint } from '../../components/print';
import { PageSheet, fitScale } from '../../components/TemplateDoc';
import { useWidth } from '../../components/useWidth';
import {
  FORM_MAP,
  PAPERS,
  FONTS,
  FIELDS,
  SCREEN_COLUMNS,
  formCat,
  contentSize,
  standardTemplate,
  normalizeTemplate,
  defaultLayout,
  rescaleBoxes,
  narrowColumns,
  buildDocContext,
  sampleDoc,
  fieldsForForm,
  defaultFieldLabel,
  defaultColumnLabel,
  screenable,
  fieldPrinted,
  setFieldPrinted,
  addBox,
  isStdId,
  boxPreset,
} from '../../lib/templates';
import { money, num } from '../../lib/format';
import { fmtDate } from '../../lib/dates';
import Designer from './Designer';

const inInput = (e) => e?.target instanceof Element && !!e.target.closest('input, textarea, select');

export default function TemplateEditor({ templateId, formType, draft, tab: initialTab = 'basic', winId }) {
  const { company, data, ledger, updateCompany } = useStore();
  const L = useLookups();
  const api = useTemplates();
  const dlg = useDialog();
  const print = usePrint();
  const { close, setTitle } = useWindows();

  const [t, setT] = useState(() => normalizeTemplate(draft || api.get(templateId, formType)));
  const [tab, setTab] = useState(initialTab);
  const [sel, setSel] = useState(null);
  const [previewId, setPreviewId] = useState('sample');
  const [makeDefault, setMakeDefault] = useState(() => api.defaultId(t.formType) === t.id);
  const snapshot = useRef(draft ? '' : JSON.stringify(t));
  const tRef = useRef(t);
  tRef.current = t;
  const past = useRef([]);
  const future = useRef([]);
  const form = FORM_MAP[t.formType];
  const cat = formCat(t.formType);
  const dirty = JSON.stringify(t) !== snapshot.current || makeDefault !== (api.defaultId(t.formType) === t.id);

  useEffect(() => setTitle(winId, 'Template: ' + (t.name || 'Untitled')), [t.name, winId, setTitle]);

  // ----- history -----
  const pushHistory = () => {
    past.current.push(tRef.current);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
  };
  const update = (fn) => {
    pushHistory();
    setT((p) => (typeof fn === 'function' ? fn(p) : fn));
  };
  const undo = () => {
    if (!past.current.length) return;
    future.current.push(tRef.current);
    setT(past.current.pop());
  };
  const redo = () => {
    if (!future.current.length) return;
    past.current.push(tRef.current);
    setT(future.current.pop());
  };

  // ----- setters -----
  const set = (k) => (e) => update((p) => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const setStyle = (k, v) => update((p) => ({ ...p, style: { ...p.style, [k]: v } }));
  const setCo = (k, v) => update((p) => ({ ...p, company: { ...p.company, [k]: v } }));
  const setLabel = (field, v) => update((p) => ({ ...p, labels: { ...p.labels, [field]: v } }));
  const setScreen = (k, v) => update((p) => ({ ...p, screen: { ...p.screen, [k]: v } }));
  const setBox = (id, patch) => update((p) => ({ ...p, boxes: p.boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  const removeBox = (id) => update((p) => ({ ...p, boxes: p.boxes.filter((b) => b.id !== id) }));
  const setCol = (key, patch) => update((p) => ({ ...p, columns: p.columns.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));
  const moveCol = (key, d) =>
    update((p) => {
      const cols = [...p.columns];
      const i = cols.findIndex((c) => c.key === key);
      const j = i + d;
      if (j < 0 || j >= cols.length) return p;
      [cols[i], cols[j]] = [cols[j], cols[i]];
      return { ...p, columns: cols };
    });

  const setPage = async (k, v) => {
    const prev = tRef.current;
    let page = { ...prev.page, [k]: v };
    let style = prev.style;
    if (k === 'size' && v === 'R80') {
      page = { ...page, margin: 3, orientation: 'portrait' };
      style = { ...style, footerAtBottom: false, fontSize: Math.min(num(style.fontSize) || 9, 8) };
    }
    const oldW = contentSize(prev.page).w;
    const newW = contentSize(page).w;
    let next = { ...prev, page, style };
    if ((oldW >= 140) !== (newW >= 140) && (await dlg.confirm(`The printable width changes from ${oldW} mm to ${newW} mm.\n\nRe-arrange the boxes for the new paper? (Recommended — otherwise they are just squeezed or stretched.)`, { ok: 'Re-arrange', cancel: 'Just resize' }))) {
      next = { ...next, ...defaultLayout(prev.formType, newW) };
      if (newW < 100) next = { ...next, columns: narrowColumns(next) };
    } else next = rescaleBoxes(next, oldW, newW);
    update(next);
  };

  // ----- logo (stored once per company) -----
  const logoFile = useRef(null);
  const logoBox = t.boxes.find((b) => b.kind === 'logo');
  const showLogo = (on) =>
    update((p) => {
      const lb = p.boxes.find((b) => b.kind === 'logo');
      if (lb) return { ...p, boxes: p.boxes.map((b) => (b.kind === 'logo' ? { ...b, hidden: !on } : b)) };
      if (!on) return p;
      const preset = boxPreset('logo');
      const W = contentSize(p.page).w;
      const narrow = W < 140;
      const logo = { ...addBox(p, 'header', 'logo').boxes.at(-1), x: narrow ? (W - preset.w) / 2 : 0, y: 0 };
      let boxes = p.boxes.map((b) => {
        if (narrow) return b.band === 'header' ? { ...b, y: b.y + preset.h + 2 } : b;
        if (b.kind === 'field' && b.field === 'companyBlock' && b.x < preset.w + 2) return { ...b, x: preset.w + 3, w: Math.max(30, b.w - (preset.w + 3 - b.x)) };
        return b;
      });
      boxes = [...boxes, logo];
      return { ...p, boxes, headerHeight: narrow ? p.headerHeight + preset.h + 2 : p.headerHeight };
    });
  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const url = await readLogo(file);
      updateCompany(company.id, { logo: url });
      if (!logoBox || logoBox.hidden) showLogo(true);
      dlg.toast('Logo uploaded');
    } catch (err) {
      dlg.alert(err.message);
    }
  };

  // ----- preview data -----
  const recent = useMemo(
    () =>
      data.txns
        .filter((x) => x.type === t.formType)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 30),
    [data.txns, t.formType],
  );
  const ctx = useMemo(() => {
    const txn = previewId !== 'sample' && data.txns.find((x) => x.id === previewId);
    return txn ? buildDocContext({ txn, company, L, ledger, template: t }) : sampleDoc(t.formType, company, t);
  }, [previewId, t, company, data.txns, L, ledger]);

  // ----- save / close -----
  const save = async (andClose) => {
    if (!t.name.trim()) {
      await dlg.alert('Give the template a name.');
      setTab('basic');
      return false;
    }
    const clash = api.list.find((x) => x.id !== t.id && x.formType === t.formType && x.name.trim().toLowerCase() === t.name.trim().toLowerCase());
    if (clash && !(await dlg.confirm(`Another ${form.label} template is already called "${t.name}". Save anyway?`))) return false;
    const { size } = api.save(t);
    const wasDefault = api.defaultId(t.formType) === t.id;
    if (makeDefault && !wasDefault) api.setDefault(t.formType, t.id);
    if (!makeDefault && wasDefault && !isStdId(t.id)) api.setDefault(t.formType, 'std-' + t.formType);
    snapshot.current = JSON.stringify(t);
    dlg.toast(`Template "${t.name}" saved`);
    if (size > SHEET_CELL_LIMIT * 0.9)
      await dlg.alert(
        `Your templates now use ${Math.round(size / 1000)} KB. A Google Sheet cell holds about ${SHEET_CELL_LIMIT / 1000} KB, so Google Sheets sync of company settings may fail.\n\nDelete templates you no longer need, or remove some text boxes.`,
      );
    if (andClose) close(winId);
    return true;
  };
  const guardClose = async () => {
    if (dirty && !(await dlg.confirm('Discard the changes to this template?', { ok: 'Discard changes', danger: true }))) return;
    close(winId);
  };
  const resetStd = async () => {
    if (!(await dlg.confirm(`Reset "${t.name}" to the standard ${form.label} layout?\n\nAll fields, columns and boxes go back to the built-in design (you can still Cancel without saving).`, { ok: 'Reset layout' })))
      return;
    const std = standardTemplate(t.formType);
    update({ ...std, id: t.id, name: t.name });
    setSel(null);
  };
  const printTest = () => print(<TemplatePrint template={t} ctx={ctx} />);

  useWindowKeys({
    'ctrl+s': () => save(false),
    'alt+s': () => save(false),
    'alt+a': () => save(true),
    'ctrl+p': printTest,
    'ctrl+z': (e) => (inInput(e) ? false : undo()),
    'ctrl+y': (e) => (inInput(e) ? false : redo()),
    'ctrl+shift+z': (e) => (inInput(e) ? false : redo()),
    esc: () => (tab === 'designer' && sel ? setSel(null) : guardClose()),
  });

  const designer = {
    t,
    ctx,
    sel,
    setSel,
    update,
    setT,
    pushHistory,
    setBox,
    removeBox,
    setLabel,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };

  return (
    <div className="win">
      <div className="win-title">
        <LayoutTemplate size={20} />
        <h1>Customize Template</h1>
        <span className="sub">
          {t.name || 'Untitled'} · {form.label}
          {dirty && <span className="badge warn" style={{ marginLeft: 8 }}>Unsaved</span>}
        </span>
      </div>
      <Tabs
        tabs={[
          { id: 'basic', label: 'Basic Customization' },
          { id: 'data', label: 'Customize Data Layout' },
          { id: 'designer', label: 'Layout Designer' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'designer' ? (
        <Designer {...designer} />
      ) : (
        <div className="tpl-ed">
          <div className="tpl-settings">
            {tab === 'basic' ? (
              <BasicPanel
                t={t}
                form={form}
                set={set}
                setStyle={setStyle}
                setCo={setCo}
                setPage={setPage}
                makeDefault={makeDefault}
                setMakeDefault={setMakeDefault}
                logo={company.logo}
                logoOn={!!logoBox && !logoBox.hidden}
                showLogo={showLogo}
                pickLogo={() => logoFile.current?.click()}
                removeLogo={async () => (await dlg.confirm('Remove the company logo from all templates?', { ok: 'Remove', danger: true })) && updateCompany(company.id, { logo: '' })}
                relayout={async () => {
                  if (!(await dlg.confirm('Put every box back in its standard position for this paper size? Labels, columns and options are kept.', { ok: 'Re-arrange' }))) return;
                  update((p) => ({ ...p, ...defaultLayout(p.formType, contentSize(p.page).w) }));
                }}
              />
            ) : (
              <DataLayoutPanel
                t={t}
                cat={cat}
                update={update}
                setLabel={setLabel}
                setScreen={setScreen}
                setBox={setBox}
                removeBox={removeBox}
                setCol={setCol}
                moveCol={moveCol}
                setTitleText={set('title')}
                goDesigner={(id) => {
                  setSel(id || null);
                  setTab('designer');
                }}
              />
            )}
          </div>
          <PreviewPane
            t={t}
            ctx={ctx}
            recent={recent}
            previewId={previewId}
            setPreviewId={setPreviewId}
            L={L}
            company={company}
            onPickBox={(id) => {
              setSel(id);
              setTab('designer');
            }}
          />
        </div>
      )}
      <input ref={logoFile} type="file" accept="image/*" hidden onChange={uploadLogo} />
      <div className="txn-actions">
        <button className="btn" onClick={printTest} title="Print this template with the preview data (Ctrl+P)">
          <Printer size={14} /> Print Test Page
        </button>
        <button className="btn" onClick={resetStd}>
          <RotateCcw size={14} /> Reset to Standard
        </button>
        <span className="sp" />
        <span className="muted small">Ctrl+S Save · Alt+A Save &amp; Close · Ctrl+Z Undo</span>
        <button className="btn" onClick={guardClose}>
          Cancel
        </button>
        <button className="btn" onClick={() => save(false)}>
          <Save size={14} /> Save
        </button>
        <button className="btn primary" onClick={() => save(true)}>
          Save &amp; Close
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- preview

function PreviewPane({ t, ctx, recent, previewId, setPreviewId, L, company, onPickBox }) {
  const ref = useRef(null);
  const w = useWidth(ref);
  return (
    <div className="tpl-preview">
      <div className="toolbar flat">
        <span className="small muted">Preview with</span>
        <select value={previewId} onChange={(e) => setPreviewId(e.target.value)} style={{ width: 300 }}>
          <option value="sample">Sample data</option>
          {recent.map((x) => (
            <option key={x.id} value={x.id}>
              #{x.num || '—'} · {fmtDate(x.date, company.dateStyle)} · {L.nameOf(x.customerId || x.vendorId) || '—'} · {money(x.total ?? x.amount ?? 0)}
            </option>
          ))}
        </select>
        <span className="sp small muted">Click any box to move or resize it</span>
      </div>
      <div
        className="tpl-stage"
        ref={ref}
        onClick={(e) => {
          const id = e.target.closest?.('[data-box]')?.dataset.box;
          if (id) onPickBox(id);
        }}
      >
        {w > 0 && <PageSheet template={t} ctx={ctx} scale={fitScale(t, Math.min(w - 32, 900))} className="clickable" />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Basic Customization

function BasicPanel({ t, form, set, setStyle, setCo, setPage, makeDefault, setMakeDefault, logo, logoOn, showLogo, pickLogo, removeLogo, relayout }) {
  const st = t.style;
  const accentCustom = !!st.accent;
  return (
    <>
      <div className="section-title" style={{ marginTop: 0 }}>
        Template
      </div>
      <div className="grid2">
        <Field label="Template name" className="span2">
          <input value={t.name} onChange={set('name')} autoFocus />
        </Field>
        <Field label="Form">
          <input value={form.label} disabled />
        </Field>
        <Field label="Title printed on the form">
          <input value={t.title} onChange={set('title')} />
        </Field>
      </div>
      <label className="check mt">
        <input type="checkbox" checked={makeDefault} disabled={makeDefault && isStdId(t.id)} onChange={(e) => setMakeDefault(e.target.checked)} />
        Use as the default template for new {form.label.toLowerCase()}s
      </label>

      <div className="section-title">Logo</div>
      <div className="logo-row">
        <div className="logo-thumb">{logo ? <img src={logo} alt="Company logo" /> : <span className="muted small">No logo</span>}</div>
        <div className="flex" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <div className="flex">
            <button className="btn sm" onClick={pickLogo}>
              <Upload size={13} /> {logo ? 'Change logo…' : 'Upload logo…'}
            </button>
            {logo && (
              <button className="btn sm" onClick={removeLogo}>
                <Trash2 size={13} /> Remove
              </button>
            )}
          </div>
          <label className="check">
            <input type="checkbox" checked={logoOn} onChange={(e) => showLogo(e.target.checked)} /> Print the logo on this template
          </label>
          <span className="muted small">One logo per company, shared by all templates. PNG with a transparent background looks best.</span>
        </div>
      </div>

      <div className="section-title">Company &amp; transaction information</div>
      <div className="check-grid">
        {[
          ['name', 'Company name'],
          ['address', 'Address'],
          ['phone', 'Phone number'],
          ['email', 'E-mail address'],
          ['website', 'Web site'],
          ['ntn', 'NTN / Tax ID'],
        ].map(([k, label]) => (
          <label key={k} className="check">
            <input type="checkbox" checked={!!t.company[k]} onChange={(e) => setCo(k, e.target.checked)} /> {label}
          </label>
        ))}
        <label className="check">
          <input type="checkbox" checked={!!st.stamps} onChange={(e) => setStyle('stamps', e.target.checked)} /> Print status stamp (PAID / VOID)
        </label>
      </div>
      <p className="muted small">Edit the company details themselves in Company › Company Information.</p>

      <div className="section-title">Fonts &amp; colors</div>
      <div className="grid2">
        <Field label="Font">
          <select value={st.font} onChange={(e) => setStyle('font', e.target.value)}>
            {Object.entries(FONTS).map(([k, f]) => (
              <option key={k} value={k} style={{ fontFamily: f.css }}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Base size (pt)">
          <input type="number" min={6} max={16} step={0.5} className="num" value={st.fontSize} onChange={(e) => setStyle('fontSize', num(e.target.value) || 9)} />
        </Field>
        <Field label="Color scheme">
          <div className="flex">
            <select value={accentCustom ? 'custom' : 'theme'} onChange={(e) => setStyle('accent', e.target.value === 'custom' ? '#1f3b64' : '')} style={{ flex: 1 }}>
              <option value="theme">Company theme color</option>
              <option value="custom">Custom color</option>
            </select>
            {accentCustom && <input type="color" value={st.accent} onChange={(e) => setStyle('accent', e.target.value)} />}
          </div>
        </Field>
        <Field label="Table header">
          <select value={st.tableHeader} onChange={(e) => setStyle('tableHeader', e.target.value)}>
            <option value="shade">Light shade</option>
            <option value="accent">Solid color</option>
            <option value="plain">Plain (underlined)</option>
          </select>
        </Field>
        <Field label="Table lines">
          <select value={st.borders} onChange={(e) => setStyle('borders', e.target.value)}>
            <option value="grid">Grid (rows &amp; columns)</option>
            <option value="columns">Column lines only</option>
            <option value="rows">Row lines only</option>
            <option value="none">No lines</option>
          </select>
        </Field>
        <label className="check" style={{ alignSelf: 'end', paddingBottom: 6 }}>
          <input type="checkbox" checked={!!st.zebra} onChange={(e) => setStyle('zebra', e.target.checked)} /> Shade alternate rows
        </label>
      </div>

      <div className="section-title">Page</div>
      <div className="grid2">
        <Field label="Paper size">
          <select value={t.page.size} onChange={(e) => setPage('size', e.target.value)}>
            {Object.entries(PAPERS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Orientation">
          <select value={t.page.orientation} disabled={t.page.size === 'R80'} onChange={(e) => setPage('orientation', e.target.value)}>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </Field>
        <Field label="Margins (mm)">
          <input type="number" min={0} max={40} step={1} className="num" value={t.page.margin} onChange={(e) => setPage('margin', Math.max(0, Math.min(40, num(e.target.value))))} />
        </Field>
        <label className="check" style={{ alignSelf: 'end', paddingBottom: 6 }}>
          <input type="checkbox" checked={!!st.footerAtBottom} onChange={(e) => setStyle('footerAtBottom', e.target.checked)} /> Keep footer at the bottom of the page
        </label>
      </div>
      <button className="btn sm mt" onClick={relayout}>
        <RotateCcw size={13} /> Re-arrange boxes for this paper
      </button>

      <div className="section-title">Amount in words</div>
      <div className="grid3">
        <Field label="Currency word">
          <input value={st.wordsCurrency} onChange={(e) => setStyle('wordsCurrency', e.target.value)} placeholder="Rupees" />
        </Field>
        <Field label="Fraction word">
          <input value={st.wordsFraction} onChange={(e) => setStyle('wordsFraction', e.target.value)} placeholder="Paisa" />
        </Field>
        <Field label="Number system">
          <select value={st.wordsSystem} onChange={(e) => setStyle('wordsSystem', e.target.value)}>
            <option value="southasian">Lakh / Crore</option>
            <option value="intl">Million / Billion</option>
          </select>
        </Field>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Customize Data Layout

function DataLayoutPanel({ t, cat, update, setLabel, setScreen, setBox, removeBox, setCol, moveCol, setTitleText, goDesigner }) {
  const [sub, setSub] = useState('header');
  const ft = t.formType;
  const headerFields = ['title', ...fieldsForForm(ft, 'Header').filter((f) => f !== 'title')];
  const footerFields = fieldsForForm(ft, 'Footer');
  const totalFields = fieldsForForm(ft, 'Totals');
  const extras = t.boxes.filter((b) => b.kind === 'text' || b.kind === 'sign');
  const screenCols = SCREEN_COLUMNS[cat] || [];

  // plain render function (not a component) so inputs keep focus while typing
  const fieldRow = (f) => {
    const canScreen = screenable(f, ft);
    return (
      <tr key={f}>
        <td>{FIELDS[f].label === defaultFieldLabel(f, ft) ? FIELDS[f].label : `${FIELDS[f].label} (${defaultFieldLabel(f, ft)})`}</td>
        <td className="c">{canScreen ? <input type="checkbox" checked={t.screen[f] !== false} onChange={(e) => setScreen(f, e.target.checked)} /> : null}</td>
        <td className="c">
          <input type="checkbox" checked={fieldPrinted(t, f)} onChange={(e) => update((p) => setFieldPrinted(p, f, e.target.checked))} />
        </td>
        <td>
          {f === 'title' ? (
            <input value={t.title} onChange={setTitleText} />
          ) : f === 'totals' ? (
            <span className="muted small">Subtotal, tax, total, balance (titles below)</span>
          ) : (
            <input value={t.labels[f] ?? ''} placeholder={defaultFieldLabel(f, ft)} onChange={(e) => setLabel(f, e.target.value)} />
          )}
        </td>
      </tr>
    );
  };

  return (
    <>
      <p className="muted small" style={{ marginTop: 0 }}>
        <b>Screen</b> shows the field on the entry form, <b>Print</b> puts its box on the printed form, <b>Title</b> renames it. New boxes appear under the others — use the{' '}
        <button className="linkish" onClick={() => goDesigner()}>
          Layout Designer
        </button>{' '}
        to move them.
      </p>
      <Tabs
        tabs={[
          { id: 'header', label: 'Header' },
          { id: 'columns', label: 'Columns' },
          { id: 'footer', label: 'Footer' },
        ]}
        value={sub}
        onChange={setSub}
        className="mb"
      />
      {sub === 'header' && (
        <table className="tbl dl-tbl">
          <thead>
            <tr>
              <th>Field</th>
              <th className="c">Screen</th>
              <th className="c">Print</th>
              <th>Title</th>
            </tr>
          </thead>
          <tbody>
            {headerFields.map(fieldRow)}
          </tbody>
        </table>
      )}
      {sub === 'columns' && (
        <>
          <table className="tbl dl-tbl">
            <thead>
              <tr>
                <th>Column</th>
                <th className="c">Screen</th>
                <th className="c">Print</th>
                <th>Title</th>
                <th className="r">Width</th>
                <th className="c">Order</th>
              </tr>
            </thead>
            <tbody>
              {t.columns.map((c, i) => (
                <tr key={c.key}>
                  <td>{defaultColumnLabel(c.key, ft)}</td>
                  <td className="c">{screenCols.includes(c.key) ? <input type="checkbox" checked={c.screen !== false} onChange={(e) => setCol(c.key, { screen: e.target.checked })} /> : null}</td>
                  <td className="c">
                    <input type="checkbox" checked={!!c.print} onChange={(e) => setCol(c.key, { print: e.target.checked })} />
                  </td>
                  <td>
                    <input value={c.label || ''} placeholder={defaultColumnLabel(c.key, ft)} onChange={(e) => setCol(c.key, { label: e.target.value })} />
                  </td>
                  <td className="r">
                    <input type="number" min={2} max={80} className="num" style={{ width: 58 }} value={c.width} onChange={(e) => setCol(c.key, { width: Math.max(1, num(e.target.value)) })} />
                  </td>
                  <td className="c nowrap">
                    <button className="icon-btn" disabled={i === 0} onClick={() => moveCol(c.key, -1)} title="Move left">
                      <ArrowUp size={13} />
                    </button>
                    <button className="icon-btn" disabled={i === t.columns.length - 1} onClick={() => moveCol(c.key, 1)} title="Move right">
                      <ArrowDown size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Widths are relative: a column with 20 is twice as wide as one with 10. When U/M is not printed, it is shown next to the quantity.</p>
        </>
      )}
      {sub === 'footer' && (
        <>
          <table className="tbl dl-tbl">
            <thead>
              <tr>
                <th>Field</th>
                <th className="c">Screen</th>
                <th className="c">Print</th>
                <th>Title</th>
              </tr>
            </thead>
            <tbody>
              {footerFields.map(fieldRow)}
            </tbody>
          </table>
          <div className="section-title">Total titles</div>
          <div className="grid2">
            {totalFields.map((f) => (
              <Field key={f} label={FIELDS[f].label}>
                <input value={t.labels[f] ?? ''} placeholder={f === 'tax' ? 'Company tax name' : defaultFieldLabel(f, ft)} onChange={(e) => setLabel(f, e.target.value)} />
              </Field>
            ))}
          </div>
          <div className="section-title">Footer text &amp; signature lines</div>
          {!extras.length && <p className="muted small">No text boxes yet.</p>}
          {extras.map((b) => (
            <div key={b.id} className="extra-row">
              <span className="badge">{b.kind === 'sign' ? 'Signature' : 'Text'}</span>
              {b.kind === 'text' ? (
                <textarea rows={2} value={b.text} onChange={(e) => setBox(b.id, { text: e.target.value })} />
              ) : (
                <input value={b.text} onChange={(e) => setBox(b.id, { text: e.target.value })} />
              )}
              <label className="check small" title="Print this box">
                <input type="checkbox" checked={!b.hidden} onChange={(e) => setBox(b.id, { hidden: !e.target.checked })} /> Print
              </label>
              <button className="icon-btn" title="Delete" onClick={() => removeBox(b.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div className="flex mt">
            <button
              className="btn sm"
              onClick={() =>
                update((p) => {
                  const W = contentSize(p.page).w;
                  const { _added, ...n } = addBox(p, 'footer', 'text', { text: 'Goods once sold will not be taken back without approval.', w: W, h: 8, size: 8, italic: true });
                  return n;
                })
              }
            >
              <Type size={13} /> Add footer text
            </button>
            <button
              className="btn sm"
              onClick={() =>
                update((p) => {
                  const { _added, ...n } = addBox(p, 'footer', 'sign', { text: 'Checked By' });
                  return n;
                })
              }
            >
              <PenLine size={13} /> Add signature line
            </button>
            <button className="btn sm" onClick={() => goDesigner()}>
              <Plus size={13} /> More in Layout Designer
            </button>
          </div>
        </>
      )}
    </>
  );
}
