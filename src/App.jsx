import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Search, ChevronsLeft, ChevronsRight, X, Cloud, CloudOff, RefreshCw, AlertCircle, Settings2, Menu, UserCircle } from 'lucide-react';
import MenuBar from './components/MenuBar';
import ErrorBoundary from './components/ErrorBoundary';
import { MENUS, GLOBAL_KEYS, comboFromEvent } from './lib/commands';
import { useStore } from './store/store';
import { WindowsProvider, useWindows, ThisWindowProvider } from './store/windows';
import { WINDOW_COMPONENTS, windowTitle } from './windows/registry';
import { useDialog, modalIsOpen, useContextMenu } from './components/ui';
import CustomizeShortcuts from './windows/CustomizeShortcuts';
import { companyShortcuts, iconOf, sameCmd, shortcutForWindow } from './lib/shortcuts';
import Companies from './windows/Companies';
import { usePerm, useUsers } from './store/users';
import { ChangePassword, FingerprintSetup } from './windows/Users';
import { pageKey } from './lib/permissions';
import { downloadFile } from './lib/format';
import { backupProblem } from './lib/importData';
import { fmtDate, today } from './lib/dates';

// With more than one shop, every new session starts on the shop screen (figures of each shop, all-shop reports).
const PICKED = 'ay.shopPicked';
const pickedThisSession = () => {
  try {
    return sessionStorage.getItem(PICKED) === '1';
  } catch {
    return true;
  }
};

export default function App() {
  const { company, data, companies } = useStore();
  const perm = usePerm();
  const dlgApp = useDialog();
  // every window opens through this check (menus, shortcuts, keys, drill-downs from reports…)
  const allow = useCallback((type, props) => (type === 'newcompany' ? perm.admin : perm.canOpen(type, props)), [perm]);
  const denied = useCallback((type, props) => dlgApp.toast(`You don't have access to "${windowTitle(type, props)}". Ask the Super Admin.`, 'err'), [dlgApp]);
  const [start, setStart] = useState(() => !pickedThisSession() && companies.length > 1);
  const picked = useCallback(() => {
    try {
      sessionStorage.setItem(PICKED, '1');
    } catch {
      /* ignore */
    }
    setStart(false);
  }, []);
  if (!company || start || !perm.canShop(company.id)) return <Companies fullscreen onOpen={picked} />;
  if (!data)
    return (
      <div className="welcome">
        <div className="muted" style={{ fontSize: 15 }}>
          <RefreshCw size={16} className="spin" style={{ verticalAlign: -3 }} /> Opening {company.name}…
        </div>
      </div>
    );
  return (
    <WindowsProvider titles={windowTitle} key={company.id + ':' + (perm.me?.id || '')} allow={allow} onDenied={denied}>
      <Shell />
    </WindowsProvider>
  );
}


// Phones (≤ 640 px): the icon bar becomes a slide-out menu opened from the title bar
const PHONE = '(max-width: 640px)';
function usePhone() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(PHONE).matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(PHONE);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

