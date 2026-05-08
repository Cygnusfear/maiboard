import * as vscode from "vscode";
import { createServer, type Server } from "node:http";
import { isReviewHandoffToken, isTicketId } from "./reviewHandoff.ts";

export const MAIBOARD_LINK_SERVER_PORT = 39287;
const LEGACY_LINK_SERVER_PORT = 3777;

type OpenReview = (token: string) => Promise<void>;
type OpenTicket = (ticketId: string) => Promise<void>;

function html(message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>Maiboard</title><body style="font: 13px system-ui; background: #09090b; color: #e4e4e7; padding: 24px">${message}</body>`;
}

export function startLinkServer({
  openReview,
  openTicket,
}: {
  openReview: OpenReview;
  openTicket: OpenTicket;
}): vscode.Disposable {
  const servers: Server[] = [];
  let server: Server | null = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
      const reviewMatch = url.pathname.match(/^\/review\/([^/?#]+)$/);
      const ticketMatch = url.pathname.match(/^\/ticket\/([^/?#]+)$/);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");

      if (url.pathname === "/health") {
        res.end(html("Maiboard link opener is running."));
        return;
      }

      if (reviewMatch?.[1]) {
        const token = decodeURIComponent(reviewMatch[1]);
        if (!isReviewHandoffToken(token)) {
          res.statusCode = 400;
          res.end(html("Invalid Maiboard review token."));
          return;
        }
        await openReview(token);
        res.end(html("Opened Maiboard review. You can close this tab."));
        return;
      }

      if (ticketMatch?.[1]) {
        const ticketId = decodeURIComponent(ticketMatch[1]);
        if (!isTicketId(ticketId)) {
          res.statusCode = 400;
          res.end(html("Invalid Maiboard ticket id."));
          return;
        }
        await openTicket(ticketId);
        res.end(html("Opened Maiboard ticket. You can close this tab."));
        return;
      }

      res.statusCode = 404;
      res.end(html("Unknown Maiboard link."));
    })().catch((error) => {
      res.statusCode = 500;
      res.end(
        html(`Maiboard link error: ${error instanceof Error ? error.message : String(error)}`),
      );
    });
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") return;
    vscode.window.showWarningMessage(`Maiboard link opener failed: ${error.message}`);
  });

  server.listen(MAIBOARD_LINK_SERVER_PORT, "127.0.0.1");
  servers.push(server);

  const legacyServer = createServer(
    server.listeners("request")[0] as Parameters<typeof createServer>[0],
  );
  legacyServer.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") return;
    vscode.window.showWarningMessage(`Maiboard legacy link opener failed: ${error.message}`);
  });
  legacyServer.listen(LEGACY_LINK_SERVER_PORT, "127.0.0.1");
  servers.push(legacyServer);

  return new vscode.Disposable(() => {
    for (const item of servers) item.close();
    server = null;
  });
}
