import { useState, useMemo, useRef, useEffect } from "react";
import { useAllTags } from "@/hooks/use-all-tags";
import { Popover } from "@base-ui/react/popover";
import { Plus, X } from "@phosphor-icons/react";
import { TagPill } from "./tag-pill";
import { normalizeTag } from "@/lib/tag-mutations";

interface TagEditorProps {
  tags: string[];
  onRemove: (tag: string) => void;
  onAdd: (tag: string) => void;
}

const popupCls =
  "min-w-[220px] max-h-[280px] rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl shadow-zinc-950/80 " +
  "origin-[var(--transform-origin)] transition-opacity data-[ending-style]:opacity-0 overflow-hidden flex flex-col";

const optionCls =
  "flex cursor-default items-center gap-2 py-1.5 px-3 text-[13px] leading-4 text-zinc-300 outline-none select-none " +
  "hover:bg-zinc-800 hover:text-zinc-100";

export function TagEditor({ tags, onRemove, onAdd }: TagEditorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Collect all known tags across every ticket in the project
  const allTags = useAllTags();

  // Filter: exclude already-applied tags, match search
  const filtered = useMemo(() => {
    const tagSet = new Set(tags);
    return allTags
      .filter((t) => !tagSet.has(t))
      .filter((t) => !search || t.toLowerCase().includes(search.toLowerCase()));
  }, [allTags, tags, search]);

  const exactMatch = allTags.includes(search.trim()) || tags.includes(search.trim());
  const showCreate = search.trim().length > 0 && !exactMatch;

  const handleSelect = (tag: string) => {
    onAdd(tag);
    setSearch("");
    setOpen(false);
  };

  const handleCreate = () => {
    const tag = normalizeTag(search);
    if (tag) {
      onAdd(tag);
      setSearch("");
      setOpen(false);
    }
  };

  useEffect(() => {
    if (open) {
      // Focus input after popover opens
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setSearch("");
    }
  }, [open]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="group/tag relative">
          <TagPill tag={tag} />
          <button
            type="button"
            onClick={() => onRemove(tag)}
            className="absolute -top-1 -right-1 hidden size-4 items-center justify-center rounded-full bg-zinc-700 text-zinc-300 transition-colors hover:bg-red-600 hover:text-white group-hover/tag:flex"
          >
            <X size={10} weight="bold" />
          </button>
        </span>
      ))}

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          className="flex size-6 items-center justify-center rounded-md border border-dashed border-zinc-700 text-zinc-500 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          render={<button type="button" />}
        >
          <Plus size={12} weight="bold" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className="z-50 outline-none" sideOffset={4}>
            <Popover.Popup className={popupCls}>
              <div className="border-b border-zinc-800 px-3 py-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (showCreate) handleCreate();
                      else if (filtered.length === 1) handleSelect(filtered[0]);
                    }
                    if (e.key === "Escape") setOpen(false);
                  }}
                  placeholder="Search or create tag…"
                  className="w-full bg-transparent text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none"
                />
              </div>
              <div className="overflow-y-auto py-1">
                {filtered.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={optionCls}
                    onClick={() => handleSelect(tag)}
                  >
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">
                      {tag}
                    </span>
                  </button>
                ))}
                {showCreate && (
                  <button
                    type="button"
                    className={`${optionCls} text-blue-400`}
                    onClick={handleCreate}
                  >
                    <Plus size={12} weight="bold" />
                    Create "{normalizeTag(search)}"
                  </button>
                )}
                {filtered.length === 0 && !showCreate && (
                  <div className="px-3 py-2 text-xs text-zinc-500">No tags available</div>
                )}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
