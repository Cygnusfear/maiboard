import * as vscode from "vscode";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface ReviewHandoffPayload {
  version: 1;
  token: string;
  createdAt: string;
  worktree: string;
  base?: string;
  head?: string;
  commits: string[];
  commitOrder?: "oldest-to-newest";
  branch?: string;
  ticket?: string;
  worker?: string;
  session?: string;
}

const TOKEN_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/;
const PENDING_TOKEN_KEY = "maiboard.pendingReviewHandoffToken";
const HEX_RE = /^[0-9a-f]{7,64}$/i;

export function isReviewHandoffToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

export function handoffDir(): string {
  return join(homedir(), ".maitake", "review-handoffs");
}

export function handoffPath(token: string): string {
  if (!isReviewHandoffToken(token)) throw new Error("invalid review handoff token");
  return join(handoffDir(), token + ".json");
}

function stringField(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validateCommits(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("review handoff commits must be an array");
  const commits = value.map((item) => String(item).trim()).filter(Boolean);
  if (commits.length === 0) throw new Error("review handoff commits must not be empty");
  const invalid = commits.find((commit) => !HEX_RE.test(commit));
  if (invalid) throw new Error(`review handoff has invalid commit: ${invalid}`);
  return commits;
}

export function readReviewHandoff(token: string): ReviewHandoffPayload {
  const file = handoffPath(token);
  if (!existsSync(file)) throw new Error(`review handoff not found: ${token}`);
  const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  if (raw.version !== 1) throw new Error("unsupported review handoff version");
  const payloadToken = stringField(raw, "token") ?? token;
  if (payloadToken !== token || !isReviewHandoffToken(payloadToken)) {
    throw new Error("review handoff token mismatch");
  }
  const worktree = stringField(raw, "worktree");
  if (!worktree) throw new Error("review handoff worktree is required");
  const commits = validateCommits(raw.commits);
  const payload: ReviewHandoffPayload = {
    version: 1,
    token,
    createdAt: stringField(raw, "createdAt") ?? "",
    worktree: resolve(worktree),
    commits,
    commitOrder: "oldest-to-newest",
  };
  const base = stringField(raw, "base");
  if (base) payload.base = base;
  const head = stringField(raw, "head");
  if (head) payload.head = head;
  const branch = stringField(raw, "branch");
  if (branch) payload.branch = branch;
  const ticket = stringField(raw, "ticket");
  if (ticket) payload.ticket = ticket;
  const worker = stringField(raw, "worker");
  if (worker) payload.worker = worker;
  const session = stringField(raw, "session");
  if (session) payload.session = session;
  return payload;
}

export function workspaceMatchesHandoff(payload: ReviewHandoffPayload): boolean {
  const worktree = resolve(payload.worktree);
  return (vscode.workspace.workspaceFolders ?? []).some(
    (folder) => resolve(folder.uri.fsPath) === worktree,
  );
}

export async function rememberPendingReviewHandoff(
  context: vscode.ExtensionContext,
  token: string,
): Promise<void> {
  if (!isReviewHandoffToken(token)) throw new Error("invalid review handoff token");
  await context.globalState.update(PENDING_TOKEN_KEY, { token, at: Date.now() });
}

export async function consumePendingReviewHandoff(
  context: vscode.ExtensionContext,
): Promise<string | null> {
  const value = context.globalState.get<{ token?: unknown; at?: unknown }>(PENDING_TOKEN_KEY);
  const token = typeof value?.token === "string" ? value.token : "";
  if (!token || !isReviewHandoffToken(token)) return null;
  await context.globalState.update(PENDING_TOKEN_KEY, undefined);
  return token;
}

export function tokenFromReviewUri(uri: vscode.Uri): string | null {
  const pathMatch = uri.path.match(/^\/review\/([^/?#]+)$/);
  const queryToken = new URLSearchParams(uri.query).get("token");
  const token = pathMatch?.[1] ? decodeURIComponent(pathMatch[1]) : queryToken;
  if (!token || !isReviewHandoffToken(token)) return null;
  return token;
}
