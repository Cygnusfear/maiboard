# Maiboard

Maiboard is the Maitake board UI and VS Code extension in one Bun workspace. It contains the shared Vite board, the Bun API server, the `mai-board` launcher/plugin binary, shared API types, and the VS Code/Codium extension.

## Packages

- `packages/board` — Vite + React board UI.
- `packages/server` — Bun API server that shells out to `mai`.
- `packages/cli` — `mai-board` binary. Direct launcher and `mai board` plugin entry are the same binary.
- `packages/api` — shared TypeScript-only route/domain types.
- `packages/vscode` — VS Code/Codium extension (`pi0.maiboard`).

## Commands

```bash
bun install
bun run typecheck
bun run lint
bun run build
bun run package:vscode
```

## VS Code/Codium packaging

The extension vendors the board build into `packages/vscode/vendor/board`:

```bash
bun run package:vscode
codium --install-extension packages/vscode/maiboard-0.3.0.vsix --force
```

Reload the Codium window after installing a new vsix.

## mai-board plugin registration

No postinstall hooks mutate global state. Register explicitly:

```bash
bun run --filter mai-board dev -- --register
```

That writes `board = "mai-board"` to `~/.maitake/plugins.toml` if needed. After the binary is on PATH, `mai board` resolves to `mai-board`.
