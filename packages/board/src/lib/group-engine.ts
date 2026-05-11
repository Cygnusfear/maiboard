/**
 * group-engine.ts — Pure grouping logic for list view.
 *
 * Three modes: status, type, epic.
 * Status/type are flat field-value grouping.
 * Epic is transitive graph-walk: BFS across deps/links to the nearest epic.
 */

import type { TicketSummary } from "./types";

// ── Types ─────────────────────────────────────────────────────

export type GroupField = "status" | "type" | "epic";

export interface TicketGroup {
  /** Group identity: field value or epic ticket ID */
  key: string;
  /** Display name: "Open", "Bug", or epic title */
  label: string;
  /** For epic grouping only — the epic ticket itself (clickable header) */
  epic?: TicketSummary;
  /** Child tickets in this group (pre-sorted) */
  tickets: TicketSummary[];
}

export type FlatRow =
  | { type: "group-header"; group: TicketGroup }
  | { type: "ticket"; ticket: TicketSummary; groupKey: string };

// ── Canonical group ordering ──────────────────────────────────

const STATUS_ORDER: Record<string, number> = {
  open: 0,
  in_progress: 1,
  closed: 2,
};

const TYPE_ORDER: Record<string, number> = {
  epic: 0,
  feature: 1,
  task: 2,
  bug: 3,
  chore: 4,
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  closed: "Closed",
};

const TYPE_LABELS: Record<string, string> = {
  epic: "Epic",
  feature: "Feature",
  task: "Task",
  bug: "Bug",
  chore: "Chore",
};

// ── Grouping ──────────────────────────────────────────────────

/**
 * Group an already-sorted ticket list by a field.
 * Sort order within groups is preserved from input.
 */
export function groupTickets(
  tickets: TicketSummary[],
  groupBy: GroupField,
  graphTickets: TicketSummary[] = tickets,
): TicketGroup[] {
  if (groupBy === "epic") return groupByEpic(tickets, graphTickets);
  return groupByField(tickets, groupBy);
}

function groupByField(tickets: TicketSummary[], field: "status" | "type"): TicketGroup[] {
  const orderMap = field === "status" ? STATUS_ORDER : TYPE_ORDER;
  const labelMap = field === "status" ? STATUS_LABELS : TYPE_LABELS;

  const buckets = new Map<string, TicketSummary[]>();

  for (const t of tickets) {
    const key = field === "status" ? t.status : t.type;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(t);
  }

  // Sort groups by canonical order, unknowns at end
  const entries = [...buckets.entries()];
  entries.sort(([a], [b]) => (orderMap[a] ?? 99) - (orderMap[b] ?? 99));

  return entries.map(([key, tix]) => ({
    key,
    label: labelMap[key] ?? key.charAt(0).toUpperCase() + key.slice(1),
    tickets: tix,
  }));
}

// ── Ancestry graph — shared by grouping + filtering ───────────

/**
 * Build a map: ticketId → Set of all ancestor ticket IDs (transitive).
 * Walks deps + links upward with BFS. Cycle-safe.
 */
export function buildAncestryMap(tickets: TicketSummary[]): Map<string, Set<string>> {
  const idSet = new Set(tickets.map((t) => t.id));

  // child → direct parents (only those in the ticket set)
  const parentIds = new Map<string, readonly string[]>();
  for (const t of tickets) {
    const parents = [...t.deps, ...t.links].filter((id) => idSet.has(id));
    if (parents.length > 0) parentIds.set(t.id, parents);
  }

  const cache = new Map<string, Set<string>>();

  function resolve(id: string): Set<string> {
    if (cache.has(id)) return cache.get(id)!;

    const ancestors = new Set<string>();
    const visited = new Set<string>();
    // Copy into a mutable queue — never mutate parentIds entries
    const queue = [...(parentIds.get(id) ?? [])];
    visited.add(id);

    while (queue.length > 0) {
      const pid = queue.shift()!;
      if (visited.has(pid)) continue;
      visited.add(pid);
      ancestors.add(pid);
      const grandparents = parentIds.get(pid);
      if (grandparents) {
        for (const gp of grandparents) {
          if (!visited.has(gp)) queue.push(gp);
        }
      }
    }

    cache.set(id, ancestors);
    return ancestors;
  }

  const result = new Map<string, Set<string>>();
  for (const t of tickets) {
    result.set(t.id, resolve(t.id));
  }
  return result;
}

// ── Epic lookup — promoted from groupByEpic so ticket-detail can use it ───────
//
// An "epic" is a ticket with type === "epic". A ticket's "parent epic" is the
// nearest epic reachable by BFS over the undirected deps+links graph. The
// graph is undirected because either side of the relationship can encode the
// parent/child link in maitake (a child can list the epic in its deps/links,
// or the epic can list children in its own deps/links — both are observed).

export interface EpicLookup {
  /** Nearest epic for any ticket id, or null. Excludes the ticket itself. */
  nearestEpicOf(ticketId: string): TicketSummary | null;
  /** All non-epic tickets whose nearest epic is this id. Empty if id isn't an epic. */
  subTicketsOf(epicId: string): TicketSummary[];
}

