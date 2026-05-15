# Maiboard for VS Code / VSCodium

Maiboard embeds the shared Maiboard board UI inside a VS Code webview and serves Maitake data through the extension bridge.

Runtime package identity: `pi0.maiboard`.

See the [main Maiboard repository](https://github.com/Cygnusfear/maiboard) for the rest of the workspace (board UI, server, `mai-board` launcher).

## Build

```bash
bun run build
bun run package
```

The package script builds `@maiboard/board`, refreshes `vendor/board`, bundles the extension with rolldown, and packages the vsix with `bunx vsce`.
