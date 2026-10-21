import { useRef, useState } from 'react';
import { Bookmark, Trash2, Play } from 'lucide-react';
import { useStore, useLookups } from '../store/store';
import { useWindowKeys } from '../store/windows';
import { useNav } from '../store/nav';
import { useDialog, Empty } from '../components/ui';
import { useListNav } from '../components/listnav';
import { TXN_TYPES } from '../store/defaults';
import { money } from '../lib/format';
import { fmtDate } from '../lib/dates';
import { memoTemplate, afterEntered } from '../lib/memorize';

export default function Memorized() {
  const { data, deleteRecord, saveRecord, company } = useStore();
  const L = useLookups();
  const nav = useNav();
  const dlg = useDialog();
  const [sel, setSel] = useState(null);
  const ref = useRef(null);
  const rows = [...(data.memorized || [])].sort((a, b) => a.name.localeCompare(b.name));
  const { keys } = useListNav(rows, sel, setSel, { containerRef: ref });
  // open a new transaction from it (only the reusable parts) and move its reminder on
  const use = (m) => {
    if (!m) return;
    nav.open(m.txnType, { template: memoTemplate(m.template), n: Date.now() });
    if (m.frequency && m.frequency !== 'Never') saveRecord('memorized', afterEntered(m));
  };
  const del = async (m) => m && (await dlg.confirm(`Delete memorized transaction "${m.name}"?`, { danger: true, ok: 'Delete' })) && deleteRecord('memorized', m.id);
  const sm = rows.find((r) => r.id === sel);
  useWindowKeys({ ...keys, enter: () => use(sm), 'ctrl+d': () => del(sm) });
  return (
    <div className="win">
      <div className="win-title">
        <Bookmark size={20} />
        <h1>Memorized Transaction List</h1>
        <span className="sub">Ctrl+M inside any form memorizes it · Enter to use</span>
      </div>
      <div className="toolbar flat">
        <button className="btn sm primary" disabled={!sm} onClick={() => use(sm)}>
          <Play size={13} /> Enter Transaction
        </button>
        <button className="btn sm" disabled={!sm} onClick={() => del(sm)}>
          <Trash2 size={13} /> Delete
        </button>
      </div>
      <div className="win-body tbl-wrap" ref={ref}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Transaction Name</th>
              <th>Type</th>
              <th>Name</th>
              <th>Remind</th>
              <th>Next date</th>
              <th className="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} data-id={m.id} className={m.id === sel ? 'sel' : ''} onClick={() => setSel(m.id)} onDoubleClick={() => use(m)}>
                <td className="b">{m.name}</td>
                <td>{TXN_TYPES[m.txnType]?.label}</td>
                <td>{L.nameOf(m.template?.customerId || m.template?.vendorId)}</td>
                <td>{m.frequency}</td>
                <td>{m.frequency && m.frequency !== 'Never' ? fmtDate(m.nextDate, company.dateStyle) || 'now' : ''}</td>
                <td className="r">{money(m.template?.total || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty icon={<Bookmark size={28} />}>No memorized transactions yet. Open an invoice, bill or check and press Ctrl+M.</Empty>}
      </div>
    </div>
  );
}
