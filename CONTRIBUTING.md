# Contributing to Taupe

Thanks for your interest! A few simple rules:

## Branches

- `main`: published releases only (every merge = a tagged release).
- `develop`: integration branch. **Pull requests target `develop`.**
- `feat/short-name`, `fix/short-name`: one branch per topic, created from `develop`.

## Before opening a PR

```bash
bun install
bun run check
bun run test
bun start   # check manually in the app
```

- Keep the engine (`src/`) **dependency-free**: built-in `node:` modules only. The app runs it on Electron's Node, the tests on Bun, so it must work on both.
- Anything OS-specific goes in `src/platform.mjs` or `electron/main.mjs`.
- Add a line to `CHANGELOG.md`, under "Unreleased".
- Commit messages **in English**, following [Conventional Commits](https://www.conventionalcommits.org/):
  `type(scope): description` in the imperative mood, lowercase, no trailing period.
  Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
  Examples: `feat(ai): add one-click account connection`, `fix(scanner): skip APFS firmlinks`.

## Security

Nothing should ever be able to delete a file without the user's explicit confirmation. Deletions always go through the Trash / Recycle Bin, and the local API stays protected (127.0.0.1, token, path check). See [SECURITY.md](SECURITY.md).
