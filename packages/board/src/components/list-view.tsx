import { useFilteredTickets } from "@/hooks/use-filtered-tickets";
import {
  createListInteraction,
  type ListInteraction,
  type ListViewState,
} from "@/lib/list-interaction";
import { groupTickets, flattenGroups, type FlatRow } from "@/lib/group-engine";
import type { SortField, TicketSummary } from "@/lib/types";
import { useFilterStore } from "@/stores/filter-store";
import { useProjectStore } from "@/stores/project-store";
import { useTicketStore } from "@/stores/ticket-store";
import { useUIStore } from "@/stores/ui-store";
import { useViewStore } from "@/stores/view-store";
import { CaretDown, CaretRight, CaretUp, Check, PencilSimple } from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LinkifiedText } from "./linkified-text";
import { PriorityIcon } from "./priority-icon";
import { StatusDot } from "./status-dot";
import { TagList } from "./tag-pill";
import { DotMenu, TicketContextMenu } from "./ticket-context-menu";
import { useNavigate } from "@/hooks/use-navigate";

// ── Constants ─────────────────────────────────────────────────

const ROW_HEIGHT = 36;
const GROUP_HEADER_HEIGHT = 32;

// ── Helpers ───────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const days = Math.floor((now - then) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ── Sort header ───────────────────────────────────────────────

function SortHeader({
  field,
  label,
  className,
}: {
  field: SortField;
  label: string;
  className?: string;
}) {
  const { sortField, sortDir, setSort } = useFilterStore();
  const active = sortField === field;

  return (
    <button
      onClick={() => setSort(field)}
      className={`flex items-center gap-0.5 text-[11px] uppercase tracking-wider select-none ${
        active ? "text-zinc-300" : "text-zinc-600 hover:text-zinc-400"
      } ${className ?? ""}`}
    >
      {label}
      {active &&
        (sortDir === "asc" ? (
          <CaretUp size={10} weight="bold" />
        ) : (
          <CaretDown size={10} weight="bold" />
        ))}
    </button>
  );
}

// ── Group header row ──────────────────────────────────────────

const GroupHeaderRow = memo(function GroupHeaderRow({
  group,
  collapsed,
  onToggle,
  onClickEpic,
}: {
  group: FlatRow & { type: "group-header" };
  collapsed: boolean;
  onToggle: () => void;
  onClickEpic?: (ticketId: string) => void;
}) {
  const { group: g } = group;
  const Chevron = collapsed ? CaretRight : CaretDown;

  // Epic group header — shows the epic ticket as a mini-row
  if (g.epic) {
    return (
      <div
        className="flex h-8 w-full cursor-pointer items-center gap-2 border-b border-zinc-800/60 bg-zinc-900/60 px-2"
        onClick={onToggle}
      >
        <Chevron size={12} weight="bold" className="shrink-0 text-zinc-500" />
        <StatusDot status={g.epic.status} />
        <span className="shrink-0 font-mono text-[11px] text-zinc-600">{g.epic.id}</span>
        <span
          className="min-w-0 truncate text-[13px] font-medium text-zinc-200 hover:text-blue-400"
          onClick={(e) => {
            e.stopPropagation();
            onClickEpic?.(g.epic!.id);
          }}
        >
          {g.label}
        </span>
        <span className="shrink-0 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-500">
          {g.tickets.length}
        </span>
        {g.epic.tags?.length > 0 && <TagList tags={g.epic.tags} className="ml-auto" />}
      </div>
    );
  }

  // Status/type group header — simple label
  return (
    <div
      className="flex h-8 w-full cursor-pointer items-center gap-2 border-b border-zinc-800/60 bg-zinc-900/60 px-2"
      onClick={onToggle}
    >
      <Chevron size={12} weight="bold" className="shrink-0 text-zinc-500" />
      <span className="text-[12px] font-medium text-zinc-400">{g.label}</span>
      <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-500">
        {g.tickets.length}
      </span>
    </div>
  );
});

// ── Single ticket row — memoized ──────────────────────────────

