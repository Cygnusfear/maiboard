/**
 * Pure filter engine — no React, no stores.
 * Evaluates composite filters against ticket data.
 */
import type { TicketSummary, SortField, SortDir } from "./types";
import { buildAncestryMap } from "./group-engine";

// ── Filter types ──────────────────────────────────────────────

export type FilterField =
  | "status"
  | "priority"
  | "kind"
  | "type"
  | "tag"
  | "assignee"
  | "branch"
  | "target"
  | "parent"
  | "created"
  | "modified"
  | "title";

export type FilterOperator =
  | "is"
  | "is_not"
  | "any_of"
  | "none_of"
  | "is_empty"
  | "is_not_empty"
  | "contains"
  | "before"
  | "after"
  | "between"
  | "last_n_days"
  | "older_than"
  | "newer_than";

export interface FilterClause {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: string | number | string[] | number[] | [string, string];
}

/** All clauses are AND'd together */
export type FilterSet = FilterClause[];

/** Fields that should be surfaced prominently in the picker / preset editor. */
export const PRIMARY_FILTER_FIELDS: FilterField[] = [
  "status",
  "priority",
  "kind",
  "type",
  "tag",
  "assignee",
  "branch",
];

/** Secondary / power-user fields. */
export const SECONDARY_FILTER_FIELDS: FilterField[] = [
  "target",
  "parent",
  "created",
  "modified",
  "title",
];

/** All available filter fields in display order. */
export const FILTER_FIELDS: FilterField[] = [...PRIMARY_FILTER_FIELDS, ...SECONDARY_FILTER_FIELDS];

export const FIELD_OPERATORS: Record<FilterField, FilterOperator[]> = {
  status: ["any_of", "none_of"],
  priority: ["any_of", "none_of"],
  kind: ["any_of", "none_of"],
  type: ["any_of", "none_of"],
  tag: ["any_of", "none_of"],
  assignee: ["is", "is_not", "any_of", "none_of", "is_empty", "is_not_empty"],
  branch: ["is", "is_not", "any_of", "none_of", "is_empty", "is_not_empty"],
  target: ["contains", "is", "is_not", "is_empty", "is_not_empty"],
  parent: ["any_of", "none_of", "is_empty", "is_not_empty"],
  created: ["newer_than", "older_than", "last_n_days", "before", "after", "between"],
  modified: ["newer_than", "older_than", "last_n_days", "before", "after", "between"],
  title: ["contains"],
};

export const FIELD_LABELS: Record<FilterField, string> = {
  status: "Status",
  priority: "Priority",
  kind: "Kind",
  type: "Type",
  tag: "Tag",
  assignee: "Assignee",
  branch: "Branch",
  target: "Target file",
  parent: "Parent",
  created: "Created",
  modified: "Modified",
  title: "Title",
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  is: "is",
  is_not: "is not",
  any_of: "is any of",
  none_of: "is none of",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  contains: "contains",
  before: "before",
  after: "after",
  between: "between",
  last_n_days: "in last",
  older_than: "older than",
  newer_than: "newer than",
};

// ── Date presets ──────────────────────────────────────────────

