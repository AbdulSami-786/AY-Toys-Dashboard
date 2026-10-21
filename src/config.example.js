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
//  Anyone with the URL can read or change the books, so keep it private.

export const SHEET_URL = '';

// ---------------------------------------------------------------------------
// For testing only: `VITE_SHEET_URL=… npm run dev` points a local copy at a test sheet.
const url = String(import.meta.env?.VITE_SHEET_URL || SHEET_URL).trim();
export const SHEET = /^https?:\/\/\S+\/exec$/.test(url) ? url : '';
export const SHEET_READY = !!SHEET;
