# Security

## Reporting a vulnerability

Please don't open a public issue. Use **[Security → Report a vulnerability](https://github.com/17Sx/taupe/security/advisories/new)** on GitHub. I'll respond as soon as possible.

## Security model

- The UI talks to a local engine that listens **only on 127.0.0.1**, on a random port.
- Every request must carry a **secret token** generated at startup and injected into the page (anti-CSRF). The `Host` header is checked (anti DNS rebinding).
- A deletion request sends **both the item ID and the expected path**. If the tree has changed in the meantime, the deletion is refused.
- Deletions go through the system **Trash / Recycle Bin** (`shell.trashItem`). System folders and the user's main folders are **always refused**.
- The Electron window is isolated: `contextIsolation`, `sandbox`, no `nodeIntegration`, no navigation outside the app.
- The AI (Claude Code / Codex) only has access to **Taupe's own tools**, through a local MCP server (`src/mcp.mjs`): search, read a folder's structure, open, check items, propose a deletion. No shell, no reading of file contents.
- A deletion requested by the AI shows a **confirmation card** and waits for the user's click (5 minutes at most, otherwise nothing happens). Protected paths are refused.
- The MCP server talks to the engine with the same secret token, only on 127.0.0.1, and only while a conversation is in progress.
