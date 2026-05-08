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
  // Edges (optional — surface "on:note:<id>" / location info if present)
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

export interface FilterClause {
  id: string;
  field: string;
  operator: string;
  value: string | number | string[] | number[] | [string, string];
}

export interface SavedList {
  id: string;
  name: string;
  filters: FilterClause[];
  sortField: string;
  sortDir: "asc" | "desc";
  groupBy?: string;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterClause[];
}

export interface SavedView {
  id: string;
  name: string;
  mode: "list" | "board" | "graph";
  list?: SavedList;
  columns?: SavedList[];
  boardSort?: { field: string; dir: "asc" | "desc" };
  collapsedGroups?: string[];
  filterPresets?: FilterPreset[];
  activePresetIds?: string[];
}
