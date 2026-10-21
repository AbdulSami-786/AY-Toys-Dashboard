// AY Toys desktop app (Electron). Shows the built app (dist/) in its own window, from a private app:// address,
// so it starts without internet and keeps its books in one place on this computer. Syncing with the Google Sheet
// is done by the app itself, exactly as in a browser.
const { app, BrowserWindow, Menu, protocol, net, shell, screen, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const HOST = 'ay-toys';
// tests point the app at another build with AY_DIST; the installed app uses its own copy
const DIST = process.env.AY_DIST ? path.resolve(process.env.AY_DIST) : path.join(__dirname, '..', 'dist');
const HIDDEN = process.env.AY_HIDDEN === '1';

// app:// behaves like a normal secure web address (database, clipboard, fetch to the Google Sheet)
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

// tests run a separate profile so they never touch the real books (set first: the one-copy lock below
// belongs to the profile, so a test copy never hands over to the installed program)
if (process.env.AY_PROFILE) app.setPath('userData', path.resolve(process.env.AY_PROFILE));

// one AY Toys at a time: a second start just brings the open window to the front
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;
const stateFile = () => path.join(app.getPath('userData'), 'window.json');

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const visible = screen.getAllDisplays().some((d) => s.x >= d.workArea.x - 50 && s.y >= d.workArea.y - 50 && s.x < d.workArea.x + d.workArea.width && s.y < d.workArea.y + d.workArea.height);
    return visible ? s : { width: s.width, height: s.height, maximized: s.maximized };
  } catch {
    return { width: 1366, height: 860, maximized: true };
  }
}
function saveState() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch {
    /* not important */
  }
}

function serveFiles() {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(DIST, rel));
    // only files of the app itself
    if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (rel.startsWith('/assets/')) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(path.join(DIST, 'index.html')).toString()); // the app has a single page
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    width: st.width || 1366,
    height: st.height || 860,
    x: st.x,
    y: st.y,
    minWidth: 360,
    minHeight: 480,
    show: false,
    title: 'AY Toys',
    backgroundColor: '#e9edf1',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, devTools: !app.isPackaged || process.env.AY_DEVTOOLS === '1' },
  });
  win.removeMenu();
  if (st.maximized) win.maximize();
  win.once('ready-to-show', () => {
    if (!HIDDEN) win.show();
  });
  // links to other sites (Google Sheet, WhatsApp, sheets.new…) open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto|tel|whatsapp):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${SCHEME}://${HOST}/`)) {
      e.preventDefault();
      if (/^(https?|mailto|tel|whatsapp):/i.test(url)) shell.openExternal(url);
    }
  });
  // right-click: cut / copy / paste in text boxes
  win.webContents.on('context-menu', (_e, p) => {
    if (!p.isEditable && !p.selectionText) return;
    Menu.buildFromTemplate([
      { role: 'cut', enabled: p.isEditable && !!p.selectionText },
      { role: 'copy', enabled: !!p.selectionText },
      { role: 'paste', enabled: p.isEditable },
      { type: 'separator' },
      { role: 'selectAll' },
    ]).popup();
  });
  // Ctrl+Shift+I opens the developer tools (for support); Ctrl +/-/0 zoom (F11 is the app's own Full Screen)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    // developer tools only when running from the source (npm run app), never in the installed program
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      if (!app.isPackaged) win.webContents.toggleDevTools();
    }
    else if (input.control && (input.key === '=' || input.key === '+')) win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5);
    else if (input.control && input.key === '-') win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5);
    else if (input.control && input.key === '0') win.webContents.setZoomLevel(0);
    else return;
    e.preventDefault();
  });
  win.on('close', saveState);
  win.on('closed', () => {
    win = null;
  });
  win.loadURL(`${SCHEME}://${HOST}/`);
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.aytoys.accounting');
  serveFiles();
  createWindow();
  // Chromium writes the small settings store (shop list, changes waiting to upload) to disk lazily; write it
  // often, so a crash or power cut cannot lose it (the books themselves are in the database and safe)
  setInterval(() => {
    try {
      session.defaultSession.flushStorageData();
    } catch {
      /* ignore */
    }
  }, 1500);
});

app.on('before-quit', () => {
  try {
    session.defaultSession.flushStorageData();
  } catch {
    /* ignore */
  }
});

app.on('window-all-closed', () => app.quit());
