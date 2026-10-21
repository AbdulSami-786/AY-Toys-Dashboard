// Menu bar structure, global keyboard shortcuts and the shortcut reference.

export const REPORT_GROUPS = [
  {
    name: 'Company & Financial',
    reports: [
      ['pl', 'Profit & Loss Standard'],
      ['pldetail', 'Profit & Loss Detail'],
      ['plmonth', 'Profit & Loss by Month'],
      ['plprev', 'Profit & Loss Prev Year Comparison'],
      ['incsum', 'Income by Customer Summary'],
      ['incdetail', 'Income by Customer Detail'],
      ['bs', 'Balance Sheet Standard'],
      ['bsdetail', 'Balance Sheet Detail'],
      ['bsprev', 'Balance Sheet Prev Year Comparison'],
    ],
  },
  {
    name: 'Customers & Receivables',
    reports: [
      ['arsum', 'A/R Aging Summary'],
      ['ardetail', 'A/R Aging Detail'],
      ['cbs', 'Customer Balance Summary'],
      ['cbd', 'Customer Balance Detail'],
      ['openinv', 'Open Invoices'],
      ['collections', 'Collections Report'],
    ],
  },
  {
    name: 'Sales',
    reports: [
      ['salescust', 'Sales by Customer Summary'],
      ['salescustdetail', 'Sales by Customer Detail'],
      ['salesitem', 'Sales by Item Summary'],
      ['salesrep', 'Sales by Rep Summary'],
      ['openso', 'Open Sales Orders by Customer'],
      ['estimates', 'Estimates by Customer'],
    ],
  },
  {
    name: 'Vendors & Payables',
    reports: [
      ['apsum', 'A/P Aging Summary'],
      ['apdetail', 'A/P Aging Detail'],
      ['vbs', 'Vendor Balance Summary'],
      ['vbd', 'Vendor Balance Detail'],
      ['unpaidbills', 'Unpaid Bills Detail'],
    ],
  },
  {
    name: 'Purchases',
    reports: [
      ['purchvend', 'Purchases by Vendor Summary'],
      ['purchitem', 'Purchases by Item Summary'],
      ['openpo', 'Open Purchase Orders'],
    ],
  },
  {
    name: 'Inventory',
    reports: [
      ['invval', 'Inventory Valuation Summary'],
      ['invvaldetail', 'Inventory Valuation Detail'],
      ['stock', 'Inventory Stock Status by Item'],
      ['physinv', 'Physical Inventory Worksheet'],
      ['lowstock', 'Items Below Reorder Point'],
    ],
  },
  {
    name: 'Banking',
    reports: [
      ['deposits', 'Deposit Detail'],
      ['checks', 'Check Detail'],
      ['missingchecks', 'Missing Checks'],
    ],
  },
  {
    name: 'Accountant & Taxes',
    reports: [
      ['tb', 'Trial Balance'],
      ['gl', 'General Ledger'],
      ['journal', 'Journal'],
      ['txnlist', 'Transaction List by Date'],
      ['salestax', 'Sales Tax Liability'],
      ['audit', 'Audit Trail'],
    ],
  },
  {
    name: 'List',
    reports: [
      ['acctlist', 'Account Listing'],
      ['custlist', 'Customer Contact List'],
      ['custphone', 'Customer Phone List'],
      ['vendlist', 'Vendor Contact List'],
      ['pricelist', 'Item Price List'],
      ['itemlisting', 'Item Listing'],
    ],
  },
];

export const REPORT_NAMES = Object.fromEntries(REPORT_GROUPS.flatMap((g) => g.reports));
Object.assign(REPORT_NAMES, { quickreport: 'QuickReport', txndetail: 'Transaction Detail by Account', history: 'Transaction History' });

const R = (id) => ({ label: REPORT_NAMES[id], cmd: { report: id } });

