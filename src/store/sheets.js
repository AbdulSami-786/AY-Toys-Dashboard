// Google Sheets sync via the Google Apps Script Web App (see apps-script/Code.gs).
// The app uses ONE sheet for every company; its URL is set in src/config.js.
// Requests use Content-Type text/plain so the browser sends no CORS preflight.

export const TABLES = ['accounts', 'items', 'customers', 'vendors', 'txns', 'memorized'];
// apps-script/Code.gs version this app expects (older scripts sync, but have no Reports tab / shop figures)
export const SCRIPT_VERSION = 8;

// an Apps Script from before v8 still asks for an owner key
export const OLD_SCRIPT_MESSAGE =
  'The Google Sheet still runs the old Apps Script code (it asks for an owner key). Copy the new code from Company › Google Sheets Sync › Setup Guide, paste it over the old code, Save, then Deploy › Manage deployments › Edit › Version: New version › Deploy.';

const TIMEOUT = 120000; // a request that gets no answer must not block syncing for ever

async function call(url, payload) {
  if (!url) throw new Error('The Google Sheet is not set up yet (src/config.js).');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  let text;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: ctl.signal,
    });
    text = await res.text();
  } catch (e) {
    throw ctl.signal.aborted ? new Error('The Google Sheet did not answer in time.') : e;
  } finally {
    clearTimeout(timer);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Unexpected response from Apps Script. Check the deployment is a Web app with "Anyone" access.');
  }
  if (!json.ok) {
    const err = new Error(json.error === 'OWNER_KEY_REQUIRED' || json.error === 'SHEET_NOT_LOCKED' ? OLD_SCRIPT_MESSAGE : json.error || 'Apps Script error');
    err.code = json.code || '';
    err.server = true; // the sheet answered with an error (not offline)
    throw err;
  }
  return json;
}

export const sheets = {
  ping: (url) => call(url, { action: 'ping' }),
  listCompanies: (url) => call(url, { action: 'listCompanies' }).then((r) => r.companies || []),
  saveCompany: (url, company) => call(url, { action: 'saveCompany', company }),
  deleteCompany: (url, companyId, code) => call(url, { action: 'deleteCompany', companyId, code }),
  pull: (url, code) => call(url, { action: 'pull', code, tables: TABLES }).then((r) => r.tables || {}),
  push: (url, code, ops) => call(url, { action: 'batch', code, ops }),
  // any tabs of one code, e.g. the users (code SYSTEM, tab "SYSTEM | Users")
  pullTables: (url, code, tables) => call(url, { action: 'pull', code, tables }).then((r) => r.tables || {}),
  replaceAll: (url, code, tables) => call(url, { action: 'replaceAll', code, tables }),
  publishLedgers: (url, req) => call(url, { action: 'publishLedgers', ...req }),
  publishReports: (url, req) => call(url, { action: 'publishReports', ...req }),
  // each shop's latest figures (sent with its reports) — for shops whose books are not on this computer
  listSummaries: (url) => call(url, { action: 'listSummaries' }).then((r) => r.summaries || []),

  /**
   * Check the sheet answers and runs the current code.
   * → { state: 'ok' | 'legacy' (old script, or one from before v8 that still wants an owner key), sheet, version }
   */
  async secure(url) {
    const r = await call(url, { action: 'ping' });
    if (!r.version || r.secured) return { state: 'legacy', sheet: r.sheet, version: r.version || 0 };
    return { state: 'ok', sheet: r.sheet, version: r.version };
  },
};
