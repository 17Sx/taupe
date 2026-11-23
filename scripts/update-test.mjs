// Updates and releases: update mode per platform, Developer ID detection, build signing config, release notes.
// Run: bun scripts/update-test.mjs
import assert from 'node:assert/strict';
import { updateMode, isDeveloperId, RELEASES, DOWNLOAD_URL } from '../electron/update-mode.mjs';
import { changelogSection, installNotes } from './release-notes.mjs';

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('✓', name); };

await test('update mode: install only where the system accepts it', () => {
  assert.equal(updateMode({ packaged: false, platform: 'darwin', signed: true }), 'off');
  assert.equal(updateMode({ packaged: true, platform: 'darwin', signed: true }), 'install');
  assert.equal(updateMode({ packaged: true, platform: 'darwin', signed: false }), 'notify');
  assert.equal(updateMode({ packaged: true, platform: 'win32' }), 'install');
  assert.equal(updateMode({ packaged: true, platform: 'win32', portable: true }), 'notify');
  assert.equal(updateMode({ packaged: true, platform: 'linux' }), 'off');
});

await test('Developer ID detection from codesign output', () => {
  assert.ok(isDeveloperId('Executable=/x\nAuthority=Developer ID Application: Noa (ABCDE12345)\nAuthority=Developer ID Certification Authority\n'));
  assert.ok(!isDeveloperId('Executable=/x\nSignature=adhoc\n'));
  assert.ok(!isDeveloperId('Authority=Apple Development: Noa (X)\n'));
  assert.ok(!isDeveloperId(undefined));
});

await test('updates come from the public releases repository', () => {
  assert.deepEqual(RELEASES, { owner: '17Sx', repo: 'taupe-releases' });
  assert.equal(DOWNLOAD_URL, 'https://github.com/17Sx/taupe-releases/releases/latest');
});

// The build config reads the environment when it is imported: import it fresh with a given environment
async function builderConfig(env) {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (/^(CSC_|WIN_CSC_|AZURE_|TAUPE_AZURE_|APPLE_)/.test(k)) delete process.env[k];
  Object.assign(process.env, env);
  try { return (await import(`../electron-builder.js?${Math.random()}`)).default; }
  finally { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
}

await test('build: ad-hoc and unsigned without secrets, publishes to the releases repository', async () => {
  const c = await builderConfig({});
  assert.equal(c.mac.identity, '-');
  assert.equal(c.mac.hardenedRuntime, false);
  assert.equal(c.mac.notarize, false);
  assert.equal(c.win.azureSignOptions, undefined);
  assert.deepEqual(c.publish, [{ provider: 'github', owner: '17Sx', repo: 'taupe-releases', releaseType: 'release' }]);
  assert.ok(c.mac.target.some(t => t.target === 'zip'), 'the zip is the macOS update package');
});

await test('build: Developer ID + hardened runtime with a certificate, Azure signing with its secrets', async () => {
  const c = await builderConfig({ CSC_LINK: 'base64…', TAUPE_AZURE_ENDPOINT: 'https://weu.codesigning.azure.net', TAUPE_AZURE_ACCOUNT: 'a',
    TAUPE_AZURE_PROFILE: 'p', TAUPE_AZURE_PUBLISHER: 'Noa', AZURE_TENANT_ID: 't', AZURE_CLIENT_ID: 'c', AZURE_CLIENT_SECRET: 's' });
  assert.equal(c.mac.identity, undefined);
  assert.equal(c.mac.hardenedRuntime, true);
  assert.equal(c.mac.notarize, undefined, 'notarization follows the APPLE_* variables');
  assert.equal(c.mac.entitlements, 'build/entitlements.mac.plist');
  assert.equal(c.win.azureSignOptions.publisherName, 'Noa');
  const partial = await builderConfig({ AZURE_CLIENT_SECRET: 's' });
  assert.equal(partial.win.azureSignOptions, undefined, 'incomplete Azure secrets: no signing attempt');
});

await test('release notes: changelog section + workarounds only when unsigned', () => {
  const log = '# Changelog\n\n## [Unreleased]\n\n## [1.3.0] - 2026-11-23\n\n### Added\n- A\n\n## [1.2.0] - 2026-11-20\n\n- B\n';
  assert.equal(changelogSection(log, '1.3.0'), '### Added\n- A');
  assert.equal(changelogSection(log, '1.2.0'), '- B');
  assert.equal(changelogSection(log, '1.2'), '');
  const unsigned = installNotes({ macNotarized: false, winSigned: false });
  assert.match(unsigned, /xattr -cr/);
  assert.match(unsigned, /not signed/);
  const signed = installNotes({ macNotarized: true, winSigned: true });
  assert.doesNotMatch(signed, /xattr/);
  assert.match(signed, /notarized by Apple/);
});

console.log(`\n${n} update tests OK`);
