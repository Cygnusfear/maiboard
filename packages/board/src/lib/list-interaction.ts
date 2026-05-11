/**
 * List interaction state machine — handles selection, drag-select,
 * click navigation, context menu, and keyboard for the ticket list.
 *
 * Pure TypeScript. No React. No hooks. No DOM queries.
 * Holds all mutable state internally. Calls onChange() when the
 * view needs to re-render.
 *
 * The React component creates one instance via useRef, wires up
 * event handlers that call machine methods, and subscribes to
 * onChange for re-renders. That's it.
 *
 * Selection is NOT owned by this engine — it reads/writes through
 * callbacks so UIStore remains the single source of truth.
 */

import type { TicketSummary } from "./types";
import { STATUS_CYCLE } from "./types";

// ── Public state (what React reads) ───────────────────────────

export interface ListViewState {
  /** Tickets targeted by the context menu */
  contextTargets: TicketSummary[];
}

// ── Factory ───────────────────────────────────────────────────

export interface ListInteractionDeps {
  /** Return the current visible (filtered+sorted) ticket array */
  getTickets: () => TicketSummary[];
  /** Navigate to a ticket's detail page */
  navigate: (ticketId: string) => void;
  /** Update a ticket's status */
  cycleStatus: (ticketId: string, newStatus: string) => void;
  /** Called whenever viewable state changes — React calls setState here */
  onChange: (state: ListViewState) => void;
  /** Read current selection from UIStore (canonical source) */
  getSelection: () => Set<string>;
  /** Write selection to UIStore (canonical source) */
  setSelection: (sel: Set<string>) => void;
  /** Read selection anchor from UIStore (used by keyboard X range-select) */
  getSelectionAnchor: () => string | null;
  /** Write selection anchor to UIStore */
  setSelectionAnchor: (id: string | null) => void;
}

const DRAG_THRESHOLD = 4;

