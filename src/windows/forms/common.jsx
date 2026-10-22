import { useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Save,
  Trash2,
  Ban,
  Copy,
  Bookmark,
  Printer,
  History,
  BookText,
  Search,
  Undo2,
  Eye,
  Columns3,
  LayoutTemplate,
  Files,
} from 'lucide-react';
import { useStore, useLookups } from '../../store/store';
import { usePerm } from '../../store/users';
import { useWindows, useWindowKeys } from '../../store/windows';
import { useNav } from '../../store/nav';
import { Modal, useDialog } from '../../components/ui';
import { Field } from '../../components/inputs';
import { PrintPreviewModal } from '../../components/print';
import { TXN_TYPES } from '../../store/defaults';
import { money, num, round2 } from '../../lib/format';
import { isTemplateForm, templatesFor, defaultTemplateId } from '../../lib/templates';
import { fmtDate } from '../../lib/dates';
import { refreshSourceDoc } from '../../lib/orders';
import { memoTemplate, nextDate, FREQUENCIES } from '../../lib/memorize';
import { today as todayIso } from '../../lib/dates';
import { sortTxns, txnTotal } from '../../lib/ledger';

// prev / next of the same transaction type (QuickBooks ◄ ► arrows)
export function useTxnSequence(types, currentId) {
  const { data } = useStore();
  return useMemo(() => {
    const list = sortTxns(data.txns.filter((t) => types.includes(t.type)));
    const i = list.findIndex((t) => t.id === currentId);
    if (i < 0) return { prev: list[list.length - 1]?.id, next: null, index: list.length, count: list.length };
    return { prev: list[i - 1]?.id || null, next: list[i + 1]?.id || null, index: i, count: list.length };
  }, [data.txns, types.join(','), currentId]);
}

export function Ribbon({ children, tabs }) {
  const [tab, setTab] = useState(0);
  return (
    <div className="ribbon">
      {tabs && (
        <div className="ribbon-tabs">
          {tabs.map((t, i) => (
            <button key={t} className={i === tab ? 'on' : ''} onClick={() => setTab(i)}>
              {t}
            </button>
          ))}
        </div>
      )}
      <div className="toolbar">{typeof children === 'function' ? children(tab) : children}</div>
    </div>
  );
}

export function TB({ icon: Icon, label, onClick, disabled, title }) {
  return (
    <button className="tb-btn" onClick={onClick} disabled={disabled} title={title || label}>
      <Icon size={18} />
      {label}
    </button>
  );
}
export const TBSep = () => <span className="tb-sep" />;

export function StdRibbon({ seq, onNav, onNew, onSave, onDelete, onVoid, onCopy, onMemorize, onPrint, onHistory, onJournal, onRevert, isNew, voided, extra, onFind, formatting }) {
  const tabs = formatting ? ['Main', 'Formatting', 'Reports'] : ['Main', 'Reports'];
  return (
    <Ribbon tabs={tabs}>
      {(tab) =>
        tabs[tab] === 'Main' ? (
          <>
            <TB icon={ChevronLeft} label="Previous" title="Previous (Alt+P)" onClick={() => onNav(seq.prev)} disabled={!seq.prev} />
            <TB icon={ChevronRight} label="Next" title="Next (Alt+N)" onClick={() => onNav(seq.next)} disabled={!seq.next} />
            <TBSep />
            {onFind && <TB icon={Search} label="Find" title="Find (Ctrl+F)" onClick={onFind} />}
            <TB icon={FilePlus2} label="New" title="New (Ctrl+N)" onClick={onNew} />
            <TB icon={Save} label="Save" title="Save (Ctrl+S)" onClick={onSave} />
            {onRevert && <TB icon={Undo2} label="Revert" onClick={onRevert} />}
            <TB icon={Trash2} label="Delete" title="Delete (Ctrl+D)" onClick={onDelete} disabled={isNew} />
            {onVoid && <TB icon={Ban} label={voided ? 'Unvoid' : 'Void'} onClick={onVoid} disabled={isNew} />}
            {onCopy && <TB icon={Copy} label="Copy" title="Create a copy" onClick={onCopy} disabled={isNew} />}
            {onMemorize && <TB icon={Bookmark} label="Memorize" title="Memorize (Ctrl+M)" onClick={onMemorize} />}
            <TBSep />
            {formatting && <TB icon={Eye} label="Preview" title="Print preview" onClick={formatting.onPreview} />}
            {onPrint && <TB icon={Printer} label="Print" title="Print (Ctrl+P)" onClick={onPrint} />}
            {extra}
          </>
        ) : tabs[tab] === 'Formatting' ? (
          <>
            <TB icon={Eye} label="Preview" title="Print preview with any template" onClick={formatting.onPreview} />
            <TBSep />
            <TB icon={Columns3} label="Customize Data Layout" title="Choose which fields and columns show on screen and in print" onClick={formatting.onCustomize} />
            <TB icon={LayoutTemplate} label="Layout Designer" title="Move and resize the data boxes of the printed form" onClick={formatting.onDesigner} />
            <TB icon={Files} label="Manage Templates" title="Lists › Templates" onClick={formatting.onTemplates} />
          </>
        ) : (
          <>
            {onHistory && <TB icon={History} label="History" title="Transaction history (Ctrl+H)" onClick={onHistory} disabled={isNew} />}
            {onJournal && <TB icon={BookText} label="Journal" title="Transaction journal (Ctrl+Y)" onClick={onJournal} disabled={isNew} />}
          </>
        )
      }
    </Ribbon>
  );
}

