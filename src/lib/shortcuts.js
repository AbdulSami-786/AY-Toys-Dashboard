// Left icon bar shortcuts (QuickBooks "Customize Icon Bar").
// Saved per company as company.shortcuts = [{ id, head } | { id, label, icon, cmd }], so the layout
// syncs with the company to other computers. Empty / missing = DEFAULT_SHORTCUTS.

import {
  Home,
  TrendingUp,
  Users,
  Truck,
  Package,
  Table2,
  BookOpen,
  FileText,
  ShoppingCart,
  Wallet,
  Receipt,
  CreditCard,
  ClipboardList,
  Boxes,
  Landmark,
  BarChart3,
  Building2,
  Keyboard,
  Search,
  PiggyBank,
  ArrowLeftRight,
  FileSpreadsheet,
  Star,
  Tag,
  Calculator,
  RefreshCw,
  Download,
  Undo2,
  FilePlus2,
  PackageCheck,
  Settings,
  LayoutTemplate,
  ListChecks,
  CircleDollarSign,
  Banknote,
  Bookmark,
  FileMinus,
  FileCheck2,
  NotebookPen,
  PieChart,
  Coins,
  Scale,
  Handshake,
  Calendar,
  Mail,
  Phone,
  Sparkles,
  Gift,
} from 'lucide-react';
import { REPORT_GROUPS } from './commands';

// Icons a shortcut can use (stored by name)
export const SHORTCUT_ICONS = {
  Home,
  TrendingUp,
  Users,
  Truck,
  Package,
  Table2,
  Boxes,
  PackageCheck,
  BookOpen,
  FileText,
  FilePlus2,
  FileMinus,
  FileCheck2,
  ShoppingCart,
  Wallet,
  Receipt,
  CreditCard,
  Banknote,
  Coins,
  CircleDollarSign,
  PiggyBank,
  Landmark,
  ArrowLeftRight,
  ClipboardList,
  ListChecks,
  NotebookPen,
  Undo2,
  BarChart3,
  PieChart,
  Scale,
  Building2,
  Handshake,
  Settings,
  LayoutTemplate,
  FileSpreadsheet,
  RefreshCw,
  Download,
  Search,
  Calculator,
  Calendar,
  Bookmark,
  Tag,
  Star,
  Sparkles,
  Gift,
  Mail,
  Phone,
  Keyboard,
};
export const iconOf = (name) => SHORTCUT_ICONS[name] || Star;

const W = (label, icon, open, props) => ({ label, icon, cmd: props ? { open, props } : { open } });
const A = (label, icon, action) => ({ label, icon, cmd: { action } });

// Everything that can be put on the icon bar, grouped for the "Add Shortcut" picker
export const SHORTCUT_CATALOG = [
  {
    group: 'Centers & Lists',
    items: [
      W('Home', 'Home', 'home'),
      W('Insights', 'TrendingUp', 'home', { tab: 'insights' }),
      W('Customers', 'Users', 'customers'),
      W('Vendors', 'Truck', 'vendors'),
      W('Items & Inventory', 'Package', 'items'),
      W('Add Multiple Items', 'Table2', 'bulkitems'),
      W('Chart of Accounts', 'BookOpen', 'coa'),
      W('Income Tracker', 'CircleDollarSign', 'tracker', { kind: 'income' }),
      W('Bill Tracker', 'Receipt', 'tracker', { kind: 'bills' }),
      W('Memorized Transactions', 'Bookmark', 'memorized'),
      W('Templates', 'LayoutTemplate', 'templates'),
      W('Profile Lists', 'ListChecks', 'lists'),
      W('Find', 'Search', 'find'),
    ],
  },
  {
    group: 'Customers',
    items: [
      W('Create Invoice', 'FileText', 'invoice'),
      W('Sales Receipt', 'ShoppingCart', 'salesreceipt'),
      W('Estimate', 'FilePlus2', 'estimate'),
      W('Sales Order', 'ClipboardList', 'salesorder'),
      W('Receive Payments', 'Wallet', 'payment'),
      W('Credit Memo / Refund', 'FileMinus', 'creditmemo'),
    ],
  },
  {
    group: 'Vendors',
    items: [
      W('Enter Bills', 'Receipt', 'bill'),
      W('Pay Bills', 'CreditCard', 'paybills'),
      W('Purchase Order', 'ClipboardList', 'purchaseorder'),
      W('Receive Items', 'PackageCheck', 'receive'),
      W('Bill Credit', 'Undo2', 'vendorcredit'),
      W('Write Checks', 'Landmark', 'check'),
    ],
  },
  {
    group: 'Banking & Inventory',
    items: [
      W('Make Deposits', 'PiggyBank', 'deposit'),
      W('Transfer Funds', 'ArrowLeftRight', 'transfer'),
      W('Use Register', 'NotebookPen', 'pickregister'),
      W('General Journal Entry', 'BookOpen', 'journal'),
      W('Adjust Inventory', 'Boxes', 'invadjust'),
    ],
  },
  {
    group: 'Reports',
    items: [
      W('Report Center', 'BarChart3', 'reportcenter'),
      ...REPORT_GROUPS.flatMap((g) => g.reports.map(([id, name]) => ({ label: name, icon: 'BarChart3', cmd: { report: id }, sub: g.name }))),
    ],
  },
  {
    group: 'Company',
    items: [
      W('Switch Company', 'Building2', 'companies'),
      W('Company Information', 'Settings', 'companyinfo'),
      W('Google Sheets Sync', 'RefreshCw', 'sync'),
      A('Sync Now', 'RefreshCw', 'sync'),
      A('Back Up Company', 'Download', 'backup'),
      W('Import / Export', 'FileSpreadsheet', 'import'),
      W('Shortcut Keys', 'Keyboard', 'shortcuts'),
    ],
  },
];

