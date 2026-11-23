# Security

## Reporting a vulnerability

Please don't open a public issue. Use **[Security → Report a vulnerability](https://github.com/17Sx/taupe-releases/security/advisories/new)** on GitHub. I'll respond as soon as possible.

## Security model

- The UI talks to a local engine that listens **only on 127.0.0.1**, on a random port.
- Every request must carry a **secret token** generated at startup (anti-CSRF). In the app the token is **never written into the page**: Electron adds it to the window's requests (`session.webRequest`), so a local program that reads `http://127.0.0.1:<port>/` does not get it. Only the browser development mode (`bun run dev:web`) puts it in the page. The `Host` header is checked (anti DNS rebinding).
- A deletion request sends **both the item ID and the expected path**. If the tree has changed in the meantime, the deletion is refused.
- Deletions go through the system **Trash / Recycle Bin** (`shell.trashItem`). System folders, the user's main folders and secrets (`~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.kube`, keychains, Windows credentials…) are **always refused**. Paths are compared after resolving symlinks in parent folders and without case on macOS / Windows, so `~/documents` or `/tmp/link-to-home/Documents` are refused too.
- App data (`~/Library/…` on macOS, `AppData\…` on Windows, except the temporary folder) needs a **reinforced confirmation**: the engine refuses it until the user ticks an explicit "I checked every item" box.
- The Electron window is isolated: `contextIsolation`, `sandbox`, no `nodeIntegration`, no navigation outside the app.
- The AI (Claude Code / Codex) only has access to **Taupe's own tools**, through a local MCP server (`src/mcp.mjs`): search, read a folder's structure, open, check items, propose a deletion. No shell, no reading of file contents:
  - Claude Code runs with `--tools ""` (no built-in tool), `--strict-mcp-config` and `--allowedTools` limited to Taupe's tools;
  - Codex runs with its command tools switched off (`--disable shell_tool --disable unified_exec`), in the `read-only` sandbox, with `approval_policy="never"`. A Codex too old to know these flags refuses to start, rather than running with a shell.
  - `scripts/ai-args-test.mjs` checks these arguments in CI.
- Commands suggested by the AI analysis (e.g. `docker system prune`) are **never run by Taupe**: they are shown with a "check it before running it" warning and can only be copied.
- A deletion requested by the AI shows a **confirmation card** and waits for the user's click (5 minutes at most, otherwise nothing happens). Protected paths are refused.
- The MCP server talks to the engine with the same secret token, only on 127.0.0.1, and only while a conversation is in progress.

## Releases and updates

- Installers are built by GitHub Actions from a tagged commit and published on [17Sx/taupe-releases](https://github.com/17Sx/taupe-releases) with a `SHA256SUMS.txt`.
- macOS builds are signed with a Developer ID, with the hardened runtime, and notarized by Apple; Windows installers are signed (Azure Artifact Signing). Until the certificates are set up, the release notes say the build is not signed. See [docs/signing.md](docs/signing.md).
- The app checks for updates with `electron-updater`, over HTTPS, against that repository only. Each downloaded update is checked against the SHA-512 in `latest*.yml`; on macOS, Squirrel also requires the update to carry the same Developer ID signature, and on Windows a signed app only installs an update signed by the same publisher. The check sends nothing but a normal HTTPS request to GitHub, and can be switched off in Help → Check for Updates Automatically.
