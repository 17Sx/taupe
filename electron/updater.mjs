// Automatic updates (electron-updater), from the public releases repository (see update-mode.mjs).
// The only network request Taupe makes on its own: reading the latest version number on GitHub.
// It can be switched off in Help → Check for Updates Automatically.
import { app, dialog, shell } from 'electron';
import { execFile } from 'node:child_process';
import path from 'node:path';
import updater from 'electron-updater';
import { updateMode, isDeveloperId, DOWNLOAD_URL, CHECK_EVERY_MS } from './update-mode.mjs';

const { autoUpdater } = updater;

// Squirrel.Mac only installs updates into an app signed with a Developer ID (not an ad-hoc signature)
function macSigned() {
  const bundle = path.resolve(path.dirname(app.getPath('exe')), '..', '..'); // …/Taupe.app
  return new Promise(resolve => execFile('/usr/bin/codesign', ['-dv', '--verbose=2', bundle], { timeout: 10000 },
    (e, out, err) => resolve(!e && isDeveloperId(err))));
}

/**
 * @param {{ T: (k: string, v?: object) => string, getWin: () => Electron.BrowserWindow | null, auto: () => boolean }} o
 * T: menu translations; auto(): whether automatic checks are on (setting).
 */
export function setupUpdates({ T, getWin, auto }) {
  let mode = null, manual = false, timer = null;
  const asked = new Set(); // versions already offered this session: never ask twice
  const box = opts => {
    const win = getWin();
    return win ? dialog.showMessageBox(win, { title: 'Taupe', ...opts }) : dialog.showMessageBox({ title: 'Taupe', ...opts });
  };

  const ready = (async () => {
    mode = updateMode({
      packaged: app.isPackaged, platform: process.platform,
      signed: process.platform === 'darwin' && app.isPackaged ? await macSigned() : false,
      portable: !!process.env.PORTABLE_EXECUTABLE_FILE, // set by the Windows portable launcher
    });
    autoUpdater.autoDownload = mode === 'install';
    autoUpdater.autoInstallOnAppQuit = mode === 'install';
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = null;
  })();

  autoUpdater.on('update-available', async info => {
    if (mode === 'install') { if (manual) box({ type: 'info', message: T('updDownloading', { v: info.version }) }); return; }
    if (asked.has(info.version) && !manual) return;
    asked.add(info.version);
    const r = await box({ type: 'info', message: T('updAvailable', { v: info.version }), detail: T('updManual'),
      buttons: [T('updDownload'), T('updLater')], defaultId: 0, cancelId: 1 });
    if (r.response === 0) shell.openExternal(DOWNLOAD_URL);
  });
  autoUpdater.on('update-not-available', () => {
    if (manual) box({ type: 'info', message: T('updLatest', { v: app.getVersion() }) });
  });
  autoUpdater.on('update-downloaded', async info => {
    if (asked.has(info.version)) return;
    asked.add(info.version);
    const r = await box({ type: 'info', message: T('updReady', { v: info.version }), detail: T('updReadyDetail'),
      buttons: [T('updRestart'), T('updLater')], defaultId: 0, cancelId: 1 });
    if (r.response === 0) setImmediate(() => autoUpdater.quitAndInstall());
  });
  autoUpdater.on('error', e => {
    if (manual) box({ type: 'warning', message: T('updError'), detail: String(e?.message || e).split('\n')[0] });
    else console.warn('[updates]', e?.message || e);
  });

  async function check(byUser = false) {
    await ready;
    if (mode === 'off') {
      if (byUser) box({ type: 'info', message: T('updOff') });
      return;
    }
    manual = byUser;
    try { await autoUpdater.checkForUpdates(); } catch {} // reported by the 'error' event
    finally { if (!byUser) manual = false; }
  }

  // Automatic checks: shortly after launch, then every few hours
  function schedule() {
    clearTimeout(timer); clearInterval(timer); timer = null;
    if (!auto()) return;
    timer = setTimeout(() => { check(); timer = setInterval(() => check(), CHECK_EVERY_MS); }, 15000);
  }
  schedule();

  return { check: () => check(true), schedule };
}
