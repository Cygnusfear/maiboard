import * as vscode from "vscode";
import { MaiboardApi } from "./panel/MaiboardApi.ts";
import { MaiboardPanel } from "./panel/MaiboardPanel.ts";
import {
  clearDecorations,
  handleMaiSave,
  maiCommentListCommand,
  maiCommentResolveCommand,
  updateDecorations,
} from "./comments/maiComments.ts";
import { MaiDocumentLinkProvider } from "./mai/MaiDocumentLinkProvider.ts";
import { startLinkServer } from "./links/linkServer.ts";
import { startVscodeBridge } from "./panel/vscodeBridge.ts";
import {
  consumePendingReviewHandoff,
  readReviewHandoff,
  rememberPendingReviewHandoff,
  ticketIdFromUri,
  tokenFromReviewUri,
  workspaceMatchesHandoff,
} from "./review/reviewHandoff.ts";

function titleForRoute(route: string): string {
  const reviewMatch = route.match(/\/review\/([^/?#]+)/);
  if (reviewMatch?.[1]) return `Maitake Review ${decodeURIComponent(reviewMatch[1])}`;
  const ticketMatch = route.match(/\/ticket\/([^/?#]+)/);
  if (ticketMatch?.[1]) return `Maitake ${decodeURIComponent(ticketMatch[1])}`;
  if (route.includes("status-board") || route.endsWith("/board")) return "Maitake Board";
  if (route.includes("/view/")) return "Maitake Tickets";
  return "Maitake";
}

function firstColumn(): vscode.ViewColumn {
  return vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
}

function normalizeTicketArg(arg: unknown): string | undefined {
  if (typeof arg === "string") return arg;
  if (
    arg &&
    typeof arg === "object" &&
    "id" in arg &&
    typeof (arg as { id?: unknown }).id === "string"
  )
    return (arg as { id: string }).id;
  return undefined;
}

async function openReviewHandoff(
  context: vscode.ExtensionContext,
  api: MaiboardApi,
  token: string,
): Promise<void> {
  let payload;
  try {
    payload = readReviewHandoff(token);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Maiboard: could not read review handoff ${token}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  if (!workspaceMatchesHandoff(payload)) {
    try {
      await rememberPendingReviewHandoff(context, token);
      await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(payload.worktree), {
        forceNewWindow: true,
      });
    } catch (error) {
      vscode.window.showErrorMessage(
        `Maiboard: could not open worktree ${payload.worktree}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return;
  }

  const project =
    api.projects().find((item) => item.path === payload.worktree) ?? api.projects()[0];
  if (!project) {
    vscode.window.showErrorMessage("Maiboard: no workspace folder open for review handoff.");
    return;
  }

  let ticketId = payload.ticket;
  if (!ticketId) {
    try {
      ticketId = await api.createReviewTicket();
    } catch (error) {
      vscode.window.showErrorMessage(
        `Maiboard: review handoff has no ticket and auto-create failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
  }

  MaiboardPanel.open(
    context,
    api,
    {
      title: `Maitake Review ${ticketId}`,
      route: `/${encodeURIComponent(project.id)}/review/${encodeURIComponent(ticketId)}?handoff=${encodeURIComponent(token)}`,
    },
    firstColumn(),
  );
}

async function openPendingReviewHandoff(
  context: vscode.ExtensionContext,
  api: MaiboardApi,
): Promise<void> {
  const token = await consumePendingReviewHandoff(context);
  if (token) await openReviewHandoff(context, api, token);
}

export function activate(context: vscode.ExtensionContext): void {
  const api = new MaiboardApi(context);

  void startVscodeBridge(context)
    .then((bridge) => {
      context.subscriptions.push({ dispose: () => void bridge.dispose() });
    })
    .catch((error) => {
      vscode.window.showWarningMessage(
        `Maiboard VS Code bridge failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

  void openPendingReviewHandoff(context, api);

  context.subscriptions.push(
    startLinkServer({
      openReview: (token) => openReviewHandoff(context, api, token),
      openTicket: async (ticketId) => {
        await vscode.commands.executeCommand("maiboard.openTicket", ticketId);
      },
    }),
    vscode.commands.registerCommand("maiboard.openBoard", () => {
      MaiboardPanel.open(
        context,
        api,
        { title: "Maitake Board", route: api.routeFor("board") },
        firstColumn(),
      );
    }),
    vscode.commands.registerCommand("maiboard.openTickets", () => {
      MaiboardPanel.open(
        context,
        api,
        { title: "Maitake Tickets", route: api.routeFor("tickets") },
        firstColumn(),
      );
    }),
    vscode.commands.registerCommand("maiboard.openTicket", async (arg?: unknown) => {
      const id =
        normalizeTicketArg(arg) ??
        (await vscode.window.showInputBox({
          title: "Open Maitake Ticket",
          prompt: "Ticket ID",
          placeHolder: "pv-mrhs",
        }));
      if (!id) return;
      MaiboardPanel.open(
        context,
        api,
        { title: `Maitake ${id}`, route: api.routeFor("ticket", id) },
        firstColumn(),
      );
    }),
    vscode.commands.registerCommand("maiboard.startReview", async (arg?: unknown) => {
      const explicit = normalizeTicketArg(arg);
      let id: string | undefined = explicit;
      if (!id) {
        const entered = await vscode.window.showInputBox({
          title: "Start review",
          prompt: "Ticket ID — leave empty to create one for the current branch",
          placeHolder: "pv-mrhs (or empty to auto-create)",
        });
        if (entered === undefined) return; // user dismissed
        id = entered.trim();
      }
      if (!id) {
        try {
          id = await api.createReviewTicket();
        } catch (error) {
          vscode.window.showErrorMessage(
            `Could not create review ticket: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
        vscode.window.showInformationMessage(`Created review ticket ${id}.`);
      }
      MaiboardPanel.open(
        context,
        api,
        { title: `Maitake Review ${id}`, route: api.routeFor("review", id) },
        firstColumn(),
      );
    }),
    vscode.commands.registerCommand("maiboard.openReview", async (arg?: unknown) => {
      await vscode.commands.executeCommand("maiboard.startReview", arg);
    }),
    vscode.commands.registerCommand("maiboard.openReviewHandoff", async (arg?: unknown) => {
      const token = typeof arg === "string" ? arg : undefined;
      if (!token) {
        vscode.window.showErrorMessage("Maiboard: review handoff token required.");
        return;
      }
      await openReviewHandoff(context, api, token);
    }),
    vscode.window.registerUriHandler({
      handleUri: async (uri) => {
        const ticketId = ticketIdFromUri(uri);
        if (ticketId) {
          await vscode.commands.executeCommand("maiboard.openTicket", ticketId);
          return;
        }

        const token = tokenFromReviewUri(uri);
        if (token) {
          await openReviewHandoff(context, api, token);
          return;
        }

        vscode.window.showErrorMessage(`Maiboard: unsupported link ${uri.toString()}`);
      },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("maiboard.maiCommentList", maiCommentListCommand),
    vscode.commands.registerCommand("maiboard.maiCommentResolve", maiCommentResolveCommand),
    vscode.workspace.onDidSaveTextDocument(handleMaiSave),
    vscode.languages.registerDocumentLinkProvider(
      { scheme: "file" },
      new MaiDocumentLinkProvider(),
    ),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor) await updateDecorations(editor);
    }),
  );

  // Initial decoration pass for already-visible editors
  for (const editor of vscode.window.visibleTextEditors) {
    void updateDecorations(editor);
  }

  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer("maiboard.panel", {
      async deserializeWebviewPanel(panel, state) {
        const persisted =
          state && typeof state === "object" && "route" in state
            ? (state as { route?: unknown }).route
            : undefined;
        const route =
          typeof persisted === "string" && persisted.length > 0 ? persisted : api.routeFor("board");
        panel.title = titleForRoute(route);
        MaiboardPanel.restore(context, api, panel, { route, title: panel.title });
      },
    }),
  );
}

export function deactivate(): void {
  clearDecorations();
}