const S = (id, label, icon, cmd) => ({ id, label, icon, cmd });

// Same layout the icon bar always had
export const DEFAULT_SHORTCUTS = [
  { id: 'h1', head: 'My Shortcuts' },
  S('home', 'Home', 'Home', { open: 'home' }),
  S('insights', 'Insights', 'TrendingUp', { open: 'home', props: { tab: 'insights' } }),
  S('customers', 'Customers', 'Users', { open: 'customers' }),
  S('vendors', 'Vendors', 'Truck', { open: 'vendors' }),
  S('items', 'Items & Inventory', 'Package', { open: 'items' }),
  S('coa', 'Chart of Accounts', 'BookOpen', { open: 'coa' }),
  { id: 'h2', head: 'Do More' },
  S('invoice', 'Create Invoice', 'FileText', { open: 'invoice' }),
  S('salesreceipt', 'Sales Receipt', 'ShoppingCart', { open: 'salesreceipt' }),
  S('payment', 'Receive Payments', 'Wallet', { open: 'payment' }),
  S('bill', 'Enter Bills', 'Receipt', { open: 'bill' }),
  S('paybills', 'Pay Bills', 'CreditCard', { open: 'paybills' }),
  S('purchaseorder', 'Purchase Order', 'ClipboardList', { open: 'purchaseorder' }),
  S('invadjust', 'Adjust Inventory', 'Boxes', { open: 'invadjust' }),
  S('check', 'Write Checks', 'Landmark', { open: 'check' }),
  { id: 'h3', head: 'Reports' },
  S('reportcenter', 'Report Center', 'BarChart3', { open: 'reportcenter' }),
  S('r-pl', 'Profit & Loss', 'BarChart3', { report: 'pl' }),
  S('r-bs', 'Balance Sheet', 'BarChart3', { report: 'bs' }),
  S('r-cbs', 'Customer Balances', 'BarChart3', { report: 'cbs' }),
  S('r-vbs', 'Vendor Balances', 'BarChart3', { report: 'vbs' }),
  { id: 'h4', head: 'Company' },
  S('companies', 'Switch Company', 'Building2', { open: 'companies' }),
  S('shortcuts', 'Shortcut Keys', 'Keyboard', { open: 'shortcuts' }),
];

export const companyShortcuts = (company) => (Array.isArray(company?.shortcuts) && company.shortcuts.length ? company.shortcuts : DEFAULT_SHORTCUTS);

export const sameCmd = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

// What a shortcut opens, in words (shown in the editor)
export function describeCmd(cmd) {
  if (!cmd) return '';
  const hit = SHORTCUT_CATALOG.flatMap((g) => g.items).find((x) => sameCmd(x.cmd, cmd));
  if (hit) return (cmd.report ? 'Report: ' : '') + hit.label;
  if (cmd.report) return 'Report: ' + cmd.report;
  if (cmd.open) return 'Window: ' + cmd.open;
  return '';
}

// The shortcut for an open window (right-click a window tab → Add to Shortcuts)
const KEEP_PROPS = ['tab', 'kind', 'formType', 'accountId'];
export function shortcutForWindow(w) {
  if (w.type === 'report') {
    const filter = w.props?.filter && Object.keys(w.props.filter).length ? w.props.filter : undefined;
    return { label: w.title, icon: 'BarChart3', cmd: filter ? { report: w.props.reportId, filter } : { report: w.props.reportId } };
  }
  const props = Object.fromEntries(KEEP_PROPS.filter((k) => w.props?.[k] !== undefined && w.props[k] !== '').map((k) => [k, w.props[k]]));
  const cmd = Object.keys(props).length ? { open: w.type, props } : { open: w.type };
  const known = SHORTCUT_CATALOG.flatMap((g) => g.items).find((x) => x.cmd.open === w.type);
  return { label: w.title, icon: known?.icon || 'Star', cmd };
}
