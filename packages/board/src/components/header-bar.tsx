import { useState, useCallback } from "react";
import { useNavigate } from "@/hooks/use-navigate";
import { useUIStore } from "@/stores/ui-store";
import { useFilterStore } from "@/stores/filter-store";
import { useViewStore } from "@/stores/view-store";
import { useFilteredTickets } from "@/hooks/use-filtered-tickets";
import { useTicketStore } from "@/stores/ticket-store";
import { useProjectStore } from "@/stores/project-store";
import { FilterBar } from "./filter-bar";
import {
  List,
  Kanban,
  Graph,
  FloppyDisk,
  CaretDown,
  Plus,
  Trash,
  Check,
} from "@phosphor-icons/react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Popover } from "@base-ui/react/popover";
import { Dialog } from "@base-ui/react/dialog";

// ── Save-as dialog ────────────────────────────────────────────

function SaveAsDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (viewId: string) => void;
}) {
  const [name, setName] = useState("");
  const { saveView } = useViewStore();
  const { activeProjectId } = useProjectStore();
  const { filters, sortField, sortDir, groupBy } = useFilterStore();

  const handleSave = async () => {
    if (!activeProjectId || !name.trim()) return;
    const saved = await saveView(activeProjectId, {
      name: name.trim(),
      mode: "list",
      list: {
        id: crypto.randomUUID().slice(0, 8),
        name: name.trim(),
        filters,
        sortField,
        sortDir,
        groupBy: groupBy ?? undefined,
      },
    });
    setName("");
    onClose();
    onCreated(saved.id);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-zinc-950/80">
          <Dialog.Title className="mb-3 text-sm font-medium text-zinc-200">
            Save as new view
          </Dialog.Title>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="View name..."
            autoFocus
            className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="rounded-md bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/25 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Header ────────────────────────────────────────────────────

export function HeaderBar() {
  const { setShowCommandPalette } = useUIStore();
  const [, navigate] = useNavigate();
  const { views, activeViewId, setActiveView, dirty, saveView, deleteView } = useViewStore();
  const { activeProjectId } = useProjectStore();
  const filtered = useFilteredTickets();
  const total = useTicketStore((s) => s.tickets.length);
  const hasFilters = useFilterStore((s) => s.filters.length > 0 || s.search.length > 0);
  const [showSaveAs, setShowSaveAs] = useState(false);

  const activeView = views.find((v) => v.id === activeViewId);
  const viewMode = activeView?.mode ?? "list";

  const switchView = useCallback(
    (viewId: string) => {
      setActiveView(viewId);
      if (activeProjectId) navigate(`/${activeProjectId}/view/${viewId}`);
    },
    [setActiveView, activeProjectId, navigate],
  );

  const handleModeToggle = (values: string[]) => {
    if (values.length === 0) return;
    const targetMode = values[0] as "list" | "board" | "graph";
    if (targetMode === viewMode) return;
    // Find an existing view with this mode, or update the current view locally
    const target = views.find((v) => v.mode === targetMode);
    if (target) {
      switchView(target.id);
    } else if (activeView) {
      // Temporarily switch mode on current view (no server persist)
      useViewStore.getState().updateViewLocal(activeView.id, { mode: targetMode });
    }
  };

  const handleSave = useCallback(async () => {
    if (!activeProjectId || !activeView) return;
    const { filters, sortField, sortDir, groupBy } = useFilterStore.getState();
    await saveView(activeProjectId, {
      ...activeView,
      list:
        activeView.mode === "list"
          ? { ...activeView.list!, filters, sortField, sortDir, groupBy: groupBy ?? undefined }
          : activeView.list,
    });
  }, [activeProjectId, activeView, saveView]);

  const handleDelete = useCallback(
    async (viewId: string) => {
      if (!activeProjectId) return;
      await deleteView(activeProjectId, viewId);
    },
    [activeProjectId, deleteView],
  );

  return (
    <header className="relative z-20 border-b border-zinc-800">
      <div className="flex h-11 items-center gap-3 px-4">
        {/* View toggle */}
        <ToggleGroup
          value={[viewMode]}
          onValueChange={handleModeToggle}
          className="flex rounded-lg border border-zinc-800 p-0.5"
        >
          <Toggle
            value="list"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300 data-[pressed]:bg-zinc-800 data-[pressed]:text-zinc-100"
          >
            <List size={14} />
            List
          </Toggle>
          <Toggle
            value="board"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300 data-[pressed]:bg-zinc-800 data-[pressed]:text-zinc-100"
          >
            <Kanban size={14} />
            Board
          </Toggle>
          <Toggle
            value="graph"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300 data-[pressed]:bg-zinc-800 data-[pressed]:text-zinc-100"
          >
            <Graph size={14} />
            Graph
          </Toggle>
        </ToggleGroup>

        {/* View picker */}
        <Popover.Root>
          <Popover.Trigger className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200">
            <span className="max-w-[140px] truncate">{activeView?.name ?? "Default"}</span>
            {dirty && <span className="size-1.5 rounded-full bg-blue-500" />}
            <CaretDown size={10} />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner sideOffset={8} className="z-50">
              <Popover.Popup className="min-w-[220px] rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl shadow-zinc-950/80">
                {views.map((v) => (
                  <div key={v.id} className="group flex items-center">
                    <button
                      onClick={() => switchView(v.id)}
                      className={`flex flex-1 items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-zinc-800 ${
                        v.id === activeViewId ? "text-zinc-100" : "text-zinc-400"
                      }`}
                    >
                      {v.mode === "list" ? (
                        <List size={12} />
                      ) : v.mode === "board" ? (
                        <Kanban size={12} />
                      ) : (
                        <Graph size={12} />
                      )}
                      {v.name}
                      {v.id === activeViewId && (
                        <Check size={12} className="ml-auto text-blue-400" />
                      )}
                    </button>
                    {/* Delete — hidden on default views */}
                    {v.id !== "default" && v.id !== "status-board" && (
                      <button
                        onClick={() => handleDelete(v.id)}
                        className="mr-2 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                      >
                        <Trash size={12} />
                      </button>
                    )}
                  </div>
                ))}

                {/* Divider + save as new */}
                <div className="my-1 border-t border-zinc-800" />
                <button
                  onClick={() => setShowSaveAs(true)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                >
                  <Plus size={12} />
                  Save as new view
                </button>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>

        {/* Save button (shown when dirty) */}
        {dirty && (
          <button
            onClick={handleSave}
            className="flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-1 text-xs text-blue-400 transition-colors hover:bg-blue-500/20"
          >
            <FloppyDisk size={12} />
            Save
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {hasFilters ? `${filtered.length} of ${total}` : `${total} tickets`}
          </span>

          <button
            onClick={() => setShowCommandPalette(true)}
            className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 py-1 text-xs text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
          >
            <kbd className="font-mono text-[10px] text-zinc-600">⌘K</kbd>
          </button>
        </div>
      </div>

      {/* Filter bar (list + graph modes) */}
      {(viewMode === "list" || viewMode === "graph") && <FilterBar />}

      {/* Save-as dialog */}
      <SaveAsDialog open={showSaveAs} onClose={() => setShowSaveAs(false)} onCreated={switchView} />
    </header>
  );
}
