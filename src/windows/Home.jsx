import { useMemo, useState } from 'react';
import {
  ClipboardList,
  PackageCheck,
  Receipt,
  CreditCard,
  FileText,
  FileSpreadsheet,
  ShoppingBag,
  ShoppingCart,
  Wallet,
  Landmark,
  Undo2,
  ScrollText,
  BookOpen,
  Package,
  Boxes,
  BarChart3,
  List,
  ArrowRightLeft,
  ArrowRight,
  ArrowDown,
  AlertTriangle,
  Users,
  Truck,
  Bell,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { usePerm } from '../store/users';
import { useStore, useLookups } from '../store/store';
import { useNav } from '../store/nav';
import { displayBal, inRange } from '../lib/ledger';
import { money, compact, num, round2 } from '../lib/format';
import { today, fiscalYearStart, addMonths, parseISO, toISO, monthLabel, addDays } from '../lib/dates';
import { isPL } from '../store/defaults';
import { isDue } from '../lib/memorize';

function Node({ icon: Icon, label, onClick, count, page }) {
  const { can } = usePerm();
  if (page && !can(page)) return null; // this user may not open it
  return (
    <button className="flow-node" onClick={onClick}>
      <span className="ic">
        <Icon size={22} />
      </span>
      {label}
      {count !== undefined && <span className="count">{count}</span>}
    </button>
  );
}
const Arrow = ({ down }) => (down ? <ArrowDown size={18} className="flow-arrow" /> : <ArrowRight size={18} className="flow-arrow" />);

function ChartTip({ active, payload, label, cur }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="t">{label}</div>
      {payload.map((p) => (
        <div className="r" key={p.dataKey}>
          <span>
            <i style={{ background: p.color }} />
            {p.name}
          </span>
          <b>
            {cur} {money(p.value)}
          </b>
        </div>
      ))}
    </div>
  );
}