export function buildEpicLookup(tickets: TicketSummary[]): EpicLookup {
  const byId = new Map<string, TicketSummary>();
  for (const t of tickets) byId.set(t.id, t);
  const ids = new Set(byId.keys());

  const adjacency = new Map<string, string[]>();
  for (const t of tickets) {
    const neighbors = [...t.deps, ...t.links].filter((id) => ids.has(id));
    if (!adjacency.has(t.id)) adjacency.set(t.id, []);
    for (const neighbor of neighbors) {
      adjacency.get(t.id)!.push(neighbor);
      if (!adjacency.has(neighbor)) adjacency.set(neighbor, []);
      adjacency.get(neighbor)!.push(t.id);
    }
  }

  const epicIds = new Set(tickets.filter((t) => t.type === "epic").map((t) => t.id));

  function nearestEpicIdFrom(ticketId: string): string | null {
    const visited = new Set<string>([ticketId]);
    const queue = [...(adjacency.get(ticketId) ?? [])];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      // Exclude the ticket itself: an epic's "nearest epic" is the next one up,
      // not itself.
      if (current !== ticketId && epicIds.has(current)) return current;
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) queue.push(next);
      }
    }
    return null;
  }

  return {
    nearestEpicOf(ticketId: string): TicketSummary | null {
      const epicId = nearestEpicIdFrom(ticketId);
      return epicId ? (byId.get(epicId) ?? null) : null;
    },
    subTicketsOf(epicId: string): TicketSummary[] {
      const epic = byId.get(epicId);
      if (!epic || epic.type !== "epic") return [];
      // A "sub-ticket" is any non-epic whose nearest epic is this one.
      return tickets.filter(
        (t) => t.id !== epicId && t.type !== "epic" && nearestEpicIdFrom(t.id) === epicId,
      );
    },
  };
}

// ── Epic grouping — transitive reference graph walk ───────────

function groupByEpic(tickets: TicketSummary[], graphTickets: TicketSummary[]): TicketGroup[] {
  // Index the full project graph by ID so grouping still works when the
  // current visible list filters out closed epics or intermediate parents.
  const byId = new Map<string, TicketSummary>();
  for (const t of graphTickets) byId.set(t.id, t);

  const graphIds = new Set(graphTickets.map((t) => t.id));
  const adjacency = new Map<string, string[]>();
  for (const t of graphTickets) {
    const neighbors = [...t.deps, ...t.links].filter((id) => graphIds.has(id));
    if (!adjacency.has(t.id)) adjacency.set(t.id, []);
    for (const neighbor of neighbors) {
      adjacency.get(t.id)!.push(neighbor);
      if (!adjacency.has(neighbor)) adjacency.set(neighbor, []);
      adjacency.get(neighbor)!.push(t.id);
    }
  }

  // Visible epics stay in visible order. Hidden epics can still become group
  // headers when visible tickets connect to them through the full graph.
  const epicTickets = tickets.filter((t) => t.type === "epic");
  const epicIds = new Set(graphTickets.filter((t) => t.type === "epic").map((t) => t.id));

  function nearestEpicId(ticketId: string): string | null {
    const visited = new Set<string>([ticketId]);
    const queue = [...(adjacency.get(ticketId) ?? [])];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      if (epicIds.has(current)) return current;
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) queue.push(next);
      }
    }

    return null;
  }

  // Assign each non-epic visible ticket to its nearest epic in the full graph.
  const buckets = new Map<string, TicketSummary[]>();
  const ungrouped: TicketSummary[] = [];

  for (const t of tickets) {
    if (t.type === "epic") continue;

    const epicId = nearestEpicId(t.id);

    if (epicId) {
      let bucket = buckets.get(epicId);
      if (!bucket) {
        bucket = [];
        buckets.set(epicId, bucket);
      }
      bucket.push(t);
    } else {
      ungrouped.push(t);
    }
  }

  // Build groups — epics in same order as input list
  const groups: TicketGroup[] = [];

  for (const epic of epicTickets) {
    const children = buckets.get(epic.id) ?? [];
    // Include the epic group even if it has no visible children
    groups.push({
      key: epic.id,
      label: epic.title,
      epic,
      tickets: children,
    });
  }

  // Also create groups for connected epics that aren't visible in the current
  // filtered list (for example a closed epic with open child tickets).
  for (const [epicId, children] of buckets) {
    if (epicTickets.some((epic) => epic.id === epicId)) continue;
    const epicTicket = byId.get(epicId);
    groups.push({
      key: epicId,
      label: epicTicket?.title ?? epicId,
      epic: epicTicket,
      tickets: children,
    });
  }

  if (ungrouped.length > 0) {
    groups.push({
      key: "__ungrouped__",
      label: "Ungrouped",
      tickets: ungrouped,
    });
  }

  return groups;
}

// ── Flatten to virtual list ───────────────────────────────────

/**
 * Flatten groups into a flat row array for the virtualizer.
 * Collapsed groups emit only their header row.
 */
export function flattenGroups(groups: TicketGroup[], collapsedGroups: Set<string>): FlatRow[] {
  const rows: FlatRow[] = [];

  for (const group of groups) {
    rows.push({ type: "group-header", group });

    if (!collapsedGroups.has(group.key)) {
      for (const ticket of group.tickets) {
        rows.push({ type: "ticket", ticket, groupKey: group.key });
      }
    }
  }

  return rows;
}
