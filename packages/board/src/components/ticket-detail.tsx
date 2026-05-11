import { useMemo, useCallback, useRef } from "react";
import { useTicketStore } from "@/stores/ticket-store";
import { useProjectStore } from "@/stores/project-store";
import { useNavigate } from "@/hooks/use-navigate";
import { useViewStore } from "@/stores/view-store";
import { useTicketWatcher } from "@/hooks/use-ticket-watcher";
import { StatusDot } from "./status-dot";
import { PriorityIcon } from "./priority-icon";
import { InlineSelect } from "./inline-select";
import { TagEditor } from "./tag-editor";
import { TicketBodyEditor, type TicketBodyEditorHandle } from "./ticket-body-editor";
import { TicketLink } from "./ticket-link";
import { TicketActivity } from "./ticket-activity";
import { TicketNoteComposer } from "./ticket-note-composer";
import { InlineTitleEditor } from "./inline-title-editor";
import { CopyableId } from "./copyable-id";
import { ArrowLeft, Warning } from "@phosphor-icons/react";
import { statusOptions, priorityOptions, typeOptions } from "@/lib/ticket-options";
import { TicketContextMenu } from "./ticket-context-menu";
import { nextStatus, type TicketSummary } from "@/lib/types";
import { buildEpicLookup } from "@/lib/group-engine";
import { Stack } from "@phosphor-icons/react";

