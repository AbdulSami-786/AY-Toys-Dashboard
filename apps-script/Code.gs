/**
 * AY Toys — Google Sheets backend: the one Google Sheet that holds the books of every company.
 *
 * ONE-TIME SETUP
 *  1. Create a new Google Sheet, e.g. "AY Toys Database" (open sheets.new).
 *  2. Extensions › Apps Script. Delete the sample code, paste this whole file and click Save.
 *  3. In the toolbar choose the function "setup" and click Run. Allow the permissions it asks for.
 *     ("setup" is already selected because it is the first function.) If Google says the app is not
 *     verified: Advanced › Go to … (unsafe) — it is your own script.
 *     setup creates every tab, locks the sheet to the owner key below and writes a "Start Here" tab.
 *     (After reloading the sheet there is also an "AY Toys" menu with the same command.)
 *  4. Deploy › New deployment › gear icon › Web app.
 *       Execute as: Me
 *       Who has access: Anyone
 *     Click Deploy and copy the Web app URL (it ends with /exec).
 *  5. Paste that URL into the app's src/config.js as SHEET_URL, then rebuild the app (npm run build).
 *     Every computer that opens the app connects by itself.
 *
 * UPDATING THIS CODE LATER
 *  Paste the new code over the old, Save, and run "setup" once (it is safe to repeat and never deletes data).
 *  Then Deploy › Manage deployments › (pencil) Edit › Version: New version › Deploy,
 *  so the same /exec URL keeps working.
 *
 * WHAT IS IN THE SHEET
 *  Start Here               status, companies and help (rebuilt by setup and AY Toys › Refresh status)
 *  Reports                  Profit & Loss, Balance Sheet, aging, sales, stock… of every company, sent by the app
 *                           a few seconds after changes (made with the app's own report engine, so they match)
 *  Companies                one row per company
 *  <CODE> | Chart of Accounts, Items, Customers, Vendors, Transactions, Memorized
 *                           six tabs per company, e.g. "AYTOYS_X1Y | Transactions"
 *  Shared Ledgers (hidden)  read-only copies of the party ledgers you shared; passwords only as hashes
 *  Report Data (hidden)     the reports as the app sent them (the Reports tab is drawn from this)
 *  SYSTEM | Users (hidden)  the people who may log in to AY Toys and the pages each may open (passwords only
 *                           as salted PBKDF2 hashes). Manage them in the app: Company › Users & Permissions.
 *                           Forgot a password? AY Toys › Reset a user's password… in this sheet.
 *  One row per record; nested data (invoice lines etc.) is stored as JSON text. Make changes in the app,
 *  not in these tabs: the app overwrites them. Each tab shows a warning before anyone edits it by hand.
 *
 * OWNER KEY
 *  Every request must carry the owner key. Without it nobody can read or change your books through the
 *  Web app URL — this matters because shared party-ledger links use the same URL.
 *  APP_OWNER_KEY below must be the same as OWNER_KEY in the app's src/config.js.
 *  Changing the key: change it in both places, then in the sheet use AY Toys › Lock to the owner key in this code.
 *
 * SHARED PARTY LEDGERS
 *  <Web app URL>?l=<link id> shows that party's ledger after they type their password.
 *  That page can only read — it cannot change anything.
 */

var VERSION = 7;

// The same as OWNER_KEY in the app's src/config.js. setup locks the sheet to it.
// Never commit the real key: leave this empty here and paste apps-script/Code.deploy.gs (made by `npm run sheet-code`,
// it has the key filled in and is not kept in git) into the Apps Script editor.
var APP_OWNER_KEY = '';

var TAB_NAMES = {
  accounts: 'Chart of Accounts',
  items: 'Items',
  customers: 'Customers',
  vendors: 'Vendors',
  txns: 'Transactions',
  memorized: 'Memorized',
};
var START_TAB = 'Start Here';
var COMPANIES_TAB = 'Companies';
var SHARED_TAB = 'Shared Ledgers';
var REPORTS_TAB = 'Reports';
var REPORT_DATA_TAB = 'Report Data';
var SHARED_HEAD = ['id', 'companyId', 'partyId', 'kind', 'name', 'company', 'color', 'salt', 'hash', 'updatedAt', 'parts'];
var SHARE_CHUNK = 40000; // a cell holds at most 50,000 characters
var MAX_TRIES = 8; // wrong passwords allowed per link every 15 minutes
var PUBLIC_ACTIONS = { ping: true, claimKey: true };

// Column order of a new tab. Any other field the app sends gets its own column at the end automatically.
var COLUMNS = {
  companies: ['id', 'code', 'name', 'legalName', 'address', 'city', 'phone', 'email', 'ntn', 'website', 'currency', 'dateStyle', 'fyMonth', 'taxName', 'taxRate', 'accountNumbers', 'theme', 'lists', 'createdAt', 'updatedAt'],
  accounts: ['id', 'number', 'name', 'type', 'parentId', 'description', 'sys', 'active', 'createdAt', 'updatedAt'],
  items: ['id', 'sku', 'barcode', 'name', 'type', 'category', 'uom', 'description', 'purchaseDescription', 'cost', 'price', 'percent', 'reorderPoint', 'preferredVendorId', 'incomeAccountId', 'cogsAccountId', 'assetAccountId', 'expenseAccountId', 'taxable', 'active', 'createdAt', 'updatedAt'],
  customers: ['id', 'name', 'company', 'type', 'contact', 'phone', 'email', 'billTo', 'shipTo', 'city', 'terms', 'priceLevelId', 'creditLimit', 'taxable', 'rep', 'ntn', 'notes', 'active', 'createdAt', 'updatedAt'],
  vendors: ['id', 'name', 'company', 'type', 'contact', 'phone', 'email', 'address', 'city', 'terms', 'ntn', 'notes', 'active', 'createdAt', 'updatedAt'],
  txns: ['id', 'type', 'num', 'date', 'dueDate', 'customerId', 'vendorId', 'nameId', 'accountId', 'depositTo', 'fromId', 'toId', 'total', 'subtotal', 'taxRate', 'tax', 'amount', 'method', 'ref', 'terms', 'memo', 'message', 'rep', 'billTo', 'shipTo', 'shipDate', 'via', 'expectedDate', 'voided', 'closed', 'sourceId', 'applied', 'credits', 'payments', 'lines', 'itemLines', 'expenseLines', 'otherLines', 'createdAt', 'updatedAt'],
  memorized: ['id', 'name', 'txnType', 'frequency', 'nextDate', 'template', 'createdAt', 'updatedAt'],
  Users: ['id', 'username', 'name', 'phone', 'email', 'role', 'active', 'canDelete', 'shops', 'pages', 'notes', 'lastLogin', 'mustChange', 'deleted', 'salt', 'hash', 'rounds', 'passwordSetAt', 'createdAt', 'updatedAt'],
};
var TAB_COLORS = { companies: '#2ca01c', accounts: '#1a73e8', items: '#f9ab00', customers: '#188038', vendors: '#e8710a', txns: '#9334e6', memorized: '#80868b', Users: '#202124' };
// the app keeps its users under this code: tab "SYSTEM | Users"
var SYSTEM_CODE = 'SYSTEM';
var USERS_TABLE = 'Users';
var RESET_ROUNDS = 2000; // PBKDF2 rounds of a password set here (the app makes it stronger at the next login)
var MIN_PASSWORD = 8;
var BRAND = '#2ca01c';
var HEAD_BG = '#2ca01c';
var HEAD_FG = '#ffffff';
// A new tab has 1,000 rows and 26 columns. A tab that needs more grows by this much at a time.
var SPARE_ROWS = 500;
var SPARE_COLS = 5;

/* ---------------- setup, the AY Toys menu and the Start Here tab ---------------- */
// These run from the Apps Script editor or the sheet's menu. They never return anything and never show the
// key, so they are harmless even if someone calls them through a shared ledger page.

/**
 * Run once after pasting this code, and again after updating it. Safe to repeat: it never deletes data.
 * Creates every tab (Start Here, Companies, the six tabs of each company, the hidden Shared Ledgers),
 * locks the sheet to APP_OWNER_KEY when no key is set yet, and rebuilds Start Here.
 */
function setup() {
  var notes = withLock_(function () {
    var out = [];
    var key = ownerKey_();
    if (!key && validKey_(APP_OWNER_KEY)) {
      setOwnerKey_(APP_OWNER_KEY);
      out.push('Locked the sheet to the owner key in this code.');
    } else if (!key) {
      out.push('APP_OWNER_KEY at the top of the code is empty, so the app locks the sheet the first time it connects.');
    } else if (APP_OWNER_KEY && key !== APP_OWNER_KEY) {
      out.push('Warning: the sheet is locked to a different owner key than the one in this code. If the app cannot connect, use AY Toys › Lock to the owner key in this code.');
    } else {
      out.push('Owner key: OK.');
    }
    var n = buildTabs_();
    renderReports_();
    writeStart_();
    removeBlankSheets_();
    out.push(n ? n + (n === 1 ? ' company' : ' companies') + ' set up.' : 'No companies yet — they appear after the app creates one.');
    return out;
  });
  tell_(
    'AY Toys sheet is ready',
    notes.join('\n') +
      '\n\nNext (first time only): Deploy › New deployment › Web app — Execute as: Me, Who has access: Anyone. ' +
      'Copy the Web app URL into the app’s src/config.js as SHEET_URL. See the Start Here tab.',
  );
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('AY Toys')
    .addItem('Set up / repair this sheet', 'setup')
    .addItem('Refresh status', 'refreshStatus')
    .addItem('Rebuild the Reports tab', 'refreshReports')
    .addItem('Delete tabs of deleted shops…', 'deleteOrphanTabs')
    .addItem('Reset a user\'s password…', 'resetUserPassword')
    .addSeparator()
    .addItem('Lock to the owner key in this code', 'useOwnerKeyFromCode')
    .addToUi();
}

function refreshStatus() {
  withLock_(writeStart_);
  toast_('Status updated.');
}

