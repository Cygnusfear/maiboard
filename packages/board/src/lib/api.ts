import type { ProjectSummary, TicketSummary, Ticket, SavedView } from "./types";

const BASE = "/api";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getProjects(): Promise<ProjectSummary[]> {
  return fetchJson("/projects");
}

export async function deleteProject(projectId: string): Promise<void> {
  await fetchJson(`/projects/${projectId}`, { method: "DELETE" });
}

export async function reorderProjects(ids: string[]): Promise<void> {
  await fetchJson("/projects/reorder", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

export async function getTickets(
  projectId: string,
  params?: Record<string, string>,
): Promise<TicketSummary[]> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchJson(`/projects/${projectId}/tickets${qs}`);
}

export async function getTicket(projectId: string, ticketId: string): Promise<Ticket> {
  return fetchJson(`/projects/${projectId}/tickets/${ticketId}`);
}

export async function updateTicket(
  projectId: string,
  ticketId: string,
  update: Record<string, unknown>,
): Promise<void> {
  await fetchJson(`/projects/${projectId}/tickets/${ticketId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
}

export async function getViews(projectId: string): Promise<SavedView[]> {
  return fetchJson(`/projects/${projectId}/views`);
}

export async function saveViewApi(projectId: string, view: object): Promise<SavedView> {
  const isUpdate = "id" in view;
  const method = isUpdate ? "PUT" : "POST";
  const url = isUpdate
    ? `/projects/${projectId}/views/${(view as any).id}`
    : `/projects/${projectId}/views`;
  return fetchJson(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(view),
  });
}

export async function deleteViewApi(projectId: string, viewId: string): Promise<void> {
  await fetchJson(`/projects/${projectId}/views/${viewId}`, { method: "DELETE" });
}

// ── Review API (Maiboard-only routes; benign 404 outside Maiboard webview) ─────

export interface GitRefs {
  defaultBranch: string;
  currentBranch: string | null;
  branches: string[];
}

export interface GitCommit {
  hash: string;
  short: string;
  subject: string;
  author: string;
  date: string;
}

export async function getGitRefs(projectId: string): Promise<GitRefs> {
  return fetchJson(`/projects/${projectId}/git/refs`);
}

export async function getGitLog(
  projectId: string,
  base: string,
  head: string,
): Promise<{ commits: GitCommit[] }> {
  const qs = new URLSearchParams({ base, head }).toString();
  return fetchJson(`/projects/${projectId}/git/log?${qs}`);
}

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

export async function getReviewHandoff(token: string): Promise<ReviewHandoffPayload> {
  return fetchJson(`/review-handoffs/${encodeURIComponent(token)}`);
}

export async function getGitDiff(
  projectId: string,
  payload: {
    base?: string;
    head?: string;
    commits?: string[];
    commitOrder?: "oldest-to-newest" | "newest-to-oldest";
    detectRenames?: boolean;
    paths?: string[];
    workingTree?: boolean;
  },
): Promise<{ base: string; head: string; patch: string }> {
  return fetchJson(`/projects/${projectId}/git/diff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function postReviewComment(
  projectId: string,
  ticketId: string,
  payload: { file: string; line: number; endLine?: number; body: string },
): Promise<void> {
  await fetchJson(`/projects/${projectId}/tickets/${ticketId}/review/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function postTicketNote(
  projectId: string,
  ticketId: string,
  body: string,
): Promise<void> {
  await fetchJson(`/projects/${projectId}/tickets/${ticketId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export async function postReviewVerdict(
  projectId: string,
  ticketId: string,
  payload: { kind: "approve" | "request"; message?: string },
): Promise<void> {
  await fetchJson(`/projects/${projectId}/tickets/${ticketId}/review/verdict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function patchReviewComment(
  projectId: string,
  ticketId: string,
  payload: { timestamp: string; body: string },
): Promise<void> {
  await fetchJson(`/projects/${projectId}/tickets/${ticketId}/review/comments/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteReviewComment(
  projectId: string,
  ticketId: string,
  payload: { timestamp: string },
): Promise<void> {
  await fetchJson(`/projects/${projectId}/tickets/${ticketId}/review/comments/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
