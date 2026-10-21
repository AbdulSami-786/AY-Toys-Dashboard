import { Keyboard, Info } from 'lucide-react';
import { SHORTCUT_HELP } from '../lib/commands';
import { useStore } from '../store/store';
import { Kbd } from '../components/ui';

export function Shortcuts() {
  return (
    <div className="win">
      <div className="win-title">
        <Keyboard size={20} />
        <h1>Keyboard Shortcuts</h1>
        <span className="sub">QuickBooks Desktop shortcuts work the same here</span>
      </div>
      <div className="win-body pad">
        <div className="note mb">
          Browsers keep a few keys for themselves (Ctrl+W closes the tab, Ctrl+T opens a tab, Ctrl+N opens a window). For those, AY Toys gives an alternative shown
          next to the key. Tip: install AY Toys as an app (browser menu › Install) for a full-window experience.
        </div>
        <div className="sc-grid">
          {SHORTCUT_HELP.map((g) => (
            <div key={g.group} className="sc-group">
              <h3>{g.group}</h3>
              {g.rows.map(([k, d]) => (
                <div key={k + d} className="sc-row">
                  <span>
                    {k.split('  /  ').map((x, i) => (
                      <span key={i}>
                        {i > 0 && ' / '}
                        <Kbd>{x}</Kbd>
                      </span>
                    ))}
                  </span>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProductInfo() {
  const { company, data, companies, sheetUrl, sync } = useStore();
  let size = 0;
  try {
    size = JSON.stringify(data).length;
  } catch {
    /* ignore */
  }
  const rows = [
    ['Product', 'AY Toys — Wholesale Accounting (Enterprise edition)'],
    ['Version', '1.0.0'],
    ['Company', company.name],
    ['Company code', company.code],
    ['Companies on this computer', companies.length],
    ['Storage', sheetUrl ? 'Google Sheet + this computer (browser database)' : 'This computer only (browser database)'],
    ['Sync status', sync.status],
    ['Data size (local)', `${(size / 1024).toFixed(1)} KB`],
    ['Accounts', data.accounts.length],
    ['Items', data.items.length],
    ['Customers', data.customers.length],
    ['Vendors', data.vendors.length],
    ['Transactions', data.txns.length],
    ['Memorized transactions', (data.memorized || []).length],
  ];
  return (
    <div className="win">
      <div className="win-title">
        <Info size={20} />
        <h1>Product Information</h1>
      </div>
      <div className="win-body pad">
        <table className="tbl" style={{ maxWidth: 620 }}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td className="muted" style={{ width: 240 }}>
                  {k}
                </td>
                <td className="b">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
