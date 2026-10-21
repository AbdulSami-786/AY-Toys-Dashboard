// Fingerprint (or Windows Hello / face / phone unlock) as a quicker way to log in and to unlock the screen.
// It uses the computer's own WebAuthn: the fingerprint never leaves the sensor and AY Toys never sees it. What is
// kept here is only a public key, made on this computer for one user. To accept a fingerprint the app asks the
// device to sign a fresh random challenge and checks that signature itself (it does not just trust "ok").
// A fingerprint belongs to one user on one computer, and stops working when that user's password changes.
import { useEffect, useState } from 'react';

const LS_KEY = 'ay.fingerprints';
const enc = new TextEncoder();

const b64 = (buf) => {
  let s = '';
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64 = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const rpId = () => location.hostname;
const usable = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && window.isSecureContext && !!rpId() && !!crypto?.subtle;

let supportCache;
/** does this computer have a fingerprint reader / Windows Hello / device unlock? */
export function fingerprintSupported() {
  if (!usable()) return Promise.resolve(false);
  supportCache ||= PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
  return supportCache;
}
export function useFingerprintSupport() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let live = true;
    fingerprintSupported().then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, []);
  return ok;
}

// ---- what is kept on this computer: { [userId]: { id, pub, alg, bind, at } }
const all = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch {
    return {};
  }
};
const store = (v) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(v));
  } catch {
    throw new Error('This computer would not save the fingerprint (browser storage is blocked).');
  }
};
/** the user's fingerprint, only while it still matches the password it was set up under */
export function fingerprintOf(user) {
  const r = user && all()[user.id];
  return r && user.hash && r.bind === user.hash ? { ...r, userId: user.id } : null;
}
export function removeFingerprint(userId) {
  const v = all();
  delete v[userId];
  store(v);
}

const message = (e) => {
  if (e?.name === 'NotAllowedError') return 'Fingerprint cancelled or not recognised. Try again, or use your password.';
  if (e?.name === 'SecurityError' || e?.name === 'NotSupportedError') return 'This window cannot use the fingerprint. Use your password.';
  return e?.message || 'The fingerprint did not work. Use your password.';
};
const fail = (e) => {
  throw new Error(message(e));
};

/** set up the fingerprint of a user on this computer (the device asks for the finger or Windows Hello PIN) */
export async function enrollFingerprint(user) {
  if (!(await fingerprintSupported())) throw new Error('This computer has no fingerprint reader or Windows Hello set up.');
  const cred = await navigator.credentials
    .create({
      publicKey: {
        rp: { name: 'AY Toys', id: rpId() },
        user: { id: enc.encode(user.id), name: user.username, displayName: user.name || user.username },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        attestation: 'none',
        timeout: 60000,
      },
    })
    .catch(fail);
  const pub = cred?.response?.getPublicKey?.();
  const alg = cred?.response?.getPublicKeyAlgorithm?.();
  if (!pub || (alg !== -7 && alg !== -257)) throw new Error('This computer’s fingerprint cannot be used by AY Toys.');
  const v = all();
  v[user.id] = { id: b64(cred.rawId), pub: b64(pub), alg, bind: user.hash, at: new Date().toISOString() };
  store(v);
}

// ES256 signatures come as DER (SEQUENCE of two INTEGERs); WebCrypto wants the plain 64 bytes r|s
function derToRaw(der) {
  const d = new Uint8Array(der);
  let i = 2 + (d[1] & 0x80 ? d[1] & 0x7f : 0);
  const out = new Uint8Array(64);
  for (let k = 0; k < 2; k++) {
    if (d[i] !== 0x02) throw new Error('bad signature');
    let len = d[i + 1];
    let p = i + 2;
    while (len > 32 && d[p] === 0) (p++, len--);
    if (len > 32) throw new Error('bad signature');
    out.set(d.subarray(p, p + len), 32 * k + 32 - len);
    i = p + len;
  }
  return out;
}

async function signatureOk(rec, authData, clientData, sig) {
  const signed = new Uint8Array(authData.length + 32);
  signed.set(authData);
  signed.set(new Uint8Array(await crypto.subtle.digest('SHA-256', clientData)), authData.length);
  if (rec.alg === -7) {
    const key = await crypto.subtle.importKey('spki', unb64(rec.pub), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(sig), signed);
  }
  const key = await crypto.subtle.importKey('spki', unb64(rec.pub), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, signed);
}

/**
 * Ask for a fingerprint and check it against the given records (from fingerprintOf).
 * → the record that was proven (it has userId), or throws an Error with the reason.
 */
export async function checkFingerprint(records) {
  if (!records.length) throw new Error('No fingerprint is set up for this. Use your password.');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const cred = await navigator.credentials
    .get({
      publicKey: {
        rpId: rpId(),
        challenge,
        allowCredentials: records.map((r) => ({ type: 'public-key', id: unb64(r.id), transports: ['internal'] })),
        userVerification: 'required',
        timeout: 60000,
      },
    })
    .catch(fail);
  const rec = records.find((r) => r.id === b64(cred?.rawId || new ArrayBuffer(0)));
  const bad = new Error('The fingerprint could not be checked. Use your password.');
  if (!rec) throw bad;
  try {
    const authData = new Uint8Array(cred.response.authenticatorData);
    const clientRaw = new Uint8Array(cred.response.clientDataJSON);
    const client = JSON.parse(new TextDecoder().decode(clientRaw));
    const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(rpId())));
    const flags = authData[32];
    const good =
      client.type === 'webauthn.get' &&
      client.origin === location.origin &&
      same([...unb64(client.challenge)], [...challenge]) &&
      same([...authData.subarray(0, 32)], [...rpHash]) &&
      (flags & 0x01) && // the person was there…
      (flags & 0x04) && // …and the device checked who (finger / face / PIN)
      (await signatureOk(rec, authData, clientRaw, new Uint8Array(cred.response.signature)));
    if (!good) throw bad;
  } catch {
    throw bad;
  }
  return rec;
}
