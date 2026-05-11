/**
 * maiComments.ts — `@mai:` inline review comment system for Maiboard.
 *
 * Scans for `@mai: [ticket-id?] comment text` markers in source code.
 * On save, unregistered comments become mai task tickets (kind=task, tags
 * `mai-comment,inline,hooman`) with the source line rewritten to embed the
 * new id. Registered comments sync title/body back to the ticket so moving
 * or editing a comment updates the ticket. Cross-references inside the
 * comment body (`[id]`, `[[id]]`) get wired as `mai dep`.
 *
 * Decorations show open (amber) vs closed (green ✓) inline.
 *
 * Project resolution: each call resolves the workspace folder containing the
 * document, so multi-root workspaces map files to the right mai project.
 */

import * as vscode from "vscode";
import { mai } from "../mai/mai.ts";

// ─── Types ───────────────────────────────────────────────────────────

export interface MaiComment {
  /** 0-indexed line number of the @mai: line */
  lineIndex: number;
  /** 1-indexed line number of the @mai: line */
  lineNumber: number;
  /** 0-indexed end line of the block (inclusive) */
  endLineIndex: number;
  /** 1-indexed end line of the block (inclusive) */
  endLineNumber: number;
  /** The first line (the @mai: line) */
  rawLine: string;
  /** All lines in the block (including the @mai: line) */
  rawLines: string[];
  /** The comment text (everything after @mai: on the first line) */
  commentText: string;
  /** The full block text (all lines joined) */
  fullText: string;
  /** mai ticket ID if registered, null if unregistered */
  ticketId: string | null;
}

// ─── Regex ───────────────────────────────────────────────────────────

const MAI_COMMENT_RE = /@mai:\s*(?:\[(\S+?)\]\s*)?(.+)$/;

function getCommentPrefix(line: string): string | null {
  const trimmed = line.trimStart();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith("@mai:")) return null;
  const prefixes = ["///", "//!", "//", "#", "--", "%", ";", "/*", "*", "<!--"];
  for (const p of prefixes) if (trimmed.startsWith(p)) return p;
  return null;
}

// ─── Scanning ────────────────────────────────────────────────────────

export function scanComments(text: string): MaiComment[] {
  const lines = text.split("\n");
  const comments: MaiComment[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const match = line.match(MAI_COMMENT_RE);
    if (!match) continue;

    const ticketId = match[1] ?? null;
    const commentText = (match[2] ?? "").trim();
    const rawLine = line;
    const rawLines: string[] = [rawLine];

    let endIdx = i;
    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j];
      if (nextLine === undefined) break;
      const prefix = getCommentPrefix(nextLine);
      if (prefix === null) break;
      rawLines.push(nextLine);
      endIdx = j;
    }

    const parts: string[] = [commentText];
    for (let k = 1; k < rawLines.length; k++) {
      const blockLine = rawLines[k];
      if (blockLine === undefined) continue;
      const stripped = blockLine
        .trimStart()
        .replace(/^[/#*;!%-]+\s*/, "")
        .trimEnd();
      const cleaned = stripped.replace(/\s*(?:\*\/|-->)\s*$/, "");
      if (cleaned) parts.push(cleaned);
    }

    comments.push({
      lineIndex: i,
      lineNumber: i + 1,
      endLineIndex: endIdx,
      endLineNumber: endIdx + 1,
      rawLine,
      rawLines,
      commentText,
      fullText: parts.join("\n"),
      ticketId,
    });

    i = endIdx;
  }

  return comments;
}

function extractRefs(text: string): string[] {
  const refs = new Set<string>();
  const wikiRe = /\[\[(\w{2,4}-\w{2,5})\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = wikiRe.exec(text)) !== null) refs.add(m[1]!);
  const bracketRe = /\[(\w{2,4}-\w{2,5})\]/g;
  while ((m = bracketRe.exec(text)) !== null) refs.add(m[1]!);
  return [...refs];
}

// ─── mai operations (project-scoped) ─────────────────────────────────

const TAGS = "mai-comment,inline,hooman";

async function maiOk(
  projectPath: string,
  args: string[],
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const r = await mai(projectPath, args);
  return { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr };
}

/** Create a mai-comment ticket. Returns the new ticket id. */
export async function createMaiCommentTicket(
  projectPath: string,
  relPath: string,
  lineNumber: number,
  commentText: string,
  fullText: string,
): Promise<string> {
  const title = `[mai] ${relPath}:${lineNumber} — ${commentText.slice(0, 80)}`;
  const description = `File: ${relPath}\nLine: ${lineNumber}\n\n${fullText}`;
  const r = await maiOk(projectPath, [
    "create",
    "-k",
    "task",
    "-l",
    TAGS,
    "--target",
    relPath,
    "-d",
    description,
    title,
  ]);
  if (!r.ok) throw new Error(r.stderr.trim() || "mai create failed");
  const lastLine = r.stdout.trim().split("\n").pop();
  if (!lastLine) throw new Error("mai create returned empty output");
  const ticketId = lastLine.trim();
  if (!/^[\w-]+$/.test(ticketId)) throw new Error(`unexpected mai output: ${lastLine}`);

  for (const refId of extractRefs(fullText)) {
    if (refId === ticketId) continue;
    await maiOk(projectPath, ["dep", ticketId, refId]); // best-effort
  }

  return ticketId;
}

