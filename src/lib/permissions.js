// What each user may open. A "page" is a window or a report; the Super Admin ticks them per user.
import { REPORT_GROUPS } from './commands';

export const PAGE_GROUPS = [
  {
    name: 'Customers & Sales',
    pages: [
      ['customers', 'Customer Center'],
      ['invoice', 'Create Invoices'],
      ['salesreceipt', 'Sales Receipts'],
      ['payment', 'Receive Payments'],
      ['creditmemo', 'Credit Memos / Refunds'],
      ['estimate', 'Estimates'],
      ['salesorder', 'Sales Orders'],
      ['tracker:income', 'Income Tracker'],
    ],
  },
  {
    name: 'Vendors & Purchases',
    pages: [
      ['vendors', 'Vendor Center'],
      ['bill', 'Enter Bills'],
      ['paybills', 'Pay Bills'],
      ['vendorcredit', 'Bill Credits'],
      ['purchaseorder', 'Purchase Orders'],
      ['receive', 'Receive Items'],
      ['tracker:bills', 'Bill Tracker'],
    ],
  },
  {
    name: 'Items & Inventory',
    pages: [
      ['items', 'Item List'],
      ['bulkitems', 'Add/Edit Multiple Items (bulk add)'],
      ['invadjust', 'Adjust Quantity / Value'],
    ],
  },
  {
    name: 'Banking',
    pages: [
      ['register', 'Registers & account balances'],
      ['check', 'Write Checks'],
      ['deposit', 'Make Deposits'],
      ['transfer', 'Transfer Funds'],
    ],
  },
  {
    name: 'Accounting',
    pages: [
      ['coa', 'Chart of Accounts'],
      ['journal', 'General Journal Entries'],
      ['memorized', 'Memorized Transactions'],
    ],
  },
  {
    name: 'Overview & Search',
    pages: [
      ['insights', 'Insights / Company Snapshot'],
      ['find', 'Find'],
      ['reportcenter', 'Report Center'],
      ['shops:figures', 'Shop figures & All Shops reports (start screen)'],
    ],
  },
  ...REPORT_GROUPS.map((g) => ({ name: 'Reports — ' + g.name, pages: g.reports.map(([id, label]) => ['report:' + id, label]) })),
  { name: 'Reports — Other', pages: [['report:quickreport', 'QuickReport, Transaction Detail & History']] },
  {
    name: 'Company & Settings',
    pages: [
      ['companyinfo', 'Company Information & Preferences'],
      ['lists', 'Profile Lists & Price Levels'],
      ['templates', 'Invoice & Bill Templates'],
      ['sync', 'Google Sheets Sync'],
      ['import', 'Import / Export CSV'],
      ['backup', 'Back Up & Restore'],
    ],
  },
];

export const ALL_PAGES = PAGE_GROUPS.flatMap((g) => g.pages.map(([k]) => k));
export const PAGE_LABEL = Object.fromEntries(PAGE_GROUPS.flatMap((g) => g.pages));

const reportsOf = (...groups) => REPORT_GROUPS.filter((g) => groups.includes(g.name)).flatMap((g) => g.reports.map(([id]) => 'report:' + id));

// starting points for a new user (the Super Admin can tick and untick anything afterwards)
export const PRESETS = [
  { id: 'all', label: 'Everything', pages: ALL_PAGES },
  {
    id: 'sales',
    label: 'Sales counter',
    pages: ['customers', 'invoice', 'salesreceipt', 'payment', 'creditmemo', 'estimate', 'salesorder', 'items', 'find', 'report:custlist', 'report:pricelist', 'report:openinv', 'report:stock'],
  },
  {
    id: 'purchase',
    label: 'Purchases & stock',
    pages: ['vendors', 'bill', 'paybills', 'vendorcredit', 'purchaseorder', 'receive', 'tracker:bills', 'items', 'invadjust', 'find', 'reportcenter', ...reportsOf('Vendors & Payables', 'Purchases', 'Inventory')],
  },
  {
    id: 'accountant',
    label: 'Accountant',
    pages: ALL_PAGES.filter((p) => !['backup', 'sync', 'import', 'companyinfo'].includes(p)),
  },
];

// pages anyone who can log in may use
const ALWAYS = new Set(['home', 'shortcuts', 'productinfo', 'companies', 'changepassword']);
// only for a Super Admin
const ADMIN_ONLY = new Set(['users', 'newcompany', 'rebuild']);

/** The permission key of a window (type + props as passed to open()). */
export function pageKey(type, props = {}) {
  if (type === 'report') return ['quickreport', 'txndetail', 'history'].includes(props.reportId) ? 'report:quickreport' : 'report:' + props.reportId;
  if (type === 'tracker') return 'tracker:' + (props.kind === 'bills' ? 'bills' : 'income');
  if (type === 'home') return props.tab === 'insights' ? 'insights' : 'home';
  if (type === 'billpayment') return 'paybills';
  if (type === 'templateeditor') return 'templates';
  if (type === 'pickregister') return 'register';
  return type;
}

export const isAdmin = (user) => !!user && user.role === 'admin';

/** May this user use this page / permission? ('delete' = delete and void transactions) */
export function userCan(user, key) {
  if (!user || user.active === false || user.deleted) return false;
  if (isAdmin(user)) return true;
  if (ADMIN_ONLY.has(key)) return false;
  if (ALWAYS.has(key)) return true;
  if (key === 'delete') return !!user.canDelete;
  return Array.isArray(user.pages) && user.pages.includes(key);
}

export function userCanShop(user, companyId) {
  if (!user) return false;
  if (isAdmin(user) || user.shops === 'all' || !Array.isArray(user.shops)) return true;
  return user.shops.includes(companyId);
}
