// What each import template (one per dashboard page) contains, which columns are required,
// and the Excel file that is handed out as the template.
import { ITEM_TYPES, ACCOUNT_TYPES } from '../store/defaults';
import { XS, downloadXlsx } from './xlsx';

export const TEMPLATE_KINDS = ['customers', 'vendors', 'items', 'accounts', 'invoices', 'bills'];
export const KIND_LABEL = { customers: 'Customers', vendors: 'Vendors', items: 'Items', accounts: 'Chart of Accounts', invoices: 'Invoices', bills: 'Bills (purchases)' };
export const TXN_KINDS = ['bills', 'invoices']; // saved into the transactions table; order = import order
export const LIST_KINDS = ['customers', 'vendors', 'items', 'accounts'];

const TERMS_NOTE = 'e.g. Net 15, Net 30, Due on receipt. Blank = the customer/vendor default.';
const party = (what) => [
  { key: 'name', head: 'Name', req: true, note: `${what} name. Must be unique — names already in the dashboard are skipped.`, ex: what === 'Customer' ? 'Ali Toys Traders' : 'Star Plastics' },
  { key: 'company', head: 'Company', note: 'Printed on invoices/bills. Blank = same as Name.', ex: '' },
  { key: 'contact', head: 'Contact', note: 'Contact person.', ex: 'Ali Raza' },
  { key: 'phone', head: 'Phone', note: '', ex: '0300-1234567' },
  { key: 'email', head: 'Email', note: '', ex: 'ali@example.com' },
  { key: 'address', head: 'Address', note: 'Street address.', ex: 'Shop 12, Toy Market' },
  { key: 'city', head: 'City', note: '', ex: 'Lahore' },
  { key: 'terms', head: 'Terms', note: TERMS_NOTE, ex: 'Net 30' },
];

export const SPECS = {
  customers: {
    sheet: 'Customers',
    fields: [
      ...party('Customer'),
      { key: 'creditlimit', head: 'Credit Limit', note: 'Number. 0 or blank = no limit.', ex: 500000 },
      { key: 'ntn', head: 'NTN', note: 'Tax number.', ex: '1234567-8' },
    ],
  },
  vendors: {
    sheet: 'Vendors',
    fields: [...party('Vendor'), { key: 'ntn', head: 'NTN', note: 'Tax number.', ex: '7654321-0' }],
  },
  items: {
    sheet: 'Items',
    fields: [
      { key: 'name', head: 'Name', req: true, note: 'Item name. Must be unique — names already in the dashboard are skipped.', ex: 'Remote Control Car' },
      { key: 'sku', head: 'SKU', note: 'Item code. Must be unique if given.', ex: 'RC-001' },
      { key: 'type', head: 'Type', note: `One of: ${ITEM_TYPES.join(', ')}. Blank = Inventory Part.`, ex: 'Inventory Part' },
      { key: 'category', head: 'Category', note: '', ex: 'Cars' },
      { key: 'description', head: 'Description', note: 'Shown on invoices.', ex: 'Remote control car, 1:16' },
      { key: 'uom', head: 'U/M', note: 'Unit of measure. Blank = pcs.', ex: 'pcs' },
      { key: 'pkg', head: 'Pkg', note: 'Pieces in one carton (for carton invoicing).', ex: 24 },
      { key: 'cost', head: 'Cost', note: 'Purchase cost per unit.', ex: 450 },
      { key: 'price', head: 'Price', note: 'Sales price per unit.', ex: 650 },
      { key: 'reorderpoint', head: 'Reorder Point', note: 'Warn when stock falls to this.', ex: 20 },
      { key: 'barcode', head: 'Barcode', note: '', ex: '8901234567890' },
    ],
  },
  accounts: {
    sheet: 'Chart of Accounts',
    fields: [
      { key: 'name', head: 'Name', req: true, note: 'Account name. Must be unique.', ex: 'Shop Rent' },
      { key: 'type', head: 'Type', req: true, note: `Exactly one of: ${ACCOUNT_TYPES.join(', ')}.`, ex: 'Expense' },
      { key: 'number', head: 'Number', note: 'Account number.', ex: '6100' },
      { key: 'description', head: 'Description', note: '', ex: 'Monthly rent' },
    ],
  },
  invoices: {
    sheet: 'Invoices',
    note: 'One row per item line. Rows with the same Invoice No become ONE invoice; its date, customer, terms etc. are read from the first row. Invoice numbers already in the dashboard are skipped. Importing invoices takes stock out — import Bills (purchases) first so quantity on hand is right.',
    fields: [
      { key: 'num', head: 'Invoice No', req: true, note: 'Rows with the same number are one invoice.', ex: 1001 },
      { key: 'date', head: 'Date', req: true, note: 'YYYY-MM-DD (e.g. 2025-11-30) or a date typed in Excel.', ex: '2025-11-30' },
      { key: 'customer', head: 'Customer', req: true, note: 'Must already be in the dashboard (or on the Customers sheet of the same file).', ex: 'Ali Toys Traders' },
      { key: 'item', head: 'Item', req: true, note: 'Item name or SKU. Must already be in the dashboard (or on the Items sheet of the same file).', ex: 'Remote Control Car' },
      { key: 'qty', head: 'Qty', req: true, note: 'Quantity (pieces).', ex: 48 },
      { key: 'rate', head: 'Rate', req: true, note: 'Price per unit.', ex: 650 },
      { key: 'time', head: 'Time', note: 'HH:MM (e.g. 14:30). Blank = no time.', ex: '14:30' },
      { key: 'terms', head: 'Terms', note: `${TERMS_NOTE.replace('Blank = the customer/vendor default.', 'Blank = the customer default.')}`, ex: 'Net 30' },
      { key: 'duedate', head: 'Due Date', note: 'Blank = worked out from Terms.', ex: '2025-12-30' },
      { key: 'po', head: 'P.O. No.', note: "Customer's purchase order number.", ex: 'PO-77' },
      { key: 'taxrate', head: 'Tax %', note: 'Sales tax % for the whole invoice. Blank = no tax.', ex: '' },
      { key: 'description', head: 'Description', note: 'Line description. Blank = the item description.', ex: '' },
      { key: 'memo', head: 'Memo', note: 'Internal note.', ex: '' },
    ],
  },
  bills: {
    sheet: 'Bills',
    note: 'One row per item line. Rows with the same Bill No become ONE bill; its date, vendor, terms etc. are read from the first row. Bill numbers already in the dashboard are skipped. Importing bills adds stock.',
    fields: [
      { key: 'num', head: 'Bill No', req: true, note: "Vendor's bill / reference number. Rows with the same number are one bill.", ex: 'B-2207' },
      { key: 'date', head: 'Date', req: true, note: 'YYYY-MM-DD (e.g. 2025-11-30) or a date typed in Excel.', ex: '2025-11-30' },
      { key: 'vendor', head: 'Vendor', req: true, note: 'Must already be in the dashboard (or on the Vendors sheet of the same file).', ex: 'Star Plastics' },
      { key: 'item', head: 'Item', req: true, note: 'Item name or SKU. Must already be in the dashboard (or on the Items sheet of the same file).', ex: 'Remote Control Car' },
      { key: 'qty', head: 'Qty', req: true, note: 'Quantity (pieces).', ex: 240 },
      { key: 'cost', head: 'Cost', req: true, note: 'Purchase cost per unit.', ex: 450 },
      { key: 'time', head: 'Time', note: 'HH:MM (e.g. 14:30). Blank = no time.', ex: '10:15' },
      { key: 'terms', head: 'Terms', note: TERMS_NOTE.replace('the customer/vendor default', 'the vendor default'), ex: 'Net 30' },
      { key: 'duedate', head: 'Due Date', note: 'Blank = worked out from Terms.', ex: '2025-12-30' },
      { key: 'description', head: 'Description', note: 'Line description. Blank = the item description.', ex: '' },
      { key: 'memo', head: 'Memo', note: 'Internal note.', ex: '' },
    ],
  },
};

