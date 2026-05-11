/**
 * Watches a ticket for external changes while the user is viewing/editing it.
 *
 * Merge strategy (temporary CRDT):
 * - Frontmatter (status, priority, tags, type): always auto-refresh from server
 * - Body when editor is clean: auto-refresh
 * - Body when editor is dirty: 3-way merge (base→local + base→remote)
 *   - Merge succeeds → silently update editor content
 *   - Merge fails → show conflict banner
 *
 * Polls full ticket every 3 seconds. Compares `modified` to detect changes.
 * (Maitake has no lightweight mtime endpoint — queries are fast enough.)
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { getTicket } from "@/lib/api";
import { useTicketStore } from "@/stores/ticket-store";
import { mergeTicketBody } from "@/lib/ticket-merge";
import type { Ticket } from "@/lib/types";

const POLL_INTERVAL = 3000;

export interface TicketConflict {
  local: string;
  remote: string;
}

interface UseTicketWatcherOpts {
  projectId: string | null;
  ticketId: string | null;
  /** Current editor body (live, including unsaved edits) */
  getEditorBody: () => string | null;
  /** Push merged/refreshed body into the editor without triggering onUpdate */
  setEditorBody: (body: string) => void;
}

export function useTicketWatcher({
  projectId,
  ticketId,
  getEditorBody,
  setEditorBody,
}: UseTicketWatcherOpts) {
  const knownModified = useRef<string | null>(null);
  /** The body version the editor started from (for 3-way merge) */
  const baseBody = useRef<string | null>(null);
  const [conflict, setConflict] = useState<TicketConflict | null>(null);

  const getEditorBodyRef = useRef(getEditorBody);
  getEditorBodyRef.current = getEditorBody;
  const setEditorBodyRef = useRef(setEditorBody);
  setEditorBodyRef.current = setEditorBody;

  // Initialize from current ticket
  useEffect(() => {
    const ticket = useTicketStore.getState().activeTicket;
    if (ticket && ticket.id === ticketId) {
      knownModified.current = ticket.modified;
      baseBody.current = ticket.body;
    }
    setConflict(null);
  }, [ticketId]);

  // Poll loop
  useEffect(() => {
    if (!projectId || !ticketId) return;

    let active = true;

    const check = async () => {
      if (!active) return;
      try {
        const fresh = await getTicket(projectId, ticketId);
        if (!active) return;

        // First poll — record modified timestamp
        if (!knownModified.current) {
          knownModified.current = fresh.modified;
          return;
        }

        // No change
        if (fresh.modified === knownModified.current) return;

        // External change detected
        const localBody = getEditorBodyRef.current();
        const base = baseBody.current ?? "";
        const editorDirty = localBody !== null && localBody !== base;

        if (!editorDirty) {
          // Editor is clean — full refresh
          useTicketStore.setState({ activeTicket: fresh });
          setEditorBodyRef.current(fresh.body);
          baseBody.current = fresh.body;
          knownModified.current = fresh.modified;
          setConflict(null);
        } else {
          // Editor has unsaved edits — 3-way merge
          const result = mergeTicketBody(base, localBody!, fresh.body);

          if (result.ok) {
            // Clean merge — update everything silently
            const merged: Ticket = { ...fresh, body: result.merged };
            useTicketStore.setState({ activeTicket: merged });
            setEditorBodyRef.current(result.merged);
            baseBody.current = fresh.body;
            knownModified.current = fresh.modified;
            setConflict(null);
          } else {
            // Conflict — update frontmatter but leave body alone
            const withOldBody: Ticket = { ...fresh, body: localBody! };
            useTicketStore.setState({ activeTicket: withOldBody });
            knownModified.current = fresh.modified;
            setConflict({ local: result.local, remote: result.remote });
          }
        }
      } catch {
        // Network error — skip
      }
    };

    const timer = setInterval(check, POLL_INTERVAL);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [projectId, ticketId]);

  /** Call after a successful save — resets the base for future merges */
  const markSaved = useCallback((body: string) => {
    baseBody.current = body;
    setConflict(null);
  }, []);

  /** Accept the remote version, discarding local edits */
  const acceptRemote = useCallback(async () => {
    if (!projectId || !ticketId) return;
    const fresh = await getTicket(projectId, ticketId);
    useTicketStore.setState({ activeTicket: fresh });
    setEditorBodyRef.current(fresh.body);
    baseBody.current = fresh.body;
    knownModified.current = fresh.modified;
    setConflict(null);
  }, [projectId, ticketId]);

  /** Keep local version (user's edits win) */
  const keepLocal = useCallback(() => {
    if (conflict) {
      baseBody.current = conflict.remote; // rebase onto remote
      setConflict(null);
    }
  }, [conflict]);

  return { conflict, markSaved, acceptRemote, keepLocal };
}
