import { useMemo, useState } from "react";
import { useTicketStore } from "@/stores/ticket-store";
import { TicketLink } from "./ticket-link";
import {
  GitBranch,
  Link,
  ArrowRight,
  Plus,
  ChatText,
  CaretDown,
  CaretRight,
} from "@phosphor-icons/react";
import { marked } from "marked";
import type { Ticket, TicketSummary } from "@/lib/types";

interface ActivityEntry {
  date: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  /** If true, entry is a note with collapsible body */
  noteBody?: string;
}

function formatActivityDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildActivityEntries(ticket: Ticket, allTickets: TicketSummary[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  // 1. Ticket created
  if (ticket.created) {
    entries.push({
      date: ticket.created,
      icon: <Plus size={14} weight="bold" />,
      content: <span className="text-zinc-400">Ticket created</span>,
    });
  }

  // 2. Forward deps — this ticket depends on ...
  for (const depId of ticket.deps ?? []) {
    entries.push({
      date: ticket.created,
      icon: <GitBranch size={14} />,
      content: (
        <span className="text-zinc-400">
          Depends on <TicketLink id={depId} className="text-xs" />
        </span>
      ),
    });
  }

  // 3. Forward links — this ticket linked to ...
  for (const linkId of ticket.links ?? []) {
    entries.push({
      date: ticket.created,
      icon: <Link size={14} />,
      content: (
        <span className="text-zinc-400">
          Linked to <TicketLink id={linkId} className="text-xs" />
        </span>
      ),
    });
  }

  // 4. Reverse deps — other tickets that depend on this one
  for (const other of allTickets) {
    if (other.id === ticket.id) continue;
    const otherDeps = Array.isArray(other.deps) ? other.deps : [];
    if (otherDeps.includes(ticket.id)) {
      entries.push({
        date: other.created,
        icon: <GitBranch size={14} />,
        content: (
          <span className="text-zinc-400">
            <TicketLink id={other.id} className="text-xs" /> depends on this ticket
          </span>
        ),
      });
    }
  }

  // 5. Reverse links — other tickets that link to this one
  for (const other of allTickets) {
    if (other.id === ticket.id) continue;
    const otherLinks = Array.isArray(other.links) ? other.links : [];
    if (otherLinks.includes(ticket.id)) {
      entries.push({
        date: other.created,
        icon: <Link size={14} />,
        content: (
          <span className="text-zinc-400">
            <TicketLink id={other.id} className="text-xs" /> linked to this ticket
          </span>
        ),
      });
    }
  }

  // 6. Comment events on the ticket. mai stores notes as events with kind='comment',
  //    NOT in body. ## Notes in body never gets populated by mai add-note. Read from
  //    ticket.events directly. Skip review-mode inline comments (prefix '[review ').
  for (const event of ticket.events ?? []) {
    if (event.kind && event.kind !== "comment") continue;
    const body = (event.body ?? "").trim();
    if (!body) continue;
    if (body.startsWith("[review ")) continue;
    const firstLine =
      body
        .split("\n")
        .find((l) => l.trim())
        ?.trim() ?? "";
    const preview = firstLine.length > 120 ? firstLine.slice(0, 120) + "…" : firstLine;
    entries.push({
      date: event.timestamp ?? "",
      icon: <ChatText size={14} />,
      content: <span className="text-zinc-400">{preview || "Note added"}</span>,
      noteBody: body,
    });
  }

  // Sort oldest → newest
  entries.sort((a, b) => {
    if (!a.date || !b.date) return 0;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  return entries;
}

function NoteEntry({ entry }: { entry: ActivityEntry }) {
  const [expanded, setExpanded] = useState(false);

  const renderedHtml = useMemo(() => {
    if (!entry.noteBody || !expanded) return "";
    return marked.parse(entry.noteBody, { async: false }) as string;
  }, [entry.noteBody, expanded]);

  return (
    <div className="flex items-start gap-3">
      {/* Dot */}
      <div className="relative z-10 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-500">
        {entry.icon}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-xs leading-relaxed">
          <span className="shrink-0 text-zinc-600">{formatActivityDate(entry.date)}</span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-left text-zinc-400 hover:text-zinc-200"
          >
            {expanded ? (
              <CaretDown size={10} className="shrink-0 text-zinc-500" />
            ) : (
              <CaretRight size={10} className="shrink-0 text-zinc-500" />
            )}
            {entry.content}
          </button>
        </div>
        {expanded && renderedHtml && (
          <div
            className="note-body mt-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs leading-relaxed text-zinc-300"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        )}
      </div>
    </div>
  );
}

function SimpleEntry({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="flex items-start gap-3">
      {/* Dot */}
      <div className="relative z-10 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-500">
        {entry.icon}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 items-baseline gap-2 text-xs leading-relaxed">
        <span className="shrink-0 text-zinc-600">{formatActivityDate(entry.date)}</span>
        {entry.content}
      </div>
    </div>
  );
}

// Selectors — only re-render on activeTicket / tickets change, not on
// every store mutation. The activity timeline iterates events and parses
// markdown for expanded notes; expensive to re-run unnecessarily.
export function TicketActivity() {
  const activeTicket = useTicketStore((s) => s.activeTicket);
  const tickets = useTicketStore((s) => s.tickets);

  const entries = useMemo(() => {
    if (!activeTicket) return [];
    return buildActivityEntries(activeTicket, tickets);
  }, [activeTicket, tickets]);

  if (entries.length === 0) return null;

  return (
    <div className="mt-8 border-t border-zinc-800 pt-6">
      <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-zinc-500">Activity</h3>
      <div className="relative ml-2">
        {/* Vertical line */}
        <div className="absolute top-1 bottom-1 left-[6px] w-px bg-zinc-800" />

        <div className="flex flex-col gap-3">
          {entries.map((entry, i) =>
            entry.noteBody ? (
              <NoteEntry key={i} entry={entry} />
            ) : (
              <SimpleEntry key={i} entry={entry} />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
