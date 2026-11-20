// Everything that depends on the operating system lives here.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { tr } from './i18n.mjs';

export const PLATFORM = process.platform; // 'darwin' | 'win32' | 'linux'
export const IS_MAC = PLATFORM === 'darwin';
export const IS_WIN = PLATFORM === 'win32';
export const HOME = os.homedir();
const norm = p => (IS_WIN ? p.toLowerCase() : p);

// Size actually used on disk. Windows doesn't expose blocks: use the logical size.
export const diskSize = st => (IS_WIN || !Number.isFinite(st.blocks) ? st.size : st.blocks * 512);

// Folders never traversed (other volumes, pseudo-filesystems, APFS duplicates of the Data volume)
export const SKIP_DIRS = new Set((IS_WIN
  ? ['C:\\System Volume Information', 'C:\\$Recycle.Bin\\S-1-5-18']
  : ['/dev', '/Volumes', '/System/Volumes', '/net', '/home', '/.vol', '/.nofollow', '/.resolve', '/proc', '/sys', '/run', '/mnt', '/media']
).map(norm));
export const isSkipped = p => SKIP_DIRS.has(norm(p));

// ---------- Paths we always refuse to move to the Trash ----------
// Compared after resolving symlinks in the parent folders (the item itself is what goes to the Trash:
// a symlink leaves on its own, not its target) and without case on macOS and Windows, whose disks are
// case-insensitive: "~/documents" or "~/link-to-home/Documents" are the same folder as "~/Documents".
const fold = p => (IS_WIN || IS_MAC ? p.toLowerCase() : p);
const H = (...p) => path.join(HOME, ...p);
// Each listed path also under its real name (/etc → /private/etc, a symlinked home folder…)
const real = p => { try { return fs.realpathSync.native(p); } catch { return p; } };
const withReal = list => [...new Set(list.flatMap(p => [p, real(p)]))];
// Secrets (keys, credentials, tokens): never, nor anything inside
const SECRETS = [
  H('.ssh'), H('.gnupg'), H('.aws'), H('.azure'), H('.kube'), H('.docker'), H('.password-store'),
  H('.config', 'gcloud'), H('.config', 'gh'), H('.netrc'), H('.git-credentials'), H('.npmrc'), H('.pypirc'),
  ...(IS_MAC ? [H('Library', 'Keychains')] : []),
  ...(IS_WIN ? [H('AppData', 'Roaming', 'Microsoft', 'Credentials'), H('AppData', 'Local', 'Microsoft', 'Credentials'),
    H('AppData', 'Roaming', 'Microsoft', 'Protect'), H('AppData', 'Roaming', 'Microsoft', 'Crypto')] : []),
];
const PROTECTED_EXACT = new Set(withReal((IS_WIN
  ? ['C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData', 'C:\\Users', HOME, H('AppData'), H('AppData', 'Local'), H('AppData', 'Roaming'),
    H('Desktop'), H('Documents'), H('Downloads'), H('Pictures'), H('Music'), H('Videos'), H('OneDrive')]
  : ['/', HOME, '/Applications', '/Users', '/Library', '/private', '/etc', '/var', '/opt', '/cores', '/Volumes', '/home', '/root',
    '/private/etc', '/private/var', H('Library'), H('Desktop'), H('Documents'), H('Downloads'), H('Pictures'), H('Music'), H('Movies')]
).concat(SECRETS)).map(fold));
const PROTECTED_PREFIX = withReal((IS_WIN
  ? ['C:\\Windows\\']
  : ['/System/', '/usr/', '/bin/', '/sbin/', '/boot/', '/proc/', '/sys/', '/dev/']
).map(x => x.replace(/[\\/]$/, '')).concat(SECRETS)).map(x => fold(x + path.sep));

// Absolute path with the symlinks of its parent folders resolved (the last component is kept as is).
// Resolves the deepest parent that exists: "<link to ~>/.kube/x" is "~/.kube/x" even without ~/.kube.
function realParent(p) {
  const abs = path.resolve(p);
  const rest = [path.basename(abs)];
  if (!rest[0]) return abs; // root of a disk
  for (let dir = path.dirname(abs); ;) {
    try { return path.join(fs.realpathSync.native(dir), ...rest); } catch {}
    const up = path.dirname(dir);
    if (up === dir) return abs;
    rest.unshift(path.basename(dir)); dir = up;
  }
}
function protectedAs(p) {
  const n = fold(p);
  if (PROTECTED_EXACT.has(n)) return true;
  if (IS_WIN && /^[a-z]:\\?$/.test(n)) return true; // drive root
  return PROTECTED_PREFIX.some(x => n === x.replace(/[\\/]$/, '') || n.startsWith(x));
}
export const isProtected = p => protectedAs(path.resolve(p)) || protectedAs(realParent(p));