// Points the sheet at APP_OWNER_KEY. Replacing a different key needs a click on Yes in the sheet.
function useOwnerKeyFromCode() {
  if (!validKey_(APP_OWNER_KEY)) {
    tell_('No owner key in the code', 'Set APP_OWNER_KEY at the top of the code (the same as OWNER_KEY in src/config.js, 24–64 letters and digits), Save, and try again.');
    return;
  }
  var cur = ownerKey_();
  if (cur === APP_OWNER_KEY) {
    tell_('Owner key', 'The sheet already uses the owner key in this code.');
    return;
  }
  if (cur) {
    var ui = ui_();
    if (!ui) {
      tell_('Owner key not changed', 'The sheet uses a different key. Run this from the sheet (AY Toys › Lock to the owner key in this code) to confirm, or delete OWNER_KEY in Project Settings › Script properties and run setup.');
      return;
    }
    var answer = ui.alert('Replace the owner key?', 'Computers whose app still has the old key stop syncing until their src/config.js has the key in this code. Continue?', ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) return;
  }
  withLock_(function () {
    setOwnerKey_(APP_OWNER_KEY);
    writeStart_();
  });
  tell_('Owner key', 'The sheet is now locked to the owner key in this code.');
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function ui_() {
  try {
    return SpreadsheetApp.getUi(); // not available when run from the editor or a web request
  } catch (e) {
    return null;
  }
}

function tell_(title, msg) {
  console.log(title + '\n' + msg);
  var ui = ui_();
  if (ui) ui.alert(title, msg, ui.ButtonSet.OK);
}

function toast_(msg) {
  try {
    SpreadsheetApp.getActive().toast(msg, 'AY Toys', 5);
  } catch (e) {
    console.log(msg);
  }
}

// Creates any missing tab and tidies every tab's look. Returns the number of companies.
function buildTabs_() {
  var co = companiesSheet_();
  if (co.getLastRow() <= 1) setHeadings_(co, COLUMNS.companies);
  styleTab_(co, TAB_COLORS.companies);
  var companies = readTable_(co).filter(function (c) {
    return c.code;
  });
  companies.forEach(function (c) {
    Object.keys(TAB_NAMES).forEach(function (t) {
      var sh = dataSheet_(c.code, t);
      if (sh.getLastRow() <= 1) setHeadings_(sh, COLUMNS[t]);
      styleTab_(sh, TAB_COLORS[t]);
    });
  });
  var users = dataSheet_(SYSTEM_CODE, USERS_TABLE);
  if (users.getLastRow() <= 1) setHeadings_(users, COLUMNS.Users);
  styleTab_(users, TAB_COLORS.Users);
  if (!users.isSheetHidden()) users.hideSheet();
  sharedSheet_();
  return companies.length;
}

// A new spreadsheet starts with an empty "Sheet1"; AY Toys does not use it.
function removeBlankSheets_() {
  var ss = SpreadsheetApp.getActive();
  ss.getSheets().forEach(function (sh) {
    if (/^Sheet\d+$/.test(sh.getName()) && sh.getLastRow() === 0 && sh.getLastColumn() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
}

function str_(v) {
  return String(v === null || v === undefined ? '' : v);
}

function when_(d) {
  var date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return str_(d);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd MMM yyyy, HH:mm');
}

function status_() {
  var ss = SpreadsheetApp.getActive();
  var key = ownerKey_();
  var co = ss.getSheetByName(COMPANIES_TAB);
  var codes = {};
  var companies = (co ? readTable_(co) : [])
    .filter(function (c) {
      return c.code;
    })
    .map(function (c) {
      codes[c.code] = true;
      var count = function (t) {
        var sh = ss.getSheetByName(tabName_(c.code, t));
        return sh ? Math.max(sh.getLastRow() - 1, 0) : 0;
      };
      return [str_(c.name || c.code), str_(c.code), count('customers'), count('vendors'), count('items'), count('txns'), c.updatedAt ? when_(c.updatedAt) : ''];
    });
  // tabs left behind by companies deleted in the app
  var tables = {};
  Object.keys(TAB_NAMES).forEach(function (t) {
    tables[TAB_NAMES[t]] = true;
  });
  var orphans = {};
  ss.getSheets().forEach(function (sh) {
    var m = /^(.*) \| (.*)$/.exec(sh.getName());
    if (m && tables[m[2]] && !codes[m[1]]) orphans[m[1]] = true;
  });
  var usersTab = ss.getSheetByName(tabName_(SYSTEM_CODE, USERS_TABLE));
  var users = (usersTab ? readTable_(usersTab) : [])
    .filter(function (u) {
      return u.username && !u.deleted;
    })
    .sort(function (a, b) {
      return (b.role === 'admin') - (a.role === 'admin') || String(a.name).localeCompare(String(b.name));
    })
    .map(function (u) {
      return [str_(u.name), str_(u.username), u.role === 'admin' ? 'Super Admin' : 'Staff', str_(u.phone), u.active === false ? 'Switched off' : 'Active', u.lastLogin ? when_(u.lastLogin) : ''];
    });
  var shared = ss.getSheetByName(SHARED_TAB);
  var keyText, keyOk;
  if (!key) {
    keyOk = false;
    keyText = 'Not locked yet. Run setup, or the app locks it the first time it connects.';
  } else if (!APP_OWNER_KEY || key === APP_OWNER_KEY) {
    keyOk = true;
    keyText = APP_OWNER_KEY ? 'Locked to the owner key in this code (the same as src/config.js).' : 'Locked by the app.';
  } else {
    keyOk = false;
    keyText = 'Locked to a different key than the one in this code. If the app cannot connect, use AY Toys › Lock to the owner key in this code.';
  }
  return {
    key: keyText,
    keyOk: keyOk,
    companies: companies,
    orphans: Object.keys(orphans),
    users: users,
    shared: shared ? Math.max(shared.getLastRow() - 1, 0) : 0,
    at: when_(new Date()),
  };
}

// The first tab: status, the companies in this sheet and short help. Rebuilt every time; type nothing here.
function writeStart_() {
  var ss = SpreadsheetApp.getActive();
  var info = status_();
  var W = 7;
  var rows = [];
  var sections = [];
  var add = function (cells) {
    var r = cells.slice(0, W);
    while (r.length < W) r.push('');
    rows.push(r);
    return rows.length;
  };
  var section = function (title) {
    add([]);
    sections.push(add([title]));
  };

  add(['AY Toys — accounting database']);
  add(['This Google Sheet stores the books of the AY Toys app. Work in the app — it reads and writes these tabs by itself.']);
  section('STATUS');
  var firstStatus = add(['Script version', VERSION]);
  var keyRow = add(['Owner key', info.key]);
  add(['Companies', info.companies.length]);
  add(['Users', info.users.length]);
  add(['Shared party ledgers', info.shared]);
  add(['Checked', info.at]);
  section('COMPANIES');
  var tableHead = 0;
  if (info.companies.length) {
    tableHead = add(['Company', 'Code', 'Customers', 'Vendors', 'Items', 'Transactions', 'Last change']);
    info.companies.forEach(add);
  } else {
    add(['No companies yet. They appear here after the app creates one.']);
  }
  if (info.orphans.length) add(['Tabs of deleted shops: ' + info.orphans.join(', ') + '. Remove them with AY Toys › Delete tabs of deleted shops.']);
  section('USERS');
  var usersHead = 0;
  if (info.users.length) {
    usersHead = add(['Name', 'Username', 'Role', 'Number', 'Status', 'Last login']);
    info.users.forEach(add);
    add(['Add users and choose their pages in the app: Company › Users & Permissions. Forgot a password? AY Toys › Reset a user\'s password…']);
  } else {
    add(['No users yet. The first time AY Toys starts it asks to create the Super Admin.']);
  }
  section('CONNECT THE APP');
  add(['1.', 'Extensions › Apps Script › Deploy › New deployment › Web app. Execute as: Me. Who has access: Anyone. Deploy.']);
  add(['2.', 'Copy the Web app URL (it ends with /exec) into the app’s src/config.js as SHEET_URL, then rebuild the app.']);
  add(['3.', 'Open the app on any computer — it connects by itself. Company › Google Sheets Sync shows the sync status.']);
  section('GOOD TO KNOW');
  add(['•', 'The Reports tab (second tab) shows Profit & Loss, Balance Sheet, aging, sales and stock for each company. The app updates it by itself a few seconds after changes.']);
  add(['•', 'Make changes in the app, not in these tabs. The app overwrites them, so changes typed here are lost.']);
  add(['•', 'Do not rename the tabs or the headings in row 1 — the app finds its data by these names.']);
  add(['•', 'Undo a mistake: File › Version history › See version history brings back an earlier copy of the whole sheet.']);
  add(['•', 'After pasting new code: run setup, then Deploy › Manage deployments › Edit › Version: New version › Deploy (same URL).']);
  add(['•', 'The hidden "Shared Ledgers" tab holds the party ledgers you shared (passwords only as hashes). Do not edit it.']);

  var sh = ss.getSheetByName(START_TAB) || ss.insertSheet(START_TAB, 0);
  sh.clear();
  fit_(sh, rows.length, W);
  // plain text: "1." stays "1." and a company name is never read as a number, date or formula
  sh.getRange(1, 1, rows.length, W).setNumberFormat('@').setValues(
    rows.map(function (r) {
      return r.map(safe_);
    }),
  );
  [200, 120, 100, 100, 100, 110, 170].forEach(function (w, i) {
    sh.setColumnWidth(i + 1, w);
  });
  sh.getRange(1, 1).setFontSize(18).setFontWeight('bold').setFontColor(BRAND);
  sections.forEach(function (r) {
    sh.getRange(r, 1, 1, W).setFontWeight('bold').setFontColor(BRAND).setBackground('#e6f4ea');
  });
  sh.getRange(firstStatus, 1, 6, 1).setFontWeight('bold');
  if (usersHead) sh.getRange(usersHead, 1, 1, W).setFontWeight('bold').setBackground('#f1f3f4');
  if (!info.keyOk) sh.getRange(keyRow, 2).setFontColor('#c5221f').setFontWeight('bold');
  if (tableHead) {
    sh.getRange(tableHead, 1, 1, W).setFontWeight('bold').setBackground('#f1f3f4');
    sh.getRange(tableHead, 3, info.companies.length + 1, 4).setHorizontalAlignment('right');
  }
  sh.getRange(firstStatus, 2, 6, 1).setHorizontalAlignment('left');
  sh.setTabColor('#202124');
  if (sh.getIndex() !== 1) {
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(1);
  }
  var reports = ss.getSheetByName(REPORTS_TAB);
  if (reports && reports.getIndex() !== 2) {
    ss.setActiveSheet(reports);
    ss.moveActiveSheet(2);
    ss.setActiveSheet(sh);
  }
}

function doGet(e) {
  var token = e && e.parameter ? String(e.parameter.l || '') : '';
  if (token) return ledgerPage_(token);
  return json_({ ok: true, app: 'AY Toys', version: VERSION, time: new Date().toISOString() });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    lock.waitLock(30000);
    locked = true;
    var req = JSON.parse(e.postData.contents);
    if (!PUBLIC_ACTIONS[req.action]) checkKey_(req.key);
    var out;
    switch (req.action) {
      case 'ping':
        var key = ownerKey_();
        var keyOk = !!key && req.key === key;
        out = { ok: true, version: VERSION, secured: !!key, keyOk: keyOk, sheet: keyOk ? SpreadsheetApp.getActive().getName() : '' };
        break;
      case 'claimKey':
        out = claimKey_(req.newKey);
        break;
      case 'rotateKey':
        // only reachable with the current key (checked above)
        out = rotateKey_(req.newKey);
        break;
      case 'listCompanies':
        out = { ok: true, companies: readTable_(companiesSheet_()) };
        break;
      case 'saveCompany':
        upsert_(companiesSheet_(), req.company);
        out = { ok: true };
        break;
      case 'deleteCompany':
        removeRow_(companiesSheet_(), req.companyId);
        removeSharedFor_(req.companyId);
        forgetReports_(req.companyId);
        out = { ok: true };
        break;
      case 'publishLedgers':
        out = publishLedgers_(req);
        break;
      case 'publishReports':
        out = publishReports_(req);
        break;
      case 'listSummaries':
        out = { ok: true, summaries: listSummaries_() };
        break;
      case 'pull':
        var tables = {};
        var pullCode = checkCode_(req.code);
        (req.tables || Object.keys(TAB_NAMES)).forEach(function (t) {
          tables[t] = readTable_(dataSheet_(pullCode, checkTable_(t)));
        });
        out = { ok: true, tables: tables };
        break;
      case 'batch':
        var grouped = {};
        var batchCode = checkCode_(req.code);
        (req.ops || []).forEach(function (op) {
          var tbl = checkTable_(op.table);
          (grouped[tbl] = grouped[tbl] || []).push(op);
        });
        Object.keys(grouped).forEach(function (t) {
          applyOps_(dataSheet_(batchCode, t), grouped[t]);
        });
        out = { ok: true, applied: (req.ops || []).length };
        break;
      case 'replaceAll':
        var replaceCode = checkCode_(req.code);
        Object.keys(req.tables || {}).forEach(function (t) {
          writeTable_(dataSheet_(replaceCode, checkTable_(t)), req.tables[t], COLUMNS[t]);
        });
        out = { ok: true };
        break;
      default:
        out = { ok: false, error: 'Unknown action ' + req.action };
    }
    return json_(out);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

/* ---------------- tabs ---------------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function tabName_(code, table) {
  return code + ' | ' + (TAB_NAMES[table] || table);
}

function companiesSheet_() {
  return tab_(COMPANIES_TAB, COLUMNS.companies, TAB_COLORS.companies);
}

function dataSheet_(code, table) {
  var name = tabName_(code, table);
  var isNew = !SpreadsheetApp.getActive().getSheetByName(name);
  var sh = tab_(name, COLUMNS[table] || ['id'], TAB_COLORS[table]);
  if (isNew && code === SYSTEM_CODE) sh.hideSheet(); // password hashes: out of sight
  return sh;
}

// Finds a tab, or adds it at the end with its column headings, colours and edit warning.
function tab_(name, columns, color) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  sh = ss.insertSheet(name, ss.getSheets().length);
  fit_(sh, 1, columns.length);
  sh.getRange(1, 1, 1, columns.length).setValues([columns]);
  styleTab_(sh, color);
  return sh;
}

function styleHead_(sh) {
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).setFontWeight('bold').setBackground(HEAD_BG).setFontColor(HEAD_FG);
  // long JSON stays inside its cell instead of spilling over the next columns
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
}

function styleTab_(sh, color) {
  styleHead_(sh);
  if (color) sh.setTabColor(color);
  // a warning only: the app (running as you) still writes freely
  if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
    sh.protect().setWarningOnly(true).setDescription('AY Toys keeps this tab up to date. Make changes in the app — edits made here are overwritten.');
  }
}

// Grows a tab before anything is written past its edge.
function fit_(sh, rows, cols) {
  var maxRows = sh.getMaxRows();
  if (rows > maxRows) sh.insertRowsAfter(maxRows, rows - maxRows + SPARE_ROWS);
  var maxCols = sh.getMaxColumns();
  if (cols > maxCols) sh.insertColumnsAfter(maxCols, cols - maxCols + SPARE_COLS);
}

// Deletes rows (row numbers, any order), neighbours in one call. Sheets refuses to delete every row
// below the frozen heading, so an empty row is added first when that would happen.
function deleteRows_(sh, rows) {
  rows = rows
    .slice()
    .sort(function (a, b) {
      return b - a;
    })
    .filter(function (r, i, all) {
      return r > 1 && r !== all[i - 1]; // never the heading, never the same row twice
    });
  if (!rows.length) return;
  var left = sh.getMaxRows() - Math.max(sh.getFrozenRows(), 1) - rows.length;
  if (left < 1) sh.insertRowsAfter(sh.getMaxRows(), 1 - left);
  for (var i = 0; i < rows.length; i++) {
    var last = rows[i];
    var first = last;
    while (i + 1 < rows.length && rows[i + 1] === first - 1) first = rows[++i];
    sh.deleteRows(first, last - first + 1);
  }
}

function headers_(sh) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

function ensureHeaders_(sh, records) {
  var headers = headers_(sh);
  var add = [];
  records.forEach(function (r) {
    Object.keys(r).forEach(function (k) {
      if (headers.indexOf(k) === -1 && add.indexOf(k) === -1) add.push(k);
    });
  });
  if (add.length) {
    fit_(sh, 1, headers.length + add.length);
    sh.getRange(1, headers.length + 1, 1, add.length).setValues([add]).setFontWeight('bold').setBackground(HEAD_BG).setFontColor(HEAD_FG);
    headers = headers.concat(add);
  }
  return headers;
}

// Headings of a tab without records: the standard order first, then any others it already had.
function setHeadings_(sh, columns) {
  var extra = headers_(sh).filter(function (h) {
    return h && columns.indexOf(h) === -1;
  });
  var all = columns.concat(extra);
  fit_(sh, 1, all.length);
  sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).clearContent();
  sh.getRange(1, 1, 1, all.length).setValues([all]);
}

/* ---------------- records ---------------- */

function encode_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function decode_(v) {
  if (typeof v === 'string' && v.length > 1 && (v.charAt(0) === '[' || v.charAt(0) === '{')) {
    try {
      return JSON.parse(v);
    } catch (e) {
      return v;
    }
  }
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v;
}

// Google Sheets runs text that starts with "=" as a formula (even in a plain-text cell) and hides one leading
// apostrophe. One added apostrophe makes such text arrive exactly as typed (Sheets removes just that one).
function safe_(v) {
  return typeof v === 'string' && (v.charAt(0) === '=' || v.charAt(0) === "'") ? "'" + v : v;
}

function rowFor_(headers, rec) {
  return headers.map(function (h) {
    return safe_(encode_(rec[h]));
  });
}

// Plain-text format for strings keeps phone numbers / dates exactly as typed
function formatsFor_(row) {
  return row.map(function (v) {
    if (typeof v === 'number') return '0.##########';
    if (typeof v === 'boolean') return 'General';
    return '@';
  });
}

// A value longer than a cell can hold (50,000 characters — e.g. an invoice with hundreds of lines) is
// split over extra columns "lines", "lines#2", "lines#3"… Each part starts with "~" so Sheets keeps it as text.
var CELL_MAX = 45000;
function splitBig_(rec) {
  var out = {};
  Object.keys(rec).forEach(function (k) {
    var v = encode_(rec[k]);
    if (typeof v === 'string' && v.length > CELL_MAX) {
      for (var i = 0, n = 1; i < v.length; i += CELL_MAX, n++) out[n === 1 ? k : k + '#' + n] = '~' + v.slice(i, i + CELL_MAX);
    } else out[k] = rec[k];
  });
  return out;
}

function readTable_(sh) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var headers = headers_(sh);
  var values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var out = [];
  values.forEach(function (row) {
    if (!row[0]) return;
    var raw = {};
    headers.forEach(function (h, i) {
      if (h && row[i] !== '') raw[h] = row[i];
    });
    // join split values back together
    Object.keys(raw).forEach(function (h) {
      var m = /^(.*)#2$/.exec(h);
      if (!m) return;
      var base = m[1];
      var joined = String(raw[base] || '').slice(1);
      for (var n = 2; raw[base + '#' + n] !== undefined; n++) joined += String(raw[base + '#' + n]).slice(1);
      raw[base] = joined;
    });
    var rec = {};
    Object.keys(raw).forEach(function (h) {
      if (!/#\d+$/.test(h)) rec[h] = decode_(raw[h]);
    });
    if (rec.id !== undefined) rec.id = String(rec.id);
    out.push(rec);
  });
  return out;
}

function indexById_(sh) {
  var lastRow = sh.getLastRow();
  var map = {};
  if (lastRow < 2) return map;
  var ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  ids.forEach(function (r, i) {
    if (r[0] !== '') map[String(r[0])] = i + 2;
  });
  return map;
}

function upsert_(sh, rec) {
  applyOps_(sh, [{ op: 'upsert', record: rec }]);
}

function removeRow_(sh, id) {
  applyOps_(sh, [{ op: 'delete', id: id }]);
}

function applyOps_(sh, ops) {
  ops = ops.map(function (o) {
    return o.op === 'upsert' ? { op: 'upsert', record: splitBig_(o.record) } : o;
  });
  var headers = ensureHeaders_(
    sh,
    ops
      .filter(function (o) {
        return o.op === 'upsert';
      })
      .map(function (o) {
        return o.record;
      }),
  );
  // index: row number of a record in the tab; negative = new in this batch (−position in appendRows); 0 = gone
  var index = indexById_(sh);
  var appendRows = [];
  var deletes = [];
  ops.forEach(function (o) {
    if (o.op === 'upsert') {
      var id = String(o.record.id);
      var row = rowFor_(headers, o.record);
      var at = index[id];
      if (at > 0) {
        var rng = sh.getRange(at, 1, 1, headers.length);
        rng.setNumberFormats([formatsFor_(row)]);
        rng.setValues([row]);
      } else if (at < 0) {
        appendRows[-at - 1] = row; // the same new record twice in one batch: keep the last
      } else {
        appendRows.push(row);
        index[id] = -appendRows.length;
      }
    } else if (o.op === 'delete') {
      var did = String(o.id);
      if (index[did] > 0) deletes.push(index[did]);
      else if (index[did] < 0) appendRows[-index[did] - 1] = null; // added earlier in this same batch
      index[did] = 0;
    }
  });
  appendRows = appendRows.filter(Boolean);
  if (appendRows.length) {
    var start = sh.getLastRow() + 1;
    fit_(sh, start + appendRows.length - 1, headers.length);
    var rng2 = sh.getRange(start, 1, appendRows.length, headers.length);
    rng2.setNumberFormats(appendRows.map(formatsFor_));
    rng2.setValues(appendRows);
  }
  deleteRows_(sh, deletes);
}

function writeTable_(sh, records, columns) {
  records = (records || []).map(splitBig_);
  sh.clear();
  var cols = columns || ['id'];
  fit_(sh, 1, cols.length);
  sh.getRange(1, 1, 1, cols.length).setValues([cols]);
  var headers = ensureHeaders_(sh, records);
  if (records.length) {
    var rows = records.map(function (r) {
      return rowFor_(headers, r);
    });
    fit_(sh, rows.length + 1, headers.length);
    var rng = sh.getRange(2, 1, rows.length, headers.length);
    rng.setNumberFormats(rows.map(formatsFor_));
    rng.setValues(rows);
  }
  styleHead_(sh);
}

/* ---------------- owner key ---------------- */

function ownerKey_() {
  return PropertiesService.getScriptProperties().getProperty('OWNER_KEY') || '';
}

function setOwnerKey_(k) {
  PropertiesService.getScriptProperties().setProperty('OWNER_KEY', k);
}

function validKey_(k) {
  return /^[A-Za-z0-9]{24,64}$/.test(String(k || ''));
}

// No request may touch the books until the sheet is locked to a key (an unlocked sheet would let anyone with the
// Web app URL read and change everything). The app locks it on its first connect (claimKey).
function checkKey_(k) {
  var key = ownerKey_();
  if (!key) throw new Error('SHEET_NOT_LOCKED');
  if (String(k || '') !== key) throw new Error('OWNER_KEY_REQUIRED');
}

// Tab names are built from the company code and table name the app sends: accept only the shapes the app makes
function checkCode_(code) {
  if (!/^[A-Za-z0-9_]{1,40}$/.test(String(code || ''))) throw new Error('Invalid company code');
  return String(code);
}
function checkTable_(t) {
  if (!Object.prototype.hasOwnProperty.call(COLUMNS, t)) throw new Error('Invalid table ' + t);
  return t;
}

// The first computer to connect protects the sheet with its key; later calls must send the same key.
function claimKey_(newKey) {
  var k = String(newKey || '');
  if (!validKey_(k)) throw new Error('Invalid owner key');
  var cur = ownerKey_();
  if (cur && cur !== k) throw new Error('OWNER_KEY_REQUIRED');
  if (!cur) setOwnerKey_(k);
  return { ok: true, secured: true };
}

// Replace the owner key (the caller already proved it holds the current one)
function rotateKey_(newKey) {
  var k = String(newKey || '');
  if (!validKey_(k)) throw new Error('Invalid owner key');
  setOwnerKey_(k);
  return { ok: true, secured: true };
}

function hash_(salt, pass) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pass, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) hex += ('0' + (bytes[i] & 255).toString(16)).slice(-2);
  return hex;
}

/* ---------------- the Reports tab ---------------- */
// The app builds the reports with its own engine (so they always match what it shows) and sends them here.
// Each company's latest set is kept in the hidden "Report Data" tab; "Reports" lays out every company's.

var REPORT_FORMATS = { money: '#,##0.00;[Red]-#,##0.00', pct: '0.0"%";[Red]-0.0"%"' };

function publishReports_(req) {
  if (!req.companyId) throw new Error('Missing company');
  if (!Array.isArray(req.reports)) throw new Error('No reports');
  var record = {
    id: String(req.companyId),
    code: String(req.code || ''),
    name: String(req.name || ''),
    at: String(req.at || new Date().toISOString()),
    summary: JSON.stringify(req.summary || {}),
    data: JSON.stringify(req.reports),
  };
  applyOps_(reportDataSheet_(), [{ op: 'upsert', record: record }]);
  renderReports_();
  return { ok: true, reports: req.reports.length };
}

function reportDataSheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(REPORT_DATA_TAB);
  if (sh) return sh;
  sh = tab_(REPORT_DATA_TAB, ['id', 'code', 'name', 'at', 'summary', 'data'], null);
  sh.hideSheet();
  return sh;
}

// Each shop's latest figures (sales, expenses, cash…) for the app's start screen on other computers.
function listSummaries_() {
  var ss = SpreadsheetApp.getActive();
  var store = ss.getSheetByName(REPORT_DATA_TAB);
  var co = ss.getSheetByName(COMPANIES_TAB);
  if (!store || !co) return [];
  var live = {};
  readTable_(co).forEach(function (c) {
    live[String(c.id)] = true;
  });
  var sh = store;
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var headers = headers_(sh);
  var want = ['id', 'at', 'summary'].map(function (h) {
    return headers.indexOf(h);
  });
  if (want[0] < 0 || want[2] < 0) return [];
  var values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var out = [];
  values.forEach(function (row) {
    var id = String(row[want[0]]);
    if (!live[id]) return;
    out.push({ id: id, at: want[1] >= 0 ? String(row[want[1]]) : '', summary: decode_(row[want[2]]) });
  });
  return out;
}

function forgetReports_(companyId) {
  var sh = SpreadsheetApp.getActive().getSheetByName(REPORT_DATA_TAB);
  if (!sh) return;
  removeRow_(sh, companyId);
  renderReports_();
}

function col_(n) {
  var s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function numberFormat_(type, v) {
  if (REPORT_FORMATS[type]) return REPORT_FORMATS[type];
  if (type === 'qty') return v % 1 === 0 ? '#,##0' : '#,##0.00';
  return 'General';
}

// Rebuilds the Reports tab from the stored sets: contents with links, then each company's reports.
function renderReports_() {
  var ss = SpreadsheetApp.getActive();
  var store = ss.getSheetByName(REPORT_DATA_TAB);
  var co = ss.getSheetByName(COMPANIES_TAB);
  var live = {};
  (co ? readTable_(co) : []).forEach(function (c) {
    live[String(c.id)] = true;
  });
  var sets = (store ? readTable_(store) : []).filter(function (s) {
    return live[s.id] && Array.isArray(s.data);
  });
  sets.sort(function (a, b) {
    return String(a.name).localeCompare(String(b.name));
  });

  var sh = ss.getSheetByName(REPORTS_TAB);
  if (!sh) {
    var start = ss.getSheetByName(START_TAB);
    sh = ss.insertSheet(REPORTS_TAB, start ? start.getIndex() : 0); // right after Start Here
    sh.setTabColor('#1a73e8');
    sh.protect().setWarningOnly(true).setDescription('AY Toys rebuilds this tab from the app. Anything typed here is lost.');
  }

  var W = 2;
  sets.forEach(function (s) {
    s.data.forEach(function (rep) {
      W = Math.max(W, (rep.cols || []).length);
    });
  });
  var rows = [];
  var fmts = [];
  var st = { company: [], report: [], head: [], right: [], bold: [], total: [], grand: [], note: [] };
  var put = function (cells, formats) {
    var r = (cells || []).slice(0, W);
    var f = (formats || []).slice(0, W);
    while (r.length < W) r.push('');
    while (f.length < W) f.push('@');
    rows.push(r);
    fmts.push(f);
    return rows.length;
  };

  put(['AY Toys — Reports']);
  put(['Made by the AY Toys app from your books and updated by itself a few seconds after changes. Do not type here — this tab is rebuilt every time.']);
  if (!sets.length) {
    put([]);
    put(['No reports yet. They appear here after the AY Toys app syncs with this sheet (Company › Google Sheets Sync › Update now).']);
  }
  var links = [];
  if (sets.length) {
    put([]);
    st.report.push(put(['Contents (click a report to jump to it)']));
    sets.forEach(function (s) {
      st.bold.push(put([s.name, 'Updated ' + when_(s.at)]));
      s.data.forEach(function (rep) {
        links.push({ row: put(['', rep.dates || '']), rep: rep });
      });
    });
  }
  sets.forEach(function (s) {
    put([]);
    put([]);
    st.company.push(put([String(s.name).toUpperCase(), 'Updated ' + when_(s.at)]));
    s.data.forEach(function (rep) {
      var cols = rep.cols || [];
      put([]);
      rep.row = put([rep.title]);
      st.report.push(rep.row);
      if (rep.dates) st.note.push(put([rep.dates]));
      var h = put(
        cols.map(function (c) {
          return c.label;
        }),
      );
      st.head.push(h);
      cols.forEach(function (c, i) {
        if (i && c.type !== 'text' && c.type !== 'date') st.right.push(col_(i + 1) + h);
      });
      (rep.rows || []).forEach(function (r) {
        var cells = [];
        var f = [];
        cols.forEach(function (c, i) {
          var v = (r.v || [])[i];
          if (typeof v === 'number') {
            cells.push(v);
            f.push(numberFormat_(c.type, v));
          } else {
            var t = v === null || v === undefined ? '' : String(v);
            if (i === 0 && r.l && t) t = new Array(r.l + 1).join('    ') + t;
            cells.push(t);
            f.push('@');
          }
        });
        var n = put(cells, f);
        if (r.k === 'section') st.bold.push(n);
        else if (r.k === 'subtotal' || r.k === 'total') st.total.push(n);
        else if (r.k === 'grand') st.grand.push(n);
        else if (r.k === 'note') st.note.push(n);
      });
    });
  });
  rows = rows.map(function (r) {
    return r.map(safe_);
  });
  var gid = sh.getSheetId();
  links.forEach(function (x) {
    rows[x.row - 1][0] = '=HYPERLINK("#gid=' + gid + '&range=A' + x.rep.row + '","' + String(x.rep.title).replace(/"/g, '""') + '")';
    fmts[x.row - 1][0] = 'General';
  });

  sh.clear();
  fit_(sh, rows.length, W);
  var rng = sh.getRange(1, 1, rows.length, W);
  rng.setNumberFormats(fmts);
  rng.setValues(rows);
  var whole = function (list) {
    return list.map(function (r) {
      return 'A' + r + ':' + col_(W) + r;
    });
  };
  var style = function (list, fn) {
    if (list.length) fn(sh.getRangeList(list));
  };
  sh.getRange(1, 1).setFontSize(18).setFontWeight('bold').setFontColor(BRAND);
  style(whole(st.company), function (l) {
    l.setBackground('#202124').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12);
  });
  style(
    st.report.map(function (r) {
      return 'A' + r;
    }),
    function (l) {
      l.setFontWeight('bold').setFontSize(13).setFontColor(BRAND);
    },
  );
  style(whole(st.head), function (l) {
    l.setFontWeight('bold').setBackground('#f1f3f4').setBorder(null, null, true, null, null, null);
  });
  style(st.right, function (l) {
    l.setHorizontalAlignment('right');
  });
  style(whole(st.bold), function (l) {
    l.setFontWeight('bold');
  });
  style(whole(st.total), function (l) {
    l.setFontWeight('bold').setBorder(true, null, null, null, null, null);
  });
  style(whole(st.grand), function (l) {
    l.setFontWeight('bold').setBackground('#e6f4ea').setBorder(true, null, true, null, null, null);
  });
  style(whole(st.note), function (l) {
    l.setFontColor('#5f6368').setFontStyle('italic');
  });
  sh.setColumnWidth(1, 330);
  for (var c = 2; c <= W; c++) sh.setColumnWidth(c, 130);
  sh.setHiddenGridlines(true);
}

// Tabs of shops that are no longer in the Companies list (deleted in the app). Asks first; sheet menu only.
function deleteOrphanTabs() {
  var ui = ui_();
  if (!ui) {
    tell_('Not deleted', 'Run this from the sheet: AY Toys › Delete tabs of deleted shops.');
    return;
  }
  var codes = status_().orphans;
  if (!codes.length) {
    tell_('Nothing to delete', 'Every tab belongs to a shop in the Companies list.');
    return;
  }
  var answer = ui.alert('Delete tabs of deleted shops?', 'This permanently deletes every tab of: ' + codes.join(', ') + '.\n\n(File › Version history can still bring them back.)', ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return;
  var n = withLock_(function () {
    var ss = SpreadsheetApp.getActive();
    var count = 0;
    codes.forEach(function (code) {
      Object.keys(TAB_NAMES).forEach(function (t) {
        var sh = ss.getSheetByName(tabName_(code, t));
        if (sh && ss.getSheets().length > 1) {
          ss.deleteSheet(sh);
          count++;
        }
      });
    });
    writeStart_();
    return count;
  });
  tell_('Deleted', n + ' tab' + (n === 1 ? '' : 's') + ' deleted.');
}

// PBKDF2-HMAC-SHA256 — the same password hash the app makes (lib/password.js), so the app accepts it.
function pbkdf2Hex_(password, salt, rounds) {
  var key = Utilities.newBlob(String(password)).getBytes();
  var u = Utilities.computeHmacSha256Signature(Utilities.newBlob(String(salt)).getBytes().concat([0, 0, 0, 1]), key);
  var t = u.slice();
  for (var i = 1; i < rounds; i++) {
    u = Utilities.computeHmacSha256Signature(u, key);
    for (var j = 0; j < t.length; j++) t[j] = t[j] ^ u[j];
  }
  return t
    .map(function (b) {
      return ('0' + (b & 255).toString(16)).slice(-2);
    })
    .join('');
}

// Sheet menu only: give a user a temporary password (e.g. the Super Admin forgot theirs). The user is switched on,
// and AY Toys asks them to choose a new password right after logging in.
function resetUserPassword() {
  var ui = ui_();
  if (!ui) {
    tell_('Not changed', "Run this from the sheet: AY Toys › Reset a user's password…");
    return;
  }
  var sh = SpreadsheetApp.getActive().getSheetByName(tabName_(SYSTEM_CODE, USERS_TABLE));
  var users = (sh ? readTable_(sh) : []).filter(function (u) {
    return u.username && !u.deleted;
  });
  if (!users.length) {
    tell_('No users yet', 'There are no AY Toys users yet. Open AY Toys: it asks to create the Super Admin.');
    return;
  }
  var r = ui.prompt("Reset a user's password", 'Username (one of: ' + users.map(function (u) { return u.username; }).join(', ') + ')', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var name = String(r.getResponseText() || '').trim().toLowerCase();
  var user = users.filter(function (u) {
    return String(u.username).toLowerCase() === name;
  })[0];
  if (!user) {
    tell_('Not found', 'There is no user "' + name + '".');
    return;
  }
  var p = ui.prompt('Temporary password for ' + user.username, 'At least ' + MIN_PASSWORD + ' characters. ' + user.username + ' must choose a new password right after logging in.', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return;
  var pass = String(p.getResponseText() || '');
  if (pass.length < MIN_PASSWORD) {
    tell_('Not changed', 'The password needs at least ' + MIN_PASSWORD + ' characters.');
    return;
  }
  var now = new Date().toISOString();
  var rec = {};
  Object.keys(user).forEach(function (k) {
    rec[k] = user[k];
  });
  rec.salt = Utilities.getUuid().replace(/-/g, '');
  rec.rounds = RESET_ROUNDS;
  rec.hash = pbkdf2Hex_(pass, rec.salt, RESET_ROUNDS);
  rec.mustChange = true;
  rec.active = true;
  rec.passwordSetAt = now;
  rec.updatedAt = now; // newer than every computer's copy, so this one wins
  withLock_(function () {
    applyOps_(sh, [{ op: 'upsert', record: rec }]);
    writeStart_();
  });
  tell_('Password reset', user.username + ' can log in with the temporary password now (on a computer that is online, so it picks up the change) and will be asked to choose a new one.');
}

function refreshReports() {
  withLock_(renderReports_);
  toast_('Reports tab rebuilt from the latest reports the app sent.');
}

/* ---------------- shared party ledgers ---------------- */

function validToken_(t) {
  return /^[A-Za-z0-9]{16,64}$/.test(String(t || ''));
}

function sharedSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHARED_TAB);
  if (!sh) {
    sh = ss.insertSheet(SHARED_TAB, ss.getSheets().length);
    sh.getRange(1, 1, 1, SHARED_HEAD.length).setValues([SHARED_HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.hideSheet();
  }
  return sh;
}

function publishLedgers_(req) {
  if (!ownerKey_()) throw new Error('Protect this Google Sheet with an owner key before sharing ledgers (open Google Sheets Sync in AY Toys).');
  var sh = sharedSheet_();
  var removes = (req.removes || []).filter(validToken_);
  if (removes.length)
    applyOps_(
      sh,
      removes.map(function (t) {
        return { op: 'delete', id: t };
      }),
    );
  (req.upserts || []).forEach(function (u) {
    writeShared_(sh, req, u);
  });
  return { ok: true, published: (req.upserts || []).length, removed: removes.length };
}

// One row per shared ledger: fixed columns, then the snapshot JSON split over as many cells as needed.
// Each data cell starts with "~" so Sheets never reads it as a number, date or formula.
function writeShared_(sh, req, u) {
  if (!validToken_(u.token)) throw new Error('Invalid ledger link id');
  var pass = String(u.pass || '').trim();
  if (pass.length < 6) throw new Error('Ledger password must be at least 6 characters');
  var data = String(u.data || '');
  var parts = [];
  for (var i = 0; i < data.length; i += SHARE_CHUNK) parts.push('~' + data.slice(i, i + SHARE_CHUNK));
  var salt = Utilities.getUuid();
  var row = [
    u.token,
    String(req.companyId || ''),
    String(u.partyId || ''),
    u.kind === 'vendor' ? 'vendor' : 'customer',
    String(u.name || ''),
    String(req.companyName || ''),
    String(u.color || ''),
    salt,
    hash_(salt, pass),
    new Date().toISOString(),
    parts.length,
  ].concat(parts);
  var at = indexById_(sh)[u.token] || sh.getLastRow() + 1;
  var width = Math.max(sh.getLastColumn(), row.length);
  fit_(sh, at, width);
  var have = sh.getLastColumn();
  if (row.length > have) {
    var labels = [];
    for (var c = have + 1; c <= row.length; c++) labels.push('data' + (c - SHARED_HEAD.length));
    sh.getRange(1, have + 1, 1, labels.length).setValues([labels]).setFontWeight('bold');
  }
  while (row.length < width) row.push('');
  var rng = sh.getRange(at, 1, 1, width);
  rng.setNumberFormat('@');
  rng.setValues([row]);
}

function readShared_(token, headOnly) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHARED_TAB);
  if (!sh) return null;
  var at = indexById_(sh)[token];
  if (!at) return null;
  var width = headOnly ? SHARED_HEAD.length : sh.getLastColumn();
  var r = sh.getRange(at, 1, 1, width).getValues()[0];
  var rec = { kind: String(r[3]), name: String(r[4]), company: String(r[5]), color: String(r[6]), salt: String(r[7]), hash: String(r[8]) };
  if (!headOnly) {
    var n = Number(r[10]) || 0;
    rec.data = r
      .slice(SHARED_HEAD.length, SHARED_HEAD.length + n)
      .map(function (c) {
        return String(c).slice(1);
      })
      .join('');
  }
  return rec;
}

function removeSharedFor_(companyId) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHARED_TAB);
  if (!sh || sh.getLastRow() < 2 || !companyId) return;
  var ids = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
  var rows = [];
  ids.forEach(function (r, i) {
    if (String(r[0]) === String(companyId)) rows.push(i + 2);
  });
  deleteRows_(sh, rows);
}

/**
 * Called by the party's ledger page (google.script.run). Read-only: returns the published
 * snapshot when the password is right. Too many wrong passwords lock the link for 15 minutes.
 */
function openLedger(token, pass) {
  try {
    token = String(token || '');
    pass = String(pass || '').trim();
    if (!validToken_(token) || !ownerKey_()) return { ok: false, error: 'This ledger link is not active.' };
    var cache = CacheService.getScriptCache();
    var failKey = 'pw_' + token;
    var fails = Number(cache.get(failKey) || 0);
    if (fails >= MAX_TRIES) return { ok: false, error: 'Too many wrong passwords. Please try again after 15 minutes.' };
    var rec = readShared_(token, false);
    if (!rec) return { ok: false, error: 'This ledger link is not active any more. Please ask for a new link.' };
    if (!pass || hash_(rec.salt, pass) !== rec.hash) {
      cache.put(failKey, String(fails + 1), 900);
      var left = MAX_TRIES - fails - 1;
      return { ok: false, error: left > 0 ? 'Wrong password. ' + left + ' tries left.' : 'Too many wrong passwords. Please try again after 15 minutes.' };
    }
    cache.remove(failKey);
    return { ok: true, data: rec.data };
  } catch (err) {
    return { ok: false, error: 'Could not load the ledger right now. Please try again.' };
  }
}

function ledgerPage_(token) {
  var head = null;
  try {
    head = validToken_(token) && ownerKey_() ? readShared_(token, true) : null;
  } catch (err) {
    head = null;
  }
  var boot = JSON.stringify({ token: head ? token : '', company: head ? head.company : '', color: head ? head.color : '' }).replace(/</g, '\\u003c');
  var html = LEDGER_HTML.replace('__BOOT__', function () {
    return boot;
  });
  return HtmlService.createHtmlOutput(html)
    .setTitle(head && head.company ? head.company + ' - Ledger' : 'Ledger')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------------- the party's read-only ledger page ---------------- */
// Plain HTML + JS (no build step). It only displays the snapshot returned by openLedger().

var LEDGER_HTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<base target="_top">
<style>
:root{--c:#2ca01c;--bg:#f2f4f7;--card:#fff;--line:#dfe3e8;--line2:#eef1f4;--text:#1d2630;--muted:#66717d;--ok:#1d7329;--okbg:#e3f3e6;--warn:#8a5300;--warnbg:#fff1d6;--err:#c02626;--errbg:#fde8e6;--info:#2456a6;--infobg:#e6eefb;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#111518;--card:#1a1f24;--line:#2e363e;--line2:#232a31;--text:#e5e9ed;--muted:#9aa5b0;--ok:#7dd38a;--okbg:#173320;--warn:#f1b65c;--warnbg:#3b2c12;--err:#ff8b80;--errbg:#3e1b1a;--info:#9bbcff;--infobg:#1b2740;color-scheme:dark}}
*{box-sizing:border-box}
html,body{margin:0}
body{font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;background:var(--bg);color:var(--text);-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent}
button,input{font:inherit;color:inherit}
.top{background:var(--c);color:#fff;padding:12px 16px;padding-top:max(12px,env(safe-area-inset-top));position:sticky;top:0;z-index:6;box-shadow:0 2px 10px rgba(0,0,0,.15)}
.top-in>div:not(.top-acts){min-width:0}
.top-acts{margin-left:auto;display:flex;gap:6px;flex:none}
.ib{height:38px;min-width:38px;padding:0 12px;border-radius:10px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;font-weight:600;transition:background .15s}
.ib:hover,.ib:active{background:rgba(255,255,255,.25)}
.ib:disabled{opacity:.7}
.ib.busy svg{animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.top-in{max-width:1000px;margin:0 auto;display:flex;align-items:center;gap:12px;min-height:40px}
.logo{height:42px;max-width:120px;object-fit:contain;background:#fff;border-radius:6px;padding:3px}
.co{font-weight:700;font-size:17px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.co-sub{font-size:12px;opacity:.88}
.brand{display:flex;align-items:center;gap:10px;max-width:1000px;margin:8px auto 0;padding-top:8px;border-top:1px solid rgba(255,255,255,.25);font-size:12px;line-height:1.3}
.brand img{height:30px;width:auto;background:#fff;border-radius:6px;padding:2px 4px;flex:none}
.brand a{color:#fff;font-weight:700;text-decoration:none;white-space:nowrap}
.brand span{opacity:.95;min-width:0}
.wrap{max-width:1000px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px}
.login{max-width:400px;margin:32px auto}
.login h1{font-size:20px;margin:0 0 6px}
.login p{margin:0}
.muted{color:var(--muted)}
.small{font-size:12px}
label.f{display:block;font-size:12px;font-weight:600;color:var(--muted);margin:16px 0 6px}
.in{width:100%;height:44px;border:1px solid var(--line);border-radius:8px;padding:0 12px;background:var(--card)}
.in:focus,.btn:focus-visible,.lr:focus-visible{outline:2px solid var(--c);outline-offset:1px}
.pwrow{display:flex;gap:8px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);cursor:pointer;font-weight:600;white-space:nowrap;text-decoration:none}
.btn:hover{border-color:var(--muted)}
.btn.pri{background:var(--c);border-color:var(--c);color:#fff}
.btn.big{height:44px;width:100%;margin-top:16px;font-size:15px}
.btn:disabled{opacity:.6;cursor:default}
.pwrow .btn{height:44px}
.alert{border-radius:8px;padding:10px 12px;margin-top:14px;font-size:13px;background:var(--errbg);color:var(--err)}
.ro{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--muted);margin-top:16px}
.ro svg{flex:none}
.party{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:flex-start;justify-content:space-between}
.party h1{font-size:19px;margin:0}
.party .det{font-size:13px;color:var(--muted);white-space:pre-line;margin-top:2px}
.acts{display:flex;gap:8px;flex-wrap:wrap}
.tiles{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin:12px 0}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;min-width:0}
.tile .k{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.tile .v{font-size:22px;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.tile.main .v{font-size:28px;color:var(--c)}
.tile .s{font-size:12px;color:var(--muted);margin-top:2px}
.tb{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:16px -16px 10px;padding:8px 16px;position:sticky;top:var(--th,64px);z-index:4;background:var(--bg)}
.chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;max-width:100%}
.chips::-webkit-scrollbar{display:none}
.chip{flex:none;height:32px;padding:0 12px;border-radius:16px;border:1px solid var(--line);background:var(--card);cursor:pointer;font-weight:600;font-size:13px;transition:background .15s,color .15s,border-color .15s}
.chip.on{background:var(--c);border-color:var(--c);color:#fff}
.flt{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.flt label{font-size:12px;color:var(--muted);display:flex;gap:6px;align-items:center}
.flt input{height:34px;border:1px solid var(--line);border-radius:8px;padding:0 8px;background:var(--card)}
.flt input[type=search]{width:190px}
.lg{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.lr{display:grid;grid-template-columns:92px minmax(0,1fr) 118px 118px 140px;gap:10px;align-items:center;padding:10px 14px;border-top:1px solid var(--line2);cursor:pointer}
.lr:hover,.lr:active{background:var(--line2)}
.lr.mh,.lr.mh:hover,.lr.mh:active{display:block;cursor:default;padding:7px 14px;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);background:var(--bg)}
.lh,.lh:hover{cursor:default;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;border-top:0;background:var(--line2)}
.lr.o{grid-template-columns:92px minmax(0,1fr) 140px}
.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.ttl{font-weight:600}
.sub{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lr.sum,.lr.sum:hover{cursor:default;font-weight:700;background:var(--line2)}
.lr.void .ttl{text-decoration:line-through}
.c-a,.c-bm{display:none}
.cr{color:var(--ok)}
.bd{display:inline-block;font-size:11px;font-weight:700;padding:1px 8px;border-radius:9px;margin-left:6px;vertical-align:1px;background:var(--line2);color:var(--muted)}
.bd.ok{background:var(--okbg);color:var(--ok)}
.bd.warn{background:var(--warnbg);color:var(--warn)}
.bd.err{background:var(--errbg);color:var(--err)}
.bd.info{background:var(--infobg);color:var(--info)}
.empty{padding:32px 16px;text-align:center;color:var(--muted)}
.foot{max-width:1000px;margin:8px auto 24px;padding:0 16px;font-size:12px;color:var(--muted);text-align:center}
.ponly{display:none}
.toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#222;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;z-index:20}
.ov{position:fixed;inset:0;background:rgba(15,20,25,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto;z-index:10}
.ov{animation:fade .18s ease-out}
.doc{background:var(--card);border-radius:12px;width:100%;max-width:780px;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.3);animation:pop .2s ease-out}
@keyframes fade{from{opacity:0}}
@keyframes pop{from{opacity:0;transform:translateY(14px)}}
@keyframes up{from{transform:translateY(60%)}}
.doc-tt{display:none}
.lim{display:none;margin-top:8px}
.lim-r{padding:10px 0;border-bottom:1px solid var(--line2)}
.lim-t{font-weight:600}
.lim-d{font-size:12px;color:var(--muted);margin-top:1px}
.lim-n{display:flex;justify-content:space-between;gap:12px;margin-top:4px;font-variant-numeric:tabular-nums}
.lim-n span{color:var(--muted)}
.doc-top{margin:-6px 0 12px}
.doc-h{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid var(--c);padding-bottom:12px}
.doc-h .r{text-align:right}
.doc-t{font-size:20px;font-weight:800;color:var(--c);letter-spacing:.03em}
.meta{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px 16px;margin:14px 0}
.meta span{display:block;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.addr{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:12px 0}
.addr div{border:1px solid var(--line);border-radius:8px;padding:10px;white-space:pre-line;font-size:13px}
.addr b{display:block;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
.tw{overflow-x:auto}
table.li{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
table.li th{text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line);padding:6px}
table.li td{border-bottom:1px solid var(--line2);padding:7px 6px;vertical-align:top}
table.li .n{text-align:right}
.tots{margin-left:auto;max-width:340px;margin-top:12px}
.tots div{display:flex;justify-content:space-between;gap:16px;padding:4px 0}
.tots .s{font-weight:800;border-top:1px solid var(--line);padding-top:6px;font-size:15px}
.words{font-size:12px;color:var(--muted);margin-top:8px;font-style:italic}
.blk{margin-top:14px;font-size:13px}
.blk h4{margin:0 0 4px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.doc-f{display:flex;gap:8px;justify-content:flex-end;margin-top:18px}
@media (max-width:720px){
  .tiles{grid-template-columns:1fr 1fr}
  .tile.main{grid-column:1/-1}
  .lh{display:none}
  .lr,.lr.o{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"p a" "d b";row-gap:2px;padding:10px 12px}
  .c-p{grid-area:p;min-width:0}
  .c-d{grid-area:d;font-size:12px;color:var(--muted)}
  .c-dr,.c-cr,.c-b{display:none}
  .c-a{display:block;grid-area:a;font-weight:700}
  .c-bm{display:block;grid-area:b;font-size:12px;color:var(--muted)}
  .lr.o .c-dr{display:block;grid-area:a;font-weight:700}
  .flt{width:100%}
  .flt input[type=search]{flex:1;width:auto;min-width:140px}
  .doc{padding:16px}
  .doc-h{flex-direction:column-reverse}
  .doc-h .r{text-align:left}
  .wrap{padding:12px}
  .top{padding:10px 12px;padding-top:max(10px,env(safe-area-inset-top))}
  .co{font-size:16px}
  .co-sub{display:none}
  .ib{width:40px;height:40px;padding:0}
  .ib span{display:none}
  .tb{margin:12px -12px 8px;padding:8px 12px;gap:8px}
  .chips{width:100%}
  .chip{height:40px;padding:0 14px;font-size:14px}
  .flt label{flex:1}
  .flt label input{flex:1;min-width:0}
  .flt input{height:40px}
  .ov{padding:0;align-items:flex-end}
  .doc{border-radius:16px 16px 0 0;max-height:94vh;max-height:94dvh;overflow:auto;padding:0 16px 16px;padding-bottom:max(16px,env(safe-area-inset-bottom));animation:up .24s cubic-bezier(.2,.8,.2,1)}
  .doc-top{position:sticky;top:0;z-index:2;background:var(--card);margin:0 -16px 12px;padding:14px 16px 10px;border-bottom:1px solid var(--line2);display:flex;align-items:center;gap:10px}
  .doc-top::before{content:"";position:absolute;top:5px;left:50%;width:40px;height:4px;margin-left:-20px;border-radius:2px;background:var(--line)}
  .doc-top .btn{height:40px;flex:none}
  .doc-tt{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tw{display:none}
  .lim{display:block}
  .doc-f .btn{flex:1;height:44px}
}
@media print{
  body{background:#fff;color:#000}
  .noprint,.toast{display:none!important}
  .top{position:static!important;box-shadow:none!important}
  .tw{display:block!important}
  .lim{display:none!important}
  .top{background:none!important;color:#000;border-bottom:2px solid #000;padding:0 0 8px}
  .wrap{padding:8px 0}
  .card,.tile,.lg{border:0;padding:0}
  .tiles{grid-template-columns:repeat(3,1fr)!important}
  .tile .v,.tile.main .v{font-size:16px;color:#000}
  .ponly{display:block}
  .lh{display:grid!important}
  .lr,.lr.o{grid-template-columns:76px minmax(0,1fr) 96px 96px 120px!important;grid-template-areas:none!important;padding:5px 0;break-inside:avoid;font-size:12px}
  .lr.o{grid-template-columns:76px minmax(0,1fr) 120px!important}
  .c-a,.c-bm{display:none!important}
  .c-dr,.c-cr,.c-b,.c-p,.c-d{display:block!important;grid-area:auto!important;font-size:12px!important;color:#000!important}
  .sub{white-space:normal}
  body.pd>*:not(.ov){display:none!important}
  body:not(.pd) .ov{display:none!important}
  .ov{position:static;background:none;padding:0;display:block}
  .doc{box-shadow:none;max-width:none;padding:0}
}
</style>
</head>
<body>
<div id="app"></div>
<script>
var BOOT = __BOOT__;
var BRAND_LOGO = "data:image/jpeg;base64,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";
(function () {
  'use strict';
  var S = { snap: null, pass: '', f: 'all', from: '', to: '', q: '' };
  var app = document.getElementById('app');
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var LOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  var ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  var ICON = {
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="7" rx="1"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'
  };
  function iconBtn(act, label) {
    return '<button class="ib" type="button" data-act="' + act + '" aria-label="' + label + '" title="' + label + '"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[act] + '</svg><span>' + label + '</span></button>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ENT[c]; });
  }
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function money(n) {
    var v = r2(n);
    return (v < 0 ? '-' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function cur(n) { var c = S.snap && S.snap.co.cur; return (c ? c + ' ' : '') + money(n); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fd(iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    var ds = (S.snap && S.snap.co.ds) || 'DMY';
    if (ds === 'MDY') return p[1] + '/' + p[2] + '/' + p[0];
    if (ds === 'LONG') return MON[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0];
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  function setColor(c) { if (/^#[0-9a-fA-F]{3,8}$/.test(c || '')) document.documentElement.style.setProperty('--c', c); }
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3000);
  }
  function isC() { return S.snap.kind === 'customer'; }

  function header() {
    var co = S.snap ? S.snap.co : { name: BOOT.company };
    var sub = [co.address, co.phone].filter(Boolean).join(' · ');
    return '<header class="top"><div class="top-in">' +
      (co.logo ? '<img class="logo" src="' + esc(co.logo) + '" alt="">' : '') +
      '<div><div class="co">' + esc(co.name || 'Party Ledger') + '</div>' + (sub ? '<div class="co-sub">' + esc(sub) + '</div>' : '') + '</div>' +
      (S.snap ? '<div class="top-acts noprint">' + iconBtn('refresh', 'Refresh') + iconBtn('print', 'Print / PDF') + iconBtn('logout', 'Log out') + '</div>' : '') +
      '</div>' +
      '<div class="brand noprint"><img src="' + BRAND_LOGO + '" alt="Acunnity"><span>Make your dashboard from Acunnity</span><a href="tel:03032385244">03032385244</a></div></header>';
  }

  function fitTop() {
    var top = app.querySelector('.top');
    if (top) document.documentElement.style.setProperty('--th', top.offsetHeight + 'px');
  }
  window.addEventListener('resize', fitTop);

  /* ---------- password screen ---------- */
  function renderLogin(msg) {
    if (!BOOT.token) {
      app.innerHTML = header() + '<main class="wrap"><div class="card login"><h1>Link not active</h1><p class="muted">This ledger link is not active any more. Please ask for a new link.</p></div></main>';
      return;
    }
    app.innerHTML = header() +
      '<main class="wrap"><form class="card login" id="lf" autocomplete="off" novalidate>' +
      '<h1>Your Account Ledger</h1>' +
      '<p class="muted">Enter the password you received with this link to see your bills, payments and balance.</p>' +
      '<label class="f" for="pw">Password</label>' +
      '<div class="pwrow"><input class="in" id="pw" type="password" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off">' +
      '<button type="button" class="btn" id="eye">Show</button></div>' +
      '<button class="btn pri big" id="go" type="submit">View Ledger</button>' +
      (msg ? '<div class="alert" role="alert">' + esc(msg) + '</div>' : '') +
      '<div class="ro">' + LOCK + '<span>View only. Nothing can be changed or deleted from this page.</span></div>' +
      '</form></main>';
    var pw = document.getElementById('pw');
    document.getElementById('eye').onclick = function () {
      var show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      this.textContent = show ? 'Hide' : 'Show';
      pw.focus();
    };
    document.getElementById('lf').onsubmit = function (e) {
      e.preventDefault();
      var p = pw.value.trim();
      if (!p) { pw.focus(); return; }
      var go = document.getElementById('go');
      go.disabled = true;
      go.textContent = 'Opening...';
      load(p, function (err) { renderLogin(err); });
    };
    pw.focus();
  }

  function load(pass, onError, onDone) {
    google.script.run
      .withSuccessHandler(function (r) {
        if (!r || !r.ok) return onError((r && r.error) || 'Could not open the ledger.');
        var snap;
        try { snap = JSON.parse(r.data); } catch (e) { return onError('The ledger could not be read. Please try again later.'); }
        S.snap = snap;
        S.pass = pass;
        setColor(snap.co && snap.co.color);
        document.title = (snap.p ? snap.p.name + ' - ' : '') + (snap.co ? snap.co.name : 'Ledger');
        renderLedger();
        if (onDone) onDone();
      })
      .withFailureHandler(function () { onError('Could not connect. Check your internet connection and try again.'); })
      .openLedger(BOOT.token, pass);
  }

  /* ---------- ledger ---------- */
  var CAT = { invoice: 'bill', salesreceipt: 'bill', bill: 'bill', payment: 'pay', billpayment: 'pay', check: 'pay', creditmemo: 'credit', vendorcredit: 'credit' };
  var BADGE = {
    paid: ['Paid', 'ok'], partial: ['Partly paid', 'warn'], open: ['Unpaid', 'warn'], overdue: ['Overdue', 'err'], received: ['Received', 'ok'],
    credit: ['Credit', 'info'], void: ['Void', ''], closed: ['Closed', ''], pending: ['Open', 'info']
  };
  function overdue(r) { return (r.st === 'open' || r.st === 'partial') && r.due && r.due < today(); }
  function badge(r) {
    var b = BADGE[overdue(r) ? 'overdue' : r.st];
    return b ? '<span class="bd ' + b[1] + '">' + b[0] + '</span>' : '';
  }
  function balText(v) {
    v = r2(v);
    if (!v) return '0.00';
    var pos = isC() ? 'Dr' : 'Cr';
    var neg = isC() ? 'Cr' : 'Dr';
    return v > 0 ? money(v) + ' ' + pos : money(-v) + ' ' + neg;
  }
  function chips() {
    var c = isC();
    var list = [['all', 'All'], ['bill', c ? 'Invoices' : 'Bills'], ['pay', 'Payments'], ['credit', 'Credits'], ['unpaid', 'Unpaid']];
    if ((S.snap.orders || []).length) list.push(['orders', c ? 'Orders & Estimates' : 'Purchase Orders']);
    return list.map(function (x) {
      return '<button type="button" class="chip' + (S.f === x[0] ? ' on' : '') + '" data-f="' + x[0] + '">' + x[1] + '</button>';
    }).join('');
  }
  function matches(r, q) {
    if (S.f === 'unpaid' && !(r.open > 0.004)) return false;
    if (S.f !== 'all' && S.f !== 'unpaid' && (CAT[r.t] || 'credit') !== S.f) return false;
    if (!q) return true;
    return [r.l, r.n, r.memo, r.ref, fd(r.d)].join(' ').toLowerCase().indexOf(q) >= 0;
  }

  function renderLedger() {
    var s = S.snap, co = s.co, p = s.p, c = isC();
    var det = [p.company && p.company !== p.name ? p.company : '', p.contact, p.phone, p.address].filter(Boolean).join('\n');
    var bal = r2(s.bal);
    var main;
    if (c) main = bal > 0 ? ['Balance due', 'Amount payable to ' + co.name] : bal < 0 ? ['Credit balance', 'Advance / credit with ' + co.name] : ['Balance', 'All settled. Nothing is due.'];
    else main = bal > 0 ? ['Balance payable to you', 'Amount ' + co.name + ' owes you'] : bal < 0 ? ['Advance balance', 'Paid in advance by ' + co.name] : ['Balance', 'All settled.'];
    var od = 0, odN = 0, un = 0, unN = 0;
    s.rows.forEach(function (r) {
      if (r.open > 0.004) { un += r.open; unN++; if (overdue(r)) { od += r.open; odN++; } }
    });
    var word = c ? 'invoice' : 'bill';
    var updated = s.at ? new Date(s.at) : null;

    app.innerHTML = header() +
      '<main class="wrap">' +
      '<div class="ponly"><h2 style="margin:0 0 4px">Statement of Account</h2></div>' +
      '<section class="card party">' +
      '<div><h1>' + esc(p.name) + '</h1>' + (det ? '<div class="det">' + esc(det) + '</div>' : '') +
      (p.terms || p.limit ? '<div class="det">' + esc([p.terms ? 'Terms: ' + p.terms : '', p.limit ? 'Credit limit: ' + cur(p.limit) : ''].filter(Boolean).join(' · ')) + '</div>' : '') + '</div>' +
      '</section>' +
      '<section class="tiles">' +
      '<div class="tile main"><div class="k">' + esc(main[0]) + '</div><div class="v">' + esc(cur(Math.abs(bal))) + '</div><div class="s">' + esc(main[1]) + '</div></div>' +
      '<div class="tile"><div class="k">Overdue</div><div class="v">' + esc(money(od)) + '</div><div class="s">' + odN + ' ' + word + (odN === 1 ? '' : 's') + ' past due date</div></div>' +
      '<div class="tile"><div class="k">Unpaid ' + word + 's</div><div class="v">' + unN + '</div><div class="s">' + esc(cur(un)) + ' open</div></div>' +
      '</section>' +
      '<div class="tb noprint"><div class="chips" id="chips">' + chips() + '</div>' +
      '<div class="flt"><label>From <input type="date" id="from" value="' + esc(S.from) + '"></label>' +
      '<label>To <input type="date" id="to" value="' + esc(S.to) + '"></label>' +
      '<input type="search" id="q" placeholder="Search no. or memo" value="' + esc(S.q) + '"></div></div>' +
      '<div class="ponly small muted" id="period"></div>' +
      '<section class="lg" id="list"></section>' +
      '</main>' +
      '<footer class="foot">View-only ledger shared by ' + esc(co.name) + (updated ? ' · Updated ' + esc(fd(updated.getFullYear() + '-' + pad(updated.getMonth() + 1) + '-' + pad(updated.getDate()))) + ' ' + esc(updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '') +
      (co.phone || co.email ? ' · Questions? ' + esc([co.phone, co.email].filter(Boolean).join(' / ')) : '') + '</footer>';

    document.getElementById('from').onchange = function () { S.from = this.value; renderList(); };
    document.getElementById('to').onchange = function () { S.to = this.value; renderList(); };
    document.getElementById('q').oninput = function () { S.q = this.value; renderList(); };
    renderList();
    fitTop();
  }

  function renderList() {
    var s = S.snap, q = S.q.trim().toLowerCase();
    var el = document.getElementById('list');
    document.getElementById('chips').innerHTML = chips();
    var per = document.getElementById('period');
    per.textContent = S.from || S.to ? 'Period: ' + (S.from ? fd(S.from) : 'start') + ' to ' + (S.to ? fd(S.to) : fd(today())) : 'All transactions up to ' + fd(today());

    if (S.f === 'orders') {
      var os = (s.orders || []).map(function (r, i) { return { r: r, i: i }; }).filter(function (x) {
        if (S.from && x.r.d < S.from) return false;
        if (S.to && x.r.d > S.to) return false;
        return !q || [x.r.l, x.r.n, x.r.memo, x.r.ref].join(' ').toLowerCase().indexOf(q) >= 0;
      });
      el.innerHTML = '<div class="lr o lh"><div>Date</div><div>Document</div><div class="n">Amount</div></div>' +
        (os.length ? os.reverse().map(function (x) {
          var r = x.r;
          return '<div class="lr o" tabindex="0" role="button" data-o="' + x.i + '"><div class="c-d">' + esc(fd(r.d)) + '</div>' +
            '<div class="c-p"><span class="ttl">' + esc(r.l) + (r.n ? ' #' + esc(r.n) : '') + '</span>' + badge(r) + (r.memo ? '<div class="sub">' + esc(r.memo) + '</div>' : '') + '</div>' +
            '<div class="c-dr n">' + money(r.tot) + '</div></div>';
        }).join('') : '<div class="empty">Nothing to show.</div>');
      return;
    }

    var c = isC(), bal = 0, ob = 0, out = [], tdr = 0, tcr = 0;
    s.rows.forEach(function (r, i) {
      var delta = c ? r.dr - r.cr : r.cr - r.dr;
      if (S.from && r.d < S.from) { bal = r2(bal + delta); ob = bal; return; }
      if (S.to && r.d > S.to) return;
      bal = r2(bal + delta);
      if (!matches(r, q)) return;
      tdr += r.dr;
      tcr += r.cr;
      out.push({ r: r, i: i, bal: bal });
    });
    var html = '<div class="lr lh"><div>Date</div><div>Particulars</div><div class="n">Debit</div><div class="n">Credit</div><div class="n">Balance</div></div>';
    if (S.from) html += '<div class="lr sum"><div class="c-d">' + esc(fd(S.from)) + '</div><div class="c-p">Opening balance</div><div class="c-dr"></div><div class="c-cr"></div><div class="c-a n">' + balText(ob) + '</div><div class="c-b n">' + balText(ob) + '</div></div>';
    if (!out.length) html += '<div class="empty">No transactions for this filter.</div>';
    var lastMonth = '';
    html += out.map(function (x) {
      var r = x.r;
      var mk = String(r.d || '').slice(0, 7);
      var mh = '';
      if (mk && mk !== lastMonth) {
        lastMonth = mk;
        mh = '<div class="lr mh">' + esc(MON[Number(mk.slice(5)) - 1] + ' ' + mk.slice(0, 4)) + '</div>';
      }
      var sub = [r.memo, r.ref ? 'Ref ' + r.ref : '', r.open > 0.004 && r.st !== 'paid' ? 'Open ' + money(r.open) : '', r.due && (r.st === 'open' || r.st === 'partial') ? 'Due ' + fd(r.due) : ''].filter(Boolean).join(' · ');
      var amt = r.dr && r.cr ? money(r.dr) + ' <span class="small muted">paid</span>' : r.dr ? money(r.dr) + ' <span class="small muted">Dr</span>' : r.cr ? '<span class="cr">' + money(r.cr) + '</span> <span class="small muted">Cr</span>' : '<span class="muted">-</span>';
      return mh + '<div class="lr' + (r.st === 'void' ? ' void' : '') + '" tabindex="0" role="button" data-i="' + x.i + '">' +
        '<div class="c-d">' + esc(fd(r.d)) + '</div>' +
        '<div class="c-p"><span class="ttl">' + esc(r.l) + (r.n ? ' #' + esc(r.n) : '') + '</span>' + badge(r) + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>' +
        '<div class="c-dr n">' + (r.dr ? money(r.dr) : '') + '</div>' +
        '<div class="c-cr n">' + (r.cr ? money(r.cr) : '') + '</div>' +
        '<div class="c-a n">' + amt + '</div>' +
        '<div class="c-b n">' + balText(x.bal) + '</div>' +
        '<div class="c-bm">Bal ' + balText(x.bal) + '</div>' +
        '</div>';
    }).join('');
    html += '<div class="lr sum"><div class="c-d"></div><div class="c-p">Closing balance' + (S.to ? ' on ' + fd(S.to) : '') + '</div>' +
      '<div class="c-dr n">' + money(tdr) + '</div><div class="c-cr n">' + money(tcr) + '</div><div class="c-a n">' + balText(bal) + '</div><div class="c-b n">' + balText(bal) + '</div></div>';
    el.innerHTML = html;
  }

  /* ---------- one document ---------- */
  function openDoc(r) {
    var co = S.snap.co, d = r.doc || {};
    var cols = d.cols || ['', 'Description', '', '', 'Amount'];
    var lines = d.lines || [];
    var show = cols.map(function (h, k) {
      return lines.some(function (l) { return l[k] !== '' && l[k] != null; });
    });
    var coSub = [co.address, co.phone, co.ntn ? 'NTN ' + co.ntn : ''].filter(Boolean).join(' · ');
    var html = '<div class="ov" id="ov"><div class="doc" role="dialog" aria-modal="true" aria-label="' + esc(r.l) + '">' +
      '<div class="doc-top noprint"><button class="btn" type="button" data-act="close">&larr; Back</button><b class="doc-tt">' + esc(r.l) + (r.n ? ' #' + esc(r.n) : '') + '</b></div>' +
      '<div class="doc-h"><div>' + (co.logo ? '<img class="logo" src="' + esc(co.logo) + '" alt="" style="margin-bottom:6px"><br>' : '') +
      '<b>' + esc(co.name) + '</b>' + (coSub ? '<div class="small muted">' + esc(coSub) + '</div>' : '') + '</div>' +
      '<div class="r"><div class="doc-t">' + esc(d.title || r.l.toUpperCase()) + '</div>' + (r.n ? '<div># ' + esc(r.n) + '</div>' : '') + '<div>' + badge(r) + '</div></div></div>';
    if ((d.meta || []).length) html += '<div class="meta">' + d.meta.map(function (m) { return '<div><span>' + esc(m[0]) + '</span>' + esc(m[1]) + '</div>'; }).join('') + '</div>';
    if ((d.to || []).length) html += '<div class="addr">' + d.to.map(function (a) { return '<div><b>' + esc(a[0]) + '</b>' + esc(a[1]) + '</div>'; }).join('') + '</div>';
    if (lines.length) {
      html += '<div class="tw"><table class="li"><thead><tr>' + cols.map(function (h, k) {
        return show[k] ? '<th' + (k >= 2 ? ' class="n"' : '') + '>' + esc(h) + '</th>' : '';
      }).join('') + '</tr></thead><tbody>' + lines.map(function (l) {
        return '<tr>' + cols.map(function (h, k) {
          return show[k] ? '<td' + (k >= 2 ? ' class="n"' : '') + '>' + esc(l[k]) + '</td>' : '';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
      html += '<div class="lim">' + lines.map(function (l) {
        var title = l[0] || l[1] || '';
        var desc = l[0] ? l[1] : '';
        var mid = cols[2] && l[2] && l[3] ? l[2] + ' \u00d7 ' + l[3] : l[3] ? (cols[3] ? cols[3] + ': ' : '') + l[3] : l[2] || '';
        return '<div class="lim-r"><div class="lim-t">' + esc(title) + '</div>' + (desc ? '<div class="lim-d">' + esc(desc) + '</div>' : '') +
          '<div class="lim-n"><span>' + esc(mid) + '</span><b>' + esc(l[4]) + '</b></div></div>';
      }).join('') + '</div>';
    }
    if ((d.totals || []).length) html += '<div class="tots">' + d.totals.map(function (t) { return '<div' + (t[2] ? ' class="s"' : '') + '><span>' + esc(t[0]) + '</span><span class="n">' + esc(t[1]) + '</span></div>'; }).join('') + '</div>';
    var dueShown = (d.totals || []).some(function (t) { return t[0] === 'Balance Due'; });
    if (r.open > 0.004 && r.st !== 'void' && !dueShown) html += '<div class="tots"><div class="s"><span>Amount still due</span><span class="n">' + esc(cur(r.open)) + '</span></div></div>';
    if (d.words) html += '<div class="words">' + esc(d.words) + '</div>';
    if ((d.pays || []).length) html += '<div class="blk"><h4>Payments against this ' + esc(r.l.toLowerCase()) + '</h4>' + d.pays.map(function (p) { return '<div>' + esc(p[0]) + ' · ' + esc(p[1]) + ' · <b>' + esc(p[2]) + '</b></div>'; }).join('') + '</div>';
    if (d.note) html += '<div class="blk"><h4>Message</h4>' + esc(d.note) + '</div>';
    if (d.memo) html += '<div class="blk"><h4>Memo</h4>' + esc(d.memo) + '</div>';
    html += '<div class="doc-f noprint"><button class="btn" type="button" data-act="printdoc">Print / PDF</button><button class="btn pri" type="button" data-act="close">Close</button></div></div></div>';
    removeDoc();
    document.body.insertAdjacentHTML('beforeend', html);
    pushDoc();
    document.body.style.overflow = 'hidden';
    var ov = document.getElementById('ov');
    ov.addEventListener('click', function (e) {
      if (e.target === ov) closeDoc();
      var a = e.target.closest && e.target.closest('[data-act]');
      if (!a) return;
      if (a.getAttribute('data-act') === 'close') closeDoc();
      if (a.getAttribute('data-act') === 'printdoc') {
        document.body.classList.add('pd');
        window.print();
        setTimeout(function () { document.body.classList.remove('pd'); }, 500);
      }
    });
    ov.querySelector('[data-act=close]').focus();
  }
  function removeDoc() {
    var ov = document.getElementById('ov');
    if (ov) ov.remove();
    document.body.style.overflow = '';
  }
  // The phone's Back button closes an open document instead of leaving the page.
  var docInHistory = false;
  function pushDoc() {
    if (docInHistory) return;
    try {
      if (window.google && google.script && google.script.history) google.script.history.push({ doc: 1 }, { l: BOOT.token }, 'doc');
      else history.pushState({ doc: 1 }, '');
      docInHistory = true;
    } catch (e) {
      docInHistory = false;
    }
  }
  function closeDoc() {
    removeDoc();
    if (!docInHistory) return;
    docInHistory = false;
    try {
      history.back();
    } catch (e) {}
  }
  function onBack(state) {
    if (state && state.doc) return;
    docInHistory = false;
    removeDoc();
  }
  try {
    if (window.google && google.script && google.script.history) google.script.history.setChangeHandler(function (e) { onBack(e && e.state); });
    window.addEventListener('popstate', function (e) { onBack(e.state); });
  } catch (e) {}

  /* ---------- events ---------- */
  app.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-act],[data-f],[data-i],[data-o]') : null;
    if (!t || !S.snap) return;
    if (t.hasAttribute('data-f')) { S.f = t.getAttribute('data-f'); renderList(); return; }
    if (t.hasAttribute('data-i')) { openDoc(S.snap.rows[Number(t.getAttribute('data-i'))]); return; }
    if (t.hasAttribute('data-o')) { openDoc(S.snap.orders[Number(t.getAttribute('data-o'))]); return; }
    var act = t.getAttribute('data-act');
    if (act === 'print') window.print();
    if (act === 'logout') { S.snap = null; S.pass = ''; S.f = 'all'; S.from = ''; S.to = ''; S.q = ''; document.title = 'Ledger'; renderLogin(); }
    if (act === 'refresh') {
      t.disabled = true;
      t.classList.add('busy');
      load(S.pass, function (err) { t.disabled = false; t.classList.remove('busy'); toast(err); }, function () { toast('Ledger is up to date'); });
    }
  });
  app.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var t = e.target;
    if (t && (t.hasAttribute('data-i') || t.hasAttribute('data-o'))) { e.preventDefault(); t.click(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDoc(); });

  setColor(BOOT.color);
  renderLogin();
})();
</script>
</body>
</html>`;
