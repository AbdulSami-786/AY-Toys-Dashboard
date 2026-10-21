import { PackageCheck } from 'lucide-react';
import { useStore, useLookups } from '../../store/store';
import { useNav } from '../../store/nav';
import { Empty } from '../../components/ui';
import { money, num } from '../../lib/format';
import { fmtDate } from '../../lib/dates';

export default function ReceiveItems() {
  const { data, company } = useStore();
  const L = useLookups();
  const nav = useNav();
  const pos = data.txns.filter((t) => t.type === 'purchaseorder' && !t.closed && !t.voided).sort((a, b) => (a.date < b.date ? -1 : 1));
  return (
    <div className="win">
      <div className="win-title">
        <PackageCheck size={20} />
        <h1>Receive Items and Enter Bill</h1>
        <span className="sub">Pick an open purchase order to receive</span>
        <button className="btn sp" onClick={() => nav.open('bill')}>
          Receive without a PO
        </button>
      </div>
      <div className="win-body tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>P.O. No.</th>
              <th>Vendor</th>
              <th>Expected</th>
              <th className="r">Items (ordered / received)</th>
              <th className="r">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pos.map((p) => {
              const ord = (p.itemLines || []).reduce((s, l) => s + num(l.qty), 0);
              const rec = (p.itemLines || []).reduce((s, l) => s + num(l.received), 0);
              return (
                <tr key={p.id} onDoubleClick={() => nav.open('bill', { fromId: p.id, n: Date.now() })}>
                  <td>{fmtDate(p.date, company.dateStyle)}</td>
                  <td>{p.num}</td>
                  <td>{L.nameOf(p.vendorId)}</td>
                  <td>{fmtDate(p.expectedDate, company.dateStyle)}</td>
                  <td className="r">
                    {ord} / {rec}
                  </td>
                  <td className="r">{money(p.total)}</td>
                  <td>
                    <button className="btn sm primary" onClick={() => nav.open('bill', { fromId: p.id, n: Date.now() })}>
                      Receive &amp; Bill
                    </button>{' '}
                    <button className="btn sm" onClick={() => nav.openTxn(p)}>
                      Open PO
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!pos.length && <Empty icon={<PackageCheck size={28} />}>No open purchase orders.</Empty>}
      </div>
    </div>
  );
}
