// Users & Permissions (Super Admin only): add users, set their password, and choose the shops and pages each may open.
import { useMemo, useState } from 'react';
import { UserCog, Plus, Pencil, Trash2, ShieldCheck, Cloud, CloudOff, Lock, Search } from 'lucide-react';
import { useUsers, usePerm } from '../store/users';
import { useStore } from '../store/store';
import { Modal, useDialog } from '../components/ui';
import { PAGE_GROUPS, PRESETS, ALL_PAGES, isAdmin } from '../lib/permissions';
import { MIN_PASSWORD } from '../lib/password';
import { randomString } from '../lib/format';
import { copyText } from '../lib/clipboard';
import { SHEET_READY } from '../config';

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const blank = () => ({ name: '', phone: '', email: '', username: '', role: 'staff', active: true, canDelete: false, shops: 'all', pages: PRESETS.find((p) => p.id === 'sales').pages, notes: '' });

function UserEditor({ initial, onClose }) {
  const { saveUser, deleteUser, me } = useUsers();
  const { companies } = useStore();
  const dlg = useDialog();
  const isNew = !initial?.id;
  const [f, setF] = useState(() => ({ ...blank(), ...(initial || {}) }));
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const pages = new Set(Array.isArray(f.pages) ? f.pages : []);
  const togglePage = (k, on) => {
    const next = new Set(pages);
    if (on) next.add(k);
    else next.delete(k);
    setF((x) => ({ ...x, pages: ALL_PAGES.filter((p) => next.has(p)) }));
  };
  const setGroup = (g, on) => {
    const next = new Set(pages);
    g.pages.forEach(([k]) => (on ? next.add(k) : next.delete(k)));
    setF((x) => ({ ...x, pages: ALL_PAGES.filter((p) => next.has(p)) }));
  };
  // a strong password made here is shown, so the Super Admin can read it out or copy it once (passwords are never stored readable)
  const generate = () => {
    const p = randomString(10, 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789');
    setPw(p);
    setPw2(p);
    setShowPw(true);
  };
  const copyPw = async () => dlg.toast((await copyText(pw)) ? 'Password copied' : 'Copying was blocked — select and copy it by hand', 'ok');
  const shops = f.shops === 'all' || !Array.isArray(f.shops) ? 'all' : f.shops;
  const admin = f.role === 'admin';
  const q = filter.trim().toLowerCase();

  const submit = async () => {
    setErr('');
    if (!f.name.trim()) return setErr('Enter the name.');
    if (!f.username.trim()) return setErr('Enter a username.');
    if (/\s/.test(f.username.trim())) return setErr('The username cannot contain spaces.');
    if (isNew || pw) {
      if (pw.length < MIN_PASSWORD) return setErr(`The password needs at least ${MIN_PASSWORD} characters.`);
      if (pw !== pw2) return setErr('The two passwords are not the same.');
    }
    if (!admin && shops !== 'all' && !shops.length) return setErr('Choose at least one shop, or "All shops".');
    if (!admin && !pages.size) return setErr('Tick at least one page this user may open.');
    setBusy(true);
    try {
      const { hash, salt, rounds, ...clean } = f; // never send the old hash back from the form
      await saveUser({ ...clean, name: f.name.trim(), phone: String(f.phone || '').trim(), email: String(f.email || '').trim(), id: initial?.id }, pw || undefined);
      dlg.toast(isNew ? `User "${f.username.trim().toLowerCase()}" added` : 'User saved');
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await dlg.confirm(`Delete the user "${initial.username}"? They can no longer log in on any computer.`, { ok: 'Delete', danger: true }))) return;
    try {
      await deleteUser(initial.id);
      dlg.toast('User deleted');
      onClose();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <Modal
      title={isNew ? 'New User' : `Edit User — ${initial.username}`}
      onClose={onClose}
      width={980}
      footer={
        <>
          {!isNew && initial.id !== me?.id && (
            <button className="btn danger" onClick={remove} style={{ marginRight: 'auto' }}>
              <Trash2 size={14} /> Delete user
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Add User' : 'Save'}
          </button>
        </>
      }
    >
      <div className="ue">
        <div className="ue-left">
          <div className="section-title" style={{ marginTop: 0 }}>
            Details
          </div>
          <div className="grid2">
            <label className="lf">
              Name *
              <input value={f.name} onChange={set('name')} autoFocus />
            </label>
            <label className="lf">
              Number
              <input value={f.phone || ''} onChange={set('phone')} inputMode="tel" />
            </label>
            <label className="lf">
              Email
              <input value={f.email || ''} onChange={set('email')} type="email" />
            </label>
            <label className="lf">
              Username *
              <input value={f.username} onChange={set('username')} autoCapitalize="off" spellCheck={false} />
            </label>
            <label className="lf">
              {isNew ? 'Password *' : 'New password'}
              <input type={showPw ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder={isNew ? `at least ${MIN_PASSWORD} characters` : 'leave empty to keep the old one'} />
            </label>
            <label className="lf">
              Password again
              <input type={showPw ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            </label>
            <div className="flex" style={{ gap: 6, flexWrap: 'wrap', gridColumn: '1 / -1' }}>
              <button type="button" className="btn sm" onClick={generate}>
                Generate a strong password
              </button>
              <button type="button" className="btn sm" onClick={() => setShowPw((v) => !v)}>
                {showPw ? 'Hide' : 'Show'}
              </button>
              {pw && (
                <button type="button" className="btn sm" onClick={copyPw}>
                  Copy
                </button>
              )}
              <span className="muted small">Passwords are stored only as hashes, so an existing one cannot be read back — set a new one instead.</span>
            </div>
          </div>
          <label className="lf">
            Notes
            <input value={f.notes || ''} onChange={set('notes')} placeholder="e.g. counter staff, morning shift" />
          </label>

          <div className="section-title">Access</div>
          <div className="ue-role">
            <label className={'ue-opt' + (admin ? ' on' : '')}>
              <input type="radio" name="role" checked={admin} onChange={() => setF((x) => ({ ...x, role: 'admin' }))} />
              <b>
                <ShieldCheck size={14} /> Super Admin
              </b>
              <span>Everything, all shops, and this Users page.</span>
            </label>
            <label className={'ue-opt' + (!admin ? ' on' : '')}>
              <input type="radio" name="role" checked={!admin} onChange={() => setF((x) => ({ ...x, role: 'staff' }))} />
              <b>Staff</b>
              <span>Only the shops and pages ticked here.</span>
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={f.active !== false} onChange={set('active')} /> Active (can log in)
          </label>
          {!admin && (
            <label className="check">
              <input type="checkbox" checked={!!f.canDelete} onChange={set('canDelete')} /> May delete and void transactions, customers, vendors and items
            </label>
          )}
          {!admin && (
            <>
              <div className="section-title">Shops</div>
              <label className="check">
                <input type="radio" name="shops" checked={shops === 'all'} onChange={() => setF((x) => ({ ...x, shops: 'all' }))} /> All shops
              </label>
              <label className="check">
                <input type="radio" name="shops" checked={shops !== 'all'} onChange={() => setF((x) => ({ ...x, shops: companies.map((c) => c.id).slice(0, 1) }))} /> Only these shops:
              </label>
              {shops !== 'all' && (
                <div className="ue-shops">
                  {companies.map((c) => (
                    <label key={c.id} className="check">
                      <input
                        type="checkbox"
                        checked={shops.includes(c.id)}
                        onChange={(e) => setF((x) => ({ ...x, shops: e.target.checked ? [...shops, c.id] : shops.filter((s) => s !== c.id) }))}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="ue-right">
          {admin ? (
            <div className="note">
              <ShieldCheck size={14} style={{ verticalAlign: -2 }} /> A Super Admin can open every page. Choose <b>Staff</b> to pick pages.
            </div>
          ) : (
            <>
              <div className="ue-pages-head">
                <div className="section-title" style={{ margin: 0 }}>
                  Pages this user may open <span className="muted">({pages.size} of {ALL_PAGES.length})</span>
                </div>
                <div className="ue-search">
                  <Search size={13} />
                  <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a page" />
                </div>
              </div>
              <div className="ue-presets">
                <span className="muted small">Start from:</span>
                {PRESETS.map((p) => (
                  <button key={p.id} type="button" className="btn sm" onClick={() => setF((x) => ({ ...x, pages: [...p.pages] }))}>
                    {p.label}
                  </button>
                ))}
                <button type="button" className="btn sm ghost" onClick={() => setF((x) => ({ ...x, pages: [] }))}>
                  None
                </button>
              </div>
              <div className="ue-groups">
                {PAGE_GROUPS.map((g) => {
                  const list = g.pages.filter(([k, l]) => !q || l.toLowerCase().includes(q) || g.name.toLowerCase().includes(q));
                  if (!list.length) return null;
                  const n = g.pages.filter(([k]) => pages.has(k)).length;
                  return (
                    <fieldset key={g.name} className="ue-group">
                      <legend>
                        <label className="check">
                          <input type="checkbox" checked={n === g.pages.length} ref={(el) => el && (el.indeterminate = n > 0 && n < g.pages.length)} onChange={(e) => setGroup(g, e.target.checked)} />
                          <b>{g.name}</b> <span className="muted small">{n}/{g.pages.length}</span>
                        </label>
                      </legend>
                      {list.map(([k, label]) => (
                        <label key={k} className="check">
                          <input type="checkbox" checked={pages.has(k)} onChange={(e) => togglePage(k, e.target.checked)} />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                  );
                })}
              </div>
              <p className="muted small">Home, the shop list, keyboard help and changing their own password are always available.</p>
            </>
          )}
          {err && <div className="note warn mt">{err}</div>}
        </div>
      </div>
    </Modal>
  );
}

export default function UsersWindow() {
  const { users, me, remote, refresh, lockAfter, setLockAfter, pending } = useUsers();
  const { admin } = usePerm();
  const { companies } = useStore();
  const [edit, setEdit] = useState(null);
  const shopName = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c.name])), [companies]);
  const sorted = [...users].sort((a, b) => (isAdmin(b) - isAdmin(a)) || String(a.name).localeCompare(String(b.name)));
  if (!admin)
    return (
      <div className="win">
        <div className="win-body pad">
          <div className="note warn">Only a Super Admin can manage users.</div>
        </div>
      </div>
    );
  return (
    <div className="win">
      <div className="win-title">
        <UserCog size={20} />
        <h1>Users &amp; Permissions</h1>
        <span className="sub">
          {users.length} user{users.length === 1 ? '' : 's'}
        </span>
        <button className="btn primary sp" onClick={() => setEdit({})}>
          <Plus size={14} /> New User
        </button>
      </div>
      <div className="win-body pad">
        <div className="note mb">
          {SHEET_READY ? (
            remote.status === 'error' ? (
              <>
                <CloudOff size={14} style={{ verticalAlign: -2 }} /> Offline — changes to users are kept here and sent to the Google Sheet when the internet is back.{' '}
                <button className="btn sm" onClick={refresh}>
                  Try now
                </button>
              </>
            ) : (
              <>
                <Cloud size={14} style={{ verticalAlign: -2 }} /> Users are kept in your Google Sheet (tab <b>SYSTEM | Users</b>, passwords only as secure hashes), so every computer has the
                same users.{pending ? ` ${pending} change(s) still being sent.` : ''}
              </>
            )
          ) : (
            'Users are kept on this computer.'
          )}
        </div>
        <div className="tbl-wrap users-tbl">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Number</th>
                <th>Email</th>
                <th>Shops</th>
                <th className="r">Pages</th>
                <th>Status</th>
                <th>Last login</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((u) => (
                <tr key={u.id} onDoubleClick={() => setEdit(u)}>
                  <td>
                    <b>{u.name}</b>
                    {u.id === me?.id && <span className="badge pri" style={{ marginLeft: 6 }}>you</span>}
                  </td>
                  <td>{u.username}</td>
                  <td>{isAdmin(u) ? <span className="badge ok">Super Admin</span> : 'Staff'}</td>
                  <td>{u.phone || '—'}</td>
                  <td>{u.email || '—'}</td>
                  <td>{isAdmin(u) || u.shops === 'all' || !Array.isArray(u.shops) ? 'All' : u.shops.map((s) => shopName[s] || '?').join(', ')}</td>
                  <td className="r">{isAdmin(u) ? 'All' : (u.pages || []).length}</td>
                  <td>{u.active === false ? <span className="badge err">Off</span> : <span className="badge ok">Active</span>}</td>
                  <td className="small">{when(u.lastLogin)}</td>
                  <td>
                    <button className="btn sm" onClick={() => setEdit(u)}>
                      <Pencil size={13} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="section-title">
          <Lock size={14} style={{ verticalAlign: -2 }} /> Screen lock (this computer)
        </div>
        <label className="check">
          Lock the screen after
          <select value={lockAfter} onChange={(e) => setLockAfter(Number(e.target.value))} style={{ margin: '0 6px', width: 'auto' }}>
            {[5, 10, 15, 30, 60, 0].map((m) => (
              <option key={m} value={m}>
                {m ? `${m} minutes` : 'never'}
              </option>
            ))}
          </select>
          without use. The open windows stay; the user types their password to continue.
        </label>
      </div>
      {edit && <UserEditor initial={edit.id ? edit : null} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** Any user: change their own password. */
export function ChangePassword({ onClose }) {
  const { me, saveUser, unlock } = useUsers();
  const dlg = useDialog();
  const [cur, setCur] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');
  const submit = async () => {
    const bad = await unlock(cur);
    if (bad) return setErr('Your current password is wrong.');
    if (p1.length < MIN_PASSWORD) return setErr(`The new password needs at least ${MIN_PASSWORD} characters.`);
    if (p1 !== p2) return setErr('The two new passwords are not the same.');
    try {
      await saveUser({ ...me }, p1);
      dlg.toast('Password changed');
      onClose();
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <Modal
      title="Change my password"
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            Change password
          </button>
        </>
      }
    >
      <label className="lf">
        Current password
        <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus autoComplete="current-password" />
      </label>
      <label className="lf">
        New password
        <input type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" />
      </label>
      <label className="lf">
        New password again
        <input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" />
      </label>
      {err && <div className="note warn mt">{err}</div>}
    </Modal>
  );
}
