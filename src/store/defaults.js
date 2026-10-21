import { uid } from '../lib/format';
import { today, addDays, toISO } from '../lib/dates';

export const ACCOUNT_TYPES = [
  'Bank',
  'Accounts Receivable',
  'Other Current Asset',
  'Fixed Asset',
  'Other Asset',
  'Accounts Payable',
  'Credit Card',
  'Other Current Liability',
  'Long Term Liability',
  'Equity',
  'Income',
  'Cost of Goods Sold',
  'Expense',
  'Other Income',
  'Other Expense',
];

export const DEBIT_NORMAL = new Set([
  'Bank',
  'Accounts Receivable',
  'Other Current Asset',
  'Fixed Asset',
  'Other Asset',
  'Cost of Goods Sold',
  'Expense',
  'Other Expense',
]);

export const BS_GROUPS = {
  assets: ['Bank', 'Accounts Receivable', 'Other Current Asset', 'Fixed Asset', 'Other Asset'],
  liabilities: ['Accounts Payable', 'Credit Card', 'Other Current Liability', 'Long Term Liability'],
  equity: ['Equity'],
};
export const PL_TYPES = ['Income', 'Cost of Goods Sold', 'Expense', 'Other Income', 'Other Expense'];
export const isPL = (type) => PL_TYPES.includes(type);

export const ITEM_TYPES = ['Inventory Part', 'Non-inventory Part', 'Service', 'Other Charge', 'Discount'];

export const THEME_PRESETS = [
  { id: 'qb', name: 'QuickBooks Green', primary: '#2ca01c' },
  { id: 'red', name: 'Ruby Red', primary: '#d52b1e' },
  { id: 'blue', name: 'Ocean Blue', primary: '#0b6bcb' },
  { id: 'navy', name: 'Enterprise Navy', primary: '#1f3b64' },
  { id: 'purple', name: 'Royal Purple', primary: '#6b3fc4' },
  { id: 'orange', name: 'Sunset Orange', primary: '#e0610e' },
  { id: 'teal', name: 'Teal', primary: '#0f8a8a' },
  { id: 'pink', name: 'Toy Pink', primary: '#d6336c' },
  { id: 'slate', name: 'Graphite', primary: '#3d4852' },
];

export const TXN_TYPES = {
  invoice: { label: 'Invoice', short: 'INV', posting: true, party: 'customer' },
  salesreceipt: { label: 'Sales Receipt', short: 'SR', posting: true, party: 'customer' },
  creditmemo: { label: 'Credit Memo', short: 'CM', posting: true, party: 'customer' },
  estimate: { label: 'Estimate', short: 'EST', posting: false, party: 'customer' },
  salesorder: { label: 'Sales Order', short: 'SO', posting: false, party: 'customer' },
  payment: { label: 'Payment', short: 'PMT', posting: true, party: 'customer' },
  deposit: { label: 'Deposit', short: 'DEP', posting: true },
  bill: { label: 'Bill', short: 'BILL', posting: true, party: 'vendor' },
  vendorcredit: { label: 'Bill Credit', short: 'VC', posting: true, party: 'vendor' },
  billpayment: { label: 'Bill Pmt -Check', short: 'BP', posting: true, party: 'vendor' },
  check: { label: 'Check', short: 'CHK', posting: true, party: 'vendor' },
  purchaseorder: { label: 'Purchase Order', short: 'PO', posting: false, party: 'vendor' },
  journal: { label: 'General Journal', short: 'GJ', posting: true },
  transfer: { label: 'Transfer', short: 'TRF', posting: true },
  invadjust: { label: 'Inventory Adjust', short: 'ADJ', posting: true },
};