// "Template" drop-down shown on printable forms (like QuickBooks' top-right template selector)
export function TemplatePicker({ formType, value, onChange }) {
  const { company } = useStore();
  const nav = useNav();
  const opts = templatesFor(company, formType);
  const cur = value && opts.some((o) => o.id === value) ? value : defaultTemplateId(company, formType);
  return (
    <Field label="Template" className="tpl-pick">
      <select
        value={cur}
        onChange={(e) => (e.target.value === '__manage' ? nav.open('templates', { formType, n: Date.now() }) : onChange(e.target.value))}
        title="Print layout for this form"
      >
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
        <option value="__manage">Manage Templates…</option>
      </select>
    </Field>
  );
}

export function FormActions({ onSaveClose, onSaveNew, onClear, clearLabel = 'Clear', left }) {
  return (
    <div className="txn-actions">
      {left}
      <span className="sp" />
      <span className="muted small kbd-hint" style={{ marginRight: 8 }}>
        Alt+A Save &amp; Close · Alt+S Save &amp; New
      </span>
      <button className="btn primary" onClick={onSaveClose}>
        <span>
          Save &amp; <u>C</u>lose
        </span>
      </button>
      <button className="btn" onClick={onSaveNew}>
        <span>
          <u>S</u>ave &amp; New
        </span>
      </button>
      {onClear && (
        <button className="btn" onClick={onClear}>
          {clearLabel}
        </button>
      )}
    </div>
  );
}

export function JournalModal({ txnId, onClose }) {
  const { ledger, company } = useStore();
  const L = useLookups();
  const t = ledger.txnById.get(txnId);
  const lines = ledger.lines.filter((l) => l.txnId === txnId);
  const dr = round2(lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0));
  const cr = round2(-lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0));
  return (
    <Modal title={`Transaction Journal — ${TXN_TYPES[t?.type]?.label || ''} ${t?.num || ''}`} onClose={onClose} width={820}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th>
            <th>Account</th>
            <th>Name</th>
            <th>Memo</th>
            <th className="r">Debit</th>
            <th className="r">Credit</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{fmtDate(l.date, company.dateStyle)}</td>
              <td>{L.accountLabel(l.accountId)}</td>
              <td>{L.nameOf(l.nameId)}</td>
              <td className="muted">{l.memo}</td>
              <td className="r">{l.amount > 0 ? money(l.amount) : ''}</td>
              <td className="r">{l.amount < 0 ? money(-l.amount) : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>Total</td>
            <td className="r">{money(dr)}</td>
            <td className="r">{money(cr)}</td>
          </tr>
        </tfoot>
      </table>
      {!lines.length && <p className="muted">This transaction does not post to any account (non-posting document or voided).</p>}
    </Modal>
  );
}

