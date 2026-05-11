/**
 * Ticket parser — reads from maitake (git notes) via the `mai` CLI.
 *
 * `mai --json ls`   → StateSummary[] (list view — no body, no deps/links)
 * `mai --json show` → State (detail view — full data)
 */
import { maiJson, type MaiStateSummary, type MaiState } from "../mai/cli";
import type { TicketSummary, Ticket, TicketEvent } from "@maiboard/api";

export type { TicketSummary, Ticket };

// ── List (for /api/projects/:id/tickets) ────────────────────

export async function listTickets(
  projectPath: string,
  projectId: string,
): Promise<TicketSummary[]> {
  const args = ["ls", "--status=all"];
  const raw = await maiJson<MaiStateSummary[]>(projectPath, args);
  if (!raw) return [];

  return raw.map((s) => summaryFromMai(s, projectId));
}

// ── Detail (for /api/projects/:id/tickets/:tid) ─────────────

export async function getTicketDetail(
  projectPath: string,
  projectId: string,
  ticketId: string,
): Promise<Ticket | null> {
  const raw = await maiJson<MaiState>(projectPath, ["show", ticketId]);
  if (!raw) return null;

  return ticketFromMai(raw, projectId);
}

// ── Mappers ─────────────────────────────────────────────────

function normalizeStatus(s: string): TicketSummary["status"] {
  if (s === "open" || s === "in_progress" || s === "closed") return s;
  return "open";
}

function summaryFromMai(s: MaiStateSummary, projectId: string): TicketSummary {
  return {
    id: s.id,
    kind: s.kind || "ticket",
    status: normalizeStatus(s.status),
    type: s.type || "",
    priority: s.priority ?? 2,
    tags: s.tags ?? [],
    deps: s.deps ?? [],
    links: s.links ?? [],
    targets: s.targets ?? [],
    created: s.createdAt || "",
    modified: s.updatedAt || s.createdAt || "",
    assignee: s.assignee || undefined,
    branch: s.branch || undefined,
    title: s.title || s.id,
    project: projectId,
  };
}

function ticketFromMai(s: MaiState, projectId: string): Ticket {
  return {
    ...summaryFromMai(s, projectId),
    body: s.body || "",
    events: Array.isArray(s.events) ? (s.events as TicketEvent[]) : [],
  };
}
