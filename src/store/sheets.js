// Google Sheets sync via the Google Apps Script Web App (see apps-script/Code.gs).
// The app uses ONE sheet for every company; its URL and owner key are set in src/config.js.
// Requests use Content-Type text/plain so the browser sends no CORS preflight.
//
// Owner key: shared party-ledger links point at the same Web App, so the script keeps every
// read/write action behind the owner key. The first connect locks the sheet to OWNER_KEY.

import { OWNER_KEY } from '../config';

export const TABLES = ['accounts', 'items', 'customers', 'vendors', 'txns', 'memorized'];
// apps-script/Code.gs version this app expects (older scripts sync, but have no Reports tab / shop figures)
export const SCRIPT_VERSION = 7;

export const KEY_MESSAGE =
  'This Google Sheet is locked with a different owner key than the one in src/config.js. In Apps Script open Project Settings › Script properties, delete OWNER_KEY, then click Reload (or Sync now) — the sheet then locks to the key in the app.';

// Keys that earlier versions generated per computer (kept only to move the sheet to OWNER_KEY)
const LEGACY_KEYS = 'ay.sheetKeys';
function legacyKeys() {
  try {
    return Object.values(JSON.parse(localStorage.getItem(LEGACY_KEYS) || '{}') || {}).filter(Boolean);
  } catch {
    return [];
  }
}
function dropLegacyKeys() {
  try {
    localStorage.removeItem(LEGACY_KEYS);
  } catch {
    /* ignore */
  }
}

const TIMEOUT = 120000; // a request that gets no answer must not block syncing for ever

async function call(url, payload, key = OWNER_KEY, retried = false) {
  if (!url) throw new Error('The Google Sheet is not set up yet (src/config.js).');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  let text;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, key }),
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
    // a sheet that is not locked yet (script v7 refuses every request until it is): lock it to our key, then retry once
    if (json.error === 'SHEET_NOT_LOCKED' && !retried && payload.action !== 'claimKey') {
      await call(url, { action: 'claimKey', newKey: OWNER_KEY }, OWNER_KEY, true);
      return call(url, payload, key, true);
    }
    const err = new Error(json.error === 'OWNER_KEY_REQUIRED' ? KEY_MESSAGE : json.error || 'Apps Script error');
    err.code = json.error === 'OWNER_KEY_REQUIRED' ? 'key' : json.code || '';
    err.server = json.error !== 'OWNER_KEY_REQUIRED'; // the sheet answered with an error (not offline)
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
   * Make sure the sheet is locked to OWNER_KEY.
   * → { state: 'ok' | 'legacy' (old script without keys) | 'locked' (a different key), sheet, claimed? }
   */
  async secure(url) {
    const r = await call(url, { action: 'ping' });
    if (!r.version) return { state: 'legacy', sheet: r.sheet };
    if (r.keyOk) {
      dropLegacyKeys();
      return { state: 'ok', sheet: r.sheet, version: r.version };
    }
    if (!r.secured) {
      await call(url, { action: 'claimKey', newKey: OWNER_KEY });
      const again = await call(url, { action: 'ping' });
      return { state: again.keyOk ? 'ok' : 'locked', sheet: again.sheet, claimed: true, version: again.version };
    }
    // locked by a key an earlier version made on this computer → move it to OWNER_KEY
    for (const old of legacyKeys()) {
      try {
        await call(url, { action: 'rotateKey', newKey: OWNER_KEY }, old);
        const again = await call(url, { action: 'ping' });
        if (again.keyOk) {
          dropLegacyKeys();
          return { state: 'ok', sheet: again.sheet, claimed: true, version: again.version };
        }
      } catch {
        /* not this one */
      }
    }
    return { state: 'locked' };
  },
};