export const DEFAULT_LISTS = {
  terms: ['Due on receipt', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60'],
  paymentMethods: ['Cash', 'Cheque', 'Bank Transfer', 'Online / IBFT', 'Credit Card', 'JazzCash', 'Easypaisa'],
  priceLevels: [
    { id: 'pl-retail', name: 'Retail', percent: 0 },
    { id: 'pl-wholesale', name: 'Wholesale (-10%)', percent: -10 },
    { id: 'pl-distributor', name: 'Distributor (-15%)', percent: -15 },
  ],
  reps: ['AY', 'Office'],
  shipVia: ['Own Vehicle', 'TCS', 'Leopards', 'M&P', 'Bus Cargo', 'Customer Pickup'],
  customerTypes: ['Toy Shop', 'Super Store', 'Distributor', 'Online Seller', 'School'],
  vendorTypes: ['Importer', 'Local Manufacturer', 'Packaging', 'Services'],
  messages: ['Thank you for your business.', 'Goods once sold will not be taken back without approval.'],
  uom: ['pcs', 'dozen', 'carton', 'set', 'box', 'pack'],
};

// [number, name, type, sys, parentNumber?]
const COA = [
  ['1000', 'Cash in Hand', 'Bank', 'cash'],
  ['1010', 'Bank Account', 'Bank', 'bank'],
  ['1100', 'Accounts Receivable', 'Accounts Receivable', 'ar'],
  ['1200', 'Inventory Asset', 'Other Current Asset', 'inventory'],
  ['1250', 'Undeposited Funds', 'Other Current Asset', 'undeposited'],
  ['1300', 'Advances to Suppliers', 'Other Current Asset'],
  ['1310', 'Employee Advances', 'Other Current Asset'],
  ['1500', 'Furniture & Fixtures', 'Fixed Asset'],
  ['1510', 'Vehicles', 'Fixed Asset'],
  ['1520', 'Computers & Equipment', 'Fixed Asset'],
  ['1590', 'Accumulated Depreciation', 'Fixed Asset'],
  ['1800', 'Security Deposits', 'Other Asset'],
  ['2000', 'Accounts Payable', 'Accounts Payable', 'ap'],
  ['2050', 'Company Credit Card', 'Credit Card'],
  ['2100', 'Sales Tax Payable', 'Other Current Liability', 'salestax'],
  ['2150', 'Customer Advances', 'Other Current Liability'],
  ['2200', 'Salaries Payable', 'Other Current Liability'],
  ['2300', 'Accrued Expenses', 'Other Current Liability'],
  ['2700', 'Loan Payable', 'Long Term Liability'],
  ['3000', 'Opening Balance Equity', 'Equity', 'obe'],
  ['3100', "Owner's Capital", 'Equity'],
  ['3200', "Owner's Drawings", 'Equity'],
  ['3900', 'Retained Earnings', 'Equity', 'retained'],
  ['4000', 'Sales - Toys', 'Income', 'sales'],
  ['4010', 'Sales - Accessories', 'Income'],
  ['4100', 'Shipping & Delivery Income', 'Income'],
  ['4900', 'Sales Discounts', 'Income', 'discounts'],
  ['5000', 'Cost of Goods Sold', 'Cost of Goods Sold', 'cogs'],
  ['5100', 'Freight In & Import Duty', 'Cost of Goods Sold'],
  ['5200', 'Inventory Shrinkage', 'Cost of Goods Sold', 'shrink'],
  ['6000', 'Rent Expense', 'Expense'],
  ['6100', 'Salaries & Wages', 'Expense'],
  ['6200', 'Utilities', 'Expense'],
  ['6300', 'Delivery & Freight Out', 'Expense'],
  ['6350', 'Packaging Material', 'Expense'],
  ['6400', 'Advertising & Marketing', 'Expense'],
  ['6500', 'Bank Charges', 'Expense'],
  ['6550', 'Office Supplies', 'Expense'],
  ['6600', 'Telephone & Internet', 'Expense'],
  ['6700', 'Repairs & Maintenance', 'Expense'],
  ['6750', 'Fuel & Travel', 'Expense'],
  ['6800', 'Depreciation Expense', 'Expense'],
  ['6900', 'Miscellaneous Expense', 'Expense'],
  ['7000', 'Interest Income', 'Other Income'],
  ['7100', 'Other Income', 'Other Income'],
  ['8000', 'Other Expenses', 'Other Expense'],
];

export function defaultAccounts() {
  return COA.map(([number, name, type, sys]) => ({
    id: 'acc-' + number,
    number,
    name,
    type,
    sys: sys || '',
    parentId: '',
    description: '',
    active: true,
  }));
}

export function newCompany({ name, theme, currency = 'Rs', ...rest }) {
  const code =
    (name || 'CO')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8) || 'CO';
  return {
    id: uid(),
    code: code + '_' + Math.random().toString(36).slice(2, 5).toUpperCase(),
    name,
    legalName: name,
    address: '',
    city: '',
    phone: '',
    email: '',
    ntn: '',
    website: '',
    currency,
    dateStyle: 'DMY',
    fyMonth: 1,
    taxName: 'Sales Tax',
    taxRate: 0,
    accountNumbers: true,
    theme: theme || { preset: 'qb', primary: '#2ca01c', mode: 'light' },
    lists: JSON.parse(JSON.stringify(DEFAULT_LISTS)),
    createdAt: new Date().toISOString(),
    ...rest,
  };
}

