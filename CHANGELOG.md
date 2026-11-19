# Changelog

All notable changes to Taupe are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
