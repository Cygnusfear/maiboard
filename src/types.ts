export interface TicketSummary {
  id: string;
  status: "open" | "in_progress" | "closed" | "cancelled";
  type: string;
  priority: number;
  tags: string[];
  deps: string[];
  links: string[];
  created: string;
  modified: string;
  assignee?: string;
  title: string;
  project: string;
}

export interface Ticket extends TicketSummary {
  body: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
}

export interface SavedList {
  id: string;
  name: string;
  filters: unknown[];
  sortField: string;
  sortDir: "asc" | "desc";
  groupBy?: string;
}

export interface SavedView {
  id: string;
  name: string;
  mode: "list" | "board" | "graph";
  list?: SavedList;
  columns?: SavedList[];
  boardSort?: { field: string; dir: "asc" | "desc" };
  collapsedGroups?: string[];
}
