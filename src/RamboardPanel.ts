import * as vscode from "vscode";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RamboardApi } from "./RamboardApi.ts";

interface PanelState {
  route: string;
  title: string;
}

function nonce(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

function bridgeScript(route: string): string {
  return `(() => {
  const vscode = acquireVsCodeApi();
  const initialRoute = ${JSON.stringify(route)};
  const pending = new Map();
  let seq = 1;
  try { history.replaceState(null, '', initialRoute); } catch {}
  window.__MAIBOARD__ = { initialRoute, vscode };
  window.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.type === 'maiboard.api.result') {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error));
      else entry.resolve(message.response);
    }
    if (message.type === 'maiboard.changed') {
      window.dispatchEvent(new CustomEvent('maiboard:changed'));
      setTimeout(() => location.reload(), 50);
    }
  });
  function apiFetch(resource, init = {}) {
    const url = typeof resource === 'string' ? resource : resource && resource.url;
    if (!url || !String(url).startsWith('/api/')) return window.__nativeFetch(resource, init);
    const id = seq++;
    const method = init.method || 'GET';
    const body = init.body ? String(init.body) : undefined;
    const promise = new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); });
    vscode.postMessage({ type: 'maiboard.api', id, request: { method, url: String(url), body } });
    return promise.then((response) => {
      const status = response.status || 200;
      const payload = response.body === undefined ? null : response.body;
      return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
    });
  }
  window.__nativeFetch = window.fetch.bind(window);
  window.fetch = apiFetch;
})();`;
}

export class RamboardPanel {
  private static readonly panels = new Set<RamboardPanel>();
  private readonly disposables: vscode.Disposable[] = [];
  private watcher?: vscode.Disposable;
  private debounce?: ReturnType<typeof setTimeout>;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly api: RamboardApi,
    private state: PanelState,
  ) {
    RamboardPanel.panels.add(this);
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "vendor", "ramboard")],
    };
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables,
    );
    this.startWatching();
    this.render();
  }

  static open(
    context: vscode.ExtensionContext,
    api: RamboardApi,
    state: PanelState,
    column = vscode.ViewColumn.One,
  ): RamboardPanel {
    const panel = vscode.window.createWebviewPanel("maiboard.ramboard", state.title, column, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "vendor", "ramboard")],
    });
    return new RamboardPanel(panel, context, api, state);
  }

  static notifyTicketDataChanged(): void {
    for (const panel of RamboardPanel.panels)
      panel.panel.webview.postMessage({ type: "maiboard.changed" });
  }

  private render(): void {
    const vendor = vscode.Uri.joinPath(this.context.extensionUri, "vendor", "ramboard");
    const indexPath = join(vendor.fsPath, "index.html");
    if (!existsSync(indexPath)) {
      this.panel.webview.html =
        "<body><h2>Ramboard assets missing</h2><p>Run <code>Maitake: Refresh Ramboard Assets</code>.</p></body>";
      return;
    }

    const n = nonce();
    const webview = this.panel.webview;
    let html = readFileSync(indexPath, "utf8");
    html = html.replace(
      /<script type="module" crossorigin src="([^"]+)"><\/script>/g,
      (_match, src: string) => {
        const uri = webview.asWebviewUri(vscode.Uri.joinPath(vendor, src.replace(/^\//, "")));
        return `<script nonce="${n}" type="module" crossorigin src="${uri}"></script>`;
      },
    );
    html = html.replace(
      /<link rel="stylesheet" crossorigin href="([^"]+)">/g,
      (_match, href: string) => {
        const cssPath = join(vendor.fsPath, href.replace(/^\//, ""));
        const css = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : "";
        return `<style nonce="${n}">${css}</style>`;
      },
    );
    html = html.replace(
      "<head>",
      `<head>\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: https:; script-src ${webview.cspSource} 'nonce-${n}'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; font-src ${webview.cspSource} https://fonts.gstatic.com data:; connect-src ${webview.cspSource} https:;">`,
    );
    html = html.replace(
      '<body class="bg-zinc-950 text-zinc-100 antialiased">',
      `<body class="bg-zinc-950 text-zinc-100 antialiased">\n<script nonce="${n}">${bridgeScript(this.state.route)}</script>`,
    );
    this.panel.webview.html = html;
  }

  private async handleMessage(message: {
    type?: string;
    id?: number;
    request?: { method: string; url: string; body?: string };
  }): Promise<void> {
    if (message.type !== "maiboard.api" || !message.request || typeof message.id !== "number")
      return;
    try {
      const body = message.request.body ? JSON.parse(message.request.body) : undefined;
      const response = await this.api.handle({
        method: message.request.method,
        url: message.request.url,
        body,
      });
      await this.panel.webview.postMessage({
        type: "maiboard.api.result",
        id: message.id,
        response,
      });
    } catch (error) {
      await this.panel.webview.postMessage({
        type: "maiboard.api.result",
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private startWatching(): void {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const watchers: vscode.Disposable[] = [];
    const refresh = () => {
      if (this.debounce) clearTimeout(this.debounce);
      this.debounce = setTimeout(() => RamboardPanel.notifyTicketDataChanged(), 250);
    };
    for (const folder of folders) {
      for (const pattern of [".git/{refs,logs}/**/*", ".git/packed-refs", ".maitake/**/*"]) {
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(folder, pattern),
        );
        watchers.push(
          watcher,
          watcher.onDidCreate(refresh),
          watcher.onDidChange(refresh),
          watcher.onDidDelete(refresh),
        );
      }
    }
    this.watcher = vscode.Disposable.from(...watchers);
  }

  private dispose(): void {
    RamboardPanel.panels.delete(this);
    if (this.debounce) clearTimeout(this.debounce);
    this.watcher?.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }
}