export function createListInteraction(deps: ListInteractionDeps) {
  // ── Internal mutable state ────────────────────────────────

  let contextTargets: TicketSummary[] = [];

  // Drag engine (index-based for range math, converted to IDs on commit)
  let dragging = false;
  let anchorIndex = -1;
  let currentIndex = -1;
  let baseSelection = new Set<string>();

  // Pending drag (deferred until mouse moves past threshold)
  let pendingDrag: { index: number; x: number; y: number } | null = null;

  // ── Helpers ───────────────────────────────────────────────

  function snapshot(): ListViewState {
    return { contextTargets };
  }

  function notify() {
    deps.onChange(snapshot());
  }

  function ticketAt(idx: number): TicketSummary | undefined {
    return deps.getTickets()[idx];
  }

  /** Build a Set<string> of ticket IDs for index range [a..b] */
  function idsInRange(a: number, b: number): Set<string> {
    const tickets = deps.getTickets();
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const ids = new Set<string>();
    for (let i = lo; i <= hi; i++) {
      if (tickets[i]) ids.add(tickets[i].id);
    }
    return ids;
  }

  function commitDragRange() {
    const range = idsInRange(anchorIndex, currentIndex);
    for (const id of baseSelection) range.add(id);
    deps.setSelection(range);
  }

  // ── Public methods ────────────────────────────────────────

  /** Call from container onMouseDown */
  function mousedown(
    index: number,
    clientX: number,
    clientY: number,
    mods: { shift: boolean; meta: boolean },
    action: string | null,
  ): "stop" | "prevent" | void {
    const ticket = ticketAt(index);
    if (!ticket) return;

    // Checkbox — defer to click for toggle, but allow drag-select
    if (action === "checkbox") {
      pendingDrag = { index, x: clientX, y: clientY };
      return "prevent";
    }

    // Status dot — let click handle it
    if (action === "status") return;

    // Dot menu — handled by Base UI Menu, don't interfere
    if (action === "menu") return;

    // Cmd/Ctrl+click — toggle
    if (mods.meta) {
      const sel = deps.getSelection();
      const next = new Set(sel);
      if (next.has(ticket.id)) next.delete(ticket.id);
      else next.add(ticket.id);
      anchorIndex = index;
      baseSelection = next;
      deps.setSelection(next);
      deps.setSelectionAnchor(ticket.id);
      notify();
      return "prevent";
    }

    // Shift+click — range extend
    if (mods.shift && anchorIndex >= 0) {
      currentIndex = index;
      commitDragRange();
      notify();
      return "prevent";
    }

    // Plain click — defer drag until mouse moves past threshold
    pendingDrag = { index, x: clientX, y: clientY };
    return "prevent";
  }

  /** Call from container onClick */
  function click(
    index: number,
    mods: { shift: boolean; meta: boolean },
    action: string | null,
  ): "stop" | void {
    const ticket = ticketAt(index);
    if (!ticket) return;

    // Status dot — cycle
    if (action === "status") {
      deps.cycleStatus(ticket.id, STATUS_CYCLE[ticket.status] ?? "open");
      return "stop";
    }

    // Checkbox — toggle on click (drag-select handled via pendingDrag)
    if (action === "checkbox") {
      if (!dragging) {
        const sel = deps.getSelection();
        const next = new Set(sel);
        if (next.has(ticket.id)) next.delete(ticket.id);
        else next.add(ticket.id);
        anchorIndex = index;
        baseSelection = next;
        deps.setSelection(next);
        deps.setSelectionAnchor(ticket.id);
        notify();
      }
      return "stop";
    }

    // Dot menu — handled by Base UI Menu
    if (action === "menu") return;

    // Modifier clicks — already handled in mousedown
    if (mods.shift || mods.meta) return;

    const sel = deps.getSelection();

    // Plain click with no selection → navigate
    if (!dragging && sel.size === 0) {
      pendingDrag = null;
      deps.navigate(ticket.id);
      return;
    }

    // Plain click with active selection → clear
    if (sel.size > 0 && !dragging) {
      clear();
    }
  }

  /** Is the mouse free to update highlight? (not during drag or pending drag) */
  function canHighlight(): boolean {
    return !dragging && !pendingDrag;
  }

  /** Call from window mousemove listener */
  function globalMousemove(clientX: number, clientY: number, indexAtPoint: number | null): boolean {
    // Check pending drag threshold
    if (pendingDrag && !dragging) {
      const dx = Math.abs(clientX - pendingDrag.x);
      const dy = Math.abs(clientY - pendingDrag.y);
      if (dx + dy >= DRAG_THRESHOLD) {
        // Activate drag
        dragging = true;
        anchorIndex = pendingDrag.index;
        currentIndex = pendingDrag.index;
        const ticket = ticketAt(pendingDrag.index);
        baseSelection = new Set();
        deps.setSelection(ticket ? new Set([ticket.id]) : new Set());
        pendingDrag = null;
        notify();
      }
      return dragging;
    }

    if (!dragging || indexAtPoint === null) return dragging;
    if (indexAtPoint === currentIndex) return true;

    currentIndex = indexAtPoint;
    commitDragRange();
    notify();
    return true;
  }

  /** Call from window mouseup listener */
  function globalMouseup() {
    pendingDrag = null;
    if (dragging) {
      dragging = false;
      baseSelection = new Set(deps.getSelection());
      notify();
    }
  }

  /** Call from container onContextMenu */
  function contextmenu(index: number) {
    const ticket = ticketAt(index);
    if (!ticket) return;

    const selection = deps.getSelection();

    if (selection.has(ticket.id)) {
      // Right-clicked a selected row → menu applies to all selected
      contextTargets = deps.getTickets().filter((t) => selection.has(t.id));
    } else {
      // Right-clicked a non-selected row → select just this one
      anchorIndex = index;
      baseSelection = new Set([ticket.id]);
      deps.setSelection(new Set([ticket.id]));
      deps.setSelectionAnchor(ticket.id);
      contextTargets = [ticket];
    }
    notify();
  }

  /** Escape key — clear selection */
  function escape() {
    if (deps.getSelection().size > 0) clear();
  }

  /** Cmd+A — select all visible tickets */
  function selectAll() {
    const tickets = deps.getTickets();
    deps.setSelection(new Set(tickets.map((t) => t.id)));
  }

  /** Clear all selection and drag state */
  function clear() {
    dragging = false;
    anchorIndex = -1;
    currentIndex = -1;
    baseSelection = new Set();
    deps.setSelection(new Set());
    deps.setSelectionAnchor(null);
    contextTargets = [];
    notify();
  }

  /** Read current state without triggering onChange */
  function getState(): ListViewState {
    return snapshot();
  }

  function isDragging() {
    return dragging;
  }

  return {
    mousedown,
    click,
    canHighlight,
    globalMousemove,
    globalMouseup,
    contextmenu,
    escape,
    selectAll,
    clear,
    getState,
    isDragging,
  };
}

export type ListInteraction = ReturnType<typeof createListInteraction>;
