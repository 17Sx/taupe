# Changelog

All notable changes to Taupe are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **The assistant acts in Taupe**: it searches, reads folders, finds big files, opens folders, checks items and proposes moving them to the Trash (always confirmed by the user).
- Every AI action shows up **live with an animation** in the assistant, and the UI reacts (folder opened, rows selected).
- "Stop" button while the AI is responding.
- The app is available in English and French; it follows the system language and can be changed in View → Language.

### Changed
- Back to the paw-print logo: app icon, header logo and tab icon.

### Fixed
- The window always shows up at startup, and a clear error appears if the engine does not respond.

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
