# Changelog

All notable changes to Taupe are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-11-20

### Added
- **Onboarding** on first launch, reopenable from Help → Show the Welcome Tour: what Taupe does and how it protects your files; on macOS, **Full Disk Access** with a button that opens the right System Settings pane and a live check of the permission (the tour resumes if macOS relaunches Taupe); connecting Claude or ChatGPT (optional); then the first folder to scan.

### Fixed
- The app now keeps the same local port between launches, so the page keeps its storage: the chat history, the chosen AI and the onboarding progress were lost on every restart.

### Security
- **Codex (ChatGPT) no longer has a shell**: its command tools are switched off (`--disable shell_tool --disable unified_exec`), so the "no shell" promise now holds for both AIs. A Codex too old for these flags is refused with a message asking to update it. A new test checks the arguments passed to both CLIs.
- The anti-CSRF token is **no longer written into the page** in the app: Electron adds it to the window's requests. The browser development mode is unchanged.
- Protected paths are checked **after resolving symlinks** and **without case** on macOS / Windows. Secrets are protected too (`~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.kube`, `~/.docker`, keychains, Windows credentials…).
- **Reinforced confirmation** for app data (`~/Library/…`, `AppData\…`, except the temporary folder): unchecked by default in the assistant, and an explicit "I checked every item" box is required.
- Commands suggested by the AI show a "check it before running it" warning.
- Inputs used as keys (AI provider, MCP tool, route, native action) only accept own keys (`Object.hasOwn`), and locating the AI CLIs no longer pastes a name into a shell command.

### Changed
- **Connecting ChatGPT no longer needs npm or Node.js**: Taupe installs Codex with OpenAI's official standalone installer (`install.sh` / `install.ps1`), like it already does for Claude Code, and finds it in its Windows install folder. The installer runs non-interactively.
- **The project now uses Bun** instead of npm: `bun install` (`bun.lock` replaces `package-lock.json`), `bun start`, `bun run check`, `bun run test`, and the tests and checks run on the Bun runtime. CI, releases and Dependabot use Bun. Building the installers still needs Node.js, since electron-builder hangs on Bun; the app itself still runs on Electron's Node. `scripts/check.mjs` is gone: ESLint already reports syntax errors.
- `bun run check` also runs ESLint and `tsc --checkJs`. New CodeQL workflow, which fails on any alert that is not a reviewed false positive (`.github/codeql-accepted.json`); GitHub Actions pinned by commit SHA, with per-job permissions; releases ship a `SHA256SUMS.txt`.

## [1.1.0] - 2026-11-19

### Added
- **The assistant acts in Taupe** through a local MCP server: it searches files, reads folders, finds big files, opens folders, checks items and proposes moving them to the Trash.
- Every AI action shows up **live with an animation** in the assistant, and the UI follows along (folder opened, rows flashed when selected).
- Trash confirmation card listing every proposed item with a checkbox each, paths relative to the open folder and a live total: only the items you keep checked are moved.
- "+ ChatGPT" / "+ Claude" link next to the model picker to connect a second AI account.
- "Stop" button while the AI is responding.
- **English and French** app: it follows the system language and can be changed in View → Language; the assistant and the AI analysis answer in that language.
- Repository documentation in English, with a French README (`README.fr.md`).

### Changed
- Back to the paw-print logo: app icon, header logo and tab icon.

### Fixed
- The window always shows up at startup, and a clear error appears if the engine does not respond.
- Hidden buttons ("Browse…", "Assistant") no longer reappear.
- Selecting a folder together with its contents is de-duplicated correctly on Windows.

## [1.0.0] - 2026-11-19

First public release.

### Added
- Desktop app for **macOS** (Apple Silicon and Intel) and **Windows** (x64, ARM64), built on Electron.
- Very fast parallel scan with a live view, sorted list and treemap.
- Big files, By type, Cleanable and **Suggestions** tabs (automatic rules with a risk level).
- Contextual **AI assistant** and **AI analysis** using your Claude (Claude Code) or ChatGPT (Codex CLI) subscription.
- **One-click connection** to Claude or ChatGPT: automatic install of the official tool if needed, sign-in page in the browser, Claude code detected automatically.
- Native move to Trash, "Show in Finder / Explorer", Quick Look on macOS, native folder picker.
- White / black / orange visual identity, thin-line icons, light and dark themes (View → Appearance menu).
