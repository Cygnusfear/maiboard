# Maiboard

A visual board and VS Code workbench for [Maitake](https://github.com/Cygnusfear/maitake), the Markdown-native ticket substrate. Maiboard reads the same `.tickets/` directory `mai` writes, so you can pick tickets graphically while keeping every operation as an auditable plain-text commit.

> **Status:** early. The HTTP server, board UI, `mai-board` plugin, and VS Code extension all run, but APIs and storage are still moving.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [Maitake (`mai`)](https://github.com/Cygnusfear/maitake) installed and on `$PATH`
- VS Code or [VSCodium](https://vscodium.com) 1.110+ (only for the extension)

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
codium --install-extension packages/vscode/maiboard-0.3.1.vsix --force
```

Reload the Codium window after installing a new vsix.

## mai-board plugin registration

No postinstall hooks mutate global state. Register explicitly:

```bash
bun run --filter mai-board dev -- --register
```

That writes `board = "mai-board"` to `~/.maitake/plugins.toml` if needed. After the binary is on PATH, `mai board` resolves to `mai-board`.

## License

[MIT](./LICENSE). See also the upstream [Maitake](https://github.com/Cygnusfear/maitake) project this builds on.
