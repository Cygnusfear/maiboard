/**
 * Column editor popover — inline editing of a board column's name, filters, and sort.
 * All filter editing primitives come from filter-primitives.tsx — zero duplication.
 */
import { useState, useCallback } from "react";
import { Popover } from "@base-ui/react/popover";
import {
  type FilterField,
  type FilterOperator,
  FILTER_FIELDS,
  FIELD_LABELS,
  FIELD_OPERATORS,
  createFilterId,
} from "@/lib/filter-engine";
import type { FilterClause } from "@/lib/filter-engine";
import type { SavedList, SortField, SortDir } from "@/lib/types";
import { SORT_FIELD_OPTIONS } from "@/lib/types";
import { getDefaultValue } from "@/lib/filter-engine";
import { FilterRow } from "./filter-primitives";
import { Plus, Trash, SortAscending, SortDescending } from "@phosphor-icons/react";

// ── Add filter field picker ───────────────────────────────────

function AddFilterButton({ onAdd }: { onAdd: (field: FilterField) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300">
        <Plus size={10} />
        Filter
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} className="z-[60]">
          <Popover.Popup className="rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
            {FILTER_FIELDS.map((f) => (
              <button
                key={f}
                onClick={() => {
                  onAdd(f);
                  setOpen(false);
                }}
                className="flex w-full px-3 py-1 text-left text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                {FIELD_LABELS[f]}
              </button>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ── Main editor ───────────────────────────────────────────────

interface ColumnEditorProps {
  column: SavedList;
  onUpdate: (updated: SavedList) => void;
  onDelete: () => void;
  children: React.ReactNode;
}

export function ColumnEditor({ column, onUpdate, onDelete, children }: ColumnEditorProps) {
  const [name, setName] = useState(column.name);
  const [filters, setFilters] = useState<FilterClause[]>(column.filters);
  const [sortField, setSortField] = useState<SortField>(column.sortField);
  const [sortDir, setSortDir] = useState<SortDir>(column.sortDir);
  const [editing, setEditing] = useState(false);

  const handleSave = useCallback(() => {
    onUpdate({ id: column.id, name: name.trim() || column.name, filters, sortField, sortDir });
    setEditing(false);
  }, [name, filters, sortField, sortDir, column.name, onUpdate]);

  const addFilter = (field: FilterField) => {
    const op: FilterOperator = FIELD_OPERATORS[field][0];
    setFilters((prev) => [
      ...prev,
      { id: createFilterId(), field, operator: op, value: getDefaultValue(field, op) },
    ]);
  };

  const updateFilter = (id: string, patch: Partial<FilterClause>) => {
    setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeFilter = (id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <Popover.Root
      open={editing}
      onOpenChange={(open) => {
        setEditing(open);
        if (open) {
          setName(column.name);
          setFilters(column.filters);
          setSortField(column.sortField);
          setSortDir(column.sortDir);
        }
      }}
    >
      <Popover.Trigger
        render={(props) => (
          <div {...props} className="flex min-h-0 flex-1 flex-col">
            {children}
          </div>
        )}
      />
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} className="z-50">
          <Popover.Popup className="w-[300px] rounded-lg border border-zinc-800 bg-zinc-900 p-3 shadow-xl shadow-zinc-950/80">
            {/* Name */}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="mb-3 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-600"
              placeholder="Column name"
              autoFocus
            />

            {/* Filters */}
            <div className="mb-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-500">Filters</span>
                <AddFilterButton onAdd={addFilter} />
              </div>
              {filters.length === 0 && (
                <div className="py-2 text-center text-[11px] text-zinc-600">
                  No filters — shows all tickets
                </div>
              )}
              {filters.map((f) => (
                <FilterRow
                  key={f.id}
                  clause={f}
                  onUpdate={(patch) => updateFilter(f.id, patch)}
                  onRemove={() => removeFilter(f.id)}
                />
              ))}
            </div>

            {/* Sort */}
            <div className="mb-3">
              <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">Sort</span>
              <div className="flex gap-1.5">
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-300 outline-none"
                >
                  {SORT_FIELD_OPTIONS.map((sf) => (
                    <option key={sf.value} value={sf.value}>
                      {sf.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                  className="rounded-md border border-zinc-800 px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  {sortDir === "asc" ? <SortAscending size={14} /> : <SortDescending size={14} />}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-zinc-800 pt-2">
              <button
                onClick={() => {
                  onDelete();
                  setEditing(false);
                }}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash size={12} />
                Delete
              </button>
              <button
                onClick={handleSave}
                className="rounded-md bg-blue-500/15 px-3 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/25"
              >
                Apply
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