export function MemorizeModal({ txn, onClose }) {
  const { saveRecord } = useStore();
  const L = useLookups();
  const dlg = useDialog();
  const [name, setName] = useState(`${TXN_TYPES[txn.type]?.label} - ${L.nameOf(txn.customerId || txn.vendorId) || 'General'}`);
  const [freq, setFreq] = useState('Never');
  const [next, setNext] = useState('');
  const save = () => {
    const due = freq === 'Never' ? '' : next || nextDate(txn.date || todayIso(), freq);
    saveRecord('memorized', { name, txnType: txn.type, frequency: freq, nextDate: due, template: memoTemplate(txn) });
    dlg.toast('Transaction memorized (Alt+T to open the list)');
    onClose();
  };
  return (
    <Modal
      title="Memorize Transaction"
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            OK
          </button>
        </>
      }
    >
      <div className="grid2">
        <label className="field span2">
          <span className="field-label">Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </label>
        <label className="field">
          <span className="field-label">Remind me</span>
          <select
            value={freq}
            onChange={(e) => {
              setFreq(e.target.value);
              setNext(nextDate(txn.date || todayIso(), e.target.value));
            }}
          >
            {FREQUENCIES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        {freq !== 'Never' && (
          <label className="field">
            <span className="field-label">Next date</span>
            <input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
        )}
      </div>
    </Modal>
  );
}

/**
 * Shared behaviour for every transaction form: load / save / delete / void / navigate / keys.
 * build(): returns the record to save or null (validation failed, already alerted)
 */
