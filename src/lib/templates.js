// Form templates (QuickBooks "Templates" list): how invoices, bills, receipts… look when printed,
// which fields show on the entry screen, and the free-form layout of every data box.
//
// A template = page + style + labels + screen flags + line columns + boxes.
// Boxes live in two bands: the header (above the line items) and the footer (below them).
// Positions/sizes are in millimetres inside the printable area. The line-item table flows
// between the bands, so any number of lines prints correctly (continuing on the next page).

import { uid, money, num, qty as fmtQty, round2 } from './format';
import { fmtDate, fmtTime } from './dates';
import { salesTotals } from './ledger';

export const PX_PER_MM = 96 / 25.4;

export const TEMPLATE_FORMS = [
  { type: 'invoice', label: 'Invoice', cat: 'sales', title: 'INVOICE' },
  { type: 'salesreceipt', label: 'Sales Receipt', cat: 'sales', title: 'SALES RECEIPT' },
  { type: 'creditmemo', label: 'Credit Memo', cat: 'sales', title: 'CREDIT MEMO' },
  { type: 'estimate', label: 'Estimate', cat: 'sales', title: 'ESTIMATE' },
  { type: 'salesorder', label: 'Sales Order', cat: 'sales', title: 'SALES ORDER' },
  { type: 'bill', label: 'Bill', cat: 'purchase', title: 'BILL' },
  { type: 'purchaseorder', label: 'Purchase Order', cat: 'purchase', title: 'PURCHASE ORDER' },
  { type: 'check', label: 'Check / Voucher', cat: 'purchase', title: 'PAYMENT VOUCHER' },
  { type: 'vendorcredit', label: 'Bill Credit', cat: 'purchase', title: 'BILL CREDIT' },
  { type: 'payment', label: 'Payment Receipt', cat: 'payment', title: 'PAYMENT RECEIPT' },
  { type: 'billpayment', label: 'Bill Payment Voucher', cat: 'payment', title: 'PAYMENT VOUCHER' },
];
export const FORM_MAP = Object.fromEntries(TEMPLATE_FORMS.map((f) => [f.type, f]));
export const isTemplateForm = (type) => !!FORM_MAP[type];
export const formCat = (type) => FORM_MAP[type]?.cat || 'sales';

export const PAPERS = {
  A4: { label: 'A4 (210 × 297 mm)', w: 210, h: 297 },
  Letter: { label: 'Letter (8.5 × 11 in)', w: 215.9, h: 279.4 },
  Legal: { label: 'Legal (8.5 × 14 in)', w: 215.9, h: 355.6 },
  A5: { label: 'A5 (148 × 210 mm)', w: 148, h: 210 },
  R80: { label: 'Receipt roll 80 mm', w: 80, h: 297 },
  R58: { label: 'Receipt roll 58 mm (mini printer)', w: 58, h: 297 },
};

