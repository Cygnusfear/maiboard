import { useCallback, useState } from "react";
import { ChatText } from "@phosphor-icons/react";
import { postTicketNote } from "@/lib/api";
import { useTicketStore } from "@/stores/ticket-store";

interface Props {
  projectId: string;
  ticketId: string;
}

/**
 * Plain note composer at the bottom of the ticket detail.
 * Posts to /tickets/:id/notes — runs `mai add-note <id> <text>` server-side.
 * On success, refetches the ticket so the activity timeline shows the new note.
 */
export function TicketNoteComposer({ projectId, ticketId }: Props) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Selector — don't re-render this composer on every unrelated store mutation.
  const fetchTicketDetail = useTicketStore((s) => s.fetchTicketDetail);

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await postTicketNote(projectId, ticketId, text);
      setDraft("");
      await fetchTicketDetail(projectId, ticketId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [projectId, ticketId, draft, fetchTicketDetail]);

  return (
    <div className="mt-8 border-t border-zinc-800 pt-6">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
        <ChatText size={12} />
        Add note
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="Comment on this ticket… (Cmd+Enter to submit)"
        rows={3}
        className="w-full resize-y rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
        disabled={busy}
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || draft.trim().length === 0}
          className="rounded-md bg-zinc-800 px-3 py-1 text-xs text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add note"}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}
