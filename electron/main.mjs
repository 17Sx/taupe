// Main process of the Taupe desktop app (Electron).
// The engine (scan + local API) runs in a separate utility process (worker.mjs) so the window stays
// smooth; it asks this process for native actions: Trash, Finder/Explorer, Quick Look, folder picker.
import { app, BrowserWindow, Menu, shell, dialog, utilityProcess, nativeTheme, session } from 'electron';
import { FULL_DISK_ACCESS_PANE } from '../src/platform.mjs';
import { setupUpdates } from './updater.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const IS_MAC = process.platform === 'darwin';
// Public page (installers, issues) while the source repository is private
const REPO = 'https://github.com/17Sx/taupe-releases';

app.setName('Taupe');
if (!app.requestSingleInstanceLock()) app.quit();

let win = null, worker = null, serverUrl = null, quitting = false, updates = null;

// Persistent settings (appearance, language)
const SETTINGS = () => path.join(app.getPath('userData'), 'settings.json');
const loadSettings = () => { try { return JSON.parse(fs.readFileSync(SETTINGS(), 'utf8')); } catch { return {}; } };
const saveSettings = s => { try { fs.writeFileSync(SETTINGS(), JSON.stringify(s, null, 2)); } catch {} };
const settings = loadSettings();

// ---------- Language: system language by default, or the one picked in View → Language ----------
const MSG = {
  fr: {
    file: 'Fichier', scan: 'Analyser un dossier…', rescan: 'Rescanner ce dossier', close: 'Fermer la fenêtre', quit: 'Quitter',
    edit: 'Édition', view: 'Présentation', assistant: 'Afficher / masquer l’assistant', appearance: 'Apparence',
    system: 'Comme le système', light: 'Clair', dark: 'Sombre', language: 'Langue',
    reset: 'Taille réelle', zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière', fullscreen: 'Plein écran',
    window: 'Fenêtre', help: 'Aide', tour: 'Revoir la présentation', github: 'Taupe sur GitHub', issue: 'Signaler un problème',
    pickTitle: 'Choisir un dossier à analyser', pickButton: 'Analyser',
    engineTimeout: 'le moteur ne répond pas (20 s)', engineExit: 'moteur arrêté (code {code})',
    engineCrash: 'Le moteur d’analyse s’est arrêté (mémoire insuffisante ?). L’application va redémarrer.',
    engineFail: 'Impossible de démarrer le moteur : {msg}',
    updCheck: 'Rechercher des mises à jour…', updAuto: 'Rechercher automatiquement les mises à jour',
    updAvailable: 'Taupe {v} est disponible.', updManual: 'Télécharge-la depuis la page des versions, puis remplace l’application.',
    updDownload: 'Télécharger', updLater: 'Plus tard', updDownloading: 'Taupe {v} est disponible : téléchargement en cours. Tu seras prévenu quand elle sera prête.',
    updLatest: 'Taupe est à jour (version {v}).', updReady: 'Taupe {v} est prête à être installée.',
    updReadyDetail: 'Taupe va redémarrer pour l’installer. Sinon, elle sera installée la prochaine fois que tu quitteras Taupe.',
    updRestart: 'Redémarrer', updError: 'Impossible de vérifier les mises à jour.',
    updOff: 'Les mises à jour ne sont disponibles que dans l’application installée.',
  },
  en: {
    file: 'File', scan: 'Scan a Folder…', rescan: 'Rescan This Folder', close: 'Close Window', quit: 'Quit',
    edit: 'Edit', view: 'View', assistant: 'Show / Hide Assistant', appearance: 'Appearance',
    system: 'Same as System', light: 'Light', dark: 'Dark', language: 'Language',
    reset: 'Actual Size', zoomIn: 'Zoom In', zoomOut: 'Zoom Out', fullscreen: 'Full Screen',
    window: 'Window', help: 'Help', tour: 'Show the Welcome Tour', github: 'Taupe on GitHub', issue: 'Report an Issue',
    pickTitle: 'Choose a folder to scan', pickButton: 'Scan',
    engineTimeout: 'the engine is not responding (20 s)', engineExit: 'engine stopped (code {code})',
    engineCrash: 'The scan engine stopped (out of memory?). The app will restart.',
    engineFail: 'Could not start the engine: {msg}',
    updCheck: 'Check for Updates…', updAuto: 'Check for Updates Automatically',
    updAvailable: 'Taupe {v} is available.', updManual: 'Download it from the releases page, then replace the app.',
    updDownload: 'Download', updLater: 'Later', updDownloading: 'Taupe {v} is available and downloading. You will be told when it is ready.',
    updLatest: 'Taupe is up to date (version {v}).', updReady: 'Taupe {v} is ready to install.',
    updReadyDetail: 'Taupe will restart to install it. Otherwise it is installed the next time you quit Taupe.',
    updRestart: 'Restart', updError: 'Could not check for updates.',
    updOff: 'Updates are only available in the installed app.',
  },
};
function lang() {
  if (settings.lang === 'fr' || settings.lang === 'en') return settings.lang;
  const sys = app.getPreferredSystemLanguages?.()[0] || app.getLocale() || 'en';
  return sys.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
const T = (k, v = {}) => MSG[lang()][k].replace(/\{(\w+)\}/g, (m, x) => v[x] ?? m);
const appUrl = () => `${serverUrl}?lang=${lang()}`;
function setLang(mode) {
  settings.lang = mode; saveSettings(settings);
  buildMenu();
  win?.loadURL(appUrl());
}

function setTheme(mode) {
  nativeTheme.themeSource = mode;
  settings.theme = mode; saveSettings(settings);
  win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0b0b0b' : '#ffffff');
  buildMenu();
}

function setAutoUpdate(on) {
  settings.autoUpdate = on; saveSettings(settings);
  updates?.schedule();
}

const ACTIONS = {
  async trash(paths) {
    const errors = {};
    for (const p of paths) { try { await shell.trashItem(p); } catch (e) { errors[p] = e.message; } }
    return errors;
  },
  reveal: p => { shell.showItemInFolder(p); },
  async open(p) { const err = await shell.openPath(p); if (err) throw new Error(err); },
  async quicklook(p) {
    if (IS_MAC && win) return win.previewFile(p); // real Quick Look
    const err = await shell.openPath(p); if (err) throw new Error(err);
  },
  openExternal: url => (/^https?:\/\//.test(url) ? shell.openExternal(url) : null),
  openPrivacySettings: () => (IS_MAC ? shell.openExternal(FULL_DISK_ACCESS_PANE) : null), // fixed URL, no input
  async pickFolder() {
    const r = await dialog.showOpenDialog(win, { title: T('pickTitle'), buttonLabel: T('pickButton'), properties: ['openDirectory', 'showHiddenFiles'] });
    return r.canceled ? null : r.filePaths[0];
  },
};

function startWorker() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(T('engineTimeout'))), 20000);
    worker = utilityProcess.fork(path.join(DIR, 'worker.mjs'), [], {
      serviceName: 'Taupe Engine',
      execArgv: ['--max-old-space-size=8192'],
      env: { ...process.env, UV_THREADPOOL_SIZE: '32', TAUPE_VERSION: app.getVersion(), TAUPE_PORT: String(settings.port || 0) },
      stdio: 'inherit',
    });
    worker.on('message', async msg => {
      if (msg?.type === 'ready') { clearTimeout(timeout); return resolve(msg); }
      if (msg?.type === 'action' && typeof msg.name === 'string' && Object.hasOwn(ACTIONS, msg.name)) {
        let result = null, error = null;
        try { result = await ACTIONS[msg.name](...msg.args); } catch (e) { error = e.message; }
        worker.postMessage({ type: 'result', id: msg.id, result: result ?? null, error });
      }
    });
    worker.on('exit', code => {
      if (!serverUrl) return reject(new Error(T('engineExit', { code })));
      if (quitting) return;
      dialog.showErrorBox('Taupe', T('engineCrash'));
      app.relaunch(); app.exit(0);
    });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1380, height: 880, minWidth: 900, minHeight: 600, show: false, title: 'Taupe',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0b0b' : '#ffffff',
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    autoHideMenuBar: !IS_MAC,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  setTimeout(() => { if (win && !win.isVisible()) win.show(); }, 4000); // safety net
  // Never navigate away from the app: external links open in the browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(serverUrl)) e.preventDefault(); });
  win.on('closed', () => { win = null; });
  win.loadURL(appUrl());
}