const ListRow = memo(function ListRow({
  ticket,
  index,
  isHighlighted,
  isSelected,
  editingTitleId,
  titleDraft,
  onStartTitleEdit,
  onTitleDraftChange,
  onCommitTitleEdit,
  onCancelTitleEdit,
}: {
  ticket: TicketSummary;
  index: number;
  isHighlighted: boolean;
  isSelected: boolean;
  editingTitleId: string | null;
  titleDraft: string;
  onStartTitleEdit: (ticket: TicketSummary) => void;
  onTitleDraftChange: (value: string) => void;
  onCommitTitleEdit: () => void;
  onCancelTitleEdit: () => void;
}) {
  const isEditingTitle = editingTitleId === ticket.id;
  return (
    <div
      data-index={index}
      className={`list-row group/row grid h-9 w-full cursor-default grid-cols-[20px_28px_1fr_72px_96px_64px] items-center gap-0 border-b border-zinc-800/40 px-2 ${
        isSelected
          ? "bg-blue-500/[0.07]"
          : isHighlighted
            ? "bg-zinc-800/40"
            : ticket.tags?.includes("board-review")
              ? "bg-yellow-500/10"
              : ""
      }`}
    >
      {/* ··· dot menu */}
      <div data-action="menu" className="flex items-center justify-center">
        <DotMenu ticket={ticket} />
      </div>

      {/* Checkbox */}
      <div
        data-action="checkbox"
        className={`flex items-center justify-center ${
          isSelected ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"
        }`}
      >
        <div
          className={`flex size-4 items-center justify-center rounded border ${
            isSelected ? "border-blue-500 bg-blue-500" : "border-zinc-600 hover:border-zinc-400"
          }`}
        >
          {isSelected && <Check size={10} weight="bold" className="text-white" />}
        </div>
      </div>

      {/* Title + ID + Tags */}
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        <span className="shrink-0 font-mono text-[11px] text-zinc-600">{ticket.id}</span>
        {ticket.kind !== "ticket" && (
          <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
            {ticket.kind}
          </span>
        )}
        {isEditingTitle ? (
          <input
            data-action="title-edit"
            value={titleDraft}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => onTitleDraftChange(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCommitTitleEdit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onCancelTitleEdit();
              }
            }}
            onBlur={onCommitTitleEdit}
            className="min-w-0 flex-1 rounded border border-blue-500/40 bg-zinc-950 px-1.5 py-0.5 text-[13px] leading-tight text-zinc-100 outline-none focus:border-blue-400"
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onStartTitleEdit(ticket);
            }}
            className="group/title flex min-w-0 flex-1 items-center gap-1.5"
          >
            <span className="truncate text-[13px] leading-tight text-zinc-200 group-hover/title:text-zinc-100">
              <LinkifiedText>{ticket.title}</LinkifiedText>
            </span>
            <button
              data-action="title-edit"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStartTitleEdit(ticket);
              }}
              className="shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-300 group-hover/title:opacity-100"
              title="Edit title"
            >
              <PencilSimple size={11} />
            </button>
          </span>
        )}
        {!isEditingTitle && ticket.tags?.length > 0 && (
          <TagList tags={ticket.tags} className="ml-1" />
        )}
      </div>

      {/* Priority */}
      <div className="flex justify-center">
        <PriorityIcon priority={ticket.priority} />
      </div>

      {/* Status — clickable to cycle */}
      <div data-action="status" className="flex cursor-pointer justify-center">
        <StatusDot status={ticket.status} showLabel />
      </div>

      {/* Created */}
      <span className="text-right text-[11px] text-zinc-600">{timeAgo(ticket.created)}</span>
    </div>
  );
});

// ── Helpers for extracting row info from DOM events ───────────

function rowIndexFromEvent(e: React.MouseEvent | MouseEvent): number | null {
  const row = (e.target as HTMLElement).closest("[data-index]") as HTMLElement | null;
  if (!row) return null;
  return parseInt(row.dataset.index!, 10);
}

function actionFromEvent(e: React.MouseEvent | MouseEvent): string | null {
  const el = (e.target as HTMLElement).closest("[data-action]");
  return el?.getAttribute("data-action") ?? null;
}

// ── Main list view ────────────────────────────────────────────