const norm = (h) => String(h ?? '').replace(/\*/g, '').trim().toLowerCase();
export const headLabel = (f) => (f.req ? f.head + ' *' : f.head);

// heading text → field key, for one template
export function headMap(kind) {
  const m = {};
  SPECS[kind].fields.forEach((f) => {
    m[norm(f.head)] = f.key;
  });
  const extra = {
    invoices: { 'invoice #': 'num', 'invoice number': 'num', 'invoice no.': 'num', 'po no': 'po', 'p.o. number': 'po', 'tax': 'taxrate', 'due': 'duedate' },
    bills: { 'bill #': 'num', 'bill number': 'num', 'bill no.': 'num', 'ref no': 'num', 'ref. no.': 'num', due: 'duedate' },
  }[kind];
  return { ...m, ...(extra || {}) };
}

// ---------------------------------------------------------------- the Excel files
const dataSheet = (kind) => {
  const spec = SPECS[kind];
  return {
    name: spec.sheet,
    freeze: 1,
    heights: [30],
    widths: spec.fields.map((f) => Math.max(14, f.head.length + 6, f.key === 'description' || f.key === 'address' || f.key === 'memo' ? 30 : 0, f.key === 'name' || f.key === 'customer' || f.key === 'vendor' || f.key === 'item' ? 26 : 0)),
    rows: [spec.fields.map((f) => ({ v: headLabel(f), s: f.req ? XS.required : XS.optional }))],
  };
};

const helpRows = (kinds) => {
  const rows = [
    [{ v: 'How to use this template', s: XS.title }],
    [{ v: 'Fill the sheet(s) from row 2 down — one record per row. Do not rename or reorder the headings. Save as .xlsx and upload it in the Import / Export Lists window (Import tab).', s: XS.note }],
    [{ v: 'RED headings marked * are required. BLUE headings are optional.', s: XS.note }],
    [{ v: 'Names that already exist in the dashboard are skipped, so uploading the same file twice is safe.', s: XS.note }],
    [],
  ];
  kinds.forEach((k) => {
    const spec = SPECS[k];
    rows.push([{ v: KIND_LABEL[k] + `  (sheet "${spec.sheet}")`, s: XS.title }]);
    if (spec.note) spec.note.split(/(?<=\.)\s+/).forEach((line) => rows.push([{ v: line, s: XS.note }]));
    rows.push(['Field', 'Required?', 'What to enter', 'Example'].map((v) => ({ v, s: XS.optional })));
    spec.fields.forEach((f) => rows.push([{ v: f.head, s: f.req ? XS.required : 0 }, f.req ? 'REQUIRED' : 'optional', f.note, f.ex === '' ? '' : { v: f.ex, s: XS.example }]));
    rows.push([]);
  });
  return rows;
};

const helpSheet = (kinds) => ({ name: 'Instructions', widths: [22, 12, 80, 26], rows: helpRows(kinds) });

export function templateSheets(kind) {
  const kinds = kind === 'all' ? TEMPLATE_KINDS : [kind];
  return [...kinds.map(dataSheet), helpSheet(kinds)];
}

export function downloadTemplate(kind) {
  const name = kind === 'all' ? 'AY_Toys_import_template_ALL' : `AY_Toys_${kind}_template`;
  downloadXlsx(name + '.xlsx', templateSheets(kind));
}