export const MENUS = [
  {
    name: 'File',
    key: 'f',
    items: [
      { label: 'New Company...', cmd: { open: 'newcompany' } },
      { label: 'Open or Restore Company...', key: 'Ctrl+O', cmd: { open: 'companies' } },
      { label: 'Close Company', cmd: { action: 'closeCompany' } },
      '-',
      { label: 'Back Up Company (download)...', cmd: { action: 'backup' } },
      { label: 'Restore Backup File...', cmd: { action: 'restore' } },
      '-',
      {
        label: 'Utilities',
        items: [
          { label: 'Import Lists from CSV...', cmd: { open: 'import' } },
          { label: 'Export Lists to CSV...', cmd: { open: 'import', props: { tab: 'export' } } },
          { label: 'Google Sheets Sync...', cmd: { open: 'sync' } },
          { label: 'Rebuild Data (recalculate)', cmd: { action: 'rebuild' } },
        ],
      },
      '-',
      { label: 'Print...', key: 'Ctrl+P', cmd: { key: 'ctrl+p' } },
      { label: 'Close Window', key: 'Esc', cmd: { action: 'closeWindow' } },
    ],
  },
  {
    name: 'Edit',
    key: 'e',
    items: [
      { label: 'Edit Selected', key: 'Ctrl+E', cmd: { key: 'ctrl+e' } },
      { label: 'New', key: 'Ins', cmd: { key: 'ctrl+n' } },
      { label: 'Delete', key: 'Ctrl+D', cmd: { key: 'ctrl+d' } },
      { label: 'Void Transaction', cmd: { key: 'void' } },
      { label: 'Copy Transaction', cmd: { key: 'copy' } },
      { label: 'Memorize Transaction', key: 'Ctrl+M', cmd: { key: 'ctrl+m' } },
      { label: 'Go To Transfer', key: 'Ctrl+G', cmd: { open: 'transfer' } },
      '-',
      { label: 'Transaction History', key: 'Ctrl+H', cmd: { key: 'ctrl+h' } },
      { label: 'Transaction Journal', key: 'Ctrl+Y', cmd: { key: 'ctrl+y' } },
      '-',
      { label: 'Find...', key: 'Ctrl+F', cmd: { open: 'find' } },
      { label: 'Preferences...', cmd: { open: 'companyinfo', props: { tab: 'prefs' } } },
    ],
  },
  {
    name: 'View',
    key: 'v',
    items: [
      { label: 'Home Page', cmd: { open: 'home' } },
      { label: 'Open Window List', cmd: { action: 'toggleWindowList' } },
      { label: 'Left Icon Bar', cmd: { action: 'toggleIconBar' } },
      { label: 'Customize Shortcuts...', cmd: { action: 'customizeShortcuts' } },
      { label: 'Add Current Window to Shortcuts', cmd: { action: 'addWindowShortcut' } },
      { label: 'Full Screen', key: 'F11', cmd: { action: 'fullscreen' } },
      '-',
      { label: 'Next Window', key: 'Alt+PgDn', cmd: { action: 'nextWindow' } },
      { label: 'Previous Window', key: 'Alt+PgUp', cmd: { action: 'prevWindow' } },
    ],
  },
  {
    name: 'Lists',
    key: 'l',
    items: [
      { label: 'Chart of Accounts', key: 'Ctrl+A', cmd: { open: 'coa' } },
      { label: 'Item List', key: 'Ctrl+L', cmd: { open: 'items' } },
      { label: 'Price Level List', cmd: { open: 'lists', props: { tab: 'priceLevels' } } },
      { label: 'Sales Tax / Customer & Vendor Profile Lists', cmd: { open: 'lists' } },
      { label: 'Templates (Invoice & Bill Designs)', cmd: { open: 'templates' } },
      '-',
      { label: 'Memorized Transaction List', key: 'Alt+T', cmd: { open: 'memorized' } },
    ],
  },
  {
    name: 'Company',
    key: 'c',
    items: [
      { label: 'Home Page', cmd: { open: 'home' } },
      { label: 'Company Snapshot', cmd: { open: 'home', props: { tab: 'insights' } } },
      '-',
      { label: 'Company Information...', cmd: { open: 'companyinfo' } },
      { label: 'Theme & Appearance...', cmd: { open: 'companyinfo', props: { tab: 'theme' } } },
      { label: 'Company List / Switch Company', cmd: { open: 'companies' } },
      { label: 'Google Sheets Sync...', cmd: { open: 'sync' } },
      '-',
      { label: 'Users & Permissions...', cmd: { open: 'users' } },
      { label: 'Change My Password...', cmd: { action: 'changePassword' } },
      { label: 'Fingerprint...', cmd: { action: 'fingerprint' } },
      { label: 'Lock Screen', cmd: { action: 'lock' } },
      { label: 'Log Out', cmd: { action: 'logout' } },
      '-',
      { label: 'Chart of Accounts', key: 'Ctrl+A', cmd: { open: 'coa' } },
      { label: 'Make General Journal Entries...', key: 'Alt+Shift+J', cmd: { open: 'journal' } },
    ],
  },
  {
    name: 'Customers',
    key: 'u',
    items: [
      { label: 'Customer Center', key: 'Ctrl+J', cmd: { open: 'customers' } },
      '-',
      { label: 'Create Estimates', key: 'Alt+Shift+E', cmd: { open: 'estimate' } },
      { label: 'Create Sales Orders', key: 'Alt+Shift+O', cmd: { open: 'salesorder' } },
      { label: 'Create Invoices', key: 'Ctrl+I', cmd: { open: 'invoice' } },
      { label: 'Enter Sales Receipts', key: 'Alt+Shift+S', cmd: { open: 'salesreceipt' } },
      '-',
      { label: 'Receive Payments', key: 'Alt+Shift+R', cmd: { open: 'payment' } },
      { label: 'Create Credit Memos/Refunds', key: 'Alt+Shift+C', cmd: { open: 'creditmemo' } },
      { label: 'Income Tracker', cmd: { open: 'tracker', props: { kind: 'income' } } },
      '-',
      { label: 'Customize Invoice Template...', cmd: { open: 'templates', props: { formType: 'invoice' } } },
      { label: 'Item List', cmd: { open: 'items' } },
    ],
  },
  {
    name: 'Vendors',
    key: 'o',
    items: [
      { label: 'Vendor Center', key: 'Alt+Shift+V', cmd: { open: 'vendors' } },
      '-',
      { label: 'Enter Bills', key: 'Alt+Shift+B', cmd: { open: 'bill' } },
      { label: 'Pay Bills', key: 'Alt+Shift+P', cmd: { open: 'paybills' } },
      { label: 'Enter Bill Credits', cmd: { open: 'vendorcredit' } },
      { label: 'Bill Tracker', cmd: { open: 'tracker', props: { kind: 'bills' } } },
      { label: 'Customize Bill / PO Templates...', cmd: { open: 'templates', props: { formType: 'bill' } } },
      '-',
      { label: 'Create Purchase Orders', key: 'Alt+Shift+U', cmd: { open: 'purchaseorder' } },
      { label: 'Receive Items and Enter Bill', cmd: { open: 'receive' } },
      {
        label: 'Inventory Activities',
        items: [
          { label: 'Inventory Center (Item List)', cmd: { open: 'items' } },
          { label: 'Adjust Quantity/Value On Hand...', key: 'Alt+Shift+I', cmd: { open: 'invadjust' } },
          { label: 'Inventory Stock Status', cmd: { report: 'stock' } },
          { label: 'Physical Inventory Worksheet', cmd: { report: 'physinv' } },
        ],
      },
    ],
  },
  {
    name: 'Banking',
    key: 'b',
    items: [
      { label: 'Write Checks', key: 'Alt+K', cmd: { open: 'check' } },
      { label: 'Use Register', key: 'Ctrl+R', cmd: { open: 'pickregister' } },
      { label: 'Make Deposits', key: 'Alt+Shift+D', cmd: { open: 'deposit' } },
      { label: 'Transfer Funds', key: 'Ctrl+G', cmd: { open: 'transfer' } },
      '-',
      { label: 'Chart of Accounts', cmd: { open: 'coa' } },
    ],
  },
  {
    name: 'Reports',
    key: 'r',
    items: [
      { label: 'Report Center', cmd: { open: 'reportcenter' } },
      { label: 'Memorized Reports', cmd: { open: 'reportcenter', props: { tab: 'memorized' } } },
      { label: 'Company Snapshot', cmd: { open: 'home', props: { tab: 'insights' } } },
      '-',
      ...REPORT_GROUPS.map((g) => ({ label: g.name, items: g.reports.map(([id]) => R(id)) })),
      '-',
      { label: 'QuickReport', key: 'Ctrl+Q', cmd: { key: 'ctrl+q' } },
    ],
  },
  {
    name: 'Window',
    key: 'w',
    items: [
      { label: 'Close All', cmd: { action: 'closeAll' } },
      { label: 'Next Window', key: 'Alt+PgDn', cmd: { action: 'nextWindow' } },
      { label: 'Previous Window', key: 'Alt+PgUp', cmd: { action: 'prevWindow' } },
      '-',
      { windows: true },
    ],
  },
  {
    name: 'Help',
    key: 'h',
    items: [
      { label: 'Keyboard Shortcuts', key: 'F1', cmd: { open: 'shortcuts' } },
      { label: 'Product Information', key: 'F2', cmd: { open: 'productinfo' } },
      { label: 'Google Sheets Setup Guide', cmd: { open: 'sync', props: { tab: 'guide' } } },
    ],
  },
];