/** Sync a registered ticket with current comment state (title + description + deps). */
export async function syncRegisteredTicket(
  projectPath: string,
  ticketId: string,
  relPath: string,
  lineNumber: number,
  commentText: string,
  fullText: string,
): Promise<void> {
  const title = `[mai] ${relPath}:${lineNumber} — ${commentText.slice(0, 80)}`;
  const description = `File: ${relPath}\nLine: ${lineNumber}\n\n${fullText}`;
  await maiOk(projectPath, ["edit", ticketId, "-d", description]);
  await maiOk(projectPath, ["title", ticketId, title]);
  for (const refId of extractRefs(fullText)) {
    if (refId === ticketId) continue;
    await maiOk(projectPath, ["dep", ticketId, refId]); // best-effort
  }
}

/** Get ticket status by parsing `mai show`. Returns 'open' | 'in_progress' | 'closed' | 'unknown'. */
export async function getTicketStatus(projectPath: string, ticketId: string): Promise<string> {
  const r = await mai(projectPath, ["show", ticketId]);
  if (r.exitCode !== 0) return "unknown";
  const m = r.stdout.match(/\[(open|in_progress|closed)\]/);
  return m ? m[1]! : "unknown";
}

/** Add a resolution note then close. */
export async function resolveTicket(
  projectPath: string,
  ticketId: string,
  resolution: string,
): Promise<void> {
  if (resolution.trim()) await maiOk(projectPath, ["add-note", ticketId, resolution]);
  await maiOk(projectPath, ["close", ticketId]);
}

/** Raw output of `mai ls -l mai-comment --status open` for the quickpick. */
export async function listOpenMaiComments(projectPath: string): Promise<string> {
  const r = await mai(projectPath, ["ls", "-l", "mai-comment", "--status", "open"]);
  return r.exitCode === 0 ? r.stdout.trim() : "";
}

// ─── Decorations ─────────────────────────────────────────────────────

let openDecoration: vscode.TextEditorDecorationType | undefined;
let closedDecoration: vscode.TextEditorDecorationType | undefined;

function getOpenDecoration(): vscode.TextEditorDecorationType {
  if (!openDecoration) {
    openDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(229, 192, 123, 0.18)",
      border: "1px solid rgba(229, 192, 123, 0.35)",
      borderRadius: "3px",
      overviewRulerColor: "#e5c07b",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      isWholeLine: true,
    });
  }
  return openDecoration;
}

function getClosedDecoration(): vscode.TextEditorDecorationType {
  if (!closedDecoration) {
    closedDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(63, 185, 80, 0.10)",
      border: "1px solid rgba(63, 185, 80, 0.25)",
      borderRadius: "3px",
      overviewRulerColor: "#3fb950",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      isWholeLine: true,
    });
  }
  return closedDecoration;
}

interface MaiDecorationOptions extends vscode.DecorationOptions {
  renderOptions?: {
    after?: { contentText?: string; color?: string; fontStyle?: string; margin?: string };
  };
}

export async function updateDecorations(editor: vscode.TextEditor): Promise<void> {
  if (editor.document.uri.scheme !== "file") return;
  const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!folder) return;

  const text = editor.document.getText();
  const comments = scanComments(text);
  if (comments.length === 0) {
    editor.setDecorations(getOpenDecoration(), []);
    editor.setDecorations(getClosedDecoration(), []);
    return;
  }

  const uniqueIds = [...new Set(comments.filter((c) => c.ticketId).map((c) => c.ticketId!))];
  const statusMap = new Map<string, string>();
  await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        statusMap.set(id, await getTicketStatus(folder.uri.fsPath, id));
      } catch {
        statusMap.set(id, "unknown");
      }
    }),
  );

  const openOpts: MaiDecorationOptions[] = [];
  const closedOpts: MaiDecorationOptions[] = [];

  for (const comment of comments) {
    const range = new vscode.Range(
      comment.lineIndex,
      0,
      comment.endLineIndex,
      Number.MAX_SAFE_INTEGER,
    );
    const isClosed = comment.ticketId && statusMap.get(comment.ticketId) === "closed";
    const badge = comment.ticketId
      ? isClosed
        ? `  \u2713 ${comment.ticketId}`
        : `  \u25CF ${comment.ticketId}`
      : "  \u25CF";
    const hover = comment.ticketId
      ? new vscode.MarkdownString(
          isClosed
            ? `**@mai: ${comment.ticketId}** — \u2713 resolved`
            : `**@mai: ${comment.ticketId}** — ${comment.commentText}`,
        )
      : new vscode.MarkdownString(`**@mai:** ${comment.commentText} *(unregistered)*`);

    const decoOptions: MaiDecorationOptions = {
      range,
      hoverMessage: hover,
      renderOptions: {
        after: {
          contentText: badge,
          color: isClosed ? "#3fb950" : "#e5c07b",
          fontStyle: "bold",
          margin: "0 0 0 1em",
        },
      },
    };
    if (isClosed) closedOpts.push(decoOptions);
    else openOpts.push(decoOptions);
  }

  editor.setDecorations(getOpenDecoration(), openOpts);
  editor.setDecorations(getClosedDecoration(), closedOpts);
}

