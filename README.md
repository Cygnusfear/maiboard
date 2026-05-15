<p align="center">
  <img src="docs/hero.png" alt="Maiboard — list, kanban board, and review side-by-side inside VS Code" width="95%">
</p>

<h1 align="center">🍄‍🟫 maiboard</h1>

<p align="center"><strong>A Linear-style board for <a href="https://github.com/Cygnusfear/maitake">Maitake</a>.</strong><br/>Browser or VS Code. Same tickets, same git notes, your repo.</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#install">Install</a> ·
  <a href="#packages">Packages</a> ·
  <a href="https://github.com/Cygnusfear/maitake">Maitake</a>
</p>

---

[Maitake](https://github.com/Cygnusfear/maitake) gives you tickets, reviews, PRs, and docs — all stored as git notes. `maiboard` is the visual layer: a Linear-style board for the same data, in the browser or inside VS Code.

Drag tickets across status columns. Group by epic. Review code in-editor with file diffs and a verdict button. Every change goes through `mai` and lands in `refs/notes/maitake` — append-only, mergeable, in your repo.

Two surfaces, one backend. Open the browser board via `mai-board`, or install the `pi0.maiboard` extension in VS Code / VSCodium. Both surfaces compute live from `mai`. The same project shows the same state in both.

> **Status:** early. APIs and storage are still moving. Run it from this monorepo for now.

## Features

### Board

<p align="center">
  <img src="docs/board.png" alt="Maitake Board view — kanban over .tickets/" width="90%">
</p>

Drag-and-drop kanban over your `mai` tickets. List, Board, and Graph layouts. Status columns, tag chips, saved views, group-by status/type/epic, board sort and filter presets. No separate database — the source of truth is your repo's `.tickets/` directory.

### Review

<p align="center">
  <img src="docs/review.png" alt="Maitake Review view — in-editor code review on top of mai review tickets" width="90%">
</p>

In-editor code reviews driven by `mai review` tickets. Pick a base, pick a head, scrub the last 1 / 3 / 5 / 10 commits, inspect file-level diffs with syntax highlighting, leave a verdict message. **Approve** or **Request changes** — either way the verdict round-trips back into the ticket as an audited comment.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [Maitake (`mai`)](https://github.com/Cygnusfear/maitake) installed and on `$PATH`
- VS Code or [VSCodium](https://vscodium.com) 1.110+ (only for the extension)

## Install

```bash
git clone https://github.com/Cygnusfear/maiboard
cd maiboard
bun install
bun run typecheck
bun run lint
bun run build
bun run package:vscode
```

## Packages

| Package                              | Description                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| [`packages/board`](packages/board)   | Vite + React board UI (List / Board / Graph views).                                |
| [`packages/server`](packages/server) | Bun HTTP API server. Shells out to `mai` for ticket reads/writes.                  |
| [`packages/cli`](packages/cli)       | `mai-board` binary. Direct launcher and the `mai board` plugin entry are the same. |
| [`packages/api`](packages/api)       | Shared TypeScript-only route/domain types. Zero runtime deps.                      |
| [`packages/vscode`](packages/vscode) | VS Code / Codium extension (`pi0.maiboard`). Reimplements the API in-process.      |

## VS Code / Codium packaging

The extension vendors the board build into `packages/vscode/vendor/board` at build time, so the vsix is self-contained except for `mai` and `git` on the user's `PATH`:

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

That writes `board = "mai-board"` to `~/.maitake/plugins.toml` if needed. After the binary is on `PATH`, `mai board` resolves to `mai-board`.

## License

[MIT](./LICENSE). See also the upstream [Maitake](https://github.com/Cygnusfear/maitake) project this builds on.
