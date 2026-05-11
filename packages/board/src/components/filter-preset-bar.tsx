import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Popover } from "@base-ui/react/popover";
import {
  type FilterClause,
  type FilterField,
  PRIMARY_FILTER_FIELDS,
  SECONDARY_FILTER_FIELDS,
  FIELD_LABELS,
  createFilterId,
} from "@/lib/filter-engine";
import type { FilterPreset, SavedView } from "@/lib/types";
import { FilterRow } from "./filter-primitives";
import { FunnelSimple, Plus, PencilSimple, X } from "@phosphor-icons/react";

interface FilterPresetBarProps {
  view: SavedView;
  onTogglePreset: (presetId: string) => void;
  onAddPreset: (preset: FilterPreset, activate: boolean) => void;
  onUpdatePreset: (presetId: string, patch: Pick<FilterPreset, "name" | "filters">) => void;
  onRemovePreset: (presetId: string) => void;
}

function cloneClause(clause: FilterClause): FilterClause {
  return {
    ...clause,
    value: Array.isArray(clause.value)
      ? ([...clause.value] as FilterClause["value"])
      : clause.value,
  };
}

function defaultClause(field: FilterField): FilterClause {
  return {
    id: createFilterId(),
    field,
    operator:
      field === "created" || field === "modified"
        ? "last_n_days"
        : field === "title" || field === "target"
          ? "contains"
          : "any_of",
    value:
      field === "created" || field === "modified"
        ? 30
        : field === "title" || field === "target"
          ? ""
          : [],
  };
}

function AddClauseButton({ onAdd }: { onAdd: (field: FilterField) => void }) {
  return (
    <Popover.Root>
      <Popover.Trigger className="inline-flex items-center gap-1 rounded-md border border-dashed border-zinc-700 px-2 py-1 text-xs text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300 data-[popup-open]:border-zinc-500 data-[popup-open]:text-zinc-300">
        <Plus size={12} />
        Clause
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8}>
          <Popover.Popup className="min-w-[180px] origin-[var(--transform-origin)] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl transition-[transform,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
              Common
            </div>
            {PRIMARY_FILTER_FIELDS.map((field) => (
              <Popover.Close
                key={field}
                onClick={() => onAdd(field)}
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
                onClick={() => onAdd(field)}
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

function PresetEditor({
  trigger,
  title,
  initialName,
  initialFilters,
  saveLabel,
  onSave,
}: {
  trigger: ReactElement;
  title: string;
  initialName: string;
  initialFilters: FilterClause[];
  saveLabel: string;
  onSave: (name: string, filters: FilterClause[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [filters, setFilters] = useState<FilterClause[]>(initialFilters.map(cloneClause));

  useEffect(() => {
    if (open) {
      setName(initialName);
      setFilters(initialFilters.map(cloneClause));
    }
  }, [open, initialName, initialFilters]);

  const canSave = name.trim().length > 0 && filters.length > 0;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="start">
          <Popover.Popup className="w-[420px] origin-[var(--transform-origin)] rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl transition-[transform,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  {title}
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  Applied across every column in this board
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                title="Close"
              >
                <X size={12} />
              </button>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-[11px] font-medium text-zinc-400">Pill name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="EPIC ONLY"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-blue-500"
              />
            </div>

            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Filter clauses
              </div>
              <AddClauseButton
                onAdd={(field) => setFilters((prev) => [...prev, defaultClause(field)])}
              />
            </div>

            <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
              {filters.length === 0 ? (
                <div className="rounded-md border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-600">
                  Add one or more clauses to define this pill.
                </div>
              ) : (
                filters.map((clause) => (
                  <FilterRow
                    key={clause.id}
                    clause={clause}
                    onUpdate={(patch) =>
                      setFilters((prev) =>
                        prev.map((item) => (item.id === clause.id ? { ...item, ...patch } : item)),
                      )
                    }
                    onRemove={() =>
                      setFilters((prev) => prev.filter((item) => item.id !== clause.id))
                    }
                  />
                ))
              )}
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                disabled={!canSave}
                onClick={() => {
                  onSave(name.trim(), filters.map(cloneClause));
                  setOpen(false);
                }}
                className="rounded-md bg-blue-600/80 px-3 py-1.5 text-xs text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saveLabel}
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function FilterPresetBar({
  view,
  onTogglePreset,
  onAddPreset,
  onUpdatePreset,
  onRemovePreset,
}: FilterPresetBarProps) {
  const presets = view.filterPresets ?? [];
  const active = useMemo(() => new Set(view.activePresetIds ?? []), [view.activePresetIds]);

  return (
    <>
      <span className="text-[11px] uppercase tracking-wider text-zinc-500">Board Filter</span>
      {presets.map((preset) => {
        const isActive = active.has(preset.id);
        return (
          <div
            key={preset.id}
            className="group/preset flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/40 px-1 py-1"
          >
            <button
              onClick={() => onTogglePreset(preset.id)}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                isActive
                  ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/25"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
              title="Toggle board-wide filter"
            >
              <span className="inline-flex items-center gap-1">
                <FunnelSimple size={11} />
                {preset.name}
              </span>
            </button>

            <PresetEditor
              trigger={
                <button
                  className="rounded p-1 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-300 group-hover/preset:opacity-100"
                  title="Edit board filter"
                >
                  <PencilSimple size={11} />
                </button>
              }
              title="Edit board filter"
              initialName={preset.name}
              initialFilters={preset.filters}
              saveLabel="Save"
              onSave={(name, filters) => onUpdatePreset(preset.id, { name, filters })}
            />

            <button
              onClick={() => onRemovePreset(preset.id)}
              className="rounded p-1 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-300 group-hover/preset:opacity-100"
              title="Remove board filter"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}

      <PresetEditor
        trigger={
          <button className="inline-flex items-center gap-1 rounded-md border border-dashed border-zinc-700 px-2 py-1 text-xs text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300">
            <Plus size={12} />
            Add Board Filter
          </button>
        }
        title="New board filter"
        initialName=""
        initialFilters={[]}
        saveLabel="Create"
        onSave={(name, filters) => onAddPreset({ id: createFilterId(), name, filters }, true)}
      />
    </>
  );
}
