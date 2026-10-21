// Users, logins and permissions.
// Users are kept on this computer (so logging in works offline) and in the Google Sheet tab "SYSTEM | Users"
// (so every computer has the same users). A user's newest change wins. Passwords only as salted hashes.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { sheets } from './sheets';
import { SHEET, SHEET_READY } from '../config';
import { hashPassword, passwordRecord, sameHash, PBKDF2_ROUNDS } from '../lib/password';
import { userCan, userCanShop, pageKey, isAdmin } from '../lib/permissions';
import { uid } from '../lib/format';

const LS_USERS = 'ay.users';
const LS_PENDING = 'ay.usersPending';
const SS_SESSION = 'ay.session';
const LS_IDLE = 'ay.lockAfter';
const SYS_CODE = 'SYSTEM';
const TABLE = 'Users';

const read = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* full or blocked: the sheet still has them */
  }
};
const session = {
  get: () => {
    try {
      return sessionStorage.getItem(SS_SESSION) || '';
    } catch {
      return '';
    }
  },
  set: (id) => {
    try {
      if (id) sessionStorage.setItem(SS_SESSION, id);
      else sessionStorage.removeItem(SS_SESSION);
    } catch {
      /* ignore */
    }
  },
};

// newest version of each user (by updatedAt)
function mergeUsers(local, remote) {
  const by = new Map(local.map((u) => [u.id, u]));
  for (const r of remote || []) {
    if (!r || !r.id) continue;
    const l = by.get(r.id);
    if (!l || String(r.updatedAt || '') > String(l.updatedAt || '')) by.set(r.id, r);
  }
  return [...by.values()];
}

// what other code may know about a user (never the password hash)
export const publicUser = (u) => (u ? { id: u.id, name: u.name, username: u.username, role: u.role } : null);

const UsersCtx = createContext(null);
export const useUsers = () => useContext(UsersCtx);

/** can(key) / canOpen(type, props) / canShop(id) for the person logged in */
export function usePerm() {
  const u = useUsers();
  return u ? u.perm : { can: () => true, canOpen: () => true, canShop: () => true, me: null, admin: true };
}

