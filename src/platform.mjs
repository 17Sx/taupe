// Tout ce qui dépend du système d'exploitation est ici.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFile, spawn } from 'node:child_process';

export const PLATFORM = process.platform; // 'darwin' | 'win32' | 'linux'
export const IS_MAC = PLATFORM === 'darwin';
export const IS_WIN = PLATFORM === 'win32';
export const HOME = os.homedir();
const norm = p => (IS_WIN ? p.toLowerCase() : p);

// Taille réellement occupée sur disque. Windows n'expose pas les blocs : on prend la taille logique.
export const diskSize = st => (IS_WIN || !Number.isFinite(st.blocks) ? st.size : st.blocks * 512);

// Dossiers jamais traversés (autres volumes, pseudo-FS, doublons APFS du volume Data)
export const SKIP_DIRS = new Set((IS_WIN
  ? ['C:\\System Volume Information', 'C:\\$Recycle.Bin\\S-1-5-18']
  : ['/dev', '/Volumes', '/System/Volumes', '/net', '/home', '/.vol', '/.nofollow', '/.resolve', '/proc', '/sys', '/run', '/mnt', '/media']
).map(norm));
export const isSkipped = p => SKIP_DIRS.has(norm(p));

// Chemins qu'on refuse toujours de mettre à la corbeille
const H = (...p) => path.join(HOME, ...p);
const PROTECTED_EXACT = new Set((IS_WIN
  ? ['C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData', 'C:\\Users', HOME, H('AppData'), H('AppData', 'Local'), H('AppData', 'Roaming'),
    H('Desktop'), H('Documents'), H('Downloads'), H('Pictures'), H('Music'), H('Videos'), H('OneDrive')]
  : ['/', HOME, '/Applications', '/Users', '/Library', '/private', '/etc', '/var', '/opt', '/cores', '/Volumes', '/home', '/root',
    H('Library'), H('Desktop'), H('Documents'), H('Downloads'), H('Pictures'), H('Music'), H('Movies')]
).map(norm));
const PROTECTED_PREFIX = (IS_WIN
  ? ['C:\\Windows\\']
  : ['/System/', '/usr/', '/bin/', '/sbin/', '/boot/', '/proc/', '/sys/', '/dev/']
).map(norm);
export function isProtected(p) {
  const n = norm(path.resolve(p));
  if (PROTECTED_EXACT.has(n)) return true;
  if (IS_WIN && /^[a-z]:\\?$/.test(n)) return true; // racine d'un lecteur
  return PROTECTED_PREFIX.some(x => n === x.replace(/[\\/]$/, '') || n.startsWith(x));
}

export function expand(p) {
  p = String(p ?? '').trim();
  if (!p || p === '~') return HOME;
  if (p.startsWith('~/') || p.startsWith('~\\')) p = path.join(HOME, p.slice(2));
  if (IS_WIN && /^[a-z]:$/i.test(p)) p += '\\';
  return path.resolve(p);
}

// Raccourcis proposés sur l'écran d'accueil
export function places() {
  if (IS_WIN) {
    const drives = [];
    for (const l of 'CDEFGH') { try { fs.accessSync(`${l}:\\`); drives.push(`${l}:\\`); } catch {} }
    return [
      { path: HOME, icon: 'home', label: 'Dossier perso', hint: HOME },
      ...drives.map(d => ({ path: d, icon: 'disk', label: `Disque ${d.slice(0, 2)}`, hint: 'tout le disque' })),
      { path: H('Downloads'), icon: 'download', label: 'Téléchargements', hint: 'Downloads' },
    ].slice(0, 5);
  }
  return [
    { path: HOME, icon: 'home', label: 'Dossier perso', hint: '~ — le plus utile' },
    { path: '/', icon: 'disk', label: 'Disque entier', hint: IS_MAC ? '/ — tout le Mac' : '/' },
    ...(IS_MAC ? [{ path: '/Applications', icon: 'apps', label: 'Applications', hint: '/Applications' }] : []),
    { path: H('Downloads'), icon: 'download', label: 'Téléchargements', hint: '~/Downloads' },
  ];
}

// ---------- Actions système de secours (mode développement sans Electron) ----------
// Dans l'application, Electron fournit ses propres actions natives (shell.trashItem, etc.).
const run = (cmd, args, opts = {}) => new Promise((res, rej) =>
  execFile(cmd, args, { timeout: 120000, ...opts }, (e, out, err) => (e ? rej(new Error(String(err || e.message).trim())) : res(out))));

export const fallbackActions = {
  async trash(paths) {
    const errors = {};
    if (IS_WIN) {
      // Corbeille Windows via l'API VisualBasic ; les chemins passent par une variable d'environnement (pas d'injection possible)
      const ps = `Add-Type -AssemblyName Microsoft.VisualBasic
$ErrorActionPreference = 'Continue'
foreach ($p in ($env:TAUPE_PATHS | ConvertFrom-Json)) {
  try {
    if (Test-Path -LiteralPath $p -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }
    else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }
  } catch { Write-Error "$p :: $($_.Exception.Message)" }
}`;
      try { await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { env: { ...process.env, TAUPE_PATHS: JSON.stringify(paths) } }); }
      catch (e) { for (const p of paths) errors[p] = e.message; }
      return errors;
    }
    for (const p of paths) {
      try {
        if (IS_MAC) {
          if (fs.existsSync('/usr/bin/trash')) await run('/usr/bin/trash', [p]);
          else await run('osascript', ['-e', 'on run argv', '-e', 'tell application "Finder" to delete (POSIX file (item 1 of argv))', '-e', 'end run', p]);
        } else await run('gio', ['trash', p]);
      } catch (e) { errors[p] = e.message; }
    }
    return errors;
  },
  reveal: p => (IS_MAC ? run('open', ['-R', p]) : IS_WIN ? explorer(`/select,"${p}"`) : run('xdg-open', [path.dirname(p)])),
  open: p => (IS_MAC ? run('open', [p]) : IS_WIN ? explorer(`"${p}"`) : run('xdg-open', [p])),
  quicklook: p => {
    if (!IS_MAC) return fallbackActions.open(p);
    spawn('qlmanage', ['-p', p], { detached: true, stdio: 'ignore' }).unref();
  },
  openExternal: url => (IS_MAC ? run('open', [url]) : IS_WIN ? run('cmd.exe', ['/c', 'start', '""', url]) : run('xdg-open', [url])),
  pickFolder: async () => null, // pas de sélecteur natif hors de l'application
};
// explorer.exe renvoie un code d'erreur même quand tout va bien : on l'ignore.
function explorer(arg) {
  spawn('explorer.exe', [arg], { windowsVerbatimArguments: true, detached: true, stdio: 'ignore' }).unref();
}
