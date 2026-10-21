// Before the app: create the Super Admin (first run), log in, or unlock after a break.
import { useState } from 'react';
import { LogIn, Lock, Eye, EyeOff, ShieldCheck, RefreshCw, CloudOff } from 'lucide-react';
import { useUsers } from '../store/users';
import { SHEET_READY } from '../config';
import { MIN_PASSWORD } from '../lib/password';

function PasswordInput({ value, onChange, autoFocus, id, placeholder, autoComplete = 'current-password' }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} autoComplete={autoComplete} placeholder={placeholder} spellCheck={false} />
      <button type="button" className="pw-eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide' : 'Show'}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function Screen({ icon: Icon, title, sub, children }) {
  return (
    <div className="welcome login-screen">
      <div className="welcome-card login-card">
        <div className="welcome-head">
          <div className="brand-logo">AY</div>
          <div>
            <h1>{title}</h1>
            {sub && <p>{sub}</p>}
          </div>
          {Icon && <Icon size={22} className="login-icon" />}
        </div>
        <div className="welcome-body">{children}</div>
      </div>
    </div>
  );
}

function Setup() {
  const { saveUser, login } = useUsers();
  const [f, setF] = useState({ name: '', phone: '', email: '', username: '', password: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim() || !f.username.trim()) return setErr('Enter your name and a username.');
    if (f.password.length < MIN_PASSWORD) return setErr(`The password needs at least ${MIN_PASSWORD} characters.`);
    if (f.password !== f.confirm) return setErr('The two passwords are not the same.');
    setBusy(true);
    try {
      await saveUser({ name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), username: f.username, role: 'admin', active: true, shops: 'all', pages: [], canDelete: true }, f.password);
      const e2 = await login(f.username, f.password);
      if (e2) setErr(e2);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen icon={ShieldCheck} title="Create the Super Admin" sub="The first account controls everything: it adds users and decides which pages each one may open.">
      <form className="login-form" onSubmit={submit}>
        <div className="grid2">
          <label className="lf">
            Name *
            <input value={f.name} onChange={set('name')} autoFocus autoComplete="name" />
          </label>
          <label className="lf">
            Number
            <input value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" />
          </label>
          <label className="lf">
            Email
            <input value={f.email} onChange={set('email')} type="email" autoComplete="email" />
          </label>
          <label className="lf">
            Username *
            <input value={f.username} onChange={set('username')} autoCapitalize="off" autoComplete="username" spellCheck={false} />
          </label>
          <label className="lf">
            Password * (at least {MIN_PASSWORD} characters)
            <PasswordInput value={f.password} onChange={set('password')} autoComplete="new-password" />
          </label>
          <label className="lf">
            Password again *
            <PasswordInput value={f.confirm} onChange={set('confirm')} autoComplete="new-password" />
          </label>
        </div>
        {err && <div className="note warn mt">{err}</div>}
        <button className="btn primary login-btn" disabled={busy}>
          <ShieldCheck size={16} /> {busy ? 'Creating…' : 'Create Super Admin and start'}
        </button>
        <p className="muted small">
          Keep this password safe. {SHEET_READY ? 'The account is saved in your Google Sheet, so it works on every computer.' : 'The account is saved on this computer.'}
        </p>
      </form>
    </Screen>
  );
}

function Login() {
  const { login } = useUsers();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!u.trim() || !p) return setErr('Enter your username and password.');
    setBusy(true);
    setErr('');
    const e2 = await login(u, p).catch((x) => x.message);
    setBusy(false);
    if (e2) {
      setErr(e2);
      setP('');
    }
  };
  return (
    <Screen icon={Lock} title="AY Toys" sub="Log in to continue.">
      <form className="login-form narrow" onSubmit={submit}>
        <label className="lf">
          Username
          <input value={u} onChange={(e) => setU(e.target.value)} autoFocus autoCapitalize="off" autoComplete="username" spellCheck={false} />
        </label>
        <label className="lf">
          Password
          <PasswordInput value={p} onChange={setP} />
        </label>
        {err && (
          <div className="note warn mt" role="alert">
            {err}
          </div>
        )}
        <button className="btn primary login-btn" disabled={busy}>
          <LogIn size={16} /> {busy ? 'Checking…' : 'Log in'}
        </button>
        <p className="muted small">Forgot your password? Ask the Super Admin to set a new one.</p>
      </form>
    </Screen>
  );
}

// after "Reset a user's password" in the Google Sheet: the user chooses their own password first
function NewPassword() {
  const { me, saveUser, logout } = useUsers();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (p1.length < MIN_PASSWORD) return setErr(`The password needs at least ${MIN_PASSWORD} characters.`);
    if (p1 !== p2) return setErr('The two passwords are not the same.');
    setBusy(true);
    try {
      await saveUser({ ...me, mustChange: false }, p1);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen icon={Lock} title="Choose a new password" sub={`${me?.name || ''}, your password was reset. Choose your own password to continue.`}>
      <form className="login-form narrow" onSubmit={submit}>
        <label className="lf">
          New password (at least {MIN_PASSWORD} characters)
          <PasswordInput value={p1} onChange={setP1} autoFocus autoComplete="new-password" />
        </label>
        <label className="lf">
          New password again
          <PasswordInput value={p2} onChange={setP2} autoComplete="new-password" />
        </label>
        {err && <div className="note warn mt">{err}</div>}
        <button className="btn primary login-btn" disabled={busy}>
          {busy ? 'Saving…' : 'Save and continue'}
        </button>
        <button type="button" className="btn ghost" onClick={logout}>
          Log out
        </button>
      </form>
    </Screen>
  );
}

function LockScreen() {
  const { me, unlock, logout } = useUsers();
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const e2 = await unlock(p);
    if (e2) {
      setErr(e2);
      setP('');
    }
  };
  return (
    <div className="lock-overlay" role="dialog" aria-modal="true" aria-label="Locked">
      <form className="lock-card" onSubmit={submit}>
        <Lock size={28} />
        <h2>Locked</h2>
        <p className="muted">
          {me?.name} — enter your password to continue. Your open windows are kept.
        </p>
        <PasswordInput value={p} onChange={setP} autoFocus />
        {err && <div className="note warn mt">{err}</div>}
        <button className="btn primary login-btn">Unlock</button>
        <button type="button" className="btn ghost" onClick={logout}>
          Log in as someone else
        </button>
      </form>
    </div>
  );
}

/** Shows the app only to someone logged in. */
export default function UserGate({ children }) {
  const { me, hasAdmin, users, remote, refresh, locked } = useUsers();
  if (!hasAdmin) {
    // a new computer must first learn the users of the Google Sheet, or anyone could make themselves admin
    if (SHEET_READY && remote.status === 'loading')
      return (
        <Screen title="AY Toys" sub="Getting the users from your Google Sheet…">
          <p className="muted">
            <RefreshCw size={14} className="spin" style={{ verticalAlign: -2 }} /> One moment.
          </p>
        </Screen>
      );
    if (SHEET_READY && remote.status === 'error' && !users.length)
      return (
        <Screen icon={CloudOff} title="Connect to the internet once" sub="This computer has not met your users yet.">
          <p>AY Toys downloads the users from your Google Sheet the first time it starts on a computer. After that it also works without internet.</p>
          <p className="muted small">{remote.message}</p>
          <button className="btn primary" onClick={refresh}>
            <RefreshCw size={14} /> Try again
          </button>
        </Screen>
      );
    return <Setup />;
  }
  if (!me) return <Login />;
  if (me.mustChange) return <NewPassword />;
  return (
    <>
      {children}
      {locked && <LockScreen />}
    </>
  );
}
