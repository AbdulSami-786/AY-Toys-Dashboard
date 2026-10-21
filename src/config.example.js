// ============================================================================
//  AY Toys — the ONE Google Sheet that holds the books of every company.
//  Every computer that runs this build connects to it automatically.
// ============================================================================
//
//  1. In the Google Sheet: Extensions › Apps Script → paste apps-script/Code.gs → Save → run "setup" once
//     → Deploy › New deployment → Web app, Execute as "Me", Who has access "Anyone" → copy the Web app URL (ends with /exec).
//  2. Paste that URL between the quotes below, then rebuild / redeploy the app (npm run build).
//
//  Copy this file to src/config.js and fill it in. src/config.js is private and listed in .gitignore — never commit it.
//  With the URL and the owner key anyone could read or change the books.

export const SHEET_URL = '';

// Secret sent with every request. The sheet locks itself to this key the first time the app connects,
// so shared party-ledger links (which show the Web App URL) can never read or change your books.
// Must be the same as APP_OWNER_KEY at the top of apps-script/Code.gs.
// Changing it later: change it here AND in Code.gs, then in the sheet use AY Toys › Lock to the owner key in this code.
export const OWNER_KEY = '';  // 24–64 letters and digits, e.g. from: node scripts/new-owner-key.mjs

// ---------------------------------------------------------------------------
// For testing only: `VITE_SHEET_URL=… npm run dev` points a local copy at a test sheet.
const url = String(import.meta.env?.VITE_SHEET_URL || SHEET_URL).trim();
export const SHEET = /^https?:\/\/\S+\/exec$/.test(url) ? url : '';
export const SHEET_READY = !!SHEET;
