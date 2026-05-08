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
  function persistState() {
    try {
      vscode.setState({ route: location.pathname + location.search + location.hash });
    } catch {}
  }
  persistState();
  const _origPush = history.pushState.bind(history);
  const _origReplace = history.replaceState.bind(history);
  history.pushState = function (...args) { const r = _origPush(...args); persistState(); return r; };
  history.replaceState = function (...args) { const r = _origReplace(...args); persistState(); return r; };
  window.addEventListener('popstate', persistState);
  window.addEventListener('hashchange', persistState);
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
  function canScrollY(el, delta) {
    if (!el) return false;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 1) return false;
    return delta > 0 ? el.scrollTop < max - 1 : el.scrollTop > 1;
  }
  function scrollableByStyle(el) {
    if (el === document.scrollingElement) return true;
    const overflow = getComputedStyle(el).overflowY;
    return /auto|scroll|overlay/.test(overflow);
  }
  function workbenchCommandForKey(event) {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod || event.altKey) return null;
    const key = event.key.toLowerCase();
    if (key === 'w' && !event.shiftKey) return 'workbench.action.closeActiveEditor';
    if (key === 'w' && event.shiftKey) return 'workbench.action.closeWindow';
    if (key === 'p' && !event.shiftKey) return 'workbench.action.quickOpen';
    if (key === 'p' && event.shiftKey) return 'workbench.action.showCommands';
    if (/^[1-9]$/.test(key) && !event.shiftKey) return 'workbench.action.openEditorAtIndex' + key;
    return null;
  }
  window.addEventListener('keydown', (event) => {
    const command = workbenchCommandForKey(event);
    if (!command) return;
    event.preventDefault();
    event.stopPropagation();
    vscode.postMessage({ type: 'maiboard.command', command });
  }, true);
  window.addEventListener('wheel', (event) => {
    if (event.defaultPrevented || event.ctrlKey || !event.deltaY) return;
    const start = event.target instanceof Element
      ? event.target
      : document.elementFromPoint(event.clientX, event.clientY);
    const candidates = [];
    for (let el = start; el; el = el.parentElement) candidates.push(el);
    if (document.scrollingElement) candidates.push(document.scrollingElement);

    for (const el of candidates) {
      if (!(el instanceof Element) || !scrollableByStyle(el)) continue;
      if (canScrollY(el, event.deltaY)) {
        el.scrollTop += event.deltaY;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
  }, { passive: false });
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

  static restore(
    context: vscode.ExtensionContext,
    api: RamboardApi,
    panel: vscode.WebviewPanel,
    state: PanelState,
  ): RamboardPanel {
    return new RamboardPanel(panel, context, api, state);
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
        return `<script nonce="${n}" type="module" src="${uri}"></script>`;
      },
    );
    html = html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, (tag: string) => {
      const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
      if (!href || !href.startsWith("/")) return tag;
      const cssPath = join(vendor.fsPath, href.replace(/^\//, ""));
      const css = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : "";
      return `<style nonce="${n}">${css}</style>`;
    });
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
    command?: string;
    request?: { method: string; url: string; body?: string };
    projectId?: string;
    path?: string;
    ticketId?: string;
  }): Promise<void> {
    if (message.type === "maiboard.command") {
      await this.executeWorkbenchCommand(message.command);
      return;
    }
    if (message.type === "maiboard.openFile") {
      await this.openProjectFile(message);
      return;
    }
    if (message.type === "maiboard.openTicketInNewTab") {
      this.openTicketInNewTab(message);
      return;
    }
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

  private async openProjectFile(message: { projectId?: string; path?: string }): Promise<void> {
    if (!message.projectId || !message.path) return;
    const projectPath = this.api.projectPath(message.projectId);
    if (!projectPath) {
      vscode.window.showErrorMessage(`Maiboard: project ${message.projectId} not found`);
      return;
    }
    const fileUri = vscode.Uri.joinPath(vscode.Uri.file(projectPath), message.path);
    try {
      await vscode.commands.executeCommand("vscode.open", fileUri, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Maiboard: cannot open ${message.path} - ${detail}`);
    }
  }

  private openTicketInNewTab(message: { ticketId?: string }): void {
    if (!message.ticketId) return;
    const id = String(message.ticketId);
    RamboardPanel.open(
      this.context,
      this.api,
      { title: `Maitake ${id}`, route: this.api.routeFor("ticket", id) },
      vscode.ViewColumn.Beside,
    );
  }

  private async executeWorkbenchCommand(command: string | undefined): Promise<void> {
    const allowed = new Set([
      "workbench.action.closeActiveEditor",
      "workbench.action.closeWindow",
      "workbench.action.quickOpen",
      "workbench.action.showCommands",
      "workbench.action.openEditorAtIndex1",
      "workbench.action.openEditorAtIndex2",
      "workbench.action.openEditorAtIndex3",
      "workbench.action.openEditorAtIndex4",
      "workbench.action.openEditorAtIndex5",
      "workbench.action.openEditorAtIndex6",
      "workbench.action.openEditorAtIndex7",
      "workbench.action.openEditorAtIndex8",
      "workbench.action.openEditorAtIndex9",
    ]);
    if (!command || !allowed.has(command)) return;
    await vscode.commands.executeCommand(command);
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