export const FONTS = {
  system: { label: 'Inter / System', css: "Inter, 'Segoe UI', system-ui, sans-serif" },
  arial: { label: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  calibri: { label: 'Calibri', css: "Calibri, Carlito, 'Segoe UI', sans-serif" },
  tahoma: { label: 'Tahoma', css: 'Tahoma, Verdana, sans-serif' },
  verdana: { label: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
  georgia: { label: 'Georgia', css: "Georgia, 'Times New Roman', serif" },
  times: { label: 'Times New Roman', css: "'Times New Roman', Times, serif" },
  mono: { label: 'Courier New', css: "'Courier New', Courier, monospace" },
};

// receipt rolls (thermal / mini printers): always portrait, and the page is as long as the receipt
export const isRoll = (page) => page?.size === 'R80' || page?.size === 'R58';
// margin that suits the printable width of each roll (most printers print 72 mm of an 80 mm roll, 48 mm of a 58 mm roll)
export const ROLL_MARGIN = { R80: 4, R58: 5 };

export function pageSize(page) {
  const p = PAPERS[page?.size] || PAPERS.A4;
  return page?.orientation === 'landscape' && !isRoll(page) ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}
export function contentSize(page) {
  const { w, h } = pageSize(page);
  const m = num(page?.margin ?? 12);
  return { w: round1(w - 2 * m), h: round1(h - 2 * m) };
}
const round1 = (n) => Math.round(n * 10) / 10;
const half = (n) => Math.round(n * 2) / 2;

// ---------------------------------------------------------------- fields

const SALES = ['invoice', 'salesreceipt', 'creditmemo', 'estimate', 'salesorder'];
const PURCH = ['bill', 'purchaseorder', 'check', 'vendorcredit'];
const PAYS = ['payment', 'billpayment'];
const ALL = [...SALES, ...PURCH, ...PAYS];

// group: where the field is listed; forms: which form types offer it; screen: can be hidden on the entry form
export const FIELDS = {
  companyBlock: { label: 'Company Name & Address', group: 'Company', forms: ALL },
  companyName: { label: 'Company Name', group: 'Company', forms: ALL },
  companyAddress: { label: 'Company Address', group: 'Company', forms: ALL },
  companyPhone: { label: 'Company Phone', group: 'Company', forms: ALL },
  companyEmail: { label: 'Company E-mail', group: 'Company', forms: ALL },
  companyWebsite: { label: 'Website', group: 'Company', forms: ALL },
  companyNtn: { label: 'NTN / Tax ID', group: 'Company', forms: ALL },
  title: { label: 'Form Title', group: 'Header', forms: ALL },
  date: { label: 'Date', group: 'Header', forms: ALL },
  time: { label: 'Time', group: 'Header', forms: [...SALES, ...PURCH], screen: [...SALES, ...PURCH] },
  num: { label: 'Number', group: 'Header', forms: ALL },
  billTo: { label: 'Bill To', group: 'Header', forms: ALL, screen: [...SALES, ...PURCH] },
  shipTo: { label: 'Ship To', group: 'Header', forms: ['invoice', 'estimate', 'salesorder', 'purchaseorder'], screen: ['invoice', 'estimate', 'salesorder'] },
  poNumber: { label: 'P.O. No.', group: 'Header', forms: ['invoice', 'creditmemo', 'estimate', 'salesorder'], screen: ['invoice', 'creditmemo', 'estimate', 'salesorder'] },
  terms: { label: 'Terms', group: 'Header', forms: ['invoice', 'estimate', 'salesorder', 'bill', 'purchaseorder'], screen: ['invoice', 'estimate', 'salesorder', 'bill'] },
  dueDate: { label: 'Due Date', group: 'Header', forms: ['invoice', 'estimate', 'bill'], screen: ['invoice', 'estimate', 'bill'] },
  rep: { label: 'Rep', group: 'Header', forms: SALES, screen: SALES },
  shipDate: { label: 'Ship Date', group: 'Header', forms: ['invoice', 'salesorder'], screen: ['invoice', 'salesorder'] },
  via: { label: 'Via', group: 'Header', forms: ['invoice', 'salesorder'], screen: ['invoice', 'salesorder'] },
  expectedDate: { label: 'Expected Date', group: 'Header', forms: ['purchaseorder'], screen: ['purchaseorder'] },
  method: { label: 'Payment Method', group: 'Header', forms: ['salesreceipt', 'payment', 'billpayment'] },
  ref: { label: 'Check / Ref No.', group: 'Header', forms: ['salesreceipt', 'payment'] },
  account: { label: 'Bank Account', group: 'Header', forms: ['salesreceipt', 'check', 'payment', 'billpayment'] },
  partyName: { label: 'Name', group: 'Header', forms: ALL },
  partyPhone: { label: 'Phone', group: 'Header', forms: ALL },
  partyEmail: { label: 'E-mail', group: 'Header', forms: ALL },
  partyNtn: { label: 'Customer NTN', group: 'Header', forms: ALL },
  message: { label: 'Customer Message', group: 'Footer', forms: SALES, screen: SALES },
  memo: { label: 'Memo', group: 'Footer', forms: ALL, screen: [...SALES, ...PURCH] },
  totals: { label: 'Totals', group: 'Footer', forms: ALL },
  subtotal: { label: 'Subtotal', group: 'Totals', forms: SALES },
  tax: { label: 'Sales Tax', group: 'Totals', forms: SALES },
  total: { label: 'Total', group: 'Totals', forms: ALL },
  payments: { label: 'Payments/Credits', group: 'Totals', forms: ['invoice'] },
  balanceDue: { label: 'Balance Due', group: 'Totals', forms: ['invoice'] },
  amountWords: { label: 'Amount in Words', group: 'Footer', forms: ALL },
  partyBalance: { label: 'Customer Total Balance', group: 'Footer', forms: ALL },
};

const NUM_LABELS = {
  invoice: 'Invoice #',
  salesreceipt: 'Sale No.',
  creditmemo: 'Credit No.',
  estimate: 'Estimate #',
  salesorder: 'S.O. No.',
  bill: 'Bill No.',
  purchaseorder: 'P.O. No.',
  check: 'Voucher No.',
  vendorcredit: 'Credit No.',
  payment: 'Receipt No.',
  billpayment: 'Voucher No.',
};
const BILLTO_LABELS = {
  salesreceipt: 'Sold To',
  creditmemo: 'Customer',
  bill: 'Vendor',
  purchaseorder: 'Vendor',
  check: 'Pay To',
  vendorcredit: 'Vendor',
  payment: 'Received From',
  billpayment: 'Paid To',
};

export function defaultFieldLabel(field, formType) {
  const cat = formCat(formType);
  if (field === 'num') return NUM_LABELS[formType] || 'No.';
  if (field === 'billTo') return BILLTO_LABELS[formType] || 'Bill To';
  if (field === 'dueDate' && formType === 'estimate') return 'Expiration Date';
  if (field === 'account') return formType === 'payment' || formType === 'salesreceipt' ? 'Deposit To' : formType === 'billpayment' ? 'Paid From' : 'Bank Account';
  if (field === 'partyName') return cat === 'sales' || formType === 'payment' ? 'Customer' : 'Vendor';
  if (field === 'partyNtn') return cat === 'sales' || formType === 'payment' ? 'Customer NTN' : 'Vendor NTN';
  if (field === 'partyBalance') return cat === 'sales' || formType === 'payment' ? 'Customer Total Balance' : 'Vendor Balance';
  if (field === 'total' && formType === 'payment') return 'Amount Received';
  if (field === 'total' && (formType === 'billpayment' || formType === 'check')) return 'Amount Paid';
  if (field === 'shipTo' && formType === 'purchaseorder') return 'Ship To';
  return FIELDS[field]?.label || field;
}

export const fieldLabel = (tpl, field) => {
  const v = tpl?.labels?.[field];
  return v !== undefined && v !== null && v !== '' ? v : defaultFieldLabel(field, tpl?.formType);
};
export const fieldsForForm = (formType, group) =>
  Object.entries(FIELDS)
    .filter(([, d]) => d.forms.includes(formType) && (!group || d.group === group))
    .map(([k]) => k);
export const screenable = (field, formType) => !!FIELDS[field]?.screen?.includes(formType);
export const showOnScreen = (tpl, key) => tpl?.screen?.[key] !== false;

// ---------------------------------------------------------------- columns

const COLS = {
  no: { label: '#', width: 5, align: 'center' },
  sku: { label: 'SKU', width: 11 },
  item: { label: 'Item', width: 22 },
  desc: { label: 'Description', width: 34 },
  pkg: { label: 'Pkg', width: 7, align: 'right' },
  ctn: { label: 'Ctn', width: 7, align: 'right' },
  pcs: { label: 'Pcs', width: 7, align: 'right' },
  qty: { label: 'Qty', width: 9, align: 'right' },
  uom: { label: 'U/M', width: 7 },
  rate: { label: 'Rate', width: 12, align: 'right' },
  tax: { label: 'Tax', width: 5, align: 'center' },
  amount: { label: 'Amount', width: 14, align: 'right' },
};
export const COLUMN_KEYS = {
  sales: ['no', 'sku', 'item', 'desc', 'pkg', 'ctn', 'pcs', 'qty', 'uom', 'rate', 'tax', 'amount'],
  purchase: ['no', 'sku', 'item', 'desc', 'qty', 'uom', 'rate', 'amount'],
  payment: ['no', 'item', 'desc', 'rate', 'amount'],
};
const COL_DEFAULT_OFF = new Set(['sku', 'uom', 'tax']);
export const SCREEN_COLUMNS = { sales: ['desc', 'pkg', 'ctn', 'pcs', 'uom'], purchase: ['desc', 'uom'], payment: [] };

export function defaultColumnLabel(key, formType) {
  const cat = formCat(formType);
  if (cat === 'purchase') {
    if (key === 'item') return 'Item / Account';
    if (key === 'rate') return 'Cost';
  }
  if (cat === 'payment') {
    if (key === 'item') return 'Document';
    if (key === 'desc') return 'Date';
    if (key === 'rate') return 'Original Amount';
    if (key === 'amount') return formType === 'payment' ? 'Amount Received' : 'Amount Paid';
  }
  return COLS[key]?.label || key;
}
export const columnLabel = (tpl, col) => (col.label ? col.label : defaultColumnLabel(col.key, tpl.formType));
export const columnAlign = (key) => COLS[key]?.align || 'left';

function defaultColumns(formType) {
  return COLUMN_KEYS[formCat(formType)].map((key) => ({ key, print: !COL_DEFAULT_OFF.has(key), screen: true, width: COLS[key].width }));
}

// receipt rolls: item, qty, rate, amount only
const NARROW_COLS = { item: 34, qty: 13, rate: 21, amount: 25, desc: 38 };
export function narrowColumns(tpl) {
  const cat = formCat(tpl.formType);
  const keep = cat === 'payment' ? ['item', 'amount'] : ['item', 'qty', 'rate', 'amount'];
  return tpl.columns.map((c) => ({ ...c, print: keep.includes(c.key), width: NARROW_COLS[c.key] || c.width }));
}

// ---------------------------------------------------------------- boxes

export const BOX_DEFAULTS = {
  band: 'header',
  kind: 'field',
  field: '',
  text: '',
  x: 0,
  y: 0,
  w: 40,
  h: 10,
  size: 0, // pt, 0 = template base size
  bold: false,
  italic: false,
  align: 'left',
  color: '',
  bg: '',
  border: 'none', // none | box | bottom | top
  labelPos: 'top', // top | left | none
  hidden: false,
  hideEmpty: false,
};

export const BOX_KINDS = {
  field: 'Data field',
  text: 'Text box',
  logo: 'Logo',
  sign: 'Signature line',
  line: 'Horizontal line',
  rect: 'Rectangle / frame',
};

// default look for a newly added box of a given field / kind
export function boxPreset(kindOrField) {
  switch (kindOrField) {
    case 'companyBlock':
      return { kind: 'field', field: 'companyBlock', w: 100, h: 30, labelPos: 'none' };
    case 'companyName':
      return { kind: 'field', field: 'companyName', w: 90, h: 9, labelPos: 'none', bold: true, size: 14 };
    case 'title':
      return { kind: 'field', field: 'title', w: 80, h: 11, labelPos: 'none', align: 'right', size: 20, color: 'accent' };
    case 'billTo':
    case 'shipTo':
      return { kind: 'field', field: kindOrField, w: 90, h: 27, border: 'box' };
    case 'totals':
      return { kind: 'field', field: 'totals', w: 70, h: 26, labelPos: 'none' };
    case 'message':
      return { kind: 'field', field: 'message', w: 105, h: 13, labelPos: 'none', italic: true, hideEmpty: true };
    case 'memo':
      return { kind: 'field', field: 'memo', w: 105, h: 11, hideEmpty: true };
    case 'amountWords':
      return { kind: 'field', field: 'amountWords', w: 105, h: 11, hideEmpty: true };
    case 'partyBalance':
      return { kind: 'field', field: 'partyBalance', w: 60, h: 11, labelPos: 'left' };
    case 'subtotal':
    case 'tax':
    case 'total':
    case 'payments':
    case 'balanceDue':
      return { kind: 'field', field: kindOrField, w: 70, h: 7, labelPos: 'left', align: 'right', bold: kindOrField === 'total' || kindOrField === 'balanceDue' };
    case 'text':
      return { kind: 'text', text: 'Type your text here', w: 90, h: 10, labelPos: 'none' };
    case 'logo':
      return { kind: 'logo', w: 30, h: 22, labelPos: 'none' };
    case 'sign':
      return { kind: 'sign', text: 'Authorized Signature', w: 60, h: 12, labelPos: 'none', align: 'center' };
    case 'line':
      return { kind: 'line', w: 186, h: 2, labelPos: 'none', color: 'accent' };
    case 'rect':
      return { kind: 'rect', w: 60, h: 20, labelPos: 'none', border: 'box' };
    default:
      if (FIELDS[kindOrField]?.group === 'Company') return { kind: 'field', field: kindOrField, w: 80, h: 6, labelPos: 'none' };
      return { kind: 'field', field: kindOrField, w: 31, h: 11, border: 'box' };
  }
}

const mk = (band, preset, pos) => ({ ...BOX_DEFAULTS, ...boxPreset(preset), band, id: uid().slice(0, 8), ...pos });

const STRIP = {
  invoice: ['poNumber', 'terms', 'dueDate', 'rep', 'shipDate', 'via'],
  salesorder: ['poNumber', 'terms', 'rep', 'shipDate', 'via'],
  estimate: ['poNumber', 'terms', 'dueDate', 'rep'],
  salesreceipt: ['method', 'ref', 'rep'],
  creditmemo: ['poNumber', 'rep'],
  bill: ['terms', 'dueDate'],
  purchaseorder: ['expectedDate', 'terms'],
  check: ['account'],
  vendorcredit: [],
  payment: ['method', 'ref', 'account'],
  billpayment: ['method', 'account'],
};
const SIGNS = {
  sales: ['Received By', 'Authorized Signature'],
  purchase: ['Prepared By', 'Authorized Signature'],
  payment: ['Received By', 'Authorized Signature'],
};

// Lay out the standard boxes for a form on a printable area W mm wide
export function defaultLayout(formType, W = 186) {
  const cat = formCat(formType);
  const hasShip = ['invoice', 'estimate', 'salesorder', 'purchaseorder'].includes(formType);
  const strip = STRIP[formType] || [];
  const hasTime = FIELDS.time.forms.includes(formType);
  const [sign1, sign2] = SIGNS[cat];
  const H = [];
  const F = [];
  let headerHeight;
  let footerHeight;
  if (W >= 140) {
    const s = W / 186;
    const X = (v) => half(v * s);
    H.push(mk('header', 'companyBlock', { x: 0, y: 0, w: X(104), h: 32 }));
    H.push(mk('header', 'title', { x: X(106), y: 0, w: W - X(106), h: 11 }));
    H.push(mk('header', 'date', { x: W - X(60), y: 14, w: X(30), h: 11 }));
    H.push(mk('header', 'num', { x: W - X(30), y: 14, w: X(30), h: 11 }));
    if (hasTime) H.push(mk('header', 'time', { x: W - X(60), y: 26, w: X(30), h: 10 }));
    H.push(mk('header', 'billTo', { x: 0, y: 36, w: X(90), h: 27 }));
    if (hasShip) H.push(mk('header', 'shipTo', { x: W - X(90), y: 36, w: X(90), h: 27 }));
    if (strip.length) {
      const cw = W / strip.length;
      strip.forEach((f, i) => H.push(mk('header', f, { x: half(i * cw), y: 67, w: half((i + 1) * cw) - half(i * cw), h: 11 })));
    }
    headerHeight = strip.length ? 81 : 67;
    const lw = X(108);
    if (cat === 'sales') {
      F.push(mk('footer', 'message', { x: 0, y: 3, w: lw, h: 12 }));
      F.push(mk('footer', 'amountWords', { x: 0, y: 16, w: lw, h: 11 }));
      F.push(mk('footer', 'memo', { x: 0, y: 28, w: lw, h: 10, hidden: true }));
    } else {
      F.push(mk('footer', 'memo', { x: 0, y: 3, w: lw, h: 11 }));
      F.push(mk('footer', 'amountWords', { x: 0, y: 16, w: lw, h: 11 }));
    }
    F.push(mk('footer', 'totals', { x: W - X(70), y: 3, w: X(70), h: 26 }));
    F.push(mk('footer', 'sign', { x: 0, y: 44, w: X(60), h: 12, text: sign1 }));
    F.push(mk('footer', 'sign', { x: W - X(60), y: 44, w: X(60), h: 12, text: sign2 }));
    footerHeight = 58;
  } else {
    // narrow paper (A5 portrait / receipt roll): stack everything
    const hw = half(W / 2);
    H.push(mk('header', 'companyBlock', { x: 0, y: 0, w: W, h: 24, align: 'center' }));
    H.push(mk('header', 'title', { x: 0, y: 25, w: W, h: 9, align: 'center', size: 15 }));
    H.push(mk('header', 'date', { x: 0, y: 36, w: hw, h: 10 }));
    H.push(mk('header', 'num', { x: hw, y: 36, w: W - hw, h: 10 }));
    if (hasTime) H.push(mk('header', 'time', { x: 0, y: 47, w: W, h: 10 }));
    const dy = hasTime ? 10 : 0;
    H.push(mk('header', 'billTo', { x: 0, y: 48 + dy, w: W, h: 20 }));
    let y = 70 + dy;
    strip.forEach((f, i) => {
      const left = i % 2 === 0;
      H.push(mk('header', f, { x: left ? 0 : hw, y, w: left ? hw : W - hw, h: 10 }));
      if (!left || i === strip.length - 1) y += 11;
    });
    headerHeight = y + 2;
    F.push(mk('footer', 'totals', { x: 0, y: 2, w: W, h: 22 }));
    F.push(mk('footer', 'amountWords', { x: 0, y: 26, w: W, h: 11 }));
    F.push(mk('footer', cat === 'sales' ? 'message' : 'memo', { x: 0, y: 38, w: W, h: 10 }));
    F.push(mk('footer', 'sign', { x: 0, y: 54, w: half(hw - 3), h: 11, text: sign1 }));
    F.push(mk('footer', 'sign', { x: half(hw + 3), y: 54, w: W - half(hw + 3), h: 11, text: sign2 }));
    footerHeight = 67;
  }
  return { headerHeight, footerHeight, boxes: [...H, ...F] };
}

// ---------------------------------------------------------------- templates

export const STD_PREFIX = 'std-';
export const isStdId = (id) => String(id || '').startsWith(STD_PREFIX);

export function standardTemplate(formType) {
  const form = FORM_MAP[formType] || FORM_MAP.invoice;
  const page = { size: 'A4', orientation: 'portrait', margin: 12 };
  return {
    id: STD_PREFIX + form.type,
    name: 'Standard ' + form.label,
    formType: form.type,
    title: form.title,
    page,
    style: {
      font: 'system',
      fontSize: 9,
      accent: '',
      tableHeader: 'shade', // shade | accent | plain
      borders: 'grid', // grid | columns | rows | none
      zebra: false,
      footerAtBottom: true,
      stamps: true,
      wordsCurrency: 'Rupees',
      wordsFraction: 'Paisa',
      wordsSystem: 'southasian', // southasian (lakh/crore) | intl (million)
    },
    company: { name: true, address: true, phone: true, email: true, website: false, ntn: true },
    labels: {},
    screen: {},
    columns: defaultColumns(form.type),
    ...defaultLayout(form.type, contentSize(page).w),
  };
}

// Fill in anything missing (older saved templates, new options added later)
export function normalizeTemplate(t) {
  if (!t) return null;
  const std = standardTemplate(t.formType);
  const cols = Array.isArray(t.columns) ? t.columns : std.columns;
  const known = new Set(cols.map((c) => c.key));
  const columns = cols.filter((c) => COLS[c.key] && COLUMN_KEYS[formCat(std.formType)].includes(c.key)).map((c) => ({ ...std.columns.find((s) => s.key === c.key), ...c }));
  // a column added later (Pkg / Ctn / Pcs) starts switched off, placed before the column that follows it in the standard layout
  std.columns.forEach((c, i) => {
    if (known.has(c.key)) return;
    const next = std.columns.slice(i + 1).find((n) => columns.some((x) => x.key === n.key));
    const at = next ? columns.findIndex((x) => x.key === next.key) : columns.length;
    columns.splice(at, 0, { ...c, print: false });
  });
  return {
    ...std,
    ...t,
    page: { ...std.page, ...(t.page || {}) },
    style: { ...std.style, ...(t.style || {}) },
    company: { ...std.company, ...(t.company || {}) },
    labels: { ...(t.labels || {}) },
    screen: { ...(t.screen || {}) },
    columns,
    boxes: (Array.isArray(t.boxes) ? t.boxes : std.boxes).map((b) => ({ ...BOX_DEFAULTS, ...b, id: b.id || uid().slice(0, 8) })),
    headerHeight: num(t.headerHeight ?? std.headerHeight),
    footerHeight: num(t.footerHeight ?? std.footerHeight),
  };
}

// Strip default values before storing (keeps the Google Sheet cell small)
export function compactTemplate(t) {
  const boxes = t.boxes.map((b) => {
    const o = {};
    Object.entries(b).forEach(([k, v]) => {
      if (k === 'id' || BOX_DEFAULTS[k] !== v) o[k] = typeof v === 'number' ? round1(v) : v;
    });
    return o;
  });
  const labels = Object.fromEntries(Object.entries(t.labels || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));
  const screen = Object.fromEntries(Object.entries(t.screen || {}).filter(([, v]) => v === false));
  const columns = t.columns.map(({ key, print, screen: s, width, label }) => {
    const c = { key, print, width };
    if (s === false) c.screen = false;
    if (label) c.label = label;
    return c;
  });
  return { ...t, boxes, labels, screen, columns, headerHeight: round1(t.headerHeight), footerHeight: round1(t.footerHeight) };
}

export function allTemplates(company) {
  const saved = (company?.templates || []).filter((t) => t && FORM_MAP[t.formType]);
  const byId = new Map(saved.map((t) => [t.id, t]));
  const out = [];
  TEMPLATE_FORMS.forEach((f) => {
    const sid = STD_PREFIX + f.type;
    out.push(byId.has(sid) ? normalizeTemplate(byId.get(sid)) : standardTemplate(f.type));
    saved.filter((t) => t.formType === f.type && t.id !== sid).forEach((t) => out.push(normalizeTemplate(t)));
  });
  return out;
}
export const templatesFor = (company, formType) => allTemplates(company).filter((t) => t.formType === formType);
export const defaultTemplateId = (company, formType) => {
  const id = company?.templateDefaults?.[formType];
  return id && templatesFor(company, formType).some((t) => t.id === id) ? id : STD_PREFIX + formType;
};
export function getTemplate(company, id, formType) {
  const list = allTemplates(company);
  const hit = id && list.find((t) => t.id === id && (!formType || t.formType === formType));
  if (hit) return hit;
  if (!formType) return null;
  const def = defaultTemplateId(company, formType);
  return list.find((t) => t.id === def) || standardTemplate(formType);
}
export const resolveTemplate = (company, txn) => getTemplate(company, txn?.templateId, txn?.type);

// ---------------------------------------------------------------- amount in words

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function under100(n) {
  return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
}
function under1000(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? ONES[h] + ' Hundred' : '', r ? under100(r) : ''].filter(Boolean).join(' ');
}
function intWords(n, system) {
  if (n === 0) return 'Zero';
  const parts = [];
  if (system === 'intl') {
    [
      [1e9, 'Billion'],
      [1e6, 'Million'],
      [1e3, 'Thousand'],
    ].forEach(([v, w]) => {
      if (n >= v) {
        parts.push(intWords(Math.floor(n / v), system) + ' ' + w);
        n %= v;
      }
    });
  } else {
    [
      [1e7, 'Crore'],
      [1e5, 'Lakh'],
      [1e3, 'Thousand'],
    ].forEach(([v, w]) => {
      if (n >= v) {
        parts.push(intWords(Math.floor(n / v), system) + ' ' + w);
        n %= v;
      }
    });
  }
  if (n) parts.push(under1000(n));
  return parts.join(' ');
}
export function amountInWords(amount, { currency = 'Rupees', fraction = 'Paisa', system = 'southasian' } = {}) {
  const v = Math.abs(round2(amount));
  const whole = Math.floor(v);
  const cents = Math.round((v - whole) * 100);
  let s = [currency, intWords(whole, system)].filter(Boolean).join(' ');
  if (cents) s += ' and ' + under100(cents) + (fraction ? ' ' + fraction : '');
  return (amount < 0 ? 'Minus ' : '') + s + ' Only';
}

// ---------------------------------------------------------------- document data

const lineHasData = (l) => l && (l.itemId || l.description || (l.amount !== '' && l.amount !== undefined && l.amount !== null && num(l.amount) !== 0));

/**
 * Turn a transaction into printable values for a template.
 * L = lookups (itemMap, customerMap, vendorMap, accountMap); ledger is optional (balances / applied docs).
 */
const filled = (v) => v !== undefined && v !== null && v !== '';

/** { ctn, pcs, qty } over the lines, or null when no line was sold by the carton */
export function cartonTotals(lines) {
  const sold = (lines || []).filter((l) => filled(l.qty));
  if (!sold.some((l) => num(l.ctn) > 0)) return null;
  const sum = (k) => Math.round(sold.reduce((s, l) => s + num(l[k]), 0) * 1000) / 1000;
  return { ctn: sum('ctn'), pcs: sum('pcs'), qty: sum('qty') };
}

export function buildDocContext({ txn: t, company, L, ledger, template }) {
  const tpl = template;
  const type = t.type;
  const cat = formCat(type);
  const ds = company?.dateStyle;
  const d = (v) => (v ? fmtDate(v, ds) : '');
  const cur = company?.currency || '';
  const partyId = t.customerId || t.vendorId;
  const party = L.customerMap.get(partyId) || L.vendorMap.get(partyId);
  const isCustomer = !!L.customerMap.get(partyId);
  const addr = (p) => (p ? [p.company || p.name, p.address, p.city].filter(Boolean).join('\n') : '');
  const coAddress = [company?.address, company?.city].filter(Boolean).join('\n');
  const coName = company?.legalName || company?.name || '';
  const acct = (id) => (id ? L.accountMap.get(id)?.name || '' : '');

  let lines = [];
  let subtotal = 0;
  let tax = 0;
  let total = 0;
  if (cat === 'sales') {
    const c = salesTotals((t.lines || []).filter(lineHasData), t.taxRate, L.itemMap);
    lines = c.lines.map((l) => {
      const it = L.itemMap.get(l.itemId);
      return { sku: it?.sku || '', item: it?.name || '', desc: l.description || '', pkg: l.pkg, ctn: l.ctn, pcs: l.pcs, qty: l.qty, uom: l.uom || '', rate: it?.type === 'Discount' && String(l.rate).includes('%') ? String(l.rate) : l.rate, amount: l.amount, tax: l.taxable ? 'T' : '' };
    });
    subtotal = c.subtotal;
    tax = c.tax;
    total = c.total;
  } else if (cat === 'purchase') {
    lines = [
      ...(t.itemLines || []).filter(lineHasData).map((l) => {
        const it = L.itemMap.get(l.itemId);
        return { sku: it?.sku || '', item: it?.name || '', desc: l.description || '', qty: l.qty, uom: l.uom || '', rate: l.cost, amount: num(l.amount) };
      }),
      ...(t.expenseLines || []).filter((l) => l.accountId || num(l.amount) || l.memo).map((l) => ({ item: acct(l.accountId), desc: l.memo || '', amount: num(l.amount) })),
    ];
    total = round2(lines.reduce((s, l) => s + num(l.amount), 0));
    subtotal = total;
  } else {
    lines = (t.applied || []).map((a) => {
      const doc = ledger?.txnById?.get(a.txnId);
      const label = doc ? (FORM_MAP[doc.type]?.label || doc.type) + (doc.num ? ' #' + doc.num : '') : '';
      return { item: label, desc: doc ? d(doc.date) : '', rate: doc ? num(doc.total) : '', amount: num(a.amount) };
    });
    total = round2(num(t.amount ?? t.total));
    subtotal = total;
  }

  const open = t.id ? ledger?.open?.get(t.id) : undefined;
  const showBalance = type === 'invoice' && open !== undefined && Math.abs(open - total) > 0.004;
  const paid = (type === 'invoice' || type === 'bill') && open !== undefined && Math.abs(open) < 0.005 && total > 0;
  const bal = partyId ? (isCustomer ? ledger?.custBal?.get(partyId) : ledger?.vendBal?.get(partyId)) : undefined;
  const st = tpl?.style || {};
  const words = amountInWords(total, { currency: st.wordsCurrency ?? 'Rupees', fraction: st.wordsFraction ?? 'Paisa', system: st.wordsSystem });

  let billTo = '';
  if (cat === 'sales') billTo = t.billTo || party?.billTo || party?.name || '';
  else if (cat === 'purchase') billTo = t.address || addr(party);
  else billTo = party?.billTo || addr(party);

  const values = {
    companyName: coName,
    companyAddress: coAddress,
    companyPhone: company?.phone || '',
    companyEmail: company?.email || '',
    companyWebsite: company?.website || '',
    companyNtn: company?.ntn || '',
    title: tpl?.title ?? FORM_MAP[type]?.title ?? '',
    date: d(t.date),
    time: fmtTime(t.time),
    num: t.num || '',
    billTo,
    shipTo: t.shipTo || (type === 'purchaseorder' ? [coName, coAddress].filter(Boolean).join('\n') : ''),
    poNumber: t.poNumber || '',
    terms: t.terms || '',
    dueDate: d(t.dueDate),
    rep: t.rep || '',
    shipDate: d(t.shipDate),
    via: t.via || '',
    expectedDate: d(t.expectedDate),
    method: t.method || '',
    ref: t.ref || '',
    account: type === 'payment' || type === 'salesreceipt' ? (t.depositTo === ledger?.sys?.UF ? 'Undeposited Funds' : acct(t.depositTo)) : acct(t.accountId),
    partyName: party?.name || '',
    partyPhone: party?.phone || '',
    partyEmail: party?.email || '',
    partyNtn: party?.ntn || '',
    message: t.message || '',
    memo: t.memo || '',
    subtotal: money(subtotal),
    tax: tax ? money(tax) : '',
    total: `${cur} ${money(total)}`.trim(),
    payments: showBalance ? money(open - total) : '',
    balanceDue: showBalance ? `${cur} ${money(open)}`.trim() : '',
    amountWords: total ? words : '',
    partyBalance: bal !== undefined ? `${cur} ${money(bal)}`.trim() : '',
  };

  const totals = [];
  if (tax) {
    totals.push({ field: 'subtotal', value: money(subtotal) });
    totals.push({ field: 'tax', label: `${fieldLabelOrTax(tpl, company)} (${num(t.taxRate)}%)`, value: money(tax) });
  }
  totals.push({ field: 'total', value: values.total, strong: true });
  if (showBalance) {
    totals.push({ field: 'payments', value: values.payments });
    totals.push({ field: 'balanceDue', value: values.balanceDue, strong: true });
  }

  return {
    values,
    lines: lines.map((l, i) => ({
      no: String(i + 1),
      sku: l.sku || '',
      item: l.item || '',
      desc: l.desc || '',
      pkg: filled(l.pkg) && num(l.pkg) ? fmtQty(l.pkg) : '',
      ctn: filled(l.ctn) ? fmtQty(l.ctn) : '',
      pcs: filled(l.pcs) ? fmtQty(l.pcs) : '',
      qty: filled(l.qty) ? fmtQty(l.qty) : '',
      uom: l.uom || '',
      rate: l.rate !== undefined && l.rate !== '' && l.rate !== null ? (typeof l.rate === 'string' && l.rate.includes('%') ? l.rate : money(l.rate)) : '',
      tax: l.tax || '',
      amount: money(l.amount),
    })),
    totals,
    // carton invoices: total cartons, loose pieces and quantity, shown as the last row of the table
    lineTotals: cartonTotals(lines),
    stamp: t.voided ? 'VOID' : paid ? 'PAID' : '',
    logo: company?.logo || '',
    company: company || {},
  };
}
function fieldLabelOrTax(tpl, company) {
  const v = tpl?.labels?.tax;
  return v || company?.taxName || 'Tax';
}

// ---------------------------------------------------------------- sample data for previews

export function sampleDoc(formType, company, template) {
  const cat = formCat(formType);
  const items = [
    { id: 's1', name: 'RC Racing Car', sku: 'RC-1016', uom: 'pcs', type: 'Inventory Part' },
    { id: 's2', name: 'Building Blocks 500', sku: 'BB-500', uom: 'box', type: 'Inventory Part' },
    { id: 's3', name: 'Teddy Bear 12"', sku: 'TB-12', uom: 'dozen', type: 'Inventory Part' },
    { id: 's4', name: 'Jigsaw Puzzle 1000', sku: 'PZ-1000', uom: 'pcs', type: 'Inventory Part' },
  ];
  const customer = {
    id: 'sc',
    name: 'Sample Toy Shop',
    billTo: 'Sample Toy Shop\nShop 12, Main Market\nGulberg, Lahore',
    shipTo: 'Sample Toy Shop\nWarehouse 3, Ring Road\nLahore',
    phone: '0300-1234567',
    email: 'orders@sampletoyshop.pk',
    ntn: '1234567-8',
  };
  const vendor = { id: 'sv', name: 'Sample Toys Importer', company: 'Sample Toys Importer (Pvt) Ltd', address: 'Plot 45, Industrial Area', city: 'Karachi', phone: '021-3456789' };
  const accounts = new Map([
    ['sb', { id: 'sb', name: 'Bank Account' }],
    ['se', { id: 'se', name: 'Freight In & Import Duty' }],
  ]);
  const L = {
    itemMap: new Map(items.map((i) => [i.id, i])),
    customerMap: new Map([[customer.id, customer]]),
    vendorMap: new Map([[vendor.id, vendor]]),
    accountMap: accounts,
  };
  const base = { id: '', type: formType, num: cat === 'sales' ? '1024' : cat === 'payment' ? 'RCV-118' : 'B-2207', date: new Date().toISOString().slice(0, 10), time: '14:30' };
  const docs = new Map([
    ['d1', { id: 'd1', type: formType === 'payment' ? 'invoice' : 'bill', num: formType === 'payment' ? '1019' : 'B-2190', date: base.date, total: 45200 }],
    ['d2', { id: 'd2', type: formType === 'payment' ? 'invoice' : 'bill', num: formType === 'payment' ? '1021' : 'B-2198', date: base.date, total: 18750 }],
  ]);
  let txn;
  if (cat === 'sales') {
    txn = {
      ...base,
      customerId: 'sc',
      billTo: customer.billTo,
      shipTo: customer.shipTo,
      poNumber: 'PO-7781',
      terms: 'Net 30',
      dueDate: base.date,
      rep: 'AY',
      shipDate: base.date,
      via: 'Own Vehicle',
      method: 'Cash',
      ref: '—',
      message: 'Thank you for your business.',
      memo: 'Sample memo',
      taxRate: num(company?.taxRate),
      lines: [
        { itemId: 's1', description: 'Remote control racing car 1:16, rechargeable', pkg: 12, ctn: 1, pcs: 0, qty: 12, uom: 'pcs', rate: 2450, amount: 29400, taxable: num(company?.taxRate) > 0 },
        { itemId: 's2', description: 'Building blocks set — 500 pieces', pkg: 1, ctn: 5, pcs: 0, qty: 5, uom: 'box', rate: 3800, amount: 19000, taxable: num(company?.taxRate) > 0 },
        { itemId: 's3', description: 'Teddy bear 12 inch, assorted colours', pkg: 3, ctn: 0, pcs: 3, qty: 3, uom: 'dozen', rate: 6600, amount: 19800, taxable: false },
        { itemId: 's4', description: 'Jigsaw puzzle 1000 pieces', pkg: 10, ctn: 1, pcs: 0, qty: 10, uom: 'pcs', rate: 950, amount: 9500, taxable: false },
      ],
    };
  } else if (cat === 'purchase') {
    txn = {
      ...base,
      vendorId: 'sv',
      terms: 'Net 15',
      dueDate: base.date,
      expectedDate: base.date,
      accountId: 'sb',
      memo: 'Container #AYT-889 — sample',
      itemLines: [
        { itemId: 's1', description: 'RC racing car 1:16', qty: 120, uom: 'pcs', cost: 1550, amount: 186000 },
        { itemId: 's2', description: 'Building blocks set — 500 pieces', qty: 60, uom: 'box', cost: 2400, amount: 144000 },
      ],
      expenseLines: [{ accountId: 'se', memo: 'Freight & clearing', amount: 18500 }],
    };
  } else {
    txn = {
      ...base,
      customerId: formType === 'payment' ? 'sc' : undefined,
      vendorId: formType === 'billpayment' ? 'sv' : undefined,
      method: 'Bank Transfer',
      ref: 'IBFT-55102',
      depositTo: 'sb',
      accountId: 'sb',
      memo: 'Sample payment',
      amount: 63950,
      applied: [
        { txnId: 'd1', amount: 45200 },
        { txnId: 'd2', amount: 18750 },
      ],
    };
  }
  const ledger = { txnById: docs, open: new Map(), custBal: new Map([['sc', 84500]]), vendBal: new Map([['sv', 212000]]), sys: {} };
  return buildDocContext({ txn, company, L, ledger, template });
}

// ---------------------------------------------------------------- editing helpers

export function bandBoxes(tpl, band) {
  return tpl.boxes.filter((b) => b.band === band);
}

// add a box below the existing ones in a band (grows the band if needed)
export function addBox(tpl, band, preset, extra = {}) {
  const W = contentSize(tpl.page).w;
  const box = { ...BOX_DEFAULTS, ...boxPreset(preset), band, id: uid().slice(0, 8), ...extra };
  box.w = Math.min(box.w, W);
  const inBand = tpl.boxes.filter((b) => b.band === band && !b.hidden);
  const bottom = inBand.reduce((m, b) => Math.max(m, b.y + b.h), 0);
  box.x = 0;
  box.y = half(inBand.length ? bottom + 2 : 2);
  const key = band === 'header' ? 'headerHeight' : 'footerHeight';
  const need = box.y + box.h + 2;
  return { ...tpl, boxes: [...tpl.boxes, box], [key]: Math.max(tpl[key], need), _added: box.id };
}

// show / hide (or create) the box of a data field — the "Print" checkbox
export function setFieldPrinted(tpl, field, on, band) {
  const existing = tpl.boxes.filter((b) => b.kind === 'field' && b.field === field);
  if (existing.length) return { ...tpl, boxes: tpl.boxes.map((b) => (b.kind === 'field' && b.field === field ? { ...b, hidden: !on } : b)) };
  if (!on) return tpl;
  const { _added, ...next } = addBox(tpl, band || (FIELDS[field]?.group === 'Footer' || FIELDS[field]?.group === 'Totals' ? 'footer' : 'header'), field);
  return next;
}
export const fieldPrinted = (tpl, field) => tpl.boxes.some((b) => b.kind === 'field' && b.field === field && !b.hidden);

// scale x / width of every box when the printable width changes (paper, orientation, margins)
export function rescaleBoxes(tpl, oldW, newW) {
  if (!oldW || !newW || Math.abs(oldW - newW) < 0.1) return tpl;
  const s = newW / oldW;
  return { ...tpl, boxes: tpl.boxes.map((b) => ({ ...b, x: half(b.x * s), w: Math.max(3, half(b.w * s)) })) };
}

export function newTemplateFrom(base, name) {
  return { ...base, id: uid(), name, boxes: base.boxes.map((b) => ({ ...b, id: uid().slice(0, 8) })), updatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------- import / export (.aytemplate.json)

export const TEMPLATE_FILE_APP = 'AY Toys Templates';

export function templateExportPayload(tpls) {
  return { app: TEMPLATE_FILE_APP, version: 1, exportedAt: new Date().toISOString(), templates: tpls.map(compactTemplate) };
}

// Read an exported file. Every template gets a fresh id, so importing never replaces an existing template.
// Returns { templates, skipped } or throws a readable Error.
export function parseTemplateFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This is not a template file (it could not be read).');
  }
  if (!data || data.app !== TEMPLATE_FILE_APP || !Array.isArray(data.templates)) throw new Error('This is not an AY Toys template file. Use a file made with "Export" on the Templates screen.');
  const templates = [];
  let skipped = 0;
  data.templates.forEach((raw) => {
    if (!raw || !FORM_MAP[raw.formType] || !Array.isArray(raw.boxes)) {
      skipped++;
      return;
    }
    const t = normalizeTemplate(raw);
    templates.push({ ...t, id: uid(), name: String(raw.name || '').trim() || t.name, boxes: t.boxes.map((b) => ({ ...b, id: uid().slice(0, 8) })) });
  });
  return { templates, skipped };
}
