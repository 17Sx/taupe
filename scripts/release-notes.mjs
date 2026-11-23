// Release notes: the version's section of CHANGELOG.md + install instructions.
// The instructions depend on whether this build is signed: the Gatekeeper / SmartScreen
// workarounds are only shown when they are really needed.
//
//   bun scripts/release-notes.mjs 1.3.0 > notes.md
//   env: MAC_NOTARIZED=true|false, WIN_SIGNED=true|false
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function changelogSection(changelog, version) {
  const out = [];
  let on = false;
  for (const line of changelog.split('\n')) {
    if (/^## /.test(line)) {
      if (on) break;
      on = new RegExp(`^## \\[?${version.replace(/\./g, '\\.')}\\]?(\\s|$)`).test(line);
      continue;
    }
    if (on) out.push(line);
  }
  return out.join('\n').trim();
}

export function installNotes({ macNotarized, winSigned }) {
  const L = ['---', '', '### Install', '',
    '| System | File |', '|---|---|',
    '| macOS Apple Silicon (M1–M4) | `Taupe-…-mac-arm64.dmg` |',
    '| macOS Intel | `Taupe-…-mac-x64.dmg` |',
    '| Windows (installer) | `Taupe-…-win-x64-setup.exe` |',
    '| Windows on ARM (installer) | `Taupe-…-win-arm64-setup.exe` |',
    '| Windows (no install) | `Taupe-…-win-x64-portable.exe` |', ''];
  L.push(macNotarized
    ? '**macOS**: signed with an Apple Developer ID and notarized by Apple: it opens normally.'
    : '**macOS**: this build is **not notarized** by Apple. On first launch: right-click Taupe → **Open**, or run `xattr -cr /Applications/Taupe.app` in Terminal.');
  L.push('');
  L.push(winSigned
    ? '**Windows**: the installers are signed. While the certificate is new, SmartScreen may still ask: **More info → Run anyway**.'
    : '**Windows**: this build is **not signed**. SmartScreen may show "Windows protected your PC": **More info → Run anyway**.');
  L.push('', '**Updates**: the installed app checks for new versions and offers to install them'
    + (macNotarized ? '' : ' (on macOS it only points to this page while builds are not notarized)')
    + '. The Windows portable version only points to this page. Switch it off in Help → Check for Updates Automatically.');
  L.push('', '**Check your download**: `SHA256SUMS.txt` lists the SHA-256 of every file. macOS: `shasum -a 256 -c SHA256SUMS.txt --ignore-missing` · Windows (PowerShell): `Get-FileHash .\\Taupe-…-setup.exe`, then compare with the matching line.');
  return L.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = String(process.argv[2] || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+/.test(version)) { console.error('usage: release-notes.mjs X.Y.Z'); process.exit(2); }
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const section = changelogSection(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version);
  if (!section) { console.error(`CHANGELOG.md has no section for ${version}`); process.exit(1); }
  process.stdout.write(section + '\n\n' + installNotes({ macNotarized: process.env.MAC_NOTARIZED === 'true', winSigned: process.env.WIN_SIGNED === 'true' }));
}
