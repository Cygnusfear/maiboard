import { useState, useCallback } from "react";
import { Popover } from "@base-ui/react/popover";
import { useFilterStore } from "@/stores/filter-store";
import type { GroupField } from "@/lib/group-engine";
import {
  type FilterField,
  type FilterClause,
  PRIMARY_FILTER_FIELDS,
  SECONDARY_FILTER_FIELDS,
  FIELD_LABELS,
  OPERATOR_LABELS,
} from "@/lib/filter-engine";
import { Plus, X, MagnifyingGlass, FunnelSimple, Rows, Check } from "@phosphor-icons/react";
import { FilterEditor, formatFilterValue } from "./filter-primitives";

// ── Filter chip (shows one active filter) ─────────────────────

function FilterChip({
  clause,
  autoOpen,
  onOpened,
}: {
  clause: FilterClause;
  autoOpen?: boolean;
  onOpened?: () => void;
}) {
  const { updateFilter, removeFilter } = useFilterStore();

  return (
    <Popover.Root
      defaultOpen={autoOpen}
      onOpenChange={(open) => {
        if (open && autoOpen) onOpened?.();
      }}
    >
      <Popover.Trigger className="flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/50 px-2 py-1 text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 data-[popup-open]:border-zinc-600 data-[popup-open]:bg-zinc-800">
        <span className="text-zinc-500">{FIELD_LABELS[clause.field]}</span>
        <span className="text-zinc-600">{OPERATOR_LABELS[clause.operator]}</span>
        <span className="max-w-[180px] truncate font-medium">{formatFilterValue(clause)}</span>
        <X
          size={12}
          className="ml-1 text-zinc-500 hover:text-zinc-200"
          onClick={(e) => {
            e.stopPropagation();
            removeFilter(clause.id);
          }}
        />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner sideOffset={8}>
          <Popover.Popup className="min-w-[240px] max-w-[360px] origin-[var(--transform-origin)] rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl transition-[transform,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <FilterEditor clause={clause} onUpdate={(patch) => updateFilter(clause.id, patch)} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ── Add filter button ─────────────────────────────────────────

function AddFilterButton({ onAdded }: { onAdded?: (id: string) => void }) {
  const { addFilter } = useFilterStore();

  return (
    <Popover.Root>
      <Popover.Trigger className="flex items-center gap-1 rounded-md border border-dashed border-zinc-700 px-2 py-1 text-xs text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300 data-[popup-open]:border-zinc-500 data-[popup-open]:text-zinc-300">
        <Plus size={12} />
        Filter
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner sideOffset={8}>
          <Popover.Popup className="min-w-[160px] origin-[var(--transform-origin)] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl transition-[transform,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
              Common
            </div>
            {PRIMARY_FILTER_FIELDS.map((field) => (
              <Popover.Close
                key={field}
                onClick={() => {
                  const id = addFilter(field);
                  onAdded?.(id);
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                {FIELD_LABELS[field]}
              </Popover.Close>
            ))}
            <div className="mx-2 my-1 h-px bg-zinc-800" />
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
              More filters
            </div>
            {SECONDARY_FILTER_FIELDS.map((field) => (
              <Popover.Close
                key={field}
                onClick={() => {
                  const id = addFilter(field);
                  onAdded?.(id);
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                {FIELD_LABELS[field]}
              </Popover.Close>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ── Group-by selector ─────────────────────────────────────────

const GROUP_OPTIONS: { value: GroupField | null; label: string }[] = [
  { value: null, label: "None" },
  { value: "status", label: "Status" },
  { value: "type", label: "Type" },
  { value: "epic", label: "Epic" },
];

function GroupByButton() {
  const { groupBy, setGroupBy } = useFilterStore();
  const active = GROUP_OPTIONS.find((o) => o.value === groupBy);

  return (
    <Popover.Root>
      <Popover.Trigger
        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
          groupBy
            ? "border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:border-zinc-600"
            : "border-dashed border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
        } data-[popup-open]:border-zinc-500`}
      >
        <Rows size={12} />
        {groupBy ? `Group: ${active?.label}` : "Group"}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner sideOffset={8}>
          <Popover.Popup className="min-w-[140px] origin-[var(--transform-origin)] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl outline-none transition-[transform,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {GROUP_OPTIONS.map((opt) => (
              <Popover.Close
                key={opt.label}
                onClick={() => setGroupBy(opt.value)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                {opt.label}
                {groupBy === opt.value && <Check size={12} className="ml-auto text-blue-400" />}
              </Popover.Close>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ── Main filter bar ───────────────────────────────────────────

export function FilterBar() {
  const { filters, search, setSearch, clearFilters } = useFilterStore();
  const hasFilters = filters.length > 0 || search.length > 0;
  const [newFilterId, setNewFilterId] = useState<string | null>(null);

  const handleFilterAdded = useCallback((id: string) => {
    setNewFilterId(id);
  }, []);

  const handleOpened = useCallback(() => {
    setNewFilterId(null);
  }, []);

  return (
    <div className="flex items-center gap-2 overflow-x-auto px-4 py-1.5">
      {/* Search */}
      <div className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-2 py-1 focus-within:border-blue-500">
        <MagnifyingGlass size={13} className="text-zinc-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tickets..."
          className="w-32 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:w-48 transition-all"
        />
        {search && (
          <X
            size={12}
            className="cursor-pointer text-zinc-500 hover:text-zinc-200"
            onClick={() => setSearch("")}
          />
        )}
      </div>

      <div className="h-4 w-px bg-zinc-800" />

      {/* Active filter chips */}
      {filters.map((clause) => (
        <FilterChip
          key={clause.id}
          clause={clause}
          autoOpen={clause.id === newFilterId}
          onOpened={handleOpened}
        />
      ))}

      {/* Add filter */}
      <AddFilterButton onAdded={handleFilterAdded} />

      <div className="h-4 w-px bg-zinc-800" />

      {/* Group by */}
      <GroupByButton />

      {/* Clear all */}
      {hasFilters && (
        <button
          onClick={clearFilters}
          className="ml-1 flex items-center gap-1 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <FunnelSimple size={12} />
          Clear
        </button>
      )}
    </div>
  );
}
