import { useState } from 'react';
import { BarChart3, Search, Trash2 } from 'lucide-react';
import { useStore } from '../../store/store';
import { useNav } from '../../store/nav';
import { REPORT_GROUPS as ALL_GROUPS } from '../../lib/commands';
import { usePerm } from '../../store/users';
import { Empty } from '../../components/ui';

const DESCRIPTIONS = {
  pl: 'How much money did my company make or lose over a period?',
  pldetail: 'Every transaction behind the profit & loss totals.',
  plmonth: 'Income and expenses month by month.',
  plprev: 'This period vs. the same period last year.',
  bs: 'What is my company worth? Assets, liabilities and equity.',
  bsdetail: 'Every transaction that changed a balance sheet account.',
  bsprev: 'Balance sheet today vs. one year ago.',
  arsum: 'How much do customers owe, and how overdue is it?',
  ardetail: 'Each unpaid invoice grouped by days overdue.',
  cbs: 'How much does each customer owe me?',
  cbd: 'Every invoice and payment for each customer, with running balance.',
  openinv: 'Which invoices are still unpaid?',
  collections: 'Overdue invoices with phone numbers — who to call.',
  incsum: 'Net income from each customer: income minus cost of goods sold.',
  incdetail: 'Every income and cost line behind the net income from each customer.',
  salescust: 'Total sales to each customer.',
  salescustdetail: 'Every item sold, grouped by customer.',
  salesitem: 'Quantity, sales, COGS and margin for each item.',
  salesrep: 'Sales by sales rep.',
  openso: 'Sales orders not yet invoiced.',
  estimates: 'Open estimates by customer.',
  apsum: 'How much do I owe vendors, and how overdue?',
  apdetail: 'Each unpaid bill grouped by days overdue.',
  vbs: 'How much do I owe each vendor?',
  vbd: 'Every bill and payment for each vendor.',
  unpaidbills: 'Which bills are still unpaid?',
  purchvend: 'Total stock purchased from each vendor.',
  purchitem: 'Quantity and cost purchased for each item.',
  openpo: 'Purchase orders not yet fully received.',
  invval: 'Value of stock on hand at average cost.',
  invvaldetail: 'Every stock movement with running quantity and value.',
  stock: 'On hand, on order, available and what to reorder.',
  physinv: 'Printable stock-count sheet.',
  lowstock: 'Items at or below reorder point.',
  deposits: 'Deposits and the payments in each.',
  checks: 'Checks and bill payments written.',
  missingchecks: 'Gaps or duplicates in check numbers.',
  tb: 'Debit/credit balance of every account.',
  gl: 'Every transaction in every account.',
  journal: 'Debits and credits of every transaction.',
  txnlist: 'All transactions by date.',
  salestax: 'Taxable sales and tax collected.',
  audit: 'Who changed what — recently entered, changed and voided.',
  acctlist: 'Chart of accounts with balances.',
  custlist: 'Customer contacts, terms and balances.',
  custphone: 'Customer phone list.',
  vendlist: 'Vendor contacts and balances.',
  pricelist: 'Item prices for each price level.',
  itemlisting: 'Items with cost, price and stock.',
};

export default function ReportCenter({ tab }) {
  const { company, updateCompany } = useStore();
  const { can } = usePerm();
  // only the reports this user may open
  const REPORT_GROUPS = ALL_GROUPS.map((g) => ({ ...g, reports: g.reports.filter(([id]) => can('report:' + id)) })).filter((g) => g.reports.length);
  const nav = useNav();
  const [group, setGroup] = useState(tab === 'memorized' || !REPORT_GROUPS.length ? 'memorized' : REPORT_GROUPS[0].name);
  const [q, setQ] = useState('');
  const memorized = (company.memorizedReports || []).filter((m) => can('report:' + m.reportId));
  const all = REPORT_GROUPS.flatMap((g) => g.reports.map(([id, name]) => ({ id, name, group: g.name })));
  const list = q.trim()
    ? all.filter((r) => (r.name + ' ' + (DESCRIPTIONS[r.id] || '')).toLowerCase().includes(q.toLowerCase()))
    : group === 'memorized'
      ? []
      : all.filter((r) => r.group === group);

  return (
    <div className="win">
      <div className="win-title">
        <BarChart3 size={20} />
        <h1>Report Center</h1>
        <div className="sp flex" style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 8 }} />
          <input placeholder="Search reports…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 26, width: 260 }} autoFocus />
        </div>
      </div>
      <div className="rc" style={{ flex: 1, minHeight: 0 }}>
        <nav className="rc-nav">
          {REPORT_GROUPS.map((g) => (
            <button key={g.name} className={group === g.name && !q ? 'on' : ''} onClick={() => (setGroup(g.name), setQ(''))}>
              {g.name}
            </button>
          ))}
          <button className={group === 'memorized' && !q ? 'on' : ''} onClick={() => (setGroup('memorized'), setQ(''))}>
            Memorized Reports ({memorized.length})
          </button>
        </nav>
        {group === 'memorized' && !q ? (
          <div className="rc-grid">
            {memorized.map((m) => (
              <div key={m.name} className="rc-card" tabIndex={0} onClick={() => nav.open('report', { reportId: m.reportId, filter: m.filter, range: m.range, from: m.range === 'Custom' ? m.from : undefined, to: m.range === 'Custom' ? m.to : undefined, force: true })}>
                <div className="rc-thumb" />
                <b>{m.name}</b>
                <small>{m.range}</small>
                <button
                  className="btn sm ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateCompany(company.id, { memorizedReports: (company.memorizedReports || []).filter((x) => x.name !== m.name) });
                  }}
                >
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            ))}
            {!memorized.length && <Empty>Open any report and click Memorize to keep it here with its settings.</Empty>}
          </div>
        ) : (
          <div className="rc-grid">
            {list.map((r) => (
              <button key={r.id} className="rc-card" onClick={() => nav.report(r.id)} onKeyDown={(e) => e.key === 'Enter' && nav.report(r.id)}>
                <div className="rc-thumb" />
                <b>{r.name}</b>
                <small>{DESCRIPTIONS[r.id]}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
