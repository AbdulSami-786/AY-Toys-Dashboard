import { useState } from 'react';
import { ListChecks, Plus, Trash2 } from 'lucide-react';
import { useStore, useLookups } from '../store/store';
import { useDialog } from '../components/ui';
import { uid } from '../lib/format';

const LISTS = [
  ['priceLevels', 'Price Levels'],
  ['terms', 'Terms'],
  ['paymentMethods', 'Payment Methods'],
  ['reps', 'Sales Reps'],
  ['shipVia', 'Ship Via'],
  ['uom', 'Units of Measure'],
  ['customerTypes', 'Customer Types'],
  ['vendorTypes', 'Vendor Types'],
  ['messages', 'Customer Messages'],
];

export default function ListsSetup({ tab = 'priceLevels' }) {
  const { company, updateCompany } = useStore();
  const L = useLookups();
  const dlg = useDialog();
  const [cur, setCur] = useState(tab);
  const [val, setVal] = useState('');
  const [pct, setPct] = useState('');
  const list = L.lists[cur] || [];
  const save = (next) => updateCompany(company.id, { lists: { ...L.lists, [cur]: next } });
  const add = () => {
    if (!val.trim()) return;
    if (cur === 'priceLevels') save([...list, { id: 'pl-' + uid(), name: val.trim(), percent: Number(pct) || 0 }]);
    else if (!list.includes(val.trim())) save([...list, val.trim()]);
    setVal('');
    setPct('');
  };
  return (
    <div className="win">
      <div className="win-title">
        <ListChecks size={20} />
        <h1>Customer &amp; Vendor Profile Lists</h1>
      </div>
      <div className="rc" style={{ flex: 1, minHeight: 0 }}>
        <nav className="rc-nav">
          {LISTS.map(([k, label]) => (
            <button key={k} className={cur === k ? 'on' : ''} onClick={() => setCur(k)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="pad" style={{ overflow: 'auto' }}>
          {cur === 'priceLevels' && (
            <p className="muted small">
              A price level changes an item's base price for a customer, e.g. "Wholesale −10%". Assign it in the customer's Payment Settings; invoices then use that
              price automatically.
            </p>
          )}
          {cur === 'terms' && <p className="muted small">Use "Net 30" style names so due dates are calculated automatically.</p>}
          <form
            className="flex mb"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input autoFocus placeholder="New entry…" value={val} onChange={(e) => setVal(e.target.value)} style={{ width: 280 }} />
            {cur === 'priceLevels' && <input className="num" placeholder="% (e.g. -10)" value={pct} onChange={(e) => setPct(e.target.value)} style={{ width: 110 }} />}
            <button className="btn primary" type="submit">
              <Plus size={14} /> Add
            </button>
          </form>
          <table className="tbl" style={{ maxWidth: 560 }}>
            <thead>
              <tr>
                <th>Name</th>
                {cur === 'priceLevels' && <th className="r">Adjust %</th>}
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((x, i) => (
                <tr key={typeof x === 'string' ? x : x.id}>
                  <td>
                    {cur === 'priceLevels' ? (
                      <input value={x.name} onChange={(e) => save(list.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)))} style={{ width: '100%' }} />
                    ) : (
                      x
                    )}
                  </td>
                  {cur === 'priceLevels' && (
                    <td className="r">
                      <input className="num" value={x.percent} onChange={(e) => save(list.map((p, j) => (j === i ? { ...p, percent: Number(e.target.value) || 0 } : p)))} style={{ width: 80 }} />
                    </td>
                  )}
                  <td>
                    <button
                      className="icon-btn"
                      onClick={async () => (await dlg.confirm(`Remove "${typeof x === 'string' ? x : x.name}"?`, { ok: 'Remove' })) && save(list.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
