export interface TicketSummary {
  id: string;
  kind: string;
  status: "open" | "in_progress" | "closed";
  type: string;
  priority: number;
  tags: string[];
  deps: string[];
  links: string[];
  targets: string[];
  created: string;
  modified: string;
  assignee?: string;
  branch?: string;
  title: string;
  project: string;
}

export interface TicketEvent {
  id?: string;
  kind?: string;
  body?: string;
  timestamp?: string;
  author?: string;
  authorEmail?: string;
  branch?: string;
  edges?: Array<{
    type?: string;
    target?: { kind?: string; ref?: string };
  }>;
  location?: {
    path?: string;
    range?: {
      startLine?: number;
      startColumn?: number;
      endLine?: number;
      endColumn?: number;
    };
  };
}

export interface Ticket extends TicketSummary {
  body: string;
  events: TicketEvent[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  path?: string;
  branch?: string;
  current?: boolean;
  kind?: "workspace" | "worktree";
}

export type ViewMode = "list" | "board" | "graph";
export type SortField = "priority" | "created" | "modified" | "title" | "status";
export type SortDir = "asc" | "desc";

export const SORT_FIELD_OPTIONS: { value: SortField; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "created", label: "Created" },
  { value: "modified", label: "Modified" },
  { value: "status", label: "Status" },
  { value: "title", label: "Title" },
];

export const STATUS_ORDER = ["open", "in_progress", "closed"] as const;
export const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  closed: "Closed",
};

/** Canonical status colors — Tailwind classes for components */
export const STATUS_DOT_COLORS: Record<string, string> = {
  open: "bg-emerald-500",
  in_progress: "bg-amber-500",
  closed: "bg-zinc-500",
};

export const STATUS_RING_COLORS: Record<string, string> = {
  open: "ring-emerald-500/30",
  in_progress: "ring-amber-500/30",
  closed: "ring-zinc-500/30",
};

/** Canonical status colors — hex values for SVG/canvas */
export const STATUS_HEX_COLORS: Record<string, string> = {
  open: "#10b981", // emerald-500
  in_progress: "#f59e0b", // amber-500
  closed: "#71717a", // zinc-500
};

/** Maps each status to the next status when cycling (space/click). */
export const STATUS_CYCLE: Record<string, string> = {
  open: "in_progress",
  in_progress: "closed",
  closed: "open",
};

/** Returns the next status in the cycle, defaulting to 'open'. */
export function nextStatus(status: string): TicketSummary["status"] {
  return (STATUS_CYCLE[status] ?? "open") as TicketSummary["status"];
}
export const PRIORITY_LABELS: Record<number, string> = {
  0: "Urgent",
  1: "High",
  2: "Medium",
  3: "Low",
};

// ── Saved Views ───────────────────────────────────────────────

export interface SavedList {
  /** Stable identity for drag-and-drop reordering */
  id: string;
  name: string;
  filters: import("./filter-engine").FilterClause[];
  sortField: SortField;
  sortDir: SortDir;
  /** Optional grouping field for list mode */
  groupBy?: import("./group-engine").GroupField;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: import("./filter-engine").FilterClause[];
}

export interface SavedView {
  id: string;
  name: string;
  mode: ViewMode;
  /** List mode — single filtered list */
  list?: SavedList;
  /** Board mode — columns rendered left-to-right, leftmost match wins */
  columns?: SavedList[];
  /** Board-level sort override (applies to all columns when set) */
  boardSort?: { field: SortField; dir: SortDir };
  /** Keys of collapsed groups (persisted per-view) */
  collapsedGroups?: string[];
  /** Named global filter presets (pills) for board views */
  filterPresets?: FilterPreset[];
  /** IDs of currently-active global presets. Their filters AND together. */
  activePresetIds?: string[];
}
