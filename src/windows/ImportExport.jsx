import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useStore } from '../store/store';
import { Tabs } from '../components/ui';
import { toCSV, downloadFile } from '../lib/format';
import { TEMPLATE_KINDS, KIND_LABEL, SPECS, downloadTemplate } from '../lib/importTemplates';
import DataImport from './DataImport';

const TEMPLATES = {
  items: ['Name', 'SKU', 'Type', 'Category', 'Description', 'U/M', 'Cost', 'Price', 'Reorder Point', 'Barcode'],
  customers: ['Name', 'Company', 'Contact', 'Phone', 'Email', 'Address', 'City', 'Terms', 'Credit Limit', 'NTN'],
  vendors: ['Name', 'Company', 'Contact', 'Phone', 'Email', 'Address', 'City', 'Terms', 'NTN'],
  accounts: ['Number', 'Name', 'Type', 'Description'],
};

export default function ImportExport({ tab: t0 = 'import' }) {
  const { data, company } = useStore();
  const [tab, setTab] = useState(t0);
  const [tpl, setTpl] = useState('all');

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

  const shown = tpl === 'all' ? TEMPLATE_KINDS : [tpl];

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
              <button className="btn" onClick={() => downloadTemplate(tpl)}>
                <Download size={14} /> Download template (Excel)
              </button>
              <select value={tpl} onChange={(e) => setTpl(e.target.value)} style={{ width: 240 }} title="Which template to download">
                <option value="all">All — every page in one file</option>
                {TEMPLATE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="tbl-wrap mb" style={{ maxHeight: 260, border: '1px solid var(--border)' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Column</th>
                    <th>Required?</th>
                    <th>What to enter</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.flatMap((k) =>
                    SPECS[k].fields.map((f, i) => (
                      <tr key={k + f.key}>
                        <td>{i === 0 ? <b>{KIND_LABEL[k]}</b> : ''}</td>
                        <td>{f.head}</td>
                        <td>{f.req ? <span className="badge err">Required</span> : <span className="muted">optional</span>}</td>
                        <td className="muted small">{f.note}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            <DataImport />
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
      </div>
    </div>
  );
}