export function clearDecorations(): void {
  openDecoration?.dispose();
  closedDecoration?.dispose();
  openDecoration = undefined;
  closedDecoration = undefined;
}

// ─── Save handler + quickpick + resolve at cursor ────────────────────

/** Handle save: register unregistered @mai: blocks; sync registered ones. */
export async function handleMaiSave(doc: vscode.TextDocument): Promise<void> {
  if (doc.uri.scheme !== "file") return;
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  if (!folder) return;
  const projectPath = folder.uri.fsPath;
  const relPath = vscode.workspace.asRelativePath(doc.uri, false);

  const text = doc.getText();
  const allComments = scanComments(text);
  if (allComments.length === 0) return;

  const unregistered = allComments.filter((c) => c.ticketId === null);
  const registered = allComments.filter((c) => c.ticketId !== null);

  if (unregistered.length > 0) {
    const edits = new vscode.WorkspaceEdit();
    let createdAny = false;
    for (const comment of unregistered) {
      try {
        const ticketId = await createMaiCommentTicket(
          projectPath,
          relPath,
          comment.lineNumber,
          comment.commentText,
          comment.fullText,
        );
        const lineRange = new vscode.Range(
          comment.lineIndex,
          0,
          comment.endLineIndex,
          (comment.rawLines.at(-1) ?? "").length,
        );
        const newLine = comment.rawLine.replace(/@mai:\s*/, `@mai: [${ticketId}] `);
        edits.replace(doc.uri, lineRange, newLine);
        createdAny = true;
        vscode.window.setStatusBarMessage(`@mai: ticket ${ticketId} created`, 3000);
      } catch (err) {
        vscode.window.showWarningMessage(
          `@mai: failed at ${relPath}:${comment.lineNumber}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (createdAny) {
      await vscode.workspace.applyEdit(edits);
      await doc.save();
      const editor = vscode.window.visibleTextEditors.find((e) => e.document === doc);
      if (editor) await updateDecorations(editor);
      return;
    }
  }

  for (const comment of registered) {
    try {
      await syncRegisteredTicket(
        projectPath,
        comment.ticketId!,
        relPath,
        comment.lineNumber,
        comment.commentText,
        comment.fullText,
      );
    } catch (err) {
      vscode.window.setStatusBarMessage(
        `@mai: sync ${comment.ticketId} failed: ${err instanceof Error ? err.message : String(err)}`,
        4000,
      );
    }
  }

  const editor = vscode.window.visibleTextEditors.find((e) => e.document === doc);
  if (editor) await updateDecorations(editor);
}

/** Quickpick of open @mai: tickets, copies the chosen id. */
export async function maiCommentListCommand(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage("No workspace folder open.");
    return;
  }
  const out = await listOpenMaiComments(folder.uri.fsPath);
  if (!out) {
    vscode.window.showInformationMessage("No open @mai: tickets.");
    return;
  }
  const items = out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\S+)\s+(?:\[([^\]]+)\]\s+)?(.+)$/);
      return m ? { label: m[1]!, description: m[2] ? `[${m[2]}]` : "", detail: m[3]! } : null;
    })
    .filter((i): i is { label: string; description: string; detail: string } => Boolean(i?.label));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: "Open @mai: tickets" });
  if (picked) {
    await vscode.env.clipboard.writeText(picked.label);
    vscode.window.setStatusBarMessage(`Copied ${picked.label}`, 3000);
  }
}

/** At cursor, find `@mai: [id]`, prompt for resolution, close. */
export async function maiCommentResolveCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!folder) return;
  const projectPath = folder.uri.fsPath;
  const line = editor.document.lineAt(editor.selection.active.line).text;
  const m = line.match(/@mai:\s*\[(\S+?)\]/);
  if (!m) {
    vscode.window.showWarningMessage("No @mai: comment with ticket ID at cursor.");
    return;
  }
  const ticketId = m[1]!;
  const resolution = await vscode.window.showInputBox({
    title: `Resolve @mai: ${ticketId}`,
    prompt: "Resolution note (optional)",
    placeHolder: "fixed in this commit",
  });
  if (resolution === undefined) return; // cancelled
  try {
    await resolveTicket(projectPath, ticketId, resolution);
    vscode.window.setStatusBarMessage(`@mai: ${ticketId} resolved`, 3000);
    await updateDecorations(editor);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to resolve ${ticketId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
