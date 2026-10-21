// Number / money / misc formatting helpers

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const num = (v) => {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// One shared formatter each: toLocaleString(options) builds a new one on every call, which is slow
const MONEY_FMT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QTY_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

export function money(n, opts = {}) {
  const v = round2(n);
  const s = MONEY_FMT.format(Math.abs(v));
  const neg = v < 0;
  if (opts.symbol) return (neg ? '-' : '') + opts.symbol + ' ' + s;
  return (neg ? '-' : '') + s;
}

export function compact(n) {
  const v = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (v >= 1e9) return sign + (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (v >= 1e6) return sign + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1e3) return sign + (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return sign + Math.round(v);
}

export function qty(n) {
  const v = Math.round((Number(n) || 0) * 1000) / 1000;
  return QTY_FMT.format(v);
}

// QuickBooks lets you type arithmetic into amount fields: "12*4+3".
// Returns '' for an empty field, the number, or null when it can't be worked out (the field keeps its old value).
export function evalAmount(str) {
  const s = String(str ?? '').replace(/,/g, '').trim();
  if (!s) return '';
  if (/^-?\d*\.?\d+$/.test(s)) return Number(s);
  // "Rs 1,200" / "1200/-" style money text
  const plain = s.replace(/^(rs\.?|pkr|\$)\s*/i, '').replace(/\/-$/, '');
  if (/^-?\d*\.?\d+$/.test(plain)) return Number(plain);
  if (!/^[\d+\-*/().\s%]+$/.test(s)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const v = Function('"use strict";return (' + s.replace(/%/g, '/100') + ')')();
    return Number.isFinite(v) ? round2(v) : null;
  } catch {
    return null;
  }
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2))
    .replace(/-/g, '')
    .slice(0, 16);

// Cryptographically random string (links, passwords, keys)
export const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function randomString(len, alphabet = ALNUM) {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[buf[i] % alphabet.length];
  return s;
}

export const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));

export function downloadFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCSV(rows) {
  const esc = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    // Excel and Sheets run text that starts with = + - @ as a formula: mark such text (but not plain numbers) as text
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d,]*\.?\d+(e[+-]?\d+)?%?$/i.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}