function Insights({ visible = true }) {
  const { data, ledger, company } = useStore();
  const L = useLookups();
  const nav = useNav();
  const t = today();
  const fyStart = fiscalYearStart(t, company.fyMonth || 1);

  const stats = useMemo(() => {
    const accType = (id) => ledger.accMap.get(id)?.type;
    let inc = 0;
    let exp = 0;
    let lastInc = 0;
    let lastExp = 0;
    const lyStart = addMonths(fyStart, -12);
    const lyEnd = addMonths(t, -12);
    for (const l of ledger.lines) {
      const ty = accType(l.accountId);
      if (!isPL(ty)) continue;
      const isInc = ty === 'Income' || ty === 'Other Income';
      if (inRange(l.date, fyStart, t)) {
        if (isInc) inc -= l.amount;
        else exp += l.amount;
      }
      if (inRange(l.date, lyStart, lyEnd)) {
        if (isInc) lastInc -= l.amount;
        else lastExp += l.amount;
      }
    }
    const ar = [...ledger.custBal.values()].reduce((s, v) => s + v, 0);
    const overdue = data.txns
      .filter((x) => x.type === 'invoice' && !x.voided && (ledger.open.get(x.id) || 0) > 0 && (x.dueDate || x.date) < t)
      .reduce((s, x) => s + ledger.open.get(x.id), 0);
    const ap = [...ledger.vendBal.values()].reduce((s, v) => s + v, 0);
    const invVal = data.items.filter((i) => i.type === 'Inventory Part').reduce((s, i) => s + ledger.itemStat(i.id).value, 0);
    const cash = data.accounts.filter((a) => a.type === 'Bank').reduce((s, a) => s + (ledger.acctBal.get(a.id) || 0), 0);
    return { inc, exp, net: inc - exp, lastNet: lastInc - lastExp, lastInc, ar, overdue, ap, invVal, cash };
  }, [ledger, data, fyStart, t]);

  // last 12 months income vs expense
  const months = useMemo(() => {
    const out = [];
    const start = parseISO(addMonths(t, -11));
    for (let i = 0; i < 12; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      out.push({ from: toISO(d), to: toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)), label: monthLabel(toISO(d)), income: 0, expense: 0 });
    }
    for (const l of ledger.lines) {
      const ty = ledger.accMap.get(l.accountId)?.type;
      if (!isPL(ty)) continue;
      const m = out.find((x) => l.date >= x.from && l.date <= x.to);
      if (!m) continue;
      if (ty === 'Income' || ty === 'Other Income') m.income -= l.amount;
      else m.expense += l.amount;
    }
    return out.map((m) => ({ ...m, income: round2(m.income), expense: round2(m.expense) }));
  }, [ledger, t]);

  const topCustomers = useMemo(() => {
    const m = new Map();
    for (const l of ledger.lines) {
      if (!['invoice', 'salesreceipt', 'creditmemo'].includes(l.type) || !inRange(l.date, fyStart, t)) continue;
      const ty = ledger.accMap.get(l.accountId)?.type;
      if (ty !== 'Income') continue;
      m.set(l.nameId, (m.get(l.nameId) || 0) - l.amount);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [ledger, fyStart, t]);

  const topItems = useMemo(
    () =>
      data.items
        .map((i) => ({ i, s: ledger.itemStat(i.id) }))
        .filter((x) => x.s.soldAmt > 0)
        .sort((a, b) => b.s.soldAmt - a.s.soldAmt)
        .slice(0, 6),
    [data.items, ledger],
  );
  const maxCust = topCustomers[0]?.[1] || 1;
  const maxItem = topItems[0]?.s.soldAmt || 1;
  const cur = company.currency;
  const delta = (a, b) => (b ? `${a >= b ? '▲' : '▼'} ${Math.abs(Math.round(((a - b) / Math.abs(b)) * 100))}% vs last year` : 'no data last year');

  return (
    <>
      <div className="kpis">
        <button className="kpi" onClick={() => nav.report('pl')}>
          <div className="lbl">Income · fiscal year to date</div>
          <div className="val">
            {cur} {compact(stats.inc)}
          </div>
          <div className="delta">{delta(stats.inc, stats.lastInc)}</div>
        </button>
        <button className="kpi" onClick={() => nav.report('pl')}>
          <div className="lbl">Net income · FYTD</div>
          <div className={'val' + (stats.net < 0 ? ' neg' : '')}>
            {cur} {compact(stats.net)}
          </div>
          <div className="delta">{delta(stats.net, stats.lastNet)}</div>
        </button>
        <button className="kpi" onClick={() => nav.report('arsum')}>
          <div className="lbl">Customers owe you</div>
          <div className="val">
            {cur} {compact(stats.ar)}
          </div>
          <div className="delta">{stats.overdue > 0 ? `${cur} ${compact(stats.overdue)} overdue` : 'nothing overdue'}</div>
        </button>
        <button className="kpi" onClick={() => nav.report('apsum')}>
          <div className="lbl">You owe vendors</div>
          <div className="val">
            {cur} {compact(stats.ap)}
          </div>
          <div className="delta">
            Cash {cur} {compact(stats.cash)} · Stock {cur} {compact(stats.invVal)}
          </div>
        </button>
      </div>
      <div className="charts">
        <div className="chart-card">
          <h3>Income and expenses</h3>
          <div className="sub">Last 12 months · click a month for its Profit &amp; Loss</div>
          <div className="legend">
            <span>
              <i style={{ background: 'var(--series-1)' }} />
              Income
            </span>
            <span>
              <i style={{ background: 'var(--series-2)' }} />
              Expenses (incl. COGS)
            </span>
          </div>
          <div style={{ height: 250 }}>
            {/* measure the chart only while it can be seen (a hidden window has no size) */}
            {visible && (
            <ResponsiveContainer>
              <BarChart
                data={months}
                barGap={2}
                margin={{ top: 6, right: 4, left: 0, bottom: 0 }}
                onClick={(e) => {
                  const m = e?.activePayload?.[0]?.payload;
                  if (m) nav.open('report', { reportId: 'pl', from: m.from, to: m.to, range: 'Custom', force: true });
                }}
              >
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--grid)' }} tick={{ fill: 'var(--text-2)', fontSize: 11 }} />
                <YAxis tickFormatter={compact} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-2)', fontSize: 11 }} width={44} />
                <Tooltip content={<ChartTip cur={cur} />} cursor={{ fill: 'var(--row-hover)' }} />
                <Bar dataKey="income" name="Income" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={18} style={{ cursor: 'pointer' }} />
                <Bar dataKey="expense" name="Expenses" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={18} style={{ cursor: 'pointer' }} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="chart-card">
          <h3>Top customers</h3>
          <div className="sub">Sales this fiscal year</div>
          <div className="bar-list">
            {topCustomers.map(([id, v]) => (
              <div key={id} className="bl-row" onClick={() => nav.report('quickreport', { nameId: id, sales: true })} title={`${cur} ${money(v)}`}>
                <span>{L.nameOf(id) || 'No name'}</span>
                <b>{compact(v)}</b>
                <div className="bl-track">
                  <div className="bl-fill" style={{ width: `${Math.max(2, (v / maxCust) * 100)}%` }} />
                </div>
              </div>
            ))}
            {!topCustomers.length && <span className="muted small">No sales yet this year.</span>}
          </div>
          <h3 style={{ marginTop: 18 }}>Best-selling items</h3>
          <div className="sub">All time, by sales amount</div>
          <div className="bar-list">
            {topItems.map(({ i, s }) => (
              <div key={i.id} className="bl-row" onClick={() => nav.report('quickreport', { itemId: i.id })} title={`${cur} ${money(s.soldAmt)} · ${s.soldQty} sold`}>
                <span>{i.name}</span>
                <b>{compact(s.soldAmt)}</b>
                <div className="bl-track">
                  <div className="bl-fill" style={{ width: `${Math.max(2, (s.soldAmt / maxItem) * 100)}%`, background: 'var(--series-3)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default function Home({ tab: t0, active = true }) {
  const { data, ledger, company } = useStore();
  const perm = usePerm();
  const L = useLookups();
  const nav = useNav();
  const [tab, setTab] = useState(t0 === 'insights' ? 'insights' : 'home');
  const o = nav.open;
  const t = today();

  const counts = useMemo(() => {
    const c = (fn) => data.txns.filter((x) => !x.voided && fn(x)).length;
    return {
      openPO: c((x) => x.type === 'purchaseorder' && !x.closed),
      openBills: c((x) => x.type === 'bill' && (ledger.open.get(x.id) || 0) > 0.004),
      dueBills: c((x) => x.type === 'bill' && (ledger.open.get(x.id) || 0) > 0.004 && (x.dueDate || x.date) <= addDays(t, 7)),
      openInv: c((x) => x.type === 'invoice' && (ledger.open.get(x.id) || 0) > 0.004),
      overdueInv: c((x) => x.type === 'invoice' && (ledger.open.get(x.id) || 0) > 0.004 && (x.dueDate || x.date) < t),
      openEst: c((x) => x.type === 'estimate' && !x.closed),
      openSO: c((x) => x.type === 'salesorder' && !x.closed),
      undeposited: ledger.undeposited.length,
      low: data.items.filter((i) => i.type === 'Inventory Part' && i.active !== false && num(i.reorderPoint) > 0 && ledger.itemStat(i.id).qty <= num(i.reorderPoint)).length,
    };
  }, [data, ledger, t]);

  const banks = data.accounts.filter((a) => ['Bank', 'Credit Card'].includes(a.type) && a.active !== false);
  const memorizedDue = (data.memorized || []).filter((m) => isDue(m));

  return (
    <div className="home">
      <div className="home-main">
        <div className="home-tabs">
          <button className={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}>
            Home Page
          </button>
          {perm.can('insights') && (
            <button className={tab === 'insights' ? 'on' : ''} onClick={() => setTab('insights')}>
              Insights
            </button>
          )}
        </div>
        {tab === 'insights' && perm.can('insights') ? (
          <Insights visible={active} />
        ) : (
          <div className="flow-wrap">
            <div>
              <div className="flow-panel">
                <span className="flow-label">VENDORS</span>
                <div className="flow-row">
                  <Node icon={ClipboardList} label="Purchase Orders" page="purchaseorder" onClick={() => o('purchaseorder')} count={counts.openPO ? `${counts.openPO} open` : undefined} />
                  <Arrow />
                  <Node icon={PackageCheck} label="Receive Inventory" page="receive" onClick={() => o('receive')} />
                  <Arrow />
                  <Node icon={Receipt} label="Enter Bills Against Inventory" page="receive" onClick={() => o('receive')} />
                  <Arrow />
                  <Node icon={CreditCard} label="Pay Bills" page="paybills" onClick={() => o('paybills')} count={counts.dueBills ? `${counts.dueBills} due soon` : undefined} />
                </div>
                <div className="flow-row" style={{ marginTop: 6 }}>
                  <Node icon={Truck} label="Vendor Center" page="vendors" onClick={() => o('vendors')} />
                  <Arrow />
                  <Node icon={Receipt} label="Enter Bills" page="bill" onClick={() => o('bill')} count={counts.openBills ? `${counts.openBills} unpaid` : undefined} />
                  <Arrow />
                  <Node icon={Undo2} label="Bill Credits" page="vendorcredit" onClick={() => o('vendorcredit')} />
                </div>
              </div>
              <div className="flow-panel">
                <span className="flow-label">CUSTOMERS</span>
                <div className="flow-row">
                  <Node icon={FileSpreadsheet} label="Estimates" page="estimate" onClick={() => o('estimate')} count={counts.openEst ? `${counts.openEst} open` : undefined} />
                  <Arrow />
                  <Node icon={ShoppingBag} label="Sales Orders" page="salesorder" onClick={() => o('salesorder')} count={counts.openSO ? `${counts.openSO} open` : undefined} />
                  <Arrow />
                  <Node icon={FileText} label="Create Invoices" page="invoice" onClick={() => o('invoice')} count={counts.overdueInv ? `${counts.overdueInv} overdue` : undefined} />
                  <Arrow />
                  <Node icon={Wallet} label="Receive Payments" page="payment" onClick={() => o('payment')} />
                  <Arrow />
                  <Node icon={Landmark} label="Record Deposits" page="deposit" onClick={() => o('deposit')} count={counts.undeposited ? `${counts.undeposited} waiting` : undefined} />
                </div>
                <div className="flow-row" style={{ marginTop: 6 }}>
                  <Node icon={Users} label="Customer Center" page="customers" onClick={() => o('customers')} />
                  <Arrow />
                  <Node icon={ShoppingCart} label="Create Sales Receipts" page="salesreceipt" onClick={() => o('salesreceipt')} />
                  <Arrow />
                  <Node icon={Undo2} label="Refunds & Credits" page="creditmemo" onClick={() => o('creditmemo')} />
                  <Arrow />
                  <Node icon={ScrollText} label="Statements" page="customers" onClick={() => o('customers')} />
                </div>
              </div>
              <div className="flow-panel">
                <span className="flow-label">REPORTS</span>
                <div className="flow-row">
                  <Node icon={BarChart3} label="Profit & Loss" page="report:pl" onClick={() => nav.report('pl')} />
                  <Node icon={BarChart3} label="Balance Sheet" page="report:bs" onClick={() => nav.report('bs')} />
                  <Node icon={BarChart3} label="Customer Balances" page="report:cbs" onClick={() => nav.report('cbs')} />
                  <Node icon={BarChart3} label="Vendor Balances" page="report:vbs" onClick={() => nav.report('vbs')} />
                  <Node icon={BarChart3} label="Inventory Valuation" page="report:invval" onClick={() => nav.report('invval')} />
                  <Node icon={BarChart3} label="Report Center" page="reportcenter" onClick={() => o('reportcenter')} />
                </div>
              </div>
            </div>
            <div>
              <div className="flow-panel">
                <span className="flow-label">COMPANY</span>
                <div className="flow-col">
                  <Node icon={BookOpen} label="Chart of Accounts" page="coa" onClick={() => o('coa')} />
                  <Node icon={Package} label="Items & Services" page="items" onClick={() => o('items')} count={counts.low ? `${counts.low} low stock` : undefined} />
                  <Node icon={Boxes} label="Inventory Activities" page="invadjust" onClick={() => o('invadjust')} />
                </div>
              </div>
              <div className="flow-panel">
                <span className="flow-label">BANKING</span>
                <div className="flow-col">
                  <Node icon={Landmark} label="Record Deposits" page="deposit" onClick={() => o('deposit')} />
                  <Node icon={ScrollText} label="Write Checks" page="check" onClick={() => o('check')} />
                  <Node icon={List} label="Check Register" page="register" onClick={() => o('register', { accountId: data.accounts.find((a) => a.sys === 'bank')?.id }, 'Register: Bank Account')} />
                  <Node icon={ArrowRightLeft} label="Transfer Funds" page="transfer" onClick={() => o('transfer')} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <aside className="home-side">
        {perm.can('register') && (
        <div className="side-card">
          <h4>Account balances</h4>
          {banks.map((a) => (
            <div key={a.id} className="acct-bal" onClick={() => o('register', { accountId: a.id }, 'Register: ' + a.name)}>
              <span>{a.name}</span>
              <b className={displayBal(a, ledger.acctBal.get(a.id) || 0) < 0 ? 'neg' : ''}>{money(displayBal(a, ledger.acctBal.get(a.id) || 0))}</b>
            </div>
          ))}
          <div className="acct-bal" onClick={() => o('deposit')}>
            <span>Undeposited Funds</span>
            <b>{money(ledger.acctBal.get(ledger.sys.UF) || 0)}</b>
          </div>
        </div>
        )}
        <div className="side-card">
          <h4>
            <span>
              <Bell size={12} /> Reminders
            </span>
          </h4>
          {counts.overdueInv > 0 && perm.can('report:collections') && (
            <button className="side-link" onClick={() => nav.report('collections')}>
              <AlertTriangle size={11} /> {counts.overdueInv} overdue invoice(s)
            </button>
          )}
          {counts.dueBills > 0 && perm.can('paybills') && (
            <button className="side-link" onClick={() => o('paybills')}>
              {counts.dueBills} bill(s) due within 7 days
            </button>
          )}
          {counts.undeposited > 0 && perm.can('deposit') && (
            <button className="side-link" onClick={() => o('deposit')}>
              {counts.undeposited} payment(s) to deposit
            </button>
          )}
          {counts.low > 0 && perm.can('report:lowstock') && (
            <button className="side-link" onClick={() => nav.report('lowstock')}>
              {counts.low} item(s) below reorder point
            </button>
          )}
          {counts.openPO > 0 && perm.can('receive') && (
            <button className="side-link" onClick={() => o('receive')}>
              {counts.openPO} purchase order(s) to receive
            </button>
          )}
          {counts.openSO > 0 && perm.can('report:openso') && (
            <button className="side-link" onClick={() => nav.report('openso')}>
              {counts.openSO} sales order(s) to invoice
            </button>
          )}
          {perm.can('memorized') && memorizedDue.map((m) => (
            <button key={m.id} className="side-link" onClick={() => o('memorized')}>
              Memorized: {m.name} ({m.frequency})
            </button>
          ))}
          {!counts.overdueInv && !counts.dueBills && !counts.undeposited && !counts.low && !counts.openPO && !counts.openSO && <span className="muted small">You're all caught up.</span>}
        </div>
        <div className="side-card">
          <h4>{company.name}</h4>
          <div className="side-row">
            <span className="l">Customers</span>
            <span>{data.customers.length}</span>
          </div>
          <div className="side-row">
            <span className="l">Vendors</span>
            <span>{data.vendors.length}</span>
          </div>
          <div className="side-row">
            <span className="l">Items</span>
            <span>{data.items.length}</span>
          </div>
          <div className="side-row">
            <span className="l">Transactions</span>
            <span>{data.txns.length}</span>
          </div>
          {perm.can('companyinfo') && (
            <button className="side-link" onClick={() => o('companyinfo', { tab: 'theme', n: Date.now() })}>
              Change theme color
            </button>
          )}
          <button className="side-link" onClick={() => o('shortcuts')}>
            Keyboard shortcuts (F1)
          </button>
          <span className="muted small">{L.lists.terms.length ? '' : ''}</span>
        </div>
      </aside>
    </div>
  );
}
