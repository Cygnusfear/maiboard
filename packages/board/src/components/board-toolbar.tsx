import { useState } from "react";
import { createFilterId } from "@/lib/filter-engine";
import type { SavedList, SavedView, SortField, SortDir } from "@/lib/types";
import { STATUS_LABELS, PRIORITY_LABELS, SORT_FIELD_OPTIONS } from "@/lib/types";
import { SortAscending, SortDescending, Lightning, Check } from "@phosphor-icons/react";
import { Popover } from "@base-ui/react/popover";
import { FilterPresetBar } from "./filter-preset-bar";

// ── Presets ───────────────────────────────────────────────────

type PresetId = "by-status" | "by-type" | "by-priority";

export interface PresetDef {
  id: PresetId;
  label: string;
  generate: () => SavedList[];
}

export const PRESETS: PresetDef[] = [
  {
    id: "by-status",
    label: "By Status",
    generate: () =>
      ["open", "in_progress", "closed"].map((s) => ({
        id: createFilterId(),
        name: STATUS_LABELS[s] ?? s,
        filters: [
          {
            id: createFilterId(),
            field: "status" as const,
            operator: "any_of" as const,
            value: [s],
          },
        ],
        sortField: "priority" as SortField,
        sortDir: "asc" as SortDir,
      })),
  },
  {
    id: "by-type",
    label: "By Type",
    generate: () =>
      ["bug", "feature", "task", "chore", "epic"].map((t) => ({
        id: createFilterId(),
        name: t.charAt(0).toUpperCase() + t.slice(1),
        filters: [
          { id: createFilterId(), field: "type" as const, operator: "any_of" as const, value: [t] },
        ],
        sortField: "priority" as SortField,
        sortDir: "asc" as SortDir,
      })),
  },
  {
    id: "by-priority",
    label: "By Priority",
    generate: () =>
      [0, 1, 2, 3].map((p) => ({
        id: createFilterId(),
        name: PRIORITY_LABELS[p],
        filters: [
          {
            id: createFilterId(),
            field: "priority" as const,
            operator: "any_of" as const,
            value: [String(p)],
          },
        ],
        sortField: "created" as SortField,
        sortDir: "desc" as SortDir,
      })),
  },
];

// ── Board toolbar ─────────────────────────────────────────────

export function BoardToolbar({
  view,
  onApplyPreset,
  onToggleBoardSort,
  onSetBoardSortField,
  onTogglePreset,
  onAddPreset,
  onUpdatePreset,
  onRemovePreset,
}: {
  view: SavedView;
  onApplyPreset: (preset: PresetDef) => void;
  onToggleBoardSort: () => void;
  onSetBoardSortField: (field: SortField) => void;
  onTogglePreset: (presetId: string) => void;
  onAddPreset: (preset: import("@/lib/types").FilterPreset, activate: boolean) => void;
  onUpdatePreset: (
    presetId: string,
    patch: Pick<import("@/lib/types").FilterPreset, "name" | "filters">,
  ) => void;
  onRemovePreset: (presetId: string) => void;
}) {
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const hasBoardSort = !!view.boardSort;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/50 px-4 py-2">
      <Popover.Root open={presetsOpen} onOpenChange={setPresetsOpen}>
        <Popover.Trigger className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300">
          <Lightning size={12} />
          Presets
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={4} className="z-50">
            <Popover.Popup className="min-w-[140px] rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onApplyPreset(p);
                    setPresetsOpen(false);
                  }}
                  className="flex w-full px-3 py-1.5 text-left text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  {p.label}
                </button>
              ))}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      <Popover.Root open={sortOpen} onOpenChange={setSortOpen}>
        <Popover.Trigger
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
            hasBoardSort
              ? "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
              : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          }`}
        >
          {view.boardSort?.dir === "desc" ? (
            <SortDescending size={12} />
          ) : (
            <SortAscending size={12} />
          )}
          {hasBoardSort ? `Sort: ${view.boardSort!.field}` : "Board sort"}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={4} className="z-50">
            <Popover.Popup className="w-[180px] rounded-lg border border-zinc-800 bg-zinc-900 p-2 shadow-xl">
              <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">
                Sort all columns by
              </span>
              {SORT_FIELD_OPTIONS.map((sf) => (
                <button
                  key={sf.value}
                  onClick={() => {
                    onSetBoardSortField(sf.value);
                    setSortOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-zinc-800 ${
                    view.boardSort?.field === sf.value ? "text-blue-400" : "text-zinc-400"
                  }`}
                >
                  {sf.label}
                  {view.boardSort?.field === sf.value && <Check size={10} className="ml-auto" />}
                </button>
              ))}
              <div className="my-1.5 border-t border-zinc-800" />
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    onToggleBoardSort();
                    setSortOpen(false);
                  }}
                  className="flex-1 rounded px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                >
                  {hasBoardSort ? "Toggle direction" : "Enable"}
                </button>
                {hasBoardSort && (
                  <button
                    onClick={() => {
                      onSetBoardSortField("__clear__" as SortField);
                      setSortOpen(false);
                    }}
                    className="rounded px-2 py-1 text-[11px] text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
                  >
                    Clear
                  </button>
                )}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      <div className="mx-1 h-4 w-px bg-zinc-800" />

      <FilterPresetBar
        view={view}
        onTogglePreset={onTogglePreset}
        onAddPreset={onAddPreset}
        onUpdatePreset={onUpdatePreset}
        onRemovePreset={onRemovePreset}
      />

      <span className="ml-auto text-[11px] text-zinc-600">{view.columns?.length ?? 0} columns</span>
    </div>
  );
}
