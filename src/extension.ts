import * as vscode from "vscode";
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RamboardApi } from "./RamboardApi.ts";
import { RamboardPanel } from "./RamboardPanel.ts";

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

export function activate(context: vscode.ExtensionContext): void {
  const api = new RamboardApi(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("maiboard.openBoard", () => {
      RamboardPanel.open(
        context,
        api,
        { title: "Maitake Board", route: api.routeFor("board") },
        firstColumn(),
      );
    }),
    vscode.commands.registerCommand("maiboard.openTickets", () => {
      RamboardPanel.open(
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
      RamboardPanel.open(
        context,
        api,
        { title: `Maitake ${id}`, route: api.routeFor("ticket", id) },
        firstColumn(),
      );
    }),
    vscode.commands.registerCommand("maiboard.startReview", async (arg?: unknown) => {
      const id =
        normalizeTicketArg(arg) ??
        (await vscode.window.showInputBox({
          title: "Review Maitake Ticket",
          prompt: "Ticket ID to review (PR or review ticket)",
          placeHolder: "pv-mrhs",
        }));
      if (!id) return;
      RamboardPanel.open(
        context,
        api,
        { title: `Maitake Review ${id}`, route: api.routeFor("review", id) },
        firstColumn(),
      );
    }),
    vscode.commands.registerCommand("maiboard.openReview", async (arg?: unknown) => {
      await vscode.commands.executeCommand("maiboard.startReview", arg);
    }),
    vscode.commands.registerCommand("maiboard.refreshRamboardAssets", async () => {
      const extensionRoot = dirname(dirname(fileURLToPath(import.meta.url)));
      const source = join(extensionRoot, "..", "ramboard", "dist");
      const target = join(extensionRoot, "vendor", "ramboard");
      if (!existsSync(source)) {
        vscode.window.showErrorMessage(`Ramboard dist not found: ${source}`);
        return;
      }
      rmSync(target, { recursive: true, force: true });
      cpSync(source, target, { recursive: true });
      vscode.window.showInformationMessage("Refreshed Ramboard assets.");
    }),
  );
}

export function deactivate(): void {}