// Global shortcut map (combo -> command). Window-level handlers take priority.
export const GLOBAL_KEYS = {
  'ctrl+i': { open: 'invoice' },
  'ctrl+a': { open: 'coa', notInInput: true },
  'ctrl+w': { open: 'check' },
  'alt+k': { open: 'check' },
  'ctrl+j': { open: 'customers' },
  'ctrl+f': { open: 'find' },
  'ctrl+r': { open: 'pickregister' },
  'ctrl+t': { open: 'memorized' },
  'alt+t': { open: 'memorized' },
  'ctrl+o': { open: 'companies' },
  'ctrl+l': { open: 'items' },
  'ctrl+g': { open: 'transfer' },
  'ctrl+shift+f': { open: 'find', props: { advanced: true } },
  f1: { open: 'shortcuts' },
  f2: { open: 'productinfo' },
  'alt+pagedown': { action: 'nextWindow' },
  'alt+pageup': { action: 'prevWindow' },
  'alt+shift+e': { open: 'estimate' },
  'alt+shift+o': { open: 'salesorder' },
  'alt+shift+s': { open: 'salesreceipt' },
  'alt+shift+r': { open: 'payment' },
  'alt+shift+c': { open: 'creditmemo' },
  'alt+shift+v': { open: 'vendors' },
  'alt+shift+b': { open: 'bill' },
  'alt+shift+p': { open: 'paybills' },
  'alt+shift+u': { open: 'purchaseorder' },
  'alt+shift+i': { open: 'invadjust' },
  'alt+shift+d': { open: 'deposit' },
  'alt+shift+j': { open: 'journal' },
  'alt+shift+h': { open: 'home' },
  'alt+shift+x': { open: 'reportcenter' },
  'ctrl+shift+s': { action: 'sync' },
};