export const DATE_PRESETS = [
  { label: "4 hours", days: 4 / 24 },
  { label: "8 hours", days: 8 / 24 },
  { label: "12 hours", days: 0.5 },
  { label: "24 hours", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
] as const;

// ── Evaluation ────────────────────────────────────────────────

function matchClause(
  ticket: TicketSummary,
  clause: FilterClause,
  ancestryMap?: Map<string, Set<string>>,
): boolean {
  const { field, operator, value } = clause;

  switch (field) {
    case "status":
      return matchSetField(ticket.status, operator, value);
    case "priority":
      return matchSetField(ticket.priority, operator, value);
    case "kind":
      return matchSetField(ticket.kind, operator, value);
    case "type":
      return matchSetField(ticket.type, operator, value);
    case "tag":
      return matchTagField(ticket.tags, operator, value);
    case "assignee":
      return matchSetField(ticket.assignee ?? "", operator, value);
    case "branch":
      return matchSetField(ticket.branch ?? "", operator, value);
    case "target":
      return matchTargetField(ticket.targets, operator, value);
    case "parent":
      return matchParentField(ticket.id, operator, value, ancestryMap);
    case "created":
      return matchDateField(ticket.created, operator, value);
    case "modified":
      return matchDateField(ticket.modified, operator, value);
    case "title":
      return matchTextField(ticket.title, operator, value);
    default:
      return true;
  }
}

function matchSetField(
  fieldValue: string | number,
  operator: FilterOperator,
  value: FilterClause["value"],
): boolean {
  const fv = String(fieldValue);
  switch (operator) {
    case "is":
      return fv === String(value);
    case "is_not":
      return fv !== String(value);
    case "any_of":
      return Array.isArray(value) && value.map(String).includes(fv);
    case "none_of":
      return Array.isArray(value) && !value.map(String).includes(fv);
    case "is_empty":
      return fv.length === 0;
    case "is_not_empty":
      return fv.length > 0;
    default:
      return true;
  }
}

function matchTagField(
  tags: string[],
  operator: FilterOperator,
  value: FilterClause["value"],
): boolean {
  if (!Array.isArray(value)) return true;
  const safeTags = Array.isArray(tags) ? tags : [];
  const vals = value as string[];

  switch (operator) {
    case "any_of":
      return vals.some((v) => safeTags.includes(v));
    case "none_of":
      return !vals.some((v) => safeTags.includes(v));
    default:
      return true;
  }
}

function matchTargetField(
  targets: string[],
  operator: FilterOperator,
  value: FilterClause["value"],
): boolean {
  const safeTargets = Array.isArray(targets) ? targets : [];

  switch (operator) {
    case "contains": {
      if (typeof value !== "string") return true;
      const q = value.trim().toLowerCase();
      if (!q) return true;
      return safeTargets.some((target) => target.toLowerCase().includes(q));
    }
    case "is":
      return typeof value === "string" && safeTargets.includes(value);
    case "is_not":
      return typeof value === "string" && !safeTargets.includes(value);
    case "is_empty":
      return safeTargets.length === 0;
    case "is_not_empty":
      return safeTargets.length > 0;
    default:
      return true;
  }
}

function matchTextField(
  fieldValue: string,
  operator: FilterOperator,
  value: FilterClause["value"],
): boolean {
  if (typeof value !== "string") return true;

  switch (operator) {
    case "contains":
      return fieldValue.toLowerCase().includes(value.toLowerCase());
    default:
      return true;
  }
}

function matchParentField(
  ticketId: string,
  operator: FilterOperator,
  value: FilterClause["value"],
  ancestryMap?: Map<string, Set<string>>,
): boolean {
  const ancestors = ancestryMap?.get(ticketId);
  const hasParent = ancestors != null && ancestors.size > 0;

  switch (operator) {
    case "is_empty":
      return !hasParent;
    case "is_not_empty":
      return hasParent;
    case "any_of": {
      if (!Array.isArray(value) || !ancestors) return !hasParent;
      return value.some((v) => ancestors.has(String(v)));
    }
    case "none_of": {
      if (!Array.isArray(value) || !ancestors) return true;
      return !value.some((v) => ancestors.has(String(v)));
    }
    default:
      return true;
  }
}

function matchDateField(
  dateStr: string,
  operator: FilterOperator,
  value: FilterClause["value"],
): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr).getTime();

  switch (operator) {
    case "before":
      return typeof value === "string" && date < new Date(value).getTime();
    case "after":
      return typeof value === "string" && date > new Date(value).getTime();
    case "between": {
      if (!Array.isArray(value) || value.length !== 2) return true;
      const [start, end] = value as [string, string];
      return date >= new Date(start).getTime() && date <= new Date(end).getTime();
    }
    case "last_n_days":
    case "newer_than": {
      if (typeof value !== "number") return true;
      const cutoff = Date.now() - value * 86400000;
      return date >= cutoff;
    }
    case "older_than": {
      if (typeof value !== "number") return true;
      const cutoff = Date.now() - value * 86400000;
      return date < cutoff;
    }
    default:
      return true;
  }
}

