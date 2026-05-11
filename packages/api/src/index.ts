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

export type FilterSet = FilterClause[];
export type GroupField = "status" | "type" | "epic";

export interface SavedList {
  /** Stable identity for drag-and-drop reordering */
  id: string;
  name: string;
  filters: FilterClause[];
  sortField: SortField;
  sortDir: SortDir;
  /** Optional grouping field for list mode */
  groupBy?: GroupField;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterClause[];
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

export type ApiResponse<T> = T | { error: string };