export function useTxnController({ winId, type, types = [type], txnId, f, setF, makeNew, build, beforeSave, afterSave, printNode, previewTxn }) {
  const store = useStore();
  const { saveRecord, deleteRecord, data, company, ledger } = store;
  const perm = usePerm();
  const L = useLookups();
  const { close, setTitle } = useWindows();
  const nav = useNav();
  const dlg = useDialog();
  const [modal, setModal] = useState(null);
  const snapshot = useRef(JSON.stringify(f));
  const seq = useTxnSequence(types, f.id);
  const isNew = !f.id || !data.txns.some((t) => t.id === f.id);
  const dirty = JSON.stringify(f) !== snapshot.current;

  const load = (id) => {
    const t = data.txns.find((x) => x.id === id);
    if (!t) return;
    const next = makeNew(t);
    snapshot.current = JSON.stringify(next);
    setF(next);
  };
  const reset = () => {
    const next = makeNew(null);
    snapshot.current = JSON.stringify(next);
    setF(next);
  };
  // keep the PO / sales order / estimate a document was made from in step with it (txnsAfter = data after the change)
  const refreshSources = (txnsAfter, ...sourceIds) => {
    for (const id of new Set(sourceIds.filter(Boolean))) {
      const next = refreshSourceDoc(
        txnsAfter.find((t) => t.id === id),
        txnsAfter,
      );
      if (next) saveRecord('txns', next);
    }
  };
  const guard = async () => {
    if (!dirty) return true;
    return dlg.confirm('You have unsaved changes on this transaction.\n\nDiscard them?', { ok: 'Discard changes', danger: true });
  };

  const save = async (mode) => {
    const rec = await build();
    if (!rec) return false;
    if (company.warnDuplicateNum !== false && rec.num) {
      // a bill's number is the vendor's own, so it only clashes with the same vendor's bills
      const vendorDoc = rec.type === 'bill' || rec.type === 'vendorcredit';
      const dup = data.txns.find((t) => t.id !== rec.id && !t.voided && t.type === rec.type && String(t.num) === String(rec.num) && (!vendorDoc || t.vendorId === rec.vendorId));
      if (dup && !(await dlg.confirm(`Number ${rec.num} is already used by another ${TXN_TYPES[rec.type].label}. Save anyway?`))) return false;
    }
    if (beforeSave && (await beforeSave(rec)) === false) return false;
    const before = data.txns.find((t) => t.id === rec.id);
    const saved = saveRecord('txns', rec);
    const after = before ? data.txns.map((t) => (t.id === saved.id ? saved : t)) : [...data.txns, saved];
    refreshSources(after, saved.sourceId, before?.sourceId);
    afterSave?.(saved);
    dlg.toast(`${TXN_TYPES[saved.type]?.label || 'Transaction'} ${saved.num || ''} saved`);
    if (mode === 'close') close(winId);
    else if (mode === 'new') reset();
    else {
      const next = makeNew(saved);
      snapshot.current = JSON.stringify(next);
      setF(next);
    }
    return saved;
  };

  const del = async () => {
    if (isNew) return;
    if (!perm.can('delete')) return dlg.alert("You don't have permission to delete or void. Ask the Super Admin.");
    const t = data.txns.find((x) => x.id === f.id);
    const linked = data.txns.filter((x) => [...(x.applied || []), ...(x.credits || [])].some((a) => a.txnId === f.id) || (x.payments || []).includes(f.id));
    if (linked.length)
      return dlg.alert(
        `This transaction is linked to ${linked.length} other transaction(s) (payments, credits or deposits).\nDelete or edit those first, or Void this one instead.`,
      );
    if (!(await dlg.confirm(`Are you sure you want to delete this ${TXN_TYPES[t.type]?.label}?`, { ok: 'Delete', danger: true }))) return;
    deleteRecord('txns', f.id);
    refreshSources(
      data.txns.filter((x) => x.id !== f.id),
      t.sourceId,
    );
    dlg.toast('Transaction deleted');
    reset();
  };

  const toggleVoid = async () => {
    if (isNew) return;
    if (!perm.can('delete')) return dlg.alert("You don't have permission to delete or void. Ask the Super Admin.");
    const t = data.txns.find((x) => x.id === f.id);
    if (!t.voided) {
      const label = TXN_TYPES[t.type]?.label || 'transaction';
      const notes = [];
      // payments / credits applied to this document become credits again
      const users = data.txns.filter((x) => !x.voided && x.id !== t.id && [...(x.applied || []), ...(x.credits || [])].some((a) => a.txnId === t.id));
      for (const x of users) {
        const amt = [...(x.applied || []), ...(x.credits || [])].filter((a) => a.txnId === t.id).reduce((s, a) => s + num(a.amount), 0);
        notes.push(
          `${TXN_TYPES[x.type]?.label} ${x.num || ''} (${money(amt)}) is applied to this ${label.toLowerCase()}. After voiding, that amount stays on the ${t.vendorId && !t.customerId ? 'vendor' : 'customer'}'s account as a credit you can use on another document.`,
        );
      }
      // a payment that was deposited comes out of that deposit (and the bank balance)
      const dep = data.txns.find((x) => x.type === 'deposit' && !x.voided && (x.payments || []).includes(t.id));
      if (dep) notes.push(`This ${label.toLowerCase()} is part of deposit ${dep.num || ''} on ${fmtDate(dep.date, company.dateStyle)}. Voiding takes ${money(txnTotal(t, ledger))} out of that deposit and out of the bank balance.`);
      const msg = `Void this ${label}? Amounts become zero but the record stays for your audit trail.` + (notes.length ? '\n\n' + notes.join('\n\n') : '');
      if (!(await dlg.confirm(msg, { ok: 'Void', danger: true }))) return;
    }
    const saved = saveRecord('txns', { ...t, voided: !t.voided, memo: !t.voided ? 'VOID: ' + (t.memo || '') : String(t.memo || '').replace(/^VOID: /, '') });
    refreshSources(
      data.txns.map((x) => (x.id === saved.id ? saved : x)),
      saved.sourceId,
    );
    load(saved.id);
  };

  const copy = () => {
    const next = makeNew(null);
    const c = { ...f, id: undefined, num: next.num, date: next.date, voided: false, closed: false, applied: undefined, sourceId: undefined };
    snapshot.current = '';
    setF(c);
    dlg.toast('Copied — this is a new unsaved transaction');
  };

  const navTo = async (id) => {
    if (!id) return;
    if (!(await guard())) return;
    load(id);
  };

  const keys = {
    'alt+s': () => save('new'),
    'alt+a': () => save('close'),
    'ctrl+s': () => save('stay'),
    'alt+p': () => navTo(seq.prev),
    'alt+n': () => navTo(seq.next),
    'ctrl+n': async () => (await guard()) && reset(),
    'ctrl+d': del,
    'ctrl+m': () => setModal({ kind: 'memorize' }),
    'ctrl+y': () => !isNew && setModal({ kind: 'journal' }),
    'ctrl+h': () => !isNew && nav.report('history', { txnId: f.id }),
    'ctrl+p': () => printNode && printNode(previewSource()),
    esc: async () => (await guard()) && close(winId),
  };
  useWindowKeys(keys);

  // ----- templates / print preview -----
  const formType = f.type || type;
  const printable = !!printNode && isTemplateForm(formType);
  const tplId = f.templateId || defaultTemplateId(company, formType);
  const openEditor = (tab, id = tplId) => nav.open('templateeditor', { templateId: id, formType, tab, n: Date.now() });
  const formatting = printable
    ? {
        onPreview: () => setModal({ kind: 'preview' }),
        onCustomize: () => openEditor('data'),
        onDesigner: () => openEditor('designer'),
        onTemplates: () => nav.open('templates', { formType, n: Date.now() }),
      }
    : null;
  const previewSource = () => {
    const x = previewTxn ? previewTxn() : f;
    if (!x.appliedMap) return x;
    const applied = Object.entries(x.appliedMap)
      .filter(([, v]) => num(v) > 0)
      .map(([id, v]) => ({ txnId: id, amount: round2(num(v)) }));
    const sum = round2(applied.reduce((s, a) => s + a.amount, 0));
    return { ...x, applied, amount: x.type === 'billpayment' ? sum : num(x.amount) };
  };

  const ribbonProps = {
    formatting,
    seq,
    onNav: navTo,
    onNew: keys['ctrl+n'],
    onSave: () => save('stay'),
    onDelete: del,
    onVoid: toggleVoid,
    onCopy: copy,
    onMemorize: () => setModal({ kind: 'memorize' }),
    onPrint: printNode ? () => printNode(previewSource()) : undefined,
    onHistory: () => nav.report('history', { txnId: f.id }),
    onJournal: () => setModal({ kind: 'journal' }),
    onFind: () => nav.open('find', { type, n: Date.now() }),
    isNew,
    voided: f.voided,
  };

  const modals = (
    <>
      {modal?.kind === 'journal' && <JournalModal txnId={f.id} onClose={() => setModal(null)} />}
      {modal?.kind === 'memorize' && <MemorizeModal txn={f} onClose={() => setModal(null)} />}
      {modal?.kind === 'preview' && (
        <PrintPreviewModal
          txn={previewSource()}
          company={company}
          L={L}
          ledger={ledger}
          onClose={() => setModal(null)}
          onCustomize={(id) => {
            setModal(null);
            openEditor('basic', id);
          }}
          onUseTemplate={(id) => {
            setF((x) => ({ ...x, templateId: id }));
            setModal(null);
          }}
        />
      )}
    </>
  );

  return { save, del, reset, load, isNew, dirty, seq, ribbonProps, modals, setModal, keys, setTitle };
}

export const blankLine = () => ({ key: Math.random().toString(36).slice(2), itemId: '', description: '', qty: '', uom: '', rate: '', amount: '', taxable: false });

// keep exactly one empty line at the end of a grid
export function ensureTrailing(lines, blank, isEmpty) {
  const out = [...lines];
  while (out.length > 1 && isEmpty(out[out.length - 1]) && isEmpty(out[out.length - 2])) out.pop();
  if (!out.length || !isEmpty(out[out.length - 1])) out.push(blank());
  return out;
}

export function SideCard({ title, children, action }) {
  return (
    <div className="side-card">
      <h4>
        {title}
        {action}
      </h4>
      {children}
    </div>
  );
}
