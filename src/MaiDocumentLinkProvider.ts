/**
 * Document link provider for `[mai-ticket-id]` references.
 *
 * Matches `[xx-yyyyy]` patterns (lowercase 2-4 letter prefix, hyphen, 4-8
 * alphanumeric) anywhere in any text document and turns them into Cmd/Alt-
 * clickable links that run `maiboard.openTicket` with the matched id.
 *
 * Selector "*" so this works in source files, markdown, plain text, mai notes,
 * and any other text doc — same behavior pi-vscode used to have.
 */

import * as vscode from "vscode";

const TICKET_ID = "([a-z]{2,4}-[a-z0-9]{4,8})";
const MAI_TICKET_RE = new RegExp(`\\[${TICKET_ID}\\]`, "g");
const MAI_TICKET_LINK_RE = new RegExp(
  `(?:mai|vscode):\\/\\/(?:pi0\\.maiboard\\/)?ticket\\/${TICKET_ID}`,
  "g",
);
const MAI_REVIEW_LINK_RE = /mai:\/\/review\/([a-zA-Z0-9][a-zA-Z0-9_-]{2,63})/g;

export class MaiDocumentLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const text = document.getText();
    const links: vscode.DocumentLink[] = [];
    for (const match of text.matchAll(MAI_TICKET_LINK_RE)) {
      const ticketId = match[1];
      if (!ticketId || match.index === undefined) continue;
      const start = document.positionAt(match.index);
      const end = document.positionAt(match.index + match[0].length);
      const args = encodeURIComponent(JSON.stringify([ticketId]));
      const link = new vscode.DocumentLink(
        new vscode.Range(start, end),
        vscode.Uri.parse("command:maiboard.openTicket?" + args),
      );
      link.tooltip = "Open mai ticket " + ticketId;
      links.push(link);
    }

    for (const match of text.matchAll(MAI_REVIEW_LINK_RE)) {
      const token = match[1];
      if (!token || match.index === undefined) continue;
      const start = document.positionAt(match.index);
      const end = document.positionAt(match.index + match[0].length);
      const args = encodeURIComponent(JSON.stringify([token]));
      const link = new vscode.DocumentLink(
        new vscode.Range(start, end),
        vscode.Uri.parse("command:maiboard.openReviewHandoff?" + args),
      );
      link.tooltip = "Open Maiboard review handoff " + token;
      links.push(link);
    }

    for (const match of text.matchAll(MAI_TICKET_RE)) {
      const ticketId = match[1];
      if (!ticketId || match.index === undefined) continue;
      const start = document.positionAt(match.index);
      const end = document.positionAt(match.index + match[0].length);
      const args = encodeURIComponent(JSON.stringify([{ id: ticketId }]));
      const link = new vscode.DocumentLink(
        new vscode.Range(start, end),
        vscode.Uri.parse("command:maiboard.openTicket?" + args),
      );
      link.tooltip = "Open mai ticket " + ticketId;
      links.push(link);
    }
    return links;
  }
}
