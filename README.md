# Maiboard

Maiboard is a standalone VS Code extension for the Maitake workbench. It embeds the Ramboard frontend in VS Code webviews and serves Maitake data through a local VS Code bridge rather than a separate HTTP server.

## Commands

- `Maitake: Open Board` — opens Ramboard's status board route for the current workspace.
- `Maitake: Open Tickets` — opens Ramboard's ticket list route for the current workspace.
- `Maitake: Open Ticket` — prompts for a Maitake ticket ID and opens Ramboard's ticket detail route.
- `Maitake: Start Review` — opens the review entry point. Full review mode belongs in Ramboard and should be added there next.
- `Maitake: Refresh Ramboard Assets` — copies `../ramboard/dist` into `vendor/ramboard`.

## Architecture

- `vendor/ramboard` contains the built Ramboard Vite assets.
- `src/RamboardPanel.ts` serves those assets inside a VS Code webview, rewrites asset URLs, injects the initial Ramboard route, and installs a `fetch('/api/...')` bridge.
- `src/RamboardApi.ts` implements Ramboard's API shape by shelling out to `mai` and storing saved views under VS Code global storage.
- `src/vscodeBridge.ts` owns Maiboard's Pi/agent-to-VS-Code bridge. It writes `~/.pi/vscode-bridge.json` on activation so editor tools such as `editor_open` can call back into the active VS Code window without depending on the separate `pi-vscode` extension.
- No polling is used for board refresh. The panel watches git refs/logs/packed-refs and `.maitake/**/*`, then notifies the webview that ticket data changed.

## Development

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm package
```
