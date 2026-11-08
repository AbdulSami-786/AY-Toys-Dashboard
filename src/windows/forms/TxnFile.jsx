import { useRef } from 'react';
import { FileDown, FileUp } from 'lucide-react';
import { useStore } from '../../store/store';
import { useDialog } from '../../components/ui';
import { TB } from './common';
import { KIND_OF, KIND_WORD, exportTxnFile, readTxnFile, buildOneFromFile, buildAllFromFile } from '../../lib/txnFile';

/**
 * Export / Import buttons for the toolbar of an invoice / bill form.
 *  getDoc()     → what is on the form now: { num, date, time, party, terms, dueDate, po, taxRate, memo, lines: [{ item, description, qty, price }] }
 *  hasContent() → the form already holds something that a loaded file would replace
 *  applyRec(rec) → put the record read from the file into the form (nothing is saved until the user saves)
 *  canImport    → false for a voided document
 * Several documents in one file can be added at once as new invoices / bills (invoice and bill forms only).
 */
export function useTxnFile({ type, getDoc, hasContent, applyRec, canImport = true, label }) {
  const { data, company, saveMany } = useStore();
  const dlg = useDialog();
  const fileRef = useRef(null);
  const kind = KIND_OF[type];
  const word = KIND_WORD[kind];
  const addAllOk = type === 'invoice' || type === 'bill';

  const doExport = async () => {
    const doc = getDoc();
    if (!doc.lines.length) return dlg.alert(`Add at least one item line before exporting this ${word}.`);
    const name = exportTxnFile(kind, doc, company, label);
    dlg.toast(`Exported ${name}`);
  };

  const addAll = (docs) => {
    const { recs, skipped } = buildAllFromFile(kind, docs, data, company);
    if (recs.length) saveMany('txns', recs);
    dlg.toast(`Added ${recs.length} ${word}${recs.length === 1 ? '' : 's'}${skipped.length ? ` (${skipped.length} skipped)` : ''}`);
    if (skipped.length) dlg.alert(`${skipped.length} could not be added:\n\n${skipped.slice(0, 12).join('\n')}${skipped.length > 12 ? `\n… and ${skipped.length - 12} more` : ''}`);
  };

  const doImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const res = await readTxnFile(file, kind, company);
    if (res.error) return dlg.alert(res.error);
    const { docs } = res;
    let doc = docs[0];
    if (docs.length > 1) {
      if (addAllOk) {
        const list = docs.slice(0, 6).map((d) => d.num).join(', ') + (docs.length > 6 ? ', …' : '');
        const all = await dlg.confirm(`This file has ${docs.length} ${word}s (${list}).\n\nAdd them all now as new ${word}s, or load only the first one (${doc.num}) into this form to check it?`, {
          title: `Import ${word}s`,
          ok: `Add all ${docs.length}`,
          cancel: 'Load first only',
        });
        if (all) return addAll(docs);
      } else dlg.toast(`The file has ${docs.length} documents — loaded the first one (${doc.num})`);
    }
    const { rec, problem } = buildOneFromFile(kind, doc, data, company);
    if (!rec) return dlg.alert(`${problem}\n\nAdd the missing customer / vendor / item first, then import again.`);
    if (hasContent() && !(await dlg.confirm(`Replace what is on this ${word} with ${word} ${doc.num} from the file?\n\nNothing is saved until you press Save.`, { ok: 'Replace' }))) return;
    applyRec(rec);
    dlg.toast(`Loaded ${word} ${doc.num} from ${file.name} — check it, then save`);
  };

  const buttons = (
    <>
      <TB icon={FileDown} label="Export" title={`Save this ${word} as an Excel file (same layout as the import template)`} onClick={doExport} />
      <TB icon={FileUp} label="Import" title={`Fill this ${word} from an Excel / CSV file`} onClick={() => fileRef.current?.click()} disabled={!canImport} />
      <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv" hidden onChange={doImport} />
    </>
  );
  return { buttons };
}
