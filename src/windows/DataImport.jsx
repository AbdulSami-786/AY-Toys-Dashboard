import { useRef, useState } from 'react';
import { Upload, DatabaseBackup } from 'lucide-react';
import { useStore } from '../store/store';
import { useDialog } from '../components/ui';
import { KINDS, KIND_LABEL, readDataFile, buildAll } from '../lib/importData';

// "Import old data" for the open shop: pick a file, see what it holds, add it to this shop's books.
export default function DataImport({ onDone }) {
  const store = useStore();
  const { data, company, saveMany, replaceData } = store;
  const dlg = useDialog();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState('');
  const [found, setFound] = useState(null); // result of readDataFile
  const [busy, setBusy] = useState(false);

  const read = async (f, k) => {
    setBusy(true);
    try {
      const r = await readDataFile(f, k);
      if (r.error) {
        setFound(null);
        setFile(null);
        dlg.alert(r.error);
      } else setFound(r);
    } finally {
      setBusy(false);
    }
  };

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFile(f);
    setKind('');
    setFound(null);
    read(f, '');
  };

  const reset = () => {
    setFile(null);
    setFound(null);
    setKind('');
  };

  const built = found?.format === 'lists' ? buildAll(found.byKind, data, { dateStyle: company.dateStyle, depositTo: company.defaultDepositTo }) : null;
  const total = built ? KINDS.reduce((s, k) => s + (built[k]?.recs.length || 0), 0) : 0;

  const importLists = () => {
    for (const k of KINDS) if (built[k]?.recs.length) saveMany(built[k].table || k, built[k].recs);
    dlg.toast(`Added ${total} record${total === 1 ? '' : 's'} to ${company.name}`);
    reset();
    onDone?.();
  };

  const restoreBackup = async () => {
    const { json } = found;
    const ok = await dlg.confirm(
      `Replace ALL current data of "${company.name}" with the backup of "${json.company?.name || 'a shop'}"${json.exportedAt ? ' from ' + new Date(json.exportedAt).toLocaleString() : ''}?\n\nThis cannot be undone.`,
      { ok: 'Replace', danger: true },
    );
    if (!ok) return;
    replaceData(json.data); // also queues the full upload to the sheet (it waits if there is no internet)
    dlg.toast('Backup loaded into ' + company.name);
    reset();
    onDone?.();
  };

  return (
    <>
      <p className="muted">
        Upload the old data of <b>{company.name}</b> and it is added to this shop's books. Works with:
      </p>
      <ul className="muted small" style={{ margin: '4px 0 12px', paddingLeft: 20 }}>
        <li>
          <b>QuickBooks IIF</b> (<code>.iif</code>) — customers, vendors, items and chart of accounts, all in one go.
        </li>
        <li>
          <b>Excel (<code>.xlsx</code>) or CSV</b> made from our template (get it with <b>Download template</b> in the Import / Export Lists window) — customers, vendors, items, chart of accounts, bills and invoices. A QuickBooks list exported to Excel/CSV works too.
        </li>
        <li>
          <b>AY Toys backup</b> (<code>.json</code>) — replaces everything in this shop.
        </li>
      </ul>
      <p className="muted small">Names that already exist are skipped, so uploading the same file twice is safe.</p>
      <div className="flex mt mb">
        <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload size={14} /> Choose data file…
        </button>
        {file && <span className="muted small">{file.name}</span>}
        <input ref={fileRef} type="file" accept=".iif,.csv,.json,.xlsx,.xls,.qbb,.qbw,text/csv,application/json" hidden onChange={pick} />
      </div>

      {found?.needKind && (
        <div className="note mb">
          <div className="mb">I can't tell what this list is. What does the file contain?</div>
          <div className="flex">
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 200 }}>
              <option value="">Choose…</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <button className="btn primary" disabled={!kind || busy} onClick={() => read(file, kind)}>
              Continue
            </button>
          </div>
        </div>
      )}

      {found?.format === 'backup' && (
        <div className="note mb">
          <div className="mb">
            AY Toys backup of <b>{found.json.company?.name || 'a shop'}</b> — {found.json.data.customers?.length || 0} customers, {found.json.data.vendors?.length || 0} vendors, {found.json.data.items?.length || 0} items, {found.json.data.txns?.length || 0} transactions.
          </div>
          <div className="flex">
            <button className="btn primary" onClick={restoreBackup}>
              <DatabaseBackup size={14} /> Replace this shop's data with it
            </button>
            <button className="btn" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {built && (
        <>
          <div className="tbl-wrap" style={{ border: '1px solid var(--border)', maxWidth: 520 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>List</th>
                  <th className="n">To add</th>
                  <th className="n">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {KINDS.filter((k) => built[k]).map((k) => (
                  <tr key={k}>
                    <td>{KIND_LABEL[k]}</td>
                    <td className="n">{built[k].recs.length}</td>
                    <td className="n muted">{built[k].skipped.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {KINDS.filter((k) => built[k]?.skipped.length).map((k) => (
            <details key={k} className="muted small mt">
              <summary>
                {KIND_LABEL[k]}: {built[k].skipped.length} skipped (already there, or a problem)
              </summary>
              <ul style={{ margin: '4px 0', paddingLeft: 20, maxHeight: 160, overflow: 'auto' }}>
                {built[k].skipped.slice(0, 100).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
                {built[k].skipped.length > 100 && <li>… and {built[k].skipped.length - 100} more</li>}
              </ul>
            </details>
          ))}
          {found.txnLines > 0 && (
            <p className="muted small mt">
              This file also has {found.txnLines} transaction lines (invoices, bills, payments). Only the lists above are imported — transactions are not.
            </p>
          )}
          <div className="flex mt">
            <button className="btn primary" onClick={importLists} disabled={!total}>
              Add {total} record{total === 1 ? '' : 's'} to {company.name}
            </button>
            <button className="btn" onClick={reset}>
              Cancel
            </button>
          </div>
        </>
      )}
    </>
  );
}
