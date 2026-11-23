// electron-builder configuration (read automatically by `bun run dist`).
//
// Signing turns on by itself when its secrets are in the environment (see docs/signing.md):
//   macOS    CSC_LINK + CSC_KEY_PASSWORD (Developer ID Application certificate)
//            → signed with the hardened runtime, then notarized if APPLE_API_KEY / APPLE_API_KEY_ID /
//              APPLE_API_ISSUER (or APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID) are set
//   Windows  AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET + TAUPE_AZURE_ENDPOINT /
//            TAUPE_AZURE_ACCOUNT / TAUPE_AZURE_PROFILE / TAUPE_AZURE_PUBLISHER (Azure Artifact Signing),
//            or WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD (.pfx certificate)
// Without them the build still works: ad-hoc signature on macOS, unsigned on Windows.
import { RELEASES } from './electron/update-mode.mjs';

const env = process.env;
const set = k => typeof env[k] === 'string' && env[k].trim() !== '';
const macSigned = set('CSC_LINK') || set('CSC_NAME');
const azure = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'TAUPE_AZURE_ENDPOINT', 'TAUPE_AZURE_ACCOUNT', 'TAUPE_AZURE_PROFILE', 'TAUPE_AZURE_PUBLISHER'].every(set);

/** @type {import('app-builder-lib').Configuration} */
export default {
  appId: 'io.github.17sx.taupe',
  productName: 'Taupe',
  copyright: 'Copyright © 2026 17Sx — MIT',
  directories: { output: 'dist', buildResources: 'build' },
  files: ['electron/**', 'src/**', 'public/**', 'package.json', 'LICENSE'],
  artifactName: 'Taupe-${version}-${os}-${arch}.${ext}',
  asarUnpack: ['src/mcp.mjs'],

  // Where the installed app looks for updates (written into app-update.yml). The release
  // workflow uploads the installers and the latest*.yml files there itself.
  publish: [{ provider: 'github', owner: RELEASES.owner, repo: RELEASES.repo, releaseType: 'release' }],

  mac: {
    category: 'public.app-category.utilities',
    target: [{ target: 'dmg', arch: ['arm64', 'x64'] }, { target: 'zip', arch: ['arm64', 'x64'] }], // zip = update package
    icon: 'build/icon.png',
    // Developer ID + hardened runtime (required for notarization); otherwise an ad-hoc signature,
    // without which Apple Silicon refuses to run the app at all
    ...(macSigned
      ? { hardenedRuntime: true, entitlements: 'build/entitlements.mac.plist', entitlementsInherit: 'build/entitlements.mac.plist' }
      : { identity: '-', hardenedRuntime: false, notarize: false }),
    gatekeeperAssess: false,
    extendInfo: {
      NSDesktopFolderUsageDescription: 'Taupe analyse la taille des fichiers de ton Bureau.',
      NSDocumentsFolderUsageDescription: 'Taupe analyse la taille des fichiers de tes Documents.',
      NSDownloadsFolderUsageDescription: 'Taupe analyse la taille des fichiers de tes Téléchargements.',
      NSRemovableVolumesUsageDescription: 'Taupe peut analyser les disques externes.',
    },
  },
  dmg: { title: 'Taupe ${version}' },

  win: {
    target: [{ target: 'nsis', arch: ['x64', 'arm64'] }, { target: 'portable', arch: ['x64'] }],
    icon: 'build/icon.png',
    ...(azure ? { azureSignOptions: {
      endpoint: env.TAUPE_AZURE_ENDPOINT, codeSigningAccountName: env.TAUPE_AZURE_ACCOUNT,
      certificateProfileName: env.TAUPE_AZURE_PROFILE, publisherName: env.TAUPE_AZURE_PUBLISHER,
    } } : {}),
  },
  nsis: {
    oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true, shortcutName: 'Taupe',
    artifactName: 'Taupe-${version}-win-${arch}-setup.${ext}',
  },
  portable: { artifactName: 'Taupe-${version}-win-${arch}-portable.${ext}' },

  linux: { target: ['AppImage'], category: 'Utility', icon: 'build/icon.png' },
};
