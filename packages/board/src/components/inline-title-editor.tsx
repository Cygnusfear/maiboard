import { useCallback, useEffect, useRef, useState } from "react";
import { PencilSimple } from "@phosphor-icons/react";

interface Props {
  value: string;
  onSave: (next: string) => void;
  /** Tailwind classes applied to the rendered heading text (matches the static <h1>). */
  className?: string;
}

/**
 * Inline title editor.
 *
 * Renders an `<h1>` styled like the existing static title. Double-click or
 * click the hover-revealed pencil to swap it for a same-size `<input>`.
 *
 * - Enter or blur: commit. Trims input; ignores empty.
 * - Escape: cancel.
 * - Auto-focuses + selects on entry.
 *
 * Mirrors the pattern in list-view.tsx so the whole app feels consistent.
 */
export function InlineTitleEditor({ value, onSave, className }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep draft in sync when the active ticket changes externally.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const start = useCallback(() => {
    setDraft(value);
    setEditing(true);
  }, [value]);

  const commit = useCallback(() => {
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    setEditing(false);
  }, [draft, value, onSave]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={commit}
        className={`mb-4 w-full rounded-md border border-blue-500/40 bg-zinc-950 px-2 py-1 text-xl font-medium tracking-tight text-zinc-100 outline-none focus:border-blue-400 ${className ?? ""}`}
      />
    );
  }

  return (
    <div className="group/title mb-4 flex items-center gap-2">
      <h1
        onDoubleClick={(e) => {
          e.preventDefault();
          start();
        }}
        className={`text-xl font-medium tracking-tight text-zinc-100 ${className ?? ""}`}
      >
        {value}
      </h1>
      <button
        type="button"
        onClick={start}
        title="Edit title (double-click works too)"
        className="opacity-0 transition-opacity group-hover/title:opacity-100 hover:text-zinc-200"
      >
        <PencilSimple size={14} className="text-zinc-500" />
      </button>
    </div>
  );
}