export function ListView() {
  const tickets = useFilteredTickets();
  const allTickets = useTicketStore((s) => s.tickets);
  const groupBy = useFilterStore((s) => s.groupBy);
  const toggleGroupCollapse = useViewStore((s) => s.toggleGroupCollapse);
  // Stable selector: returns the same array reference when unchanged (Zustand shallow)
  const collapsedGroupsArr = useViewStore(
    useCallback(
      (s: { views: { id: string; collapsedGroups?: string[] }[]; activeViewId: string | null }) => {
        const view = s.views.find((v) => v.id === s.activeViewId);
        return view?.collapsedGroups;
      },
      [],
    ),
  );
  const collapsedGroups = useMemo(() => new Set(collapsedGroupsArr ?? []), [collapsedGroupsArr]);
  const highlightIndex = useUIStore((s) => s.highlightIndex);
  const setHighlightIndex = useUIStore((s) => s.setHighlightIndex);
  const selectedIds = useUIStore((s) => s.selectedIds);
  const { activeProjectId } = useProjectStore();
  const { updateField } = useTicketStore();
  const [, navigate] = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");

  const startTitleEdit = useCallback((ticket: TicketSummary) => {
    setEditingTitleId(ticket.id);
    setTitleDraft(ticket.title);
  }, []);

  const cancelTitleEdit = useCallback(() => {
    setEditingTitleId(null);
    setTitleDraft("");
  }, []);

  const commitTitleEdit = useCallback(() => {
    if (!activeProjectId || !editingTitleId) return;
    const nextTitle = titleDraft.trim();
    const current = allTickets.find((ticket) => ticket.id === editingTitleId);
    setEditingTitleId(null);
    setTitleDraft("");
    if (!nextTitle || !current || current.title === nextTitle) return;
    void updateField(activeProjectId, editingTitleId, { title: nextTitle });
  }, [activeProjectId, allTickets, editingTitleId, titleDraft, updateField]);

  // ── Grouped row model ─────────────────────────────────────
  const flatRows: FlatRow[] | null = useMemo(() => {
    if (!groupBy) return null;
    const groups = groupTickets(tickets, groupBy, allTickets);
    return flattenGroups(groups, collapsedGroups);
  }, [tickets, allTickets, groupBy, collapsedGroups]);

  // Ticket list for the interaction engine — when grouped, extract just the tickets
  // from flatRows to keep index mapping consistent
  const visibleTickets = useMemo(() => {
    if (!flatRows) return tickets;
    return flatRows
      .filter((r): r is FlatRow & { type: "ticket" } => r.type === "ticket")
      .map((r) => r.ticket);
  }, [flatRows, tickets]);

  // Map from flatRow index → ticket index for the interaction engine
  const flatToTicketIndex = useMemo(() => {
    if (!flatRows) return null;
    const map = new Map<number, number>();
    let ticketIdx = 0;
    for (let i = 0; i < flatRows.length; i++) {
      if (flatRows[i].type === "ticket") {
        map.set(i, ticketIdx++);
      }
    }
    return map;
  }, [flatRows]);

  // Keep latest deps in refs so the interaction engine never goes stale
  const ticketsRef = useRef(visibleTickets);
  ticketsRef.current = visibleTickets;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const updateFieldRef = useRef(updateField);
  updateFieldRef.current = updateField;
  const activeProjectRef = useRef(activeProjectId);
  activeProjectRef.current = activeProjectId;

  // State machine — created once, reads deps through refs
  const [viewState, setViewState] = useState<ListViewState>({
    contextTargets: [],
  });

  const engineRef = useRef<ListInteraction | null>(null);
  if (!engineRef.current) {
    engineRef.current = createListInteraction({
      getTickets: () => ticketsRef.current,
      navigate: (ticketId) => {
        const pid = activeProjectRef.current;
        if (pid) navigateRef.current(`/${pid}/ticket/${ticketId}`);
      },
      cycleStatus: (ticketId, status) => {
        const pid = activeProjectRef.current;
        if (pid)
          updateFieldRef.current(pid, ticketId, { status: status as TicketSummary["status"] });
      },
      onChange: setViewState,
      getSelection: () => useUIStore.getState().selectedIds,
      setSelection: (sel) => useUIStore.setState({ selectedIds: sel }),
      getSelectionAnchor: () => useUIStore.getState().selectionAnchor,
      setSelectionAnchor: (id) => useUIStore.setState({ selectionAnchor: id }),
    });
  }
  const engine = engineRef.current;

  // Navigate to epic ticket
  const handleClickEpic = useCallback(
    (ticketId: string) => {
      if (activeProjectId) navigate(`/${activeProjectId}/ticket/${ticketId}`);
    },
    [activeProjectId, navigate],
  );

  // Scroll suppression for highlight
  const isScrolling = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Virtualizer — count changes based on grouping
  const totalRows = flatRows ? flatRows.length : tickets.length;

  const virtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      if (flatRows && flatRows[index]?.type === "group-header") return GROUP_HEADER_HEIGHT;
      return ROW_HEIGHT;
    },
    overscan: 20,
  });

  // Detect scroll to suppress hover highlights
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      isScrolling.current = true;
      clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => {
        isScrolling.current = false;
      }, 100);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // ── Event handlers — dispatch to engine, but translate indices when grouped ──

  /** Translate a flat-row index to the engine's ticket index */
  function toTicketIndex(flatIdx: number): number | null {
    if (!flatToTicketIndex) return flatIdx;
    return flatToTicketIndex.get(flatIdx) ?? null;
  }

  function onMouseDown(e: React.MouseEvent) {
    const flatIdx = rowIndexFromEvent(e);
    if (actionFromEvent(e) === "title-edit") {
      e.stopPropagation();
      return;
    }
    if (flatIdx === null) return;
    // If clicking a group header, ignore for the engine
    if (flatRows && flatRows[flatIdx]?.type === "group-header") return;
    const idx = toTicketIndex(flatIdx);
    if (idx === null) return;
    const action = actionFromEvent(e);
    const result = engine.mousedown(
      idx,
      e.clientX,
      e.clientY,
      { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey },
      action,
    );
    if (result === "stop") e.stopPropagation();
    if (result === "prevent" || result === "stop") e.preventDefault();
  }

  function onClick(e: React.MouseEvent) {
    const flatIdx = rowIndexFromEvent(e);
    if (actionFromEvent(e) === "title-edit") {
      e.stopPropagation();
      return;
    }
    if (flatIdx === null) return;
    if (flatRows && flatRows[flatIdx]?.type === "group-header") return;
    const idx = toTicketIndex(flatIdx);
    if (idx === null) return;
    const action = actionFromEvent(e);
    const result = engine.click(idx, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey }, action);
    if (result === "stop") e.stopPropagation();
  }

  function onMouseMove(e: React.MouseEvent) {
    if (isScrolling.current) return;
    const flatIdx = rowIndexFromEvent(e);
    if (flatIdx !== null && engine.canHighlight()) {
      // For grouped view, only highlight ticket rows
      if (flatRows && flatRows[flatIdx]?.type === "group-header") return;
      const idx = toTicketIndex(flatIdx);
      if (idx !== null) setHighlightIndex(idx);
    }
  }

  function onContextMenu(e: React.MouseEvent) {
    const flatIdx = rowIndexFromEvent(e);
    if (flatIdx === null) return;
    if (flatRows && flatRows[flatIdx]?.type === "group-header") return;
    const idx = toTicketIndex(flatIdx);
    if (idx !== null) engine.contextmenu(idx);
  }

  // Global mousemove/mouseup during drag
  useEffect(() => {
    function onGlobalMousemove(e: MouseEvent) {
      const container = scrollRef.current;
      if (container && engine.isDragging()) {
        const rect = container.getBoundingClientRect();
        if (e.clientY < rect.top + 40) container.scrollTop -= 8;
        else if (e.clientY > rect.bottom - 40) container.scrollTop += 8;
      }

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest("[data-index]");
      let idx: number | null = null;
      if (row) {
        const flatIdx = parseInt(row.getAttribute("data-index")!, 10);
        idx = flatToTicketIndex ? (flatToTicketIndex.get(flatIdx) ?? null) : flatIdx;
      }
      engine.globalMousemove(e.clientX, e.clientY, idx);
    }

    function onGlobalMouseup() {
      engine.globalMouseup();
    }

    window.addEventListener("mousemove", onGlobalMousemove);
    window.addEventListener("mouseup", onGlobalMouseup);
    return () => {
      window.removeEventListener("mousemove", onGlobalMousemove);
      window.removeEventListener("mouseup", onGlobalMouseup);
    };
  }, [engine, flatToTicketIndex]);

  // Keyboard: Escape + Cmd+A
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") engine.escape();
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "a" &&
        !(e.target as HTMLElement).closest("input,textarea,select")
      ) {
        e.preventDefault();
        engine.selectAll();
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [engine]);

  // Scroll to highlighted row on keyboard nav
  useEffect(() => {
    if (!flatRows) {
      virtualizer.scrollToIndex(highlightIndex, { align: "auto" });
    }
    // When grouped, we'd need to map ticket index → flat index for scroll.
    // For now, keyboard nav operates on ticket indices directly.
  }, [highlightIndex, virtualizer, flatRows]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden select-none">
      {/* Column headers */}
      <div className="grid grid-cols-[20px_28px_1fr_72px_96px_64px] items-center gap-0 border-b border-zinc-800 bg-zinc-950 px-2 py-1.5">
        <div />
        <div />
        <SortHeader field="title" label="Title" />
        <SortHeader field="priority" label="Pri" className="justify-center" />
        <SortHeader field="status" label="Status" className="justify-center" />
        <SortHeader field="created" label="Age" className="justify-end" />
      </div>

      {/* Selection info bar */}
      {selectedIds.size > 0 && (
        <div className="absolute top-full left-0 w-full flex items-center gap-3 border-b border-blue-500/20 bg-blue-500/[0.05] px-4 py-1">
          <span className="text-xs font-medium text-blue-400">{selectedIds.size} selected</span>
          <button
            onClick={() => engine.clear()}
            className="text-[11px] text-zinc-500 hover:text-zinc-300"
          >
            Clear
          </button>
        </div>
      )}

      {/* Virtual scroll container — wrapped in context menu */}
      <TicketContextMenu targetTickets={viewState.contextTargets}>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-auto"
          onMouseDown={onMouseDown}
          onClick={onClick}
          onMouseMove={onMouseMove}
          onContextMenu={onContextMenu}
        >
          {totalRows === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-zinc-600">
              No tickets match your filters
            </div>
          ) : (
            <div
              className="relative will-change-transform"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualItems.map((vrow) => {
                // ── Grouped mode ──────────────────────────
                if (flatRows) {
                  const flatRow = flatRows[vrow.index];
                  if (!flatRow) return null;

                  if (flatRow.type === "group-header") {
                    return (
                      <div
                        key={`gh-${flatRow.group.key}`}
                        className="absolute left-0 top-0 w-full"
                        style={{
                          height: GROUP_HEADER_HEIGHT,
                          transform: `translateY(${vrow.start}px)`,
                        }}
                      >
                        <GroupHeaderRow
                          group={flatRow as FlatRow & { type: "group-header" }}
                          collapsed={collapsedGroups.has(flatRow.group.key)}
                          onToggle={() => toggleGroupCollapse(flatRow.group.key)}
                          onClickEpic={handleClickEpic}
                        />
                      </div>
                    );
                  }

                  // Ticket row in grouped mode
                  const ticketIdx = flatToTicketIndex?.get(vrow.index) ?? vrow.index;
                  return (
                    <div
                      key={flatRow.ticket.id}
                      className="absolute left-0 top-0 w-full"
                      style={{
                        height: ROW_HEIGHT,
                        transform: `translateY(${vrow.start}px)`,
                      }}
                    >
                      <ListRow
                        ticket={flatRow.ticket}
                        index={vrow.index}
                        isHighlighted={ticketIdx === highlightIndex}
                        isSelected={selectedIds.has(flatRow.ticket.id)}
                        editingTitleId={editingTitleId}
                        titleDraft={titleDraft}
                        onStartTitleEdit={startTitleEdit}
                        onTitleDraftChange={setTitleDraft}
                        onCommitTitleEdit={commitTitleEdit}
                        onCancelTitleEdit={cancelTitleEdit}
                      />
                    </div>
                  );
                }

                // ── Flat mode (no grouping) ───────────────
                const ticket = tickets[vrow.index];
                if (!ticket) return null;

                return (
                  <div
                    key={ticket.id}
                    className="absolute left-0 top-0 w-full"
                    style={{ height: ROW_HEIGHT, transform: `translateY(${vrow.start}px)` }}
                  >
                    <ListRow
                      ticket={ticket}
                      index={vrow.index}
                      isHighlighted={vrow.index === highlightIndex}
                      isSelected={selectedIds.has(ticket.id)}
                      editingTitleId={editingTitleId}
                      titleDraft={titleDraft}
                      onStartTitleEdit={startTitleEdit}
                      onTitleDraftChange={setTitleDraft}
                      onCommitTitleEdit={commitTitleEdit}
                      onCancelTitleEdit={cancelTitleEdit}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </TicketContextMenu>
    </div>
  );
}