export function TicketDetail() {
  // Zustand selectors so this component re-renders only on the data it actually
  // reads — not on every store mutation. Without selectors, useTicketStore()
  // subscribes to the entire state; every store update (e.g. ticket-watcher
  // poll, fetchTickets after a maiboard:changed event) re-rendered the whole
  // ticket-detail tree including the heavy Tiptap body editor and the activity
  // timeline, which made typing in any embedded composer feel laggy.
  const activeTicket = useTicketStore((s) => s.activeTicket);
  const tickets = useTicketStore((s) => s.tickets);
  const updateField = useTicketStore((s) => s.updateField);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const [, navigate] = useNavigate();

  // Reverse relationships: other tickets that dep on or link to this one
  const { reverseDeps, reverseLinks } = useMemo(() => {
    if (!activeTicket) return { reverseDeps: [] as string[], reverseLinks: [] as string[] };
    const rd: string[] = [];
    const rl: string[] = [];
    for (const t of tickets) {
      if (t.id === activeTicket.id) continue;
      const tDeps = Array.isArray(t.deps) ? t.deps : [];
      const tLinks = Array.isArray(t.links) ? t.links : [];
      if (tDeps.includes(activeTicket.id)) rd.push(t.id);
      if (tLinks.includes(activeTicket.id)) rl.push(t.id);
    }
    return { reverseDeps: rd, reverseLinks: rl };
  }, [activeTicket, tickets]);

  // Epic relationships (transitive, via the canonical nearest-epic BFS).
  // Parent epic: shown for every ticket (including epics — an epic can have
  //   an epic-of-epics above it).
  // Sub-tickets: shown only when this ticket IS an epic. Includes every
  //   non-epic in the project whose nearest epic is this one, which catches
  //   transitively-related children (e.g. a task linked to a feature linked
  //   to this epic) that would otherwise be invisible from this view.
  const { parentEpic, subTickets } = useMemo(() => {
    if (!activeTicket) {
      return { parentEpic: null as TicketSummary | null, subTickets: [] as TicketSummary[] };
    }
    const lookup = buildEpicLookup(tickets);
    return {
      parentEpic: lookup.nearestEpicOf(activeTicket.id),
      subTickets: activeTicket.type === "epic" ? lookup.subTicketsOf(activeTicket.id) : [],
    };
  }, [activeTicket, tickets]);

  // ── External change detection (CRDT merge) ────────────────
  const editorRef = useRef<TicketBodyEditorHandle>(null);

  const { conflict, markSaved, acceptRemote, keepLocal } = useTicketWatcher({
    projectId: activeProjectId,
    ticketId: activeTicket?.id ?? null,
    getEditorBody: () => editorRef.current?.getBody() ?? null,
    setEditorBody: (body) => editorRef.current?.setBody(body),
  });

  const goBack = useCallback(() => {
    if (!activeProjectId) return;
    const viewId = useViewStore.getState().activeViewId;
    navigate(viewId ? `/${activeProjectId}/view/${viewId}` : `/${activeProjectId}`);
  }, [activeProjectId, navigate]);

  const handleStatusToggle = useCallback(() => {
    if (!activeProjectId || !activeTicket) return;
    const newStatus = nextStatus(activeTicket.status);
    updateField(activeProjectId, activeTicket.id, { status: newStatus });
    goBack();
  }, [activeProjectId, activeTicket, updateField, goBack]);

  if (!activeTicket) return null;

  const pid = activeProjectId!;

  return (
    <TicketContextMenu
      targetTickets={[activeTicket]}
      triggerClassName="flex flex-1 flex-col overflow-auto"
      hideOpen
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800 px-6 py-3">
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <CopyableId id={activeTicket.id} className="text-sm" />

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => navigate(`/${pid}/review/${activeTicket.id}`)}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
            title="Open review for this ticket"
          >
            Open review
          </button>
          <button
            onClick={handleStatusToggle}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
          >
            {activeTicket.status === "closed"
              ? "Reopen"
              : activeTicket.status === "open"
                ? "Start"
                : "Close"}
          </button>
        </div>
      </div>

      {/* Merge conflict banner — only shown when 3-way merge fails */}
      {conflict && (
        <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/[0.07] px-6 py-2">
          <Warning size={16} className="shrink-0 text-amber-400" />
          <span className="text-xs text-amber-300">
            Merge conflict — both you and an external process edited the same region.
          </span>
          <button
            onClick={keepLocal}
            className="rounded-md bg-zinc-700/50 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
          >
            Keep mine
          </button>
          <button
            onClick={acceptRemote}
            className="rounded-md bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/25"
          >
            Take theirs
          </button>
        </div>
      )}

      {/* Content */}
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <CopyableId id={activeTicket.id} className="mb-2 text-xs" />
        <InlineTitleEditor
          value={activeTicket.title}
          onSave={(title) => updateField(pid, activeTicket.id, { title })}
        />

        {/* Metadata — click to change */}
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-zinc-300">
            {activeTicket.kind}
          </span>

          <InlineSelect
            options={statusOptions}
            value={activeTicket.status}
            onChange={(val) => updateField(pid, activeTicket.id, { status: val })}
          >
            <span className="flex items-center gap-1.5 rounded-md px-2 py-1">
              <StatusDot status={activeTicket.status} showLabel />
            </span>
          </InlineSelect>

          <InlineSelect
            options={priorityOptions}
            value={activeTicket.priority}
            onChange={(val) => updateField(pid, activeTicket.id, { priority: val })}
          >
            <span className="flex items-center gap-1.5 rounded-md px-2 py-1">
              <PriorityIcon priority={activeTicket.priority} showLabel />
            </span>
          </InlineSelect>

          {activeTicket.kind === "ticket" || activeTicket.type ? (
            <InlineSelect
              options={typeOptions}
              value={activeTicket.type}
              onChange={(val) => updateField(pid, activeTicket.id, { type: val })}
            >
              <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                {activeTicket.type || "type"}
              </span>
            </InlineSelect>
          ) : null}

          {activeTicket.created && (
            <span className="text-xs text-zinc-500">{activeTicket.created}</span>
          )}
        </div>

        {/* Parent epic — derived via nearest-epic BFS over deps+links.
            Rendered as a prominent pill so the user always sees the
            ticket's home epic at a glance, separate from raw deps/links. */}
        {parentEpic && (
          <div className="mb-4 flex items-center gap-2 text-sm">
            <Stack size={14} className="shrink-0 text-violet-400" weight="duotone" />
            <span className="text-xs uppercase tracking-wider text-zinc-500">Parent epic:</span>
            <button
              type="button"
              onClick={() => navigate(`/${pid}/ticket/${parentEpic.id}`)}
              className="group inline-flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-200 transition-colors hover:border-violet-400/60 hover:bg-violet-500/20"
              title={`Open ${parentEpic.title}`}
            >
              <span className="font-mono text-[10px] text-violet-300/70">{parentEpic.id}</span>
              <span className="max-w-md truncate">{parentEpic.title}</span>
            </button>
          </div>
        )}

        {/* Targets */}
        {activeTicket.targets?.length > 0 && (
          <div className="mb-4 text-sm">
            <span className="text-xs uppercase tracking-wider text-zinc-500">Targets: </span>
            {activeTicket.targets.map((path) => (
              <span
                key={path}
                className="mr-2 inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-200"
              >
                {path}
              </span>
            ))}
          </div>
        )}

        {/* Tags — editable */}
        <div className="mb-4">
          <TagEditor
            tags={activeTicket.tags ?? []}
            onRemove={(tag) => {
              const next = (activeTicket.tags ?? []).filter((t) => t !== tag);
              updateField(pid, activeTicket.id, { tags: next });
            }}
            onAdd={(tag) => {
              const next = [...(activeTicket.tags ?? []), tag];
              updateField(pid, activeTicket.id, { tags: next });
            }}
          />
        </div>

        {/* Dependencies */}
        {activeTicket.deps?.length > 0 && (
          <div className="mb-6 text-sm">
            <span className="text-xs uppercase tracking-wider text-zinc-500">Depends on: </span>
            {activeTicket.deps.map((dep) => (
              <TicketLink key={dep} id={dep} className="mr-2 text-xs" />
            ))}
          </div>
        )}

        {/* Links */}
        {activeTicket.links?.length > 0 && (
          <div className="mb-6 text-sm">
            <span className="text-xs uppercase tracking-wider text-zinc-500">Linked: </span>
            {activeTicket.links.map((linkId) => (
              <TicketLink key={linkId} id={linkId} className="mr-2 text-xs" />
            ))}
          </div>
        )}

        {/* Sub-tickets — every non-epic whose nearest epic is this one.
            Only shown when this ticket IS an epic. Uses the transitive
            BFS algorithm (group-engine.buildEpicLookup) so children linked
            via intermediates still surface here. */}
        {subTickets.length > 0 && (
          <div className="mb-6 text-sm">
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              Sub-tickets ({subTickets.length}):{" "}
            </span>
            {subTickets.map((sub) => (
              <TicketLink key={sub.id} id={sub.id} className="mr-2 text-xs" />
            ))}
          </div>
        )}

        {/* Reverse deps */}
        {reverseDeps.length > 0 && (
          <div className="mb-6 text-sm">
            <span className="text-xs uppercase tracking-wider text-zinc-500">Depended on by: </span>
            {reverseDeps.map((id) => (
              <TicketLink key={id} id={id} className="mr-2 text-xs" />
            ))}
          </div>
        )}

        {/* Reverse links */}
        {reverseLinks.length > 0 && (
          <div className="mb-6 text-sm">
            <span className="text-xs uppercase tracking-wider text-zinc-500">Referenced by: </span>
            {reverseLinks.map((id) => (
              <TicketLink key={id} id={id} className="mr-2 text-xs" />
            ))}
          </div>
        )}

        <div className="mb-6 h-px bg-zinc-800" />

        {/* Editable body */}
        {/*
          key={activeTicket.id} force-remounts the editor when the user
          navigates to a different ticket. This is REQUIRED — Tiptap's
          useEditor takes content at construction time only; without a
          remount the editor keeps the previous ticket's body while the
          header above (title, tags) shows the new ticket, and a subsequent
          edit would overwrite the new ticket with stale content.
        */}
        <TicketBodyEditor
          key={activeTicket.id}
          ref={editorRef}
          ticketId={activeTicket.id}
          body={activeTicket.body}
          onSave={(md) => {
            updateField(pid, activeTicket.id, { body: md });
            markSaved(md);
          }}
        />

        {/* Activity timeline */}
        <div className="mt-8">
          <TicketActivity />
        </div>

        {/* Plain note composer at the bottom */}
        <TicketNoteComposer projectId={pid} ticketId={activeTicket.id} />
      </div>
    </TicketContextMenu>
  );
}