// Allowed, but only after a reinforced confirmation: app data (settings, accounts, histories…)
const SENSITIVE_PREFIX = withReal(IS_MAC ? [H('Library')] : IS_WIN ? [H('AppData')] : [H('.config'), H('.local', 'share')]).map(x => fold(x + path.sep));
// …except the temporary folder: on Windows %TEMP% lives in AppData\Local\Temp, and it is safe to empty
const TEMP = withReal([os.tmpdir()]).map(fold);
const inTemp = f => TEMP.some(t => f === t || f.startsWith(t + path.sep));
export const isSensitive = p => [path.resolve(p), realParent(p)].map(fold).some(f => SENSITIVE_PREFIX.some(s => f.startsWith(s)) && !inTemp(f));

export function expand(p) {
  p = String(p ?? '').trim();
  if (!p || p === '~') return HOME;
  if (p.startsWith('~/') || p.startsWith('~\\')) p = path.join(HOME, p.slice(2));
  if (IS_WIN && /^[a-z]:$/i.test(p)) p += '\\';
  return path.resolve(p);
}

// Shortcuts offered on the welcome screen
export function places(lang = 'en') {
  const T = (s, v) => tr(lang, s, v);
  if (IS_WIN) {
    const drives = [];
    for (const l of 'CDEFGH') { try { fs.accessSync(`${l}:\\`); drives.push(`${l}:\\`); } catch {} }
    return [
      { path: HOME, icon: 'home', label: T('Dossier perso'), hint: HOME },
      ...drives.map(d => ({ path: d, icon: 'disk', label: T('Disque {d}', { d: d.slice(0, 2) }), hint: T('tout le disque') })),
      { path: H('Downloads'), icon: 'download', label: T('Téléchargements'), hint: 'Downloads' },
    ].slice(0, 5);
  }
  return [
    { path: HOME, icon: 'home', label: T('Dossier perso'), hint: T('~ — le plus utile') },
    { path: '/', icon: 'disk', label: T('Disque entier'), hint: IS_MAC ? T('/ — tout le Mac') : '/' },
    ...(IS_MAC ? [{ path: '/Applications', icon: 'apps', label: T('Applications'), hint: '/Applications' }] : []),
    { path: H('Downloads'), icon: 'download', label: T('Téléchargements'), hint: '~/Downloads' },
  ];
}

// ---------- macOS Full Disk Access ----------
// The privacy database itself is only readable with Full Disk Access: opening it tells whether Taupe
// (the app that runs this engine) has it. true / false, or null when unknown or not macOS.
export async function fullDiskAccess() {
  if (!IS_MAC) return null;
  try { await (await fs.promises.open(H('Library', 'Application Support', 'com.apple.TCC', 'TCC.db'), 'r')).close(); return true; }
  catch (e) { return e.code === 'EPERM' || e.code === 'EACCES' ? false : null; }
}
// System Settings → Privacy & Security → Full Disk Access
export const FULL_DISK_ACCESS_PANE = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';

// ---------- Fallback system actions (development mode without Electron) ----------
// In the app, Electron provides its own native actions (shell.trashItem, etc.).
const run = (cmd, args, opts = {}) => new Promise((res, rej) =>
  execFile(cmd, args, { timeout: 120000, ...opts }, (e, out, err) => (e ? rej(new Error(String(err || e.message).trim())) : res(out))));

export const fallbackActions = {
  async trash(paths) {
    const errors = {};
    if (IS_WIN) {
      // Windows Recycle Bin via the VisualBasic API; paths go through an environment variable (no injection possible)
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
  pickFolder: async () => null, // no native picker outside the app
  openPrivacySettings: () => (IS_MAC ? run('open', [FULL_DISK_ACCESS_PANE]) : null),
};
// explorer.exe returns an error code even on success: ignore it.
function explorer(arg) {
  spawn('explorer.exe', [arg], { windowsVerbatimArguments: true, detached: true, stdio: 'ignore' }).unref();
}