export function UsersProvider({ children }) {
  const [users, setUsers] = useState(() => read(LS_USERS, []));
  const [meId, setMeId] = useState(() => session.get());
  const [remote, setRemote] = useState({ status: SHEET_READY ? 'loading' : 'off', message: '', at: null });
  const [locked, setLocked] = useState(false);
  const [lockAfter, setLockAfterState] = useState(() => Number(read(LS_IDLE, 15)) || 0); // minutes, 0 = never
  const usersRef = useRef(users);
  usersRef.current = users;
  const pendingRef = useRef(new Set(read(LS_PENDING, [])));

  const save = (list) => {
    usersRef.current = list;
    setUsers(list);
    write(LS_USERS, list);
  };
  const savePending = () => write(LS_PENDING, [...pendingRef.current]);

  // send waiting changes to the sheet
  const pushPending = useCallback(async () => {
    if (!SHEET_READY || !pendingRef.current.size) return;
    const ops = [...pendingRef.current].map((id) => usersRef.current.find((u) => u.id === id)).filter(Boolean).map((record) => ({ op: 'upsert', table: TABLE, record }));
    if (!ops.length) {
      pendingRef.current.clear();
      savePending();
      return;
    }
    try {
      await sheets.push(SHEET, SYS_CODE, ops);
      ops.forEach((o) => pendingRef.current.delete(o.record.id));
      savePending();
    } catch {
      /* offline: they wait */
    }
  }, []);

  // download the users of every computer
  const refresh = useCallback(async () => {
    if (!SHEET_READY) return;
    try {
      const t = await sheets.pullTables(SHEET, SYS_CODE, [TABLE]);
      const remoteList = t[TABLE] || [];
      // the sheet decides who exists: a user removed there is removed here too (except users made on this
      // computer that have not reached the sheet yet)
      const there = new Set(remoteList.map((u) => u.id));
      const kept = usersRef.current.filter((u) => there.has(u.id) || pendingRef.current.has(u.id));
      const merged = mergeUsers(kept, remoteList);
      save(merged);
      setRemote({ status: 'ok', message: '', at: new Date().toISOString() });
      await pushPending();
    } catch (e) {
      setRemote((r) => ({ status: 'error', message: e.message, at: r.at }));
    }
  }, [pushPending]);

  useEffect(() => {
    refresh();
    const on = () => refresh();
    window.addEventListener('online', on);
    const t = setInterval(() => navigator.onLine && refresh(), 5 * 60000);
    return () => {
      window.removeEventListener('online', on);
      clearInterval(t);
    };
  }, [refresh]);

  const live = useMemo(() => users.filter((u) => !u.deleted), [users]);
  const me = useMemo(() => live.find((u) => u.id === meId && u.active !== false) || null, [live, meId]);
  const hasAdmin = live.some((u) => isAdmin(u) && u.active !== false);

  /** add or change a user; password (plain) is hashed here when given */
  const saveUser = useCallback(
    async (u, password) => {
      const now = new Date().toISOString();
      const name = String(u.username || '').trim().toLowerCase();
      if (!name) throw new Error('Enter a username.');
      if (usersRef.current.some((x) => !x.deleted && x.id !== u.id && String(x.username || '').toLowerCase() === name)) throw new Error(`The username "${name}" is already used.`);
      const old = usersRef.current.find((x) => x.id === u.id);
      if (!old && !password) throw new Error('Set a password for the new user.');
      // never lock everyone out: keep at least one active Super Admin
      const admins = usersRef.current.filter((x) => !x.deleted && isAdmin(x) && x.active !== false && x.id !== u.id);
      if (old && isAdmin(old) && (!isAdmin(u) || u.active === false || u.deleted) && !admins.length) throw new Error('This is the only active Super Admin. Make another user Super Admin first.');
      const rec = { ...(old || {}), ...u, id: u.id || uid(), username: name, updatedAt: now, createdAt: old?.createdAt || now };
      if (password) Object.assign(rec, await passwordRecord(password), { passwordSetAt: now });
      save([...usersRef.current.filter((x) => x.id !== rec.id), rec]);
      pendingRef.current.add(rec.id);
      savePending();
      pushPending();
      return rec;
    },
    [pushPending],
  );

  const deleteUser = useCallback(
    async (id) => {
      const u = usersRef.current.find((x) => x.id === id);
      if (!u) return;
      if (id === meId) throw new Error('You cannot delete yourself.');
      // a deleted user stays as a marker, so other computers learn it is gone
      await saveUser({ ...u, deleted: true, active: false });
    },
    [meId, saveUser],
  );

  /** → '' when logged in, else the reason */
  const login = useCallback(
    async (username, password) => {
      const name = String(username || '').trim().toLowerCase();
      const u = usersRef.current.find((x) => !x.deleted && String(x.username || '').toLowerCase() === name);
      // the same work for unknown users, so the answer time does not tell which usernames exist
      const hash = await hashPassword(password, u?.salt || 'no-such-user', u?.rounds);
      if (!u || !sameHash(hash, u.hash)) return 'Wrong username or password.';
      if (u.active === false) return 'This user is switched off. Ask the Super Admin.';
      session.set(u.id);
      setMeId(u.id);
      setLocked(false);
      // a password set in the Google Sheet (AY Toys › Reset a user's password) uses fewer rounds: make it full strength
      const weak = (Number(u.rounds) || 0) < PBKDF2_ROUNDS;
      saveUser({ ...u, lastLogin: new Date().toISOString() }, weak ? password : undefined).catch(() => {});
      return '';
    },
    [saveUser],
  );

  const unlock = useCallback(
    async (password) => {
      const u = usersRef.current.find((x) => x.id === meId);
      if (!u) return 'Please log in again.';
      const hash = await hashPassword(password, u.salt, u.rounds);
      if (!sameHash(hash, u.hash)) return 'Wrong password.';
      setLocked(false);
      return '';
    },
    [meId],
  );

  const logout = useCallback(() => {
    session.set('');
    setMeId('');
    setLocked(false);
  }, []);

  const setLockAfter = useCallback((m) => {
    setLockAfterState(m);
    write(LS_IDLE, m);
  }, []);

  // lock the screen after some minutes without mouse or keyboard (the open windows stay as they are)
  useEffect(() => {
    if (!me || !lockAfter) return undefined;
    let last = Date.now();
    const seen = () => (last = Date.now());
    const evs = ['mousedown', 'keydown', 'touchstart', 'wheel', 'mousemove'];
    evs.forEach((e) => window.addEventListener(e, seen, { passive: true }));
    const t = setInterval(() => {
      if (Date.now() - last > lockAfter * 60000) setLocked(true);
    }, 15000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, seen));
      clearInterval(t);
    };
  }, [me, lockAfter]);

  const perm = useMemo(
    () => ({
      me: publicUser(me),
      admin: isAdmin(me),
      can: (key) => userCan(me, key),
      canOpen: (type, props) => userCan(me, pageKey(type, props)),
      canShop: (id) => userCanShop(me, id),
    }),
    [me],
  );

  const value = useMemo(
    () => ({ users: live, me, hasAdmin, remote, refresh, saveUser, deleteUser, login, logout, locked, lock: () => setLocked(true), unlock, lockAfter, setLockAfter, perm, pending: pendingRef.current.size }),
    [live, me, hasAdmin, remote, refresh, saveUser, deleteUser, login, logout, locked, unlock, lockAfter, setLockAfter, perm],
  );
  return <UsersCtx.Provider value={value}>{children}</UsersCtx.Provider>;
}
