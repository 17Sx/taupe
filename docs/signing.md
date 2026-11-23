# Signing, notarization and publishing

The release workflow (`.github/workflows/release.yml`) signs and notarizes the installers **by itself as soon as the secrets below exist**. Without them it still builds and publishes, and the release notes say the build is not signed. Nothing in the code needs to change.

Secrets and variables go in the source repository: **Settings → Secrets and variables → Actions**.

## 1. Publishing on the public releases repository (required)

Installers and update files (`latest-mac.yml`, `latest.yml`, `*.blockmap`) are published on [17Sx/taupe-releases](https://github.com/17Sx/taupe-releases), which is public: the download links and the in-app updates point there while the source stays private.

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token.
2. Resource owner: `17Sx`. Repository access: **Only select repositories → `17Sx/taupe-releases`**.
3. Permissions: **Contents: Read and write** (nothing else).
4. Add it as the secret **`RELEASES_TOKEN`**.

Set an expiry and a reminder: when the token expires, the release job fails with a clear message.

## 2. macOS: Developer ID + notarization

Needs the [Apple Developer Program](https://developer.apple.com/programs/) (99 USD / year).

**Certificate**
1. On a Mac: Xcode → Settings → Accounts → Manage Certificates → **+ → Developer ID Application** (or create it on developer.apple.com with a CSR from Keychain Access).
2. Keychain Access → My Certificates → right-click the *Developer ID Application: …* certificate → **Export** as `.p12` with a strong password.
3. `base64 -i Certificates.p12 | pbcopy`, then add:
   - **`MAC_CERTIFICATE`**: the base64 text
   - **`MAC_CERTIFICATE_PASSWORD`**: the `.p12` password

**Notarization** (App Store Connect API key, no Apple ID password involved)
1. [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api) → generate a **Team key** with the **Developer** role.
2. Download `AuthKey_XXXXXXXXXX.p8` (only possible once), then add:
   - **`APPLE_API_KEY`**: the full content of the `.p8` file
   - **`APPLE_API_KEY_ID`**: the key ID
   - **`APPLE_API_ISSUER`**: the issuer ID shown above the list of keys

With the certificate, `electron-builder.js` switches from the ad-hoc signature to the Developer ID with the **hardened runtime** (`build/entitlements.mac.plist`: only V8's JIT exceptions), and electron-builder sends the app to Apple's notary service, then staples the ticket. The workflow checks the result (`codesign --verify`, `spctl`).

Signing also makes **automatic updates install on macOS**: Squirrel.Mac refuses an update that is not signed with the same Developer ID. Until then the app only points to the download page.

**First signed release**: users of an unsigned version get the new version through the download page (their app cannot install it itself); from the next one on, updates install automatically.

## 3. Windows: Azure Artifact Signing

Azure Artifact Signing (formerly *Trusted Signing*) is the cheapest code signing accepted by SmartScreen (Basic plan, about 10 USD / month). It requires an identity validation; check that it is open to individual developers in your country, otherwise use the `.pfx` alternative below.

1. In Azure: create an **Artifact Signing account** and a **certificate profile** (*Public Trust*), after the identity validation.
2. Create an **app registration** (Microsoft Entra ID) with a client secret, and give it the **Certificate Profile Signer** role (*Artifact Signing* / *Trusted Signing Certificate Profile Signer*) on the account.
3. Secrets: **`AZURE_TENANT_ID`**, **`AZURE_CLIENT_ID`**, **`AZURE_CLIENT_SECRET`**.
4. Variables (not secret): **`AZURE_SIGNING_ENDPOINT`** (e.g. `https://weu.codesigning.azure.net`), **`AZURE_SIGNING_ACCOUNT`**, **`AZURE_SIGNING_PROFILE`**, **`AZURE_SIGNING_PUBLISHER`** (the exact *CN* of the certificate, e.g. your name).

Signing only turns on when **all seven** are set. Signed installers carry the publisher name, and the installed app then refuses an update signed by anyone else.

Alternative: a classic `.pfx` code-signing certificate in **`WIN_CERTIFICATE`** (base64) and **`WIN_CERTIFICATE_PASSWORD`**.

SmartScreen builds reputation per certificate: the first downloads after a new certificate may still show a warning.

## Checking locally

```bash
bun run test                      # includes scripts/update-test.mjs (build config + release notes)
CSC_LINK=… CSC_KEY_PASSWORD=… bun run dist:mac   # signed build on your Mac
codesign -dv --verbose=2 dist/mac-arm64/Taupe.app # Authority=Developer ID Application: …
spctl -a -vv dist/mac-arm64/Taupe.app             # source=Notarized Developer ID
```
