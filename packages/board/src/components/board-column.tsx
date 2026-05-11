import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useProjectStore } from "@/stores/project-store";
import { useNavigate } from "@/hooks/use-navigate";
import { useOpenTicket } from "@/hooks/use-open-ticket";
import { PriorityIcon } from "./priority-icon";
import { StatusDot } from "./status-dot";
import { TagList } from "./tag-pill";
import { applyFiltersAndSort } from "@/lib/filter-engine";
import type { SavedList, TicketSummary } from "@/lib/types";
import { Pencil, DotsSixVertical } from "@phosphor-icons/react";
import { LinkifiedText } from "./linkified-text";
import { TicketContextMenu } from "./ticket-context-menu";

// ── Card ──────────────────────────────────────────────────────

function BoardCard({ ticket }: { ticket: TicketSummary }) {
  const openTicket = useOpenTicket();

  return (
    <TicketContextMenu targetTickets={[ticket]} triggerClassName="">
      <div
        onClick={(e) => openTicket(ticket.id, { newTab: e.metaKey || e.ctrlKey })}
        onAuxClick={(e) => {
          // middle-click → new tab
          if (e.button === 1) {
            e.preventDefault();
            openTicket(ticket.id, { newTab: true });
          }
        }}
        className="flex h-[120px] cursor-pointer flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-3 transition-colors hover:border-zinc-700 hover:bg-zinc-800/80"
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-mono text-[10px] text-zinc-500">{ticket.id}</span>
          <StatusDot status={ticket.status} />
        </div>
        <div className="mb-1 flex min-w-0 items-center gap-1.5">
          {ticket.kind !== "ticket" && (
            <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              {ticket.kind}
            </span>
          )}
          <div className="min-w-0 line-clamp-2 text-sm leading-snug text-zinc-200">
            <LinkifiedText>{ticket.title}</LinkifiedText>
          </div>
        </div>
        {ticket.targets?.[0] && (
          <div className="mb-auto truncate font-mono text-[10px] text-zinc-500">
            {ticket.targets[0]}
          </div>
        )}
        <div className="flex items-center justify-between">
          <PriorityIcon priority={ticket.priority} />
          {ticket.tags?.length > 0 && <TagList tags={ticket.tags} max={2} />}
        </div>
      </div>
    </TicketContextMenu>
  );
}

// ── Column ────────────────────────────────────────────────────

const CARD_HEIGHT = 120; // enforced by h-[120px] on BoardCard
const CARD_GAP = 8; // pb-2 on virtual item wrapper

interface BoardColumnProps {
  list: SavedList;
  allTickets: TicketSummary[];
  prefixFilters?: SavedList["filters"];
  sortOverride?: { field: SavedList["sortField"]; dir: SavedList["sortDir"] };
  dragHandleProps?: Record<string, unknown>;
}

export function BoardColumn({
  list,
  allTickets,
  prefixFilters,
  sortOverride,
  dragHandleProps,
}: BoardColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const tickets = useMemo(() => {
    return applyFiltersAndSort({
      tickets: allTickets,
      filters: list.filters,
      prefixFilters,
      sortField: sortOverride?.field ?? list.sortField,
      sortDir: sortOverride?.dir ?? list.sortDir,
    });
  }, [allTickets, list, prefixFilters, sortOverride]);

  const virtualizer = useVirtualizer({
    count: tickets.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CARD_HEIGHT + CARD_GAP,
    overscan: 5,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Column header — entire row is drag handle (ColumnEditor wraps for click-to-edit) */}
      <div
        {...(dragHandleProps ?? {})}
        className="group mb-2 flex cursor-grab items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-zinc-800/50 active:cursor-grabbing"
      >
        <DotsSixVertical size={12} className="shrink-0 text-zinc-700 group-hover:text-zinc-500" />
        <span className="text-xs font-medium text-zinc-300">{list.name}</span>
        <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
          {tickets.length}
        </span>
        <Pencil
          size={10}
          className="ml-auto shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>

      {/* Scrollable card list */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-lg bg-zinc-900/30 p-2"
      >
        {tickets.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-600">No tickets</div>
        ) : (
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((vrow) => {
              const ticket = tickets[vrow.index];
              if (!ticket) return null;
              return (
                <div
                  key={ticket.id}
                  className="absolute left-0 top-0 w-full"
                  style={{
                    height: vrow.size,
                    transform: `translateY(${vrow.start}px)`,
                    paddingBottom: CARD_GAP,
                  }}
                >
                  <BoardCard ticket={ticket} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
