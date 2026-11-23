<p align="center">
  <img src="build/icon.png" width="112" alt="Taupe">
</p>

<h1 align="center">Taupe</h1>

<p align="center">
  <b>Where did your disk space go?</b><br>
  A fast disk space explorer for <b>macOS</b> and <b>Windows</b>, with an AI assistant that knows your folders.
</p>

<p align="center">
  <a href="https://github.com/17Sx/taupe-releases/releases/latest">Download</a> ·
  <a href="#features">Features</a> ·
  <a href="#ai-claude--chatgpt">AI</a> ·
  <a href="#development">Development</a> ·
  <a href="README.fr.md">Français</a>
</p>

---

## Features

- **Blazing-fast scan**: around 120,000 files/s, with a view that updates live while scanning.
- **List + treemap**: see at a glance what takes up space, then drill into folders with the keyboard.
- **Big files**, **breakdown by file type**, and **cleanable** folders (caches, `node_modules`, DerivedData, `%TEMP%`…).
- Automatic **suggestions** with a risk level: build caches, dependencies of dormant projects, old installers, duplicates, worktrees…
- **AI assistant** in a side panel. It knows the folder you are looking at, and its answers contain clickable paths.
- **Safe deletion**: everything goes to the **Trash** (macOS) or **Recycle Bin** (Windows) after confirmation. System folders are protected.
- **English and French UI**: follows the system language and can be changed in View → Language.
- **100% local**: no data leaves your machine, except to the AI if you use it (folder structure only, see below). The only other request is the update check (the latest version number, on GitHub), which you can switch off.

## Install

Download the latest version from the **[Releases](https://github.com/17Sx/taupe-releases/releases/latest)** page:

| System | File |
|---|---|
| macOS Apple Silicon (M1–M4) | `Taupe-x.y.z-mac-arm64.dmg` |
| macOS Intel | `Taupe-x.y.z-mac-x64.dmg` |
| Windows 10/11 (installer) | `Taupe-x.y.z-win-x64-setup.exe` |
| Windows (portable, no install) | `Taupe-x.y.z-win-x64-portable.exe` |

> **macOS**: releases are signed with an Apple Developer ID and notarized as soon as the certificate is set up (see [docs/signing.md](docs/signing.md)). Each release's notes say whether it is: if it is not notarized yet, right-click → **Open** on first launch, or run `xattr -cr /Applications/Taupe.app` in Terminal.
> To scan everything (Mail, Photos…), grant Taupe **Full Disk Access**: System Settings → Privacy & Security.
>
> **Windows**: if SmartScreen appears (unsigned build, or a certificate that is still new), click **More info → Run anyway**.
>
> **Updates**: the installed app checks for new versions and offers to install them, then restarts. On macOS it can only install them into a notarized build; otherwise, like the Windows portable version, it opens the download page. Switch it off in Help → Check for Updates Automatically.

## AI (Claude / ChatGPT)

Taupe uses **your own subscription**, not an API key. It goes through the official command-line tools:

| Provider | Official tool used |
|---|---|
| Claude (Pro / Max) | [Claude Code](https://docs.claude.com/en/docs/claude-code/setup) |
| ChatGPT (Plus / Pro) | [Codex CLI](https://github.com/openai/codex) |

Click **Continue with Claude** or **Continue with ChatGPT** in the assistant:
- if the tool is not installed, Taupe installs it automatically with the official installer;
- the sign-in page opens in your browser;
- for Claude, copy the code shown at the end: Taupe detects it automatically when you switch back to the app.

The **Accounts** button at the top of the assistant shows the connection status and lets you sign out.

### The assistant acts for you

Ask it, for example, "find all node_modules folders and select them" or "delete the old .dmg installers". The assistant can:
- **search** files by name, **read** a folder, find the **biggest files**;
- **open** a folder in Taupe and **check** items;
- **propose moving items to the Trash**: a confirmation card appears where you can untick items, and nothing is deleted until you click.

Every action shows up live in the assistant, with an animation. Under the hood, Taupe exposes these tools to Claude Code / Codex through a small local [MCP](https://modelcontextprotocol.io) server (`src/mcp.mjs`). The AI has no access to any other tool: no shell, no file reading (Claude Code's built-in tools and Codex's command tools are switched off, see [SECURITY.md](SECURITY.md)). ChatGPT needs a recent Codex CLI: the "Continue with ChatGPT" button installs it with OpenAI's official installer (no npm or Node.js needed).

**Privacy**: the AI only receives **paths, sizes and dates**, never the contents of your files. It cannot delete anything on its own: you always check the items and confirm.

## Keyboard shortcuts

| Action | macOS | Windows |
|---|---|---|
| Navigate / open / go up | ↑ ↓ / → / ← | ↑ ↓ / → / ← |
| Preview | Space (Quick Look) | Space |
| Select | ⌘-click, ⇧-click, ⌘A | Ctrl+click, ⇧-click, Ctrl+A |
| Move to Trash | ⌘⌫ | Delete |
| Scan a folder | ⌘O | Ctrl+O |
| Show the assistant | ⌘J | Ctrl+J |

## Development

Requires [Bun](https://bun.com) 1.4 or later. Building the installers also needs Node.js 20+, because electron-builder runs on Node.

```bash
bun install
bun start            # run the app (Electron)
bun run test         # engine tests
bun run check        # ESLint (incl. syntax), tsc --checkJs
bun run dist:mac     # build the .dmg (on macOS)
bun run dist:win     # build the .exe installer (on Windows)
```

Architecture:

```
electron/main.mjs    window, menus, native actions (Trash, Finder/Explorer, Quick Look)
electron/worker.mjs  separate "engine" process (scanning never blocks the UI)
src/scanner.mjs      parallel scan + compact in-memory tree (typed arrays)
src/server.mjs       local 127.0.0.1 API protected by a token
src/ai.mjs           Claude Code / Codex: chat, analysis, account connection
src/mcp.mjs          local MCP server exposing Taupe's tools to the AI
src/platform.mjs     everything specific to macOS / Windows / Linux
public/              UI (framework-free HTML/CSS/JS)
```

Branches: `main` = releases, `develop` = integration, `feat/*` / `fix/*` = work in progress. See [CONTRIBUTING.md](CONTRIBUTING.md).

To publish a release: update `CHANGELOG.md` and the version in `package.json`, merge `develop` into `main`, then push a `vX.Y.Z` tag. GitHub Actions builds, signs and notarizes the installers (when the certificates are set up, see [docs/signing.md](docs/signing.md)) and publishes them, with the update files, on the public [taupe-releases](https://github.com/17Sx/taupe-releases) repository.

## Français

**Taupe** est un explorateur d'espace disque rapide pour macOS et Windows : scan en direct, liste + treemap, gros fichiers, suggestions de nettoyage et suppression sûre vers la Corbeille. Un assistant IA intégré utilise ton propre abonnement Claude ou ChatGPT et peut chercher, ouvrir et cocher des éléments pour toi, toujours avec ta confirmation. L'interface est disponible en français et en anglais. La documentation complète en français est dans **[README.fr.md](README.fr.md)**.

## License

[MIT](LICENSE) © 2026 17Sx