export function comboFromEvent(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  let k = e.key;
  if (k === ' ') k = 'space';
  if (k === 'Escape') k = 'esc';
  if (e.code && /^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
  else if (e.code && /^Digit\d$/.test(e.code)) k = e.code.slice(5);
  k = k.toLowerCase();
  if (['control', 'alt', 'shift', 'meta'].includes(k)) return '';
  parts.push(k);
  return parts.join('+');
}

export const SHORTCUT_HELP = [
  {
    group: 'Opening windows',
    rows: [
      ['Ctrl+I', 'Create Invoices'],
      ['Ctrl+A', 'Chart of Accounts'],
      ['Ctrl+J', 'Customer Center'],
      ['Ctrl+W  /  Alt+K', 'Write Checks (browser reserves Ctrl+W — use Alt+K)'],
      ['Ctrl+R', 'Use Register'],
      ['Ctrl+F', 'Find transactions'],
      ['Ctrl+L', 'Item List (or open the list of the current field)'],
      ['Ctrl+G', 'Transfer Funds / Go to transfer'],
      ['Ctrl+T  /  Alt+T', 'Memorized Transaction List (browser reserves Ctrl+T — use Alt+T)'],
      ['Ctrl+O', 'Company List / Open company'],
      ['F1', 'Keyboard shortcuts (this window)'],
      ['F2', 'Product Information'],
      ['Alt+Shift+E', 'Create Estimates'],
      ['Alt+Shift+O', 'Create Sales Orders'],
      ['Alt+Shift+S', 'Enter Sales Receipts'],
      ['Alt+Shift+R', 'Receive Payments'],
      ['Alt+Shift+C', 'Credit Memos / Refunds'],
      ['Alt+Shift+V', 'Vendor Center'],
      ['Alt+Shift+B', 'Enter Bills'],
      ['Alt+Shift+P', 'Pay Bills'],
      ['Alt+Shift+U', 'Purchase Orders'],
      ['Alt+Shift+I', 'Adjust Inventory Quantity/Value'],
      ['Alt+Shift+D', 'Make Deposits'],
      ['Alt+Shift+J', 'General Journal Entry'],
      ['Alt+Shift+X', 'Report Center'],
      ['Alt+Shift+H', 'Home Page'],
      ['Ctrl+Shift+S', 'Sync with Google Sheets now'],
    ],
  },
  {
    group: 'In transaction forms',
    rows: [
      ['Alt+S', 'Save & New'],
      ['Alt+A', 'Save & Close'],
      ['Alt+P', 'Previous transaction'],
      ['Alt+N', 'Next transaction'],
      ['Ctrl+N  /  Insert', 'New transaction'],
      ['Ctrl+D', 'Delete transaction'],
      ['Ctrl+M', 'Memorize transaction'],
      ['Ctrl+H', 'Transaction history (linked transactions)'],
      ['Ctrl+Y', 'Transaction journal (debits & credits)'],
      ['Ctrl+P', 'Print'],
      ['Ctrl+Insert', 'Insert line'],
      ['Ctrl+Delete', 'Delete line'],
      ['Esc', 'Close window'],
    ],
  },
  {
    group: 'In lists & centers',
    rows: [
      ['Ctrl+N  /  Insert', 'New item / customer / vendor / account'],
      ['Ctrl+E  /  Enter', 'Edit selected'],
      ['Ctrl+D', 'Delete selected'],
      ['Ctrl+Q', 'QuickReport for selected'],
      ['Ctrl+Shift+L', 'Share Ledger (customer / vendor center)'],
      ['Ctrl+R', 'Register for selected account'],
      ['↑ / ↓', 'Move selection'],
      ['Type letters', 'Jump to matching name'],
    ],
  },
  {
    group: 'In date fields',
    rows: [
      ['+  /  -', 'Next / previous day'],
      ['T', 'Today'],
      ['W  /  K', 'First / last day of week'],
      ['M  /  H', 'First / last day of month'],
      ['Y  /  R', 'First / last day of year'],
      ['[  /  ]', 'Same day previous / next week'],
      [";  /  '", 'Same day previous / next month'],
      ['Alt+↓', 'Open calendar'],
    ],
  },
  {
    group: 'In list fields & amounts',
    rows: [
      ['Type', 'Filter the list (type-ahead)'],
      ['Alt+↓  /  F4  /  Ctrl+L', 'Open the drop-down list'],
      ['↑ / ↓  then  Enter', 'Pick an entry'],
      ['12*450+100', 'Amount fields work as a calculator'],
    ],
  },
  {
    group: 'Menus & windows',
    rows: [
      ['Alt+F / E / V / L / C', 'File, Edit, View, Lists, Company menus'],
      ['Alt+U / O / B / R / W / H', 'Customers, Vendors, Banking, Reports, Window, Help menus'],
      ['Alt+PgDn  /  Alt+PgUp', 'Next / previous open window'],
      ['Esc', 'Close active window or dialog'],
    ],
  },
];
