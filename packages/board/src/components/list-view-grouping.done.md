# List View Grouping — Implementation Plan

**Ticket**: r-4d08  
**Parent**: list-view.tsx, types.ts, view-store.ts, filter-store.ts

## Architecture

### Data layer: `src/lib/group-engine.ts` (new)

Pure functions, no React. Three grouping modes:

```ts
type GroupField = "status" | "type" | "epic" | null;

interface TicketGroup {
  key: string; // group identity: status value, type value, or epic ticket ID
  label: string; // display name: "Open", "Bug", or epic title
  epic?: TicketSummary; // only for epic grouping — the epic ticket itself
  tickets: TicketSummary[]; // children (sorted within group)
  collapsed: boolean;
}
```

**Status/Type grouping**: Simple `Map<fieldValue, tickets[]>`. Canonical order:

- Status: open → in_progress → closed → cancelled
- Type: epic → feature → task → bug → chore

**Epic grouping**: Graph walk.

1. Build adjacency: `childId → parentIds` from `deps` + `links`
2. For each non-epic ticket, BFS/DFS up through deps/links
3. Stop at first epic-type ancestor — that's the group
4. Cycle detection via visited set
5. Tickets with no epic ancestor → "Ungrouped" group (last)
6. Epic tickets that are group headers don't appear as children

Edge case: ticket reachable from multiple epics → closest (shortest path) wins.

### View model changes

**`SavedList`** gets optional `groupBy`:

```ts
interface SavedList {
  // ... existing
  groupBy?: GroupField;
}
```

**`collapsedGroups`** persisted per-view:

```ts
interface SavedView {
  // ... existing
  collapsedGroups?: string[]; // group keys that are collapsed
}
```

### Virtualizer integration

The virtualizer currently has `count: tickets.length` with flat rows. With grouping:

- Flatten groups into a **row model**: `(GroupHeader | TicketRow)[]`
- GroupHeader rows are taller (height ~32px, distinct style)
- TicketRow is existing ListRow (36px)
- Collapsed groups: only the header row, children omitted from flat list
- `estimateSize` switches on row type

```ts
type FlatRow =
  | { type: "group-header"; group: TicketGroup }
  | { type: "ticket"; ticket: TicketSummary; groupKey: string };
```

### UI components

**GroupHeaderRow** (new, in list-view.tsx or extracted):

- Left chevron (▸ collapsed / ▾ expanded)
- Group label + count badge
- For epic mode: full epic row (status dot, ID, title, priority, tags) — clickable
- For status/type: simple label text with count
- Subtle background: `bg-zinc-900/60` or `bg-zinc-800/30`

**Toolbar addition**:

- "Group" dropdown in header bar or filter bar area
- Options: None, Status, Type, Epic
- Shows active grouping state

### Keyboard

- `highlightIndex` continues to work on the flat row model
- Arrow keys skip group headers or land on them (TBD — Linear lands on them)
- Enter on group header = toggle collapse
- Enter on ticket row = open ticket (existing)

## Steps

### 1. `src/lib/group-engine.ts` — pure grouping logic

- `groupTickets(tickets, groupBy, collapsedGroups)` → `TicketGroup[]`
- `flattenGroups(groups)` → `FlatRow[]`
- `resolveEpicAncestor(ticketId, tickets)` — graph walk with cycle detection
- Unit-testable, no React deps

### 2. Types — extend `SavedList` + `SavedView`

- Add `groupBy?: GroupField` to `SavedList`
- Add `collapsedGroups?: string[]` to `SavedView`

### 3. Store wiring — filter-store or view-store

- `groupBy` lives alongside `sortField`/`sortDir` in filter-store
- `collapsedGroups` + `toggleGroupCollapse(key)` in view-store (persisted)
- `setGroupBy(field)` action

### 4. List view integration

- `useFilteredTickets()` returns flat sorted tickets (unchanged)
- New: `useMemo` → `groupTickets()` → `flattenGroups()` → flat row model
- Virtualizer count = flatRows.length
- `estimateSize` checks row type
- Render: switch on FlatRow type → GroupHeaderRow or ListRow

### 5. GroupHeaderRow component

- Collapse toggle (chevron + click)
- Status/type: label + count
- Epic: mini ticket row (reuse ListRow styling but with group-header chrome)

### 6. Toolbar / Group-by selector

- Dropdown in the filter bar area: "Group: None ▾"
- Options: None, Status, Type, Epic

### 7. Persist collapse state

- On toggle: update `collapsedGroups` in view store → mark dirty → auto-save

### 8. Keyboard integration

- Highlight index operates on flat row model
- Group header row: Enter = toggle collapse
- Ticket row: existing behavior
