import Home from './Home';
import Companies from './Companies';
import CompanyInfo from './CompanyInfo';
import SyncWindow from './Sync';
import ChartOfAccounts from './ChartOfAccounts';
import ItemList from './ItemList';
import BulkItems from './BulkItems';
import NameCenter from './NameCenter';
import SalesForm from './forms/SalesForm';
import PurchaseForm from './forms/PurchaseForm';
import ReceivePayment from './forms/ReceivePayment';
import PayBills from './forms/PayBills';
import BillPayment from './forms/BillPayment';
import Deposit from './forms/Deposit';
import JournalEntry from './forms/JournalEntry';
import Transfer from './forms/Transfer';
import InventoryAdjust from './forms/InventoryAdjust';
import ReceiveItems from './forms/ReceiveItems';
import Register from './Register';
import ReportView from './reports/ReportView';
import ReportCenter from './reports/ReportCenter';
import Find from './Find';
import Memorized from './Memorized';
import ListsSetup from './ListsSetup';
import Tracker from './Tracker';
import { Shortcuts, ProductInfo } from './Help';
import ImportExport from './ImportExport';
import Templates from './templates/Templates';
import TemplateEditor from './templates/TemplateEditor';
import UsersWindow from './Users';
import { reportTitle } from '../lib/reports';
import { TXN_TYPES } from '../store/defaults';

export const WINDOW_COMPONENTS = {
  home: Home,
  companies: Companies,
  companyinfo: CompanyInfo,
  sync: SyncWindow,
  coa: ChartOfAccounts,
  items: ItemList,
  bulkitems: BulkItems,
  customers: (p) => <NameCenter which="customer" {...p} />,
  vendors: (p) => <NameCenter which="vendor" {...p} />,
  invoice: (p) => <SalesForm type="invoice" {...p} />,
  salesreceipt: (p) => <SalesForm type="salesreceipt" {...p} />,
  creditmemo: (p) => <SalesForm type="creditmemo" {...p} />,
  estimate: (p) => <SalesForm type="estimate" {...p} />,
  salesorder: (p) => <SalesForm type="salesorder" {...p} />,
  bill: (p) => <PurchaseForm type="bill" {...p} />,
  check: (p) => <PurchaseForm type="check" {...p} />,
  vendorcredit: (p) => <PurchaseForm type="vendorcredit" {...p} />,
  purchaseorder: (p) => <PurchaseForm type="purchaseorder" {...p} />,
  payment: ReceivePayment,
  paybills: PayBills,
  billpayment: BillPayment,
  deposit: Deposit,
  journal: JournalEntry,
  transfer: Transfer,
  invadjust: InventoryAdjust,
  receive: ReceiveItems,
  register: Register,
  report: ReportView,
  reportcenter: ReportCenter,
  find: Find,
  memorized: Memorized,
  lists: ListsSetup,
  tracker: Tracker,
  shortcuts: Shortcuts,
  productinfo: ProductInfo,
  import: ImportExport,
  templates: Templates,
  templateeditor: TemplateEditor,
  users: UsersWindow,
};

const TITLES = {
  home: 'Home',
  companies: 'Company List',
  companyinfo: 'Company Information',
  sync: 'Google Sheets Sync',
  coa: 'Chart of Accounts',
  items: 'Item List',
  bulkitems: 'Add/Edit Multiple Items',
  customers: 'Customer Center',
  vendors: 'Vendor Center',
  invoice: 'Create Invoices',
  salesreceipt: 'Enter Sales Receipts',
  creditmemo: 'Create Credit Memos/Refunds',
  estimate: 'Create Estimates',
  salesorder: 'Create Sales Orders',
  payment: 'Receive Payments',
  deposit: 'Make Deposits',
  bill: 'Enter Bills',
  check: 'Write Checks',
  vendorcredit: 'Enter Bill Credits',
  purchaseorder: 'Create Purchase Orders',
  paybills: 'Pay Bills',
  billpayment: 'Bill Payment',
  journal: 'Make General Journal Entries',
  transfer: 'Transfer Funds',
  invadjust: 'Adjust Quantity/Value on Hand',
  receive: 'Receive Items',
  register: 'Register',
  reportcenter: 'Report Center',
  find: 'Find',
  memorized: 'Memorized Transaction List',
  lists: 'Profile Lists',
  shortcuts: 'Keyboard Shortcuts',
  productinfo: 'Product Information',
  import: 'Import / Export',
  templates: 'Templates',
  templateeditor: 'Customize Template',
  users: 'Users & Permissions',
};

export function windowTitle(type, props = {}) {
  if (type === 'report') return reportTitle(props.reportId);
  if (type === 'tracker') return props.kind === 'bills' ? 'Bill Tracker' : 'Income Tracker';
  return TITLES[type] || type;
}

// which window edits a transaction of a given type
export const TXN_WINDOW = Object.fromEntries(Object.keys(TXN_TYPES).map((t) => [t, t]));
