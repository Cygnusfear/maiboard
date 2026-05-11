export interface Keybinding {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  action: string;
  description: string;
  category: "navigation" | "action" | "view";
}

export const keybindings: Keybinding[] = [
  // Navigation
  { key: "j", action: "move-down", description: "Move down", category: "navigation" },
  { key: "k", action: "move-up", description: "Move up", category: "navigation" },
  { key: "g", action: "go-first", description: "Go to first (gg)", category: "navigation" },
  { key: "G", shift: true, action: "go-last", description: "Go to last", category: "navigation" },
  {
    key: "d",
    ctrl: true,
    action: "page-down",
    description: "Half page down",
    category: "navigation",
  },
  { key: "u", ctrl: true, action: "page-up", description: "Half page up", category: "navigation" },
  {
    key: "H",
    shift: true,
    action: "prev-project",
    description: "Previous project",
    category: "navigation",
  },
  {
    key: "L",
    shift: true,
    action: "next-project",
    description: "Next project",
    category: "navigation",
  },
  { key: "Enter", action: "open-ticket", description: "Open ticket", category: "navigation" },
  { key: "Escape", action: "back", description: "Back / clear", category: "navigation" },
  { key: "/", action: "search", description: "Search", category: "navigation" },

  // Actions
  { key: "x", action: "toggle-select", description: "Toggle selection", category: "action" },
  {
    key: "X",
    shift: true,
    action: "range-select",
    description: "Range select",
    category: "action",
  },
  { key: "o", action: "set-open", description: "Set Open", category: "action" },
  { key: "i", action: "set-in-progress", description: "Set In Progress", category: "action" },
  { key: "c", action: "set-closed", description: "Set Closed", category: "action" },
  { key: "p", action: "cycle-priority", description: "Cycle priority", category: "action" },

  // View
  { key: "v", action: "toggle-view", description: "Toggle List/Board", category: "view" },
  {
    key: "?",
    shift: true,
    action: "show-help",
    description: "Keyboard shortcuts",
    category: "view",
  },
  {
    key: "k",
    meta: true,
    action: "command-palette",
    description: "Command palette",
    category: "view",
  },
];
