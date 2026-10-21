// Passwords are never stored: only a salted PBKDF2-SHA-256 hash (120,000 rounds), made with the browser's own
// cryptography (also in the desktop program). The same password + salt always gives the same hash.
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const PBKDF2_ROUNDS = 120000;
export const MIN_PASSWORD = 8;

export function newSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return hex(a);
}

export async function hashPassword(password, salt, rounds = PBKDF2_ROUNDS) {
  if (!crypto?.subtle) throw new Error('This window cannot check passwords. Open AY Toys from the desktop program or an https:// address.');
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: rounds }, key, 256);
  return hex(bits);
}

// compare without stopping at the first different character
export function sameHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function passwordRecord(password) {
  const salt = newSalt();
  return { salt, rounds: PBKDF2_ROUNDS, hash: await hashPassword(password, salt) };
}