const ui = js => () => win?.webContents.executeJavaScript(`window.taupe && window.taupe.${js}`).catch(() => {});
function buildMenu() {
  const radio = (items, current, onPick) => items.map(([id, label]) => ({ label, type: 'radio', checked: current === id, click: () => onPick(id) }));
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    ...(IS_MAC ? [/** @type {const} */ ({ role: 'appMenu' })] : []),
    { label: T('file'), submenu: [
      { label: T('scan'), accelerator: 'CmdOrCtrl+O', click: ui('pick()') },
      { label: T('rescan'), accelerator: 'CmdOrCtrl+Shift+R', click: ui('rescan()') },
      { type: 'separator' },
      IS_MAC ? { role: 'close', label: T('close') } : { role: 'quit', label: T('quit') },
    ] },
    { role: 'editMenu', label: T('edit') },
    { label: T('view'), submenu: [
      { label: T('assistant'), accelerator: 'CmdOrCtrl+J', click: ui('toggleChat()') },
      { label: T('appearance'), submenu: radio([['system', T('system')], ['light', T('light')], ['dark', T('dark')]], settings.theme || 'system', setTheme) },
      { label: T('language'), submenu: radio([['system', T('system')], ['fr', 'Français'], ['en', 'English']], settings.lang || 'system', setLang) },
      { type: 'separator' },
      { role: 'resetZoom', label: T('reset') }, { role: 'zoomIn', label: T('zoomIn') }, { role: 'zoomOut', label: T('zoomOut') },
      { type: 'separator' },
      { role: 'togglefullscreen', label: T('fullscreen') },
      ...(app.isPackaged ? [] : /** @type {const} */ ([{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }])),
    ] },
    { role: 'windowMenu', label: T('window') },
    { role: 'help', label: T('help'), submenu: [
      { label: T('tour'), click: ui('onboarding()') },
      { type: 'separator' },
      { label: T('updCheck'), click: () => updates?.check() },
      { label: T('updAuto'), type: 'checkbox', checked: settings.autoUpdate !== false, click: m => setAutoUpdate(m.checked) },
      { type: 'separator' },
      { label: T('github'), click: () => shell.openExternal(REPO) },
      { label: T('issue'), click: () => shell.openExternal(`${REPO}/issues`) },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('activate', () => { if (!win && serverUrl) createWindow(); });
app.on('window-all-closed', () => { if (!IS_MAC) app.quit(); });
app.on('before-quit', () => { quitting = true; worker?.kill(); });

app.whenReady().then(async () => {
  if (['light', 'dark'].includes(settings.theme)) nativeTheme.themeSource = settings.theme;
  buildMenu();
  let token;
  try { ({ url: serverUrl, token } = await startWorker()); }
  catch (e) { dialog.showErrorBox('Taupe', T('engineFail', { msg: e.message })); app.quit(); return; }
  // Keep this port for the next launches (stable origin → the page's localStorage is kept)
  const port = Number(new URL(serverUrl).port);
  if (settings.port !== port) { settings.port = port; saveSettings(settings); }
  // Anti-CSRF token: added to the window's requests to the engine, never written into the page,
  // so a local process that reads http://127.0.0.1:<port>/ does not get it.
  session.defaultSession.webRequest.onBeforeSendHeaders((d, cb) => {
    if (d.url.startsWith(serverUrl)) d.requestHeaders['x-token'] = token;
    cb({ requestHeaders: d.requestHeaders });
  });
  createWindow();
  updates = setupUpdates({ T, getWin: () => win, auto: () => settings.autoUpdate !== false });
});
