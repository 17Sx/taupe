// Processus principal de l'application Taupe (Electron).
// Le moteur (scan + API) tourne dans un processus séparé (worker.mjs) pour garder la fenêtre fluide ;
// il demande ici les actions natives : corbeille, Finder/Explorateur, Quick Look, sélecteur de dossier.
import { app, BrowserWindow, Menu, shell, dialog, utilityProcess, nativeTheme } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const IS_MAC = process.platform === 'darwin';
const REPO = 'https://github.com/17Sx/taupe';

app.setName('Taupe');
if (!app.requestSingleInstanceLock()) app.quit();

let win = null, worker = null, serverUrl = null, quitting = false;

// Réglages persistants (apparence…)
const SETTINGS = () => path.join(app.getPath('userData'), 'settings.json');
const loadSettings = () => { try { return JSON.parse(fs.readFileSync(SETTINGS(), 'utf8')); } catch { return {}; } };
const saveSettings = s => { try { fs.writeFileSync(SETTINGS(), JSON.stringify(s, null, 2)); } catch {} };
const settings = loadSettings();
function setTheme(mode) {
  nativeTheme.themeSource = mode;
  settings.theme = mode; saveSettings(settings);
  win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0b0b0b' : '#ffffff');
  buildMenu();
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
    if (IS_MAC && win) return win.previewFile(p); // vrai Quick Look
    const err = await shell.openPath(p); if (err) throw new Error(err);
  },
  openExternal: url => (/^https?:\/\//.test(url) ? shell.openExternal(url) : null),
  async pickFolder() {
    const r = await dialog.showOpenDialog(win, { title: 'Choisir un dossier à analyser', buttonLabel: 'Analyser', properties: ['openDirectory', 'showHiddenFiles'] });
    return r.canceled ? null : r.filePaths[0];
  },
};

function startWorker() {
  return new Promise((resolve, reject) => {
    worker = utilityProcess.fork(path.join(DIR, 'worker.mjs'), [], {
      serviceName: 'Taupe Engine',
      execArgv: ['--max-old-space-size=8192'],
      env: { ...process.env, UV_THREADPOOL_SIZE: '32', TAUPE_VERSION: app.getVersion() },
      stdio: 'inherit',
    });
    worker.on('message', async msg => {
      if (msg?.type === 'ready') return resolve(msg.url);
      if (msg?.type === 'action' && ACTIONS[msg.name]) {
        let result = null, error = null;
        try { result = await ACTIONS[msg.name](...msg.args); } catch (e) { error = e.message; }
        worker.postMessage({ type: 'result', id: msg.id, result: result ?? null, error });
      }
    });
    worker.on('exit', code => {
      if (!serverUrl) return reject(new Error(`moteur arrêté (code ${code})`));
      if (quitting) return;
      dialog.showErrorBox('Taupe', 'Le moteur d’analyse s’est arrêté (mémoire insuffisante ?). L’application va redémarrer.');
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
  // Jamais de navigation hors de l'app : les liens externes s'ouvrent dans le navigateur
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(serverUrl)) e.preventDefault(); });
  win.on('closed', () => { win = null; });
  win.loadURL(serverUrl);
}

const ui = js => () => win?.webContents.executeJavaScript(`window.taupe && window.taupe.${js}`).catch(() => {});
function buildMenu() {
  const template = [
    ...(IS_MAC ? [{ role: 'appMenu' }] : []),
    { label: 'Fichier', submenu: [
      { label: 'Analyser un dossier…', accelerator: 'CmdOrCtrl+O', click: ui('pick()') },
      { label: 'Rescanner ce dossier', accelerator: 'CmdOrCtrl+Shift+R', click: ui('rescan()') },
      { type: 'separator' },
      IS_MAC ? { role: 'close', label: 'Fermer la fenêtre' } : { role: 'quit', label: 'Quitter' },
    ] },
    { role: 'editMenu', label: 'Édition' },
    { label: 'Présentation', submenu: [
      { label: 'Afficher / masquer l’assistant', accelerator: 'CmdOrCtrl+J', click: ui('toggleChat()') },
      { label: 'Apparence', submenu: [['system', 'Comme le système'], ['light', 'Clair'], ['dark', 'Sombre']].map(([id, label]) =>
        ({ label, type: 'radio', checked: (settings.theme || 'system') === id, click: () => setTheme(id) })) },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Taille réelle' }, { role: 'zoomIn', label: 'Zoom avant' }, { role: 'zoomOut', label: 'Zoom arrière' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Plein écran' },
      ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }]),
    ] },
    { role: 'windowMenu', label: 'Fenêtre' },
    { role: 'help', label: 'Aide', submenu: [
      { label: 'Taupe sur GitHub', click: () => shell.openExternal(REPO) },
      { label: 'Signaler un problème', click: () => shell.openExternal(`${REPO}/issues`) },
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
  try { serverUrl = await startWorker(); }
  catch (e) { dialog.showErrorBox('Taupe', `Impossible de démarrer le moteur : ${e.message}`); app.quit(); return; }
  createWindow();
});
