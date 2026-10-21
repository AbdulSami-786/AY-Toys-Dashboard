import { useRef, useState } from 'react';
import { Upload, Download, FileSpreadsheet } from 'lucide-react';
import { useStore, useLookups } from '../store/store';
import { useDialog, Tabs } from '../components/ui';
import { toCSV, downloadFile } from '../lib/format';
import { parseCSV, rowsToObjects, buildRecords } from '../lib/importData';

const TEMPLATES = {
  items: ['Name', 'SKU', 'Type', 'Category', 'Description', 'U/M', 'Cost', 'Price', 'Reorder Point', 'Barcode'],
  customers: ['Name', 'Company', 'Contact', 'Phone', 'Email', 'Address', 'City', 'Terms', 'Credit Limit', 'NTN'],
  vendors: ['Name', 'Company', 'Contact', 'Phone', 'Email', 'Address', 'City', 'Terms', 'NTN'],
  accounts: ['Number', 'Name', 'Type', 'Description'],
};

export default function ImportExport({ tab: t0 = 'import' }) {
  const { data, saveMany, company } = useStore();
  const L = useLookups();
  const dlg = useDialog();
  const [tab, setTab] = useState(t0);
  const [kind, setKind] = useState('items');
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const rows = parseCSV((await f.text()).replace(/^﻿/, ''));
    if (rows.length < 2) return dlg.alert('The file has no data rows.');
    const { objs } = rowsToObjects(rows);
    setPreview(buildRecords({ [kind]: objs }, data)[kind]);
  };

  const doImport = () => {
    saveMany(kind, preview.recs);
    dlg.toast(`Imported ${preview.recs.length} ${kind}`);
    setPreview(null);
  };

  const exportList = (k) => {
    let out;
    if (k === 'items') {
      out = [TEMPLATES.items, ...data.items.map((i) => [i.name, i.sku, i.type, i.category, i.description, i.uom, i.cost, i.price, i.reorderPoint, i.barcode])];
    } else if (k === 'accounts') {
      out = [TEMPLATES.accounts, ...data.accounts.map((a) => [a.number, a.name, a.type, a.description])];
    } else {
      const list = data[k];
      out = [TEMPLATES[k], ...list.map((c) => [c.name, c.company, c.contact, c.phone, c.email, c.address, c.city, c.terms, ...(k === 'customers' ? [c.creditLimit] : []), c.ntn])];
    }
    downloadFile(`${company.name}_${k}.csv`, toCSV(out), 'text/csv');
  };

  return (
    <div className="win">
      <div className="win-title">
        <FileSpreadsheet size={20} />
        <h1>Import / Export Lists</h1>
      </div>
      <Tabs
        tabs={[
          { id: 'import', label: 'Import from Excel / CSV' },
          { id: 'export', label: 'Export to Excel / CSV' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="win-body pad" style={{ maxWidth: 900 }}>
        {tab === 'import' ? (
          <>
            <div className="flex mb">
              <select value={kind} onChange={(e) => (setKind(e.target.value), setPreview(null))} style={{ width: 180 }}>
                <option value="items">Items</option>
                <option value="customers">Customers</option>
                <option value="vendors">Vendors</option>
                <option value="accounts">Chart of Accounts</option>
              </select>
              <button className="btn" onClick={() => downloadFile(`AY_Toys_${kind}_template.csv`, toCSV([TEMPLATES[kind]]), 'text/csv')}>
                <Download size={14} /> Download template
              </button>
              <button className="btn primary" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> Choose CSV file…
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
            </div>
            <p className="muted small">
              Columns: <code>{TEMPLATES[kind].join(', ')}</code>. In Excel use <b>File › Save As › CSV UTF-8</b>. Names that already exist are skipped.
              {kind === 'accounts' && ' Type must match a QuickBooks account type exactly (e.g. Expense, Bank, Other Current Asset).'}
            </p>
            {preview && (
              <>
                <div className="note mb">
                  Ready to import <b>{preview.recs.length}</b> {kind}.{preview.skipped.length > 0 && ` Skipped ${preview.skipped.length}: ${preview.skipped.slice(0, 8).join(', ')}${preview.skipped.length > 8 ? '…' : ''}`}
                </div>
                <div className="tbl-wrap" style={{ maxHeight: 340, border: '1px solid var(--border)' }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.recs.slice(0, 200).map((r, i) => (
                        <tr key={i}>
                          <td>{r.name}</td>
                          <td className="muted">{kind === 'items' ? `${r.type} · cost ${r.cost} · price ${r.price}` : kind === 'accounts' ? r.type : [r.phone, r.city].filter(Boolean).join(' · ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex mt">
                  <button className="btn primary" onClick={doImport} disabled={!preview.recs.length}>
                    Import {preview.recs.length} records
                  </button>
                  <button className="btn" onClick={() => setPreview(null)}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="grid2" style={{ maxWidth: 520 }}>
            {['items', 'customers', 'vendors', 'accounts'].map((k) => (
              <button key={k} className="btn" style={{ height: 44 }} onClick={() => exportList(k)}>
                <Download size={14} /> Export {k === 'accounts' ? 'Chart of Accounts' : k[0].toUpperCase() + k.slice(1)} ({(data[k] || []).length})
              </button>
            ))}
          </div>
        )}
        <p className="muted small mt">{L.lists.uom.length ? '' : ''}</p>
      </div>
    </div>
  );
}