export function emptyData() {
  return { accounts: defaultAccounts(), items: [], customers: [], vendors: [], txns: [], memorized: [] };
}

// ---------- Sample data for a toy wholesaler ----------
export function sampleData() {
  const data = emptyData();
  const now = today();
  const ts = (i) => new Date(Date.now() - (200 - i) * 60000).toISOString();

  const vendors = [
    ['Shantou Toys Import Co.', 'Importer', 'Mr. Li Wei', '+86 754 8888 1200', 'Net 30'],
    ['Karachi Plastic Works', 'Local Manufacturer', 'Imran Ali', '0300-1234567', 'Net 15'],
    ['Lahore Packaging House', 'Packaging', 'Bilal Ahmed', '0321-7654321', 'Net 7'],
    ['City Electric Supply', 'Services', 'Accounts Dept', '021-111-222-333', 'Due on receipt'],
  ].map(([name, type, contact, phone, terms]) => ({
    id: uid(),
    name,
    company: name,
    type,
    contact,
    phone,
    email: '',
    address: '',
    city: '',
    terms,
    ntn: '',
    notes: '',
    active: true,
    createdAt: ts(0),
  }));

  const customers = [
    ['Kids World Toy Shop', 'Toy Shop', 'Zubair Khan', '0333-1112233', 'Net 30', 'pl-wholesale', 'Saddar, Karachi'],
    ['Smile Super Store', 'Super Store', 'Ahsan Raza', '0345-9988776', 'Net 15', 'pl-wholesale', 'Gulberg, Lahore'],
    ['Al-Noor Distributors', 'Distributor', 'Haji Noor', '0300-5566778', 'Net 45', 'pl-distributor', 'Peshawar'],
    ['Happy Kids Online', 'Online Seller', 'Sana Tariq', '0312-4455667', 'Due on receipt', 'pl-retail', 'Islamabad'],
    ['Toy Palace Hyderabad', 'Toy Shop', 'Farhan Memon', '0301-2233445', 'Net 30', 'pl-wholesale', 'Hyderabad'],
  ].map(([name, type, contact, phone, terms, priceLevelId, city]) => ({
    id: uid(),
    name,
    company: name,
    type,
    contact,
    phone,
    email: '',
    billTo: name + '\n' + city,
    shipTo: name + '\n' + city,
    city,
    terms,
    priceLevelId,
    creditLimit: 500000,
    taxable: false,
    rep: 'AY',
    ntn: '',
    notes: '',
    active: true,
    createdAt: ts(0),
  }));

  const items = [
    ['RC-CAR-01', 'RC Racing Car 1:16', 'Remote control racing car with rechargeable battery', 1450, 2400, 'pcs', 20, 'Vehicles'],
    ['DOLL-SET-02', 'Fashion Doll Set', 'Fashion doll with 3 outfits and accessories', 650, 1150, 'pcs', 30, 'Dolls'],
    ['BLK-500', 'Building Blocks 500pc', 'Creative building blocks bucket, 500 pieces', 1800, 3000, 'pcs', 15, 'Educational'],
    ['TED-24', 'Teddy Bear 24 inch', 'Soft plush teddy bear 24"', 900, 1600, 'pcs', 25, 'Plush'],
    ['PZL-1000', 'Jigsaw Puzzle 1000pc', 'Landscape jigsaw puzzle 1000 pieces', 420, 800, 'pcs', 40, 'Educational'],
    ['BALL-PK6', 'Rubber Ball Pack (6)', 'Bouncy rubber balls pack of 6', 180, 350, 'pack', 60, 'Outdoor'],
    ['KITCH-SET', 'Kitchen Play Set', 'Pretend play kitchen set with sounds', 2600, 4200, 'set', 10, 'Pretend Play'],
    ['CYC-12', 'Kids Bicycle 12 inch', 'Kids bicycle with training wheels', 5200, 7900, 'pcs', 5, 'Outdoor'],
  ].map(([sku, name, description, cost, price, uom, reorder, category]) => ({
    id: uid(),
    sku,
    name,
    type: 'Inventory Part',
    description,
    purchaseDescription: description,
    cost,
    price,
    uom,
    reorderPoint: reorder,
    category,
    incomeAccountId: 'acc-4000',
    cogsAccountId: 'acc-5000',
    assetAccountId: 'acc-1200',
    expenseAccountId: '',
    preferredVendorId: '',
    taxable: true,
    barcode: '',
    active: true,
    createdAt: ts(0),
  }));
  items.push({
    id: uid(),
    sku: 'DELIVERY',
    name: 'Delivery Charges',
    type: 'Other Charge',
    description: 'Delivery / cartage charges',
    cost: 0,
    price: 500,
    uom: '',
    incomeAccountId: 'acc-4100',
    taxable: false,
    active: true,
    createdAt: ts(0),
  });
  items.push({
    id: uid(),
    sku: 'DISC',
    name: 'Discount',
    type: 'Discount',
    description: 'Special discount',
    cost: 0,
    price: 0,
    percent: 5,
    uom: '',
    incomeAccountId: 'acc-4900',
    taxable: false,
    active: true,
    createdAt: ts(0),
  });
  items.forEach((it) => {
    if (it.type === 'Inventory Part') it.preferredVendorId = vendors[it.price > 2000 ? 0 : 1].id;
  });

  data.vendors = vendors;
  data.customers = customers;
  data.items = items;

  const d = (n) => addDays(now, -n);
  let seq = 1;
  const txns = [];
  const push = (t) => txns.push({ id: uid(), createdAt: ts(seq++), voided: false, ...t });
  const inv = items.filter((i) => i.type === 'Inventory Part');

  // Owner capital
  push({
    type: 'journal',
    num: 'GJ-1',
    date: d(120),
    memo: 'Owner capital introduced',
    lines: [
      { accountId: 'acc-1010', debit: 3000000, credit: 0, memo: 'Capital' },
      { accountId: 'acc-3100', debit: 0, credit: 3000000, memo: 'Capital' },
    ],
  });

  // Stock purchases
  const purchase = (vendor, daysAgo, rows, num) => {
    const itemLines = rows.map(([it, q]) => ({
      itemId: it.id,
      description: it.purchaseDescription,
      qty: q,
      cost: it.cost,
      amount: q * it.cost,
    }));
    const total = itemLines.reduce((s, l) => s + l.amount, 0);
    push({
      type: 'bill',
      num,
      date: d(daysAgo),
      dueDate: d(daysAgo - 30),
      vendorId: vendor.id,
      terms: vendor.terms,
      itemLines,
      expenseLines: [],
      total,
      memo: 'Stock purchase',
    });
  };
  purchase(vendors[0], 110, [[inv[0], 120], [inv[2], 80], [inv[6], 40], [inv[7], 25]], 'SH-2201');
  purchase(vendors[1], 100, [[inv[1], 200], [inv[3], 150], [inv[4], 160], [inv[5], 300]], 'KPW-118');
  purchase(vendors[0], 45, [[inv[0], 60], [inv[2], 40]], 'SH-2260');
  purchase(vendors[1], 20, [[inv[1], 80], [inv[4], 60]], 'KPW-131');

  // Expenses (checks)
  const expense = (daysAgo, accountId, amount, memo, vendorId = '') =>
    push({
      type: 'check',
      num: 'CHK-' + seq,
      date: d(daysAgo),
      accountId: 'acc-1010',
      vendorId,
      expenseLines: [{ accountId, amount, memo }],
      itemLines: [],
      total: amount,
      memo,
    });
  [95, 65, 35, 5].forEach((n) => expense(n, 'acc-6000', 35000, 'Warehouse rent'));
  [92, 62, 32, 2].forEach((n) => expense(n, 'acc-6100', 45000, 'Staff salaries'));
  [88, 58, 28].forEach((n) => expense(n, 'acc-6200', 6000 + n * 20, 'Electricity bill', vendors[3].id));
  expense(50, 'acc-6400', 15000, 'Social media ads');
  expense(15, 'acc-6350', 9000, 'Cartons & tape', vendors[2].id);

  // Sales invoices
  const price = (it, cust) => {
    const pl = DEFAULT_LISTS.priceLevels.find((p) => p.id === cust.priceLevelId);
    return Math.round(it.price * (1 + (pl ? pl.percent : 0) / 100));
  };
  let invNo = 1001;
  const sale = (cust, daysAgo, rows) => {
    const lines = rows.map(([it, q]) => {
      const rate = price(it, cust);
      return { itemId: it.id, description: it.description, qty: q, rate, amount: q * rate, taxable: false, uom: it.uom };
    });
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const id = uid();
    txns.push({
      id,
      createdAt: ts(seq++),
      voided: false,
      type: 'invoice',
      num: String(invNo++),
      date: d(daysAgo),
      dueDate: d(daysAgo - 30),
      customerId: cust.id,
      terms: cust.terms,
      billTo: cust.billTo,
      shipTo: cust.shipTo,
      lines,
      subtotal,
      taxRate: 0,
      tax: 0,
      total: subtotal,
      message: DEFAULT_LISTS.messages[0],
      rep: 'AY',
    });
    return { id, total: subtotal };
  };
  const s1 = sale(customers[0], 90, [[inv[0], 20], [inv[1], 30], [inv[3], 20]]);
  const s2 = sale(customers[1], 80, [[inv[2], 15], [inv[4], 40], [inv[5], 60]]);
  const s3 = sale(customers[2], 70, [[inv[0], 40], [inv[6], 12], [inv[7], 8], [inv[3], 50]]);
  sale(customers[4], 55, [[inv[1], 40], [inv[4], 30]]);
  const s5 = sale(customers[0], 40, [[inv[2], 20], [inv[0], 15]]);
  sale(customers[1], 25, [[inv[3], 30], [inv[5], 80], [inv[6], 6]]);
  sale(customers[2], 12, [[inv[0], 30], [inv[2], 25], [inv[7], 6]]);
  sale(customers[4], 6, [[inv[1], 35], [inv[4], 25], [inv[3], 15]]);
  sale(customers[1], 60, [[inv[0], 25], [inv[6], 10], [inv[4], 30]]);
  sale(customers[2], 35, [[inv[3], 30], [inv[5], 100], [inv[2], 20]]);
  sale(customers[0], 18, [[inv[1], 60], [inv[7], 6], [inv[6], 6]]);
  sale(customers[4], 3, [[inv[0], 25], [inv[2], 15]]);

  const pay = (cust, daysAgo, invoice, amount, method = 'Bank Transfer') =>
    push({
      type: 'payment',
      num: 'RCV-' + seq,
      date: d(daysAgo),
      customerId: cust.id,
      amount,
      method,
      ref: '',
      depositTo: 'acc-1010',
      applied: [{ txnId: invoice.id, amount }],
      total: amount,
    });
  pay(customers[0], 60, s1, s1.total);
  pay(customers[1], 50, s2, s2.total);
  pay(customers[2], 30, s3, Math.round(s3.total / 2), 'Cheque');
  pay(customers[0], 10, s5, 30000, 'Cash');

  // Cash sales
  push({
    type: 'salesreceipt',
    num: 'SR-1',
    date: d(8),
    customerId: customers[3].id,
    depositTo: 'acc-1000',
    method: 'Cash',
    lines: [
      { itemId: inv[4].id, description: inv[4].description, qty: 10, rate: inv[4].price, amount: 10 * inv[4].price, taxable: false },
      { itemId: inv[5].id, description: inv[5].description, qty: 12, rate: inv[5].price, amount: 12 * inv[5].price, taxable: false },
    ],
    subtotal: 10 * inv[4].price + 12 * inv[5].price,
    tax: 0,
    taxRate: 0,
    total: 10 * inv[4].price + 12 * inv[5].price,
  });

  // Pay a vendor bill
  const firstBill = txns.find((t) => t.type === 'bill');
  push({
    type: 'billpayment',
    num: 'BP-1',
    date: d(75),
    vendorId: firstBill.vendorId,
    accountId: 'acc-1010',
    amount: firstBill.total,
    method: 'Bank Transfer',
    applied: [{ txnId: firstBill.id, amount: firstBill.total }],
    total: firstBill.total,
  });

  // Open purchase order
  push({
    type: 'purchaseorder',
    num: 'PO-1',
    date: d(3),
    vendorId: vendors[0].id,
    itemLines: [
      { itemId: inv[7].id, description: inv[7].purchaseDescription, qty: 20, cost: inv[7].cost, amount: 20 * inv[7].cost },
      { itemId: inv[6].id, description: inv[6].purchaseDescription, qty: 20, cost: inv[6].cost, amount: 20 * inv[6].cost },
    ],
    expenseLines: [],
    total: 20 * inv[7].cost + 20 * inv[6].cost,
    closed: false,
  });

  data.txns = txns;
  return data;
}

export { toISO };
