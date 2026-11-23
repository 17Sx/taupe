// How Taupe updates itself. No Electron import: checked by scripts/update-test.mjs.
//   'install' — download in the background, then offer to restart (signed macOS app, Windows installer)
//   'notify'  — only say a new version exists and open the download page: macOS refuses to install an
//               update into an app that is not signed with a Developer ID, and the Windows portable .exe
//               has no installer to run
//   'off'     — development, or a platform without published builds (Linux)

// Installers are published on a public repository, separate from the source code
export const RELEASES = { owner: '17Sx', repo: 'taupe-releases' };
export const DOWNLOAD_URL = `https://github.com/${RELEASES.owner}/${RELEASES.repo}/releases/latest`;

/** @param {{ packaged: boolean, platform: string, signed?: boolean, portable?: boolean }} o */
export function updateMode({ packaged, platform, signed = false, portable = false }) {
  if (!packaged) return 'off';
  if (platform === 'darwin') return signed ? 'install' : 'notify';
  if (platform === 'win32') return portable ? 'notify' : 'install';
  return 'off';
}

// `codesign -dv` prints the signing authorities on stderr: a Developer ID app is updatable
export const isDeveloperId = codesignOutput => /^Authority=Developer ID Application: /m.test(String(codesignOutput || ''));

export const CHECK_EVERY_MS = 6 * 3600e3;