// ── Main filter + sort entry point ────────────────────────────

export interface FilterSortParams {
  tickets: TicketSummary[];
  filters: FilterSet;
  /** Optional board-level global filters (e.g. active pill presets) AND-applied before local filters. */
  prefixFilters?: FilterSet;
  sortField: SortField;
  sortDir: SortDir;
  /** Quick text search across title + id (independent of filter clauses) */
  search?: string;
}

export function applyFiltersAndSort(params: FilterSortParams): TicketSummary[] {
  const { tickets, filters, prefixFilters = [], sortField, sortDir, search } = params;
  let result = tickets;

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter(
      (t) => t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q),
    );
  }

  const allFilters = [...prefixFilters, ...filters];
  const needsAncestry = allFilters.some((f) => f.field === "parent");
  const ancestryMap = needsAncestry ? buildAncestryMap(tickets) : undefined;

  for (const clause of allFilters) {
    result = result.filter((t) => matchClause(t, clause, ancestryMap));
  }

  const dir = sortDir === "asc" ? 1 : -1;
  result = [...result].sort((a, b) => {
    if (sortField === "priority") return (a.priority - b.priority) * dir;
    if (sortField === "created") return a.created.localeCompare(b.created) * dir;
    if (sortField === "modified") return a.modified.localeCompare(b.modified) * dir;
    if (sortField === "title") return a.title.localeCompare(b.title) * dir;
    if (sortField === "status") return a.status.localeCompare(b.status) * dir;
    return 0;
  });

  return result;
}

// ── Helpers ───────────────────────────────────────────────────

let _nextId = 0;
export function createFilterId(): string {
  return `f-${++_nextId}-${Date.now().toString(36)}`;
}

/** Default value for a new filter clause — keyed by operator */
export function getDefaultValue(
  _field: FilterField,
  operator: FilterOperator,
): FilterClause["value"] {
  switch (operator) {
    case "any_of":
    case "none_of":
      return [];
    case "is_empty":
    case "is_not_empty":
      return "";
    case "between":
      return ["", ""];
    case "last_n_days":
    case "older_than":
    case "newer_than":
      return 30;
    case "contains":
    case "is":
    case "is_not":
    case "before":
    case "after":
      return "";
    default:
      return "";
  }
}

/** Extract unique values for a field from tickets (for multi-select options). */
export function uniqueFieldValues(tickets: TicketSummary[], field: FilterField): string[] {
  const vals = new Set<string>();
  for (const t of tickets) {
    switch (field) {
      case "status":
        vals.add(t.status);
        break;
      case "priority":
        vals.add(String(t.priority));
        break;
      case "kind":
        if (t.kind) vals.add(t.kind);
        break;
      case "type":
        if (t.type) vals.add(t.type);
        break;
      case "tag":
        (Array.isArray(t.tags) ? t.tags : []).forEach((tag) => {
          if (typeof tag === "string") vals.add(tag);
        });
        break;
      case "assignee":
        if (t.assignee) vals.add(t.assignee);
        break;
      case "branch":
        if (t.branch) vals.add(t.branch);
        break;
      case "target":
        (Array.isArray(t.targets) ? t.targets : []).forEach((target) => {
          if (typeof target === "string") vals.add(target);
        });
        break;
      case "parent": {
        const referenced = new Set<string>();
        for (const ticket of tickets) {
          for (const id of [...ticket.deps, ...ticket.links]) referenced.add(id);
        }
        const idSet = new Set(tickets.map((ticket) => ticket.id));
        for (const id of referenced) {
          if (idSet.has(id)) vals.add(id);
        }
        break;
      }
    }
  }
  return [...vals].sort();
}