function Shell() {
  const store = useStore();
  const { company, sync, syncNow, data, companies, switchCompany, replaceData, updateCompany } = store;
  const wm = useWindows();
  const { windows, activeId, open, close, focus, closeAll, cycle, handlersRef } = wm;
  const dlg = useDialog();
  const perm = usePerm();
  const usersApi = useUsers();
  const [pwOpen, setPwOpen] = useState(false);
  const [fpOpen, setFpOpen] = useState(false);
  // may this user use a menu / shortcut command?
  const allowCmd = useCallback(
    (cmd) => {
      if (!cmd) return true;
      if (cmd.open) return cmd.open === 'newcompany' ? perm.admin : perm.canOpen(cmd.open, cmd.props || {});
      if (cmd.report) return perm.can(pageKey('report', { reportId: cmd.report }));
      if (cmd.key === 'ctrl+d' || cmd.key === 'void') return perm.can('delete');
      if (cmd.action === 'backup' || cmd.action === 'restore') return perm.can('backup');
      if (cmd.action === 'rebuild') return perm.admin;
      return true;
    },
    [perm],
  );
  // the store refuses deletes without permission and says so here
  useEffect(() => {
    const h = (e) => dlg.toast(e.detail || "You don't have permission for this. Ask the Super Admin.", 'err');
    window.addEventListener('ay:denied', h);
    return () => window.removeEventListener('ay:denied', h);
  }, [dlg]);
  const [menuIdx, setMenuIdx] = useState(null);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ay.iconbar') === '1');
  const phone = usePhone();
  const [drawer, setDrawer] = useState(false);
  const iconCollapsed = collapsed && !phone; // the phone menu always shows labels
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);
  useEffect(() => {
    if (!phone) setDrawer(false);
  }, [phone]);
  const [showOpenWins, setShowOpenWins] = useState(true);
  const [search, setSearch] = useState('');
  const [scEdit, setScEdit] = useState(null); // Customize Shortcuts dialog: { focusIndex?, startAdding? }
  const ctx = useContextMenu();
  const fileRef = useRef(null);
  const shortcuts = companyShortcuts(company);

  // ----- icon bar shortcuts (saved with the company; null = default layout) -----
  const saveShortcuts = useCallback((list) => updateCompany(company.id, { shortcuts: list }), [company.id, updateCompany]);
  const editShortcuts = (fn) => {
    const next = fn([...shortcuts]);
    saveShortcuts(next.length ? next : null);
  };
  const addWindowShortcut = useCallback(
    (w) => {
      if (!w) return;
      const sc = shortcutForWindow(w);
      if (shortcuts.some((x) => !x.head && sameCmd(x.cmd, sc.cmd))) return dlg.toast(`"${sc.label}" is already in your shortcuts`);
      saveShortcuts([...shortcuts, { id: Math.random().toString(36).slice(2, 10), ...sc }]);
      dlg.toast(`"${sc.label}" added to your shortcuts`);
    },
    [shortcuts, saveShortcuts, dlg],
  );
  const shortcutMenu = (i) => {
    const x = shortcuts[i];
    const move = (d) => () =>
      editShortcuts((l) => {
        const [it] = l.splice(i, 1);
        l.splice(Math.max(0, Math.min(l.length, i + d)), 0, it);
        return l;
      });
    return [
      { label: x.head !== undefined ? 'Rename Heading…' : 'Edit Shortcut…', onClick: () => setScEdit({ focusIndex: i }) },
      { label: 'Move Up', disabled: i === 0, onClick: move(-1) },
      { label: 'Move Down', disabled: i === shortcuts.length - 1, onClick: move(1) },
      { label: x.head !== undefined ? 'Remove Heading' : 'Remove from Shortcuts', onClick: () => editShortcuts((l) => l.filter((_, j) => j !== i)) },
      '-',
      { label: 'Add Shortcut…', onClick: () => setScEdit({ focusIndex: i, startAdding: true }) },
      { label: 'Customize Shortcuts…', onClick: () => setScEdit({}) },
    ];
  };

  useEffect(() => localStorage.setItem('ay.iconbar', collapsed ? '1' : '0'), [collapsed]);

  const run = useCallback(
    async (cmd) => {
      if (!cmd) return;
      if (!allowCmd(cmd)) {
        dlg.toast("You don't have access to this. Ask the Super Admin.", 'err');
        return;
      }
      if (cmd.open) {
        if (cmd.open === 'newcompany') return open('companies', { create: true, n: Date.now() });
        if (cmd.open === 'pickregister') {
          const bank = data.accounts.find((a) => a.sys === 'bank') || data.accounts.find((a) => a.type === 'Bank');
          return open('register', { accountId: bank?.id }, 'Register: ' + (bank?.name || ''));
        }
        return open(cmd.open, cmd.props ? { ...cmd.props, n: Date.now() } : {});
      }
      if (cmd.report) return open('report', { reportId: cmd.report, filter: cmd.filter || {} });
      if (cmd.key) {
        const h = handlersRef.current[activeId];
        if (h && cmd.key in h) h[cmd.key]();
        else dlg.toast('Not available in this window', 'err');
        return;
      }
      switch (cmd.action) {
        case 'focus':
          return focus(cmd.id);
        case 'closeWindow':
          return activeId !== 'home' && close(activeId);
        case 'closeAll':
          return closeAll();
        case 'nextWindow':
          return cycle(1);
        case 'prevWindow':
          return cycle(-1);
        case 'toggleIconBar':
          return setCollapsed((c) => !c);
        case 'toggleWindowList':
          return setShowOpenWins((s) => !s);
        case 'customizeShortcuts':
          return setScEdit({});
        case 'addWindowShortcut':
          return addWindowShortcut(windows.find((w) => w.id === activeId));
        case 'fullscreen':
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen?.();
          return;
        case 'closeCompany':
          return switchCompany(null);
        case 'sync':
          try {
            await syncNow();
            dlg.toast('Synced with Google Sheets');
          } catch (e) {
            dlg.toast(e.message, 'err');
          }
          return;
        case 'backup': {
          const payload = { app: 'AY Toys', version: 1, exportedAt: new Date().toISOString(), company, data };
          downloadFile(`${company.name.replace(/[^\w]+/g, '_')}_backup_${today()}.aytoys.json`, JSON.stringify(payload), 'application/json');
          dlg.toast('Backup downloaded');
          return;
        }
        case 'restore':
          fileRef.current?.click();
          return;
        case 'rebuild':
          store.rebuildData();
          dlg.toast('Data rebuilt — all balances recalculated');
          return;
        case 'changePassword':
          return setPwOpen(true);
        case 'fingerprint':
          return setFpOpen(true);
        case 'lock':
          return usersApi.lock();
        case 'logout':
          return usersApi.logout();
        default:
      }
    },
    [open, close, focus, closeAll, cycle, activeId, handlersRef, data, dlg, company, syncNow, switchCompany, replaceData, store, windows, addWindowShortcut, allowCmd, usersApi],
  );

  // ---------- global keyboard ----------
  useEffect(() => {
    const menuKeys = Object.fromEntries(MENUS.map((m, i) => [m.key, i]));
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      const combo = comboFromEvent(e);
      if (!combo) return;
      if (modalIsOpen() || document.querySelector('.modal-backdrop')) return;
      if (menuIdx !== null) return;
      const target = e.target;
      const inInput = target instanceof Element && !!target.closest('input, textarea, select, [contenteditable=true]');
      const h = handlersRef.current[activeId];
      let key = combo;
      if (combo === 'insert' && !inInput) key = 'ctrl+n';
      if (h && key in h && typeof h[key] === 'function') {
        if (key === 'enter' && inInput) return;
        const r = h[key](e);
        if (r !== false) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (combo === 'esc') {
        if (activeId !== 'home') {
          e.preventDefault();
          close(activeId);
        }
        return;
      }
      const m = /^alt\+([a-z])$/.exec(combo);
      if (m && menuKeys[m[1]] !== undefined) {
        e.preventDefault();
        setMenuIdx(menuKeys[m[1]]);
        return;
      }
      const g = GLOBAL_KEYS[combo];
      if (g) {
        if (g.notInInput && inInput) return;
        e.preventDefault();
        run(g);
        return;
      }
      if (combo === 'ctrl+p') {
        e.preventDefault();
        dlg.toast('Open a report or transaction to print', 'err');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId, handlersRef, menuIdx, run, close, dlg]);

  // stop the browser from swallowing Alt (focusing its own menu)
  useEffect(() => {
    const up = (e) => {
      if (e.key === 'Alt') e.preventDefault();
    };
    window.addEventListener('keyup', up);
    return () => window.removeEventListener('keyup', up);
  }, []);

  const onRestore = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const bad = backupProblem(json);
      if (bad) throw new Error(bad);
      const ok = await dlg.confirm(
        `Restore backup of "${json.company?.name || 'a shop'}"${json.exportedAt ? ' from ' + new Date(json.exportedAt).toLocaleString() : ''} into the current company "${company.name}"?\n\nAll current data of this company will be replaced.`,
        { ok: 'Restore', danger: true },
      );
      if (!ok) return;
      replaceData(json.data); // also queues the full upload to the sheet (it waits if there is no internet)
      closeAll();
      dlg.toast('Backup restored');
    } catch (err) {
      dlg.alert('Restore failed: ' + err.message);
    }
  };

  const syncIcon =
    sync.status === 'syncing' ? (
      <RefreshCw size={13} className="spin" />
    ) : sync.status === 'error' ? (
      <AlertCircle size={13} />
    ) : sync.status === 'local' || sync.status === 'offline' || !store.sheetUrl ? (
      <CloudOff size={13} />
    ) : (
      <Cloud size={13} />
    );
  const syncText = !store.sheetUrl
    ? 'Local only'
    : sync.status === 'syncing'
      ? 'Syncing…'
      : sync.status === 'offline'
        ? `Offline${sync.pending ? ` · ${sync.pending} waiting` : ''}`
      : sync.status === 'error'
        ? 'Sync error'
        : sync.pending
          ? `${sync.pending} pending`
          : 'Synced';

  const activeWin = windows.find((w) => w.id === activeId);
  // highlight the shortcut of the window in front
  const isOn = (cmd) =>
    !!activeWin &&
    ((cmd.open && cmd.open === activeWin.type && !cmd.props) || (cmd.report && activeWin.type === 'report' && cmd.report === activeWin.props?.reportId && !cmd.filter));

  return (
    <div className="app">
      <header className="titlebar">
        <button className="nav-btn" onClick={() => setDrawer((d) => !d)} aria-label="Menu" aria-expanded={drawer} title="Menu">
          <Menu size={20} />
        </button>
        <div className="brand">
          <div className="brand-logo">AY</div>
          <span>AY Toys</span>
          <span className="brand-sub">Enterprise · Wholesale</span>
        </div>
        <button className="co-switch" onClick={() => open('companies')} title="Switch company (Ctrl+O)">
          <span className="co-dot" style={{ background: company.theme?.primary }} />
          <span>{company.name}</span>
        </button>
        {companies.length > 1 && (
          <select
            className="small quick-switch"
            style={{ height: 26, background: 'rgb(255 255 255 / 12%)', color: '#fff', border: '1px solid rgb(255 255 255 / 25%)', width: 160 }}
            value=""
            onChange={(e) => e.target.value && switchCompany(e.target.value)}
            title="Quick switch"
          >
            <option value="">Quick switch…</option>
            {companies
              .filter((c) => c.id !== company.id && perm.canShop(c.id))
              .map((c) => (
                <option key={c.id} value={c.id} style={{ color: '#000' }}>
                  {c.name}
                </option>
              ))}
          </select>
        )}
        <form
          className="title-search"
          onSubmit={(e) => {
            e.preventDefault();
            open('find', { q: search, n: Date.now() });
          }}
        >
          <Search size={14} />
          <input placeholder="Search company file (Ctrl+F)" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <button className={'sync-pill' + (sync.status === 'error' ? ' error' : sync.status === 'offline' ? ' offline' : '')} onClick={() => open('sync')} title={sync.message || 'Google Sheets sync'}>
          {syncIcon}
          <span className="sync-text">{syncText}</span>
        </button>
        <button
          className="user-chip"
          title={`Logged in as ${perm.me?.name || ''} (${perm.admin ? 'Super Admin' : 'Staff'})`}
          onClick={(e) =>
            ctx.show(e, [
              { label: `${perm.me?.name || ''} — ${perm.admin ? 'Super Admin' : 'Staff'}`, disabled: true },
              '-',
              ...(perm.admin ? [{ label: 'Users & Permissions…', onClick: () => open('users') }] : []),
              { label: 'Change My Password…', onClick: () => setPwOpen(true) },
              { label: 'Fingerprint…', onClick: () => setFpOpen(true) },
              { label: 'Lock Screen', onClick: () => usersApi.lock() },
              { label: 'Log Out', onClick: () => usersApi.logout() },
            ])
          }
        >
          <UserCircle size={17} />
          <span className="user-name">{perm.me?.name}</span>
        </button>
      </header>

      <MenuBar openIdx={menuIdx} setOpenIdx={setMenuIdx} run={run} allowCmd={allowCmd} />
      {store.storageError && (
        <div className="storage-alert" role="alert">
          <AlertCircle size={15} />
          <span>
            <b>{store.storageError}</b>{' '}
            {store.sheetUrl
              ? 'Your latest changes are still in this window and are being sent to the Google Sheet — keep this tab open until the sync pill says Synced.'
              : 'Your latest changes are only in this window. Download a backup now (File › Back Up Company) before closing this tab.'}
          </span>
        </div>
      )}

      <div className="main">
        <aside className={'iconbar' + (iconCollapsed ? ' collapsed' : '') + (drawer ? ' open' : '')}>
          <div className="iconbar-scroll">
            {showOpenWins && windows.length > 1 && (
              <>
                <div className="ib-head">Open Windows</div>
                {windows.map((w) => (
                  <button
                    key={w.id}
                    className={'ib-item' + (w.id === activeId ? ' on' : '')}
                    onClick={() => {
                      setDrawer(false);
                      focus(w.id);
                    }}
                    title={w.title}
                  >
                    <FileText size={15} />
                    {!iconCollapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.title}</span>}
                    {!iconCollapsed && w.id !== 'home' && (
                      <X
                        size={13}
                        className="ib-x"
                        onClick={(e) => {
                          e.stopPropagation();
                          close(w.id);
                        }}
                      />
                    )}
                  </button>
                ))}
              </>
            )}
            {shortcuts.map((s, i) => {
              if (s.head === undefined && !allowCmd(s.cmd)) return null; // not for this user
              if (s.head !== undefined)
                return (
                  <div key={s.id || 'h' + i} className="ib-head" onContextMenu={(e) => ctx.show(e, shortcutMenu(i))}>
                    {s.head}
                  </div>
                );
              const Icon = iconOf(s.icon);
              return (
                <button
                  key={s.id || i}
                  className={'ib-item' + (isOn(s.cmd || {}) ? ' on' : '')}
                  title={s.label}
                  onClick={() => {
                    setDrawer(false);
                    run(s.cmd);
                  }}
                  onContextMenu={(e) => ctx.show(e, shortcutMenu(i))}
                >
                  <Icon size={16} />
                  {!iconCollapsed && <span>{s.label}</span>}
                </button>
              );
            })}
          </div>
          <div className="iconbar-foot">
            <button
              className="icon-btn"
              onClick={() => {
                setDrawer(false);
                setScEdit({});
              }}
              title="Customize shortcuts"
            >
              <Settings2 size={16} />
            </button>
            <button className="icon-btn" onClick={() => setCollapsed((c) => !c)} title="Collapse icon bar">
              {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            </button>
          </div>
        </aside>
        {drawer && <div className="drawer-bg" onClick={() => setDrawer(false)} />}

        <section className="workspace">
          <div className="wtabs" role="tablist">
            {windows.map((w) => (
              <div
                key={w.id}
                role="tab"
                aria-selected={w.id === activeId}
                className={'wtab' + (w.id === activeId ? ' on' : '')}
                onMouseDown={(e) => {
                  if (e.button === 1 && w.id !== 'home') {
                    e.preventDefault();
                    close(w.id);
                  } else focus(w.id);
                }}
                onContextMenu={(e) =>
                  ctx.show(e, [
                    { label: `Add "${w.title}" to Shortcuts`, onClick: () => addWindowShortcut(w) },
                    { label: 'Close', disabled: w.id === 'home', onClick: () => close(w.id) },
                  ])
                }
                title={w.title}
              >
                <span>{w.title}</span>
                {w.id !== 'home' && (
                  <button
                    className="icon-btn"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => close(w.id)}
                    title="Close (Esc)"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="wtab-content">
            {windows.map((w) => (
              <WindowHost key={w.id + ':' + w.nonce} win={w} active={w.id === activeId} />
            ))}
          </div>
        </section>
      </div>

      <footer className="statusbar">
        <span>
          <b>{company.name}</b>
        </span>
        <span>{fmtDate(today(), 'LONG')}</span>
        <span>
          <kbd className="kbd">F1</kbd> Shortcuts &nbsp; <kbd className="kbd">Ctrl+I</kbd> Invoice &nbsp; <kbd className="kbd">Alt+Shift+B</kbd> Bill &nbsp;{' '}
          <kbd className="kbd">Esc</kbd> Close
        </span>
        <span className="sp">
          {store.sheetUrl
            ? 'Google Sheets · ' + (sync.last ? 'last sync ' + new Date(sync.last).toLocaleTimeString() : 'not synced yet')
            : 'Saved on this computer · Google Sheets not connected'}
        </span>
      </footer>
      <input ref={fileRef} type="file" accept=".json" hidden onChange={onRestore} />
      {ctx.node}
      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
      {fpOpen && <FingerprintSetup onClose={() => setFpOpen(false)} />}
      {scEdit && (
        <CustomizeShortcuts
          value={shortcuts}
          focusIndex={scEdit.focusIndex}
          startAdding={scEdit.startAdding}
          onClose={() => setScEdit(null)}
          onSave={(list) => {
            saveShortcuts(list);
            setScEdit(null);
            dlg.toast('Shortcuts saved');
          }}
        />
      )}
    </div>
  );
}

// memo: switching windows only re-renders the two whose visibility changed, not every open window
const WindowHost = memo(function WindowHost({ win, active }) {
  const Comp = WINDOW_COMPONENTS[win.type];
  const me = useMemo(() => ({ id: win.id }), [win.id]);
  return (
    <div className="win-host" hidden={!active}>
      <ErrorBoundary>
        <ThisWindowProvider value={me}>{Comp ? <Comp {...win.props} winId={win.id} active={active} /> : <div className="pad">Unknown window</div>}</ThisWindowProvider>
      </ErrorBoundary>
    </div>
  );
});
