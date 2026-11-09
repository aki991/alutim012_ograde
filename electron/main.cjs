'use strict';
const { app, BrowserWindow, Menu, ipcMain, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const config = require('./config.json');

const TITLE = 'ALU TIM 012 – Ograde';
const DIST = path.join(__dirname, '..', 'dist');
const DEV_URL = !app.isPackaged ? process.env.VITE_DEV_SERVER_URL : undefined;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

// jedna instanca: drugo pokretanje samo fokusira postojeći prozor
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// "app" je standardna, bezbedna šema: stabilan origin (app://app) za localStorage/IndexedDB
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// ---------- log (greške ažuriranja se samo upisuju u fajl, ne prikazuju) ----------
function log(...parts) {
  try {
    const text = parts.map((p) => (p instanceof Error ? p.stack || p.message : String(p))).join(' ');
    fs.appendFileSync(path.join(app.getPath('userData'), 'main.log'), `${new Date().toISOString()} ${text}\n`);
  } catch {
    /* ignoriši */
  }
}

// ---------- pozicija i veličina prozora ----------
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (s && Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
  } catch {
    /* prvo pokretanje */
  }
  return { width: 1366, height: 860 };
}
function saveState(win) {
  try {
    const maximized = win.isMaximized();
    const b = maximized ? win.getNormalBounds() : win.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized }));
  } catch {
    /* ignoriši */
  }
}

// ---------- app:// protokol: servira dist/ uz SPA fallback i prosleđuje /api na server ----------
function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const origin = String(config.apiOrigin || process.env.ALUTIM_API_ORIGIN || '').replace(/\/$/, '');
      if (!origin) {
        return new Response(JSON.stringify({ error: 'API adresa nije podešena (electron/config.json).' }), { status: 503, headers: { 'content-type': 'application/json' } });
      }
      try {
        return await net.fetch(origin + url.pathname + url.search, { method: request.method, headers: request.headers, body: request.body, duplex: 'half' });
      } catch (e) {
        log('api proxy', e);
        return new Response(JSON.stringify({ error: 'Nema veze sa serverom.' }), { status: 502, headers: { 'content-type': 'application/json' } });
      }
    }
    let rel;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    let file = path.normalize(path.join(DIST, rel));
    if (file !== DIST && !file.startsWith(DIST + path.sep)) return new Response('Forbidden', { status: 403 });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // fajl sa nastavkom koji ne postoji je greška; sve ostalo su rute aplikacije
      if (path.extname(rel)) return new Response('Not found', { status: 404 });
      file = path.join(DIST, 'index.html');
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

// ---------- prozor ----------
let mainWindow = null;
let pendingUpdate = null;

function createWindow() {
  const state = loadState();
  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 900,
    minHeight: 600,
    title: TITLE,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (state.maximized) mainWindow.maximize();

  // naslov ostaje isti bez obzira na <title> stranice
  mainWindow.on('page-title-updated', (e) => e.preventDefault());
  mainWindow.on('close', () => saveState(mainWindow));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // spoljašnji linkovi idu u pregledač, ne u prozor aplikacije
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const internal = url.startsWith('app://app/') || (DEV_URL && url.startsWith(DEV_URL));
    if (!internal) {
      e.preventDefault();
      if (/^https?:/i.test(url)) void shell.openExternal(url);
    }
  });

  void mainWindow.loadURL(DEV_URL || 'app://app/');
}

// ---------- automatsko ažuriranje ----------
function setupUpdater() {
  if (!app.isPackaged) {
    ipcMain.handle('update:install', () => undefined);
    return;
  }
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // "Kasnije" => instalira se pri zatvaranju
  const toLog = (m) => log('updater', m);
  autoUpdater.logger = { info: toLog, warn: toLog, error: toLog, debug: () => {} };

  autoUpdater.on('update-downloaded', (info) => {
    pendingUpdate = { version: info.version };
    mainWindow?.webContents.send('update:downloaded', pendingUpdate);
  });
  autoUpdater.on('error', (e) => log('update error', e));

  const check = () => {
    autoUpdater.checkForUpdates().catch((e) => log('check failed', e));
  };
  check();
  setInterval(check, CHECK_EVERY_MS);

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall(true, true); // tiho: bez čarobnjaka, aplikacija se sama ponovo pokrene
  });
}

ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('update:pending', () => pendingUpdate);

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerAppProtocol();
  createWindow();
  setupUpdater();
});

app.on('window-all-closed', () => app.quit());
