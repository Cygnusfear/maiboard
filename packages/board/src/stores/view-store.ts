import { create } from "zustand";
import type { SavedView } from "@/lib/types";
import { getViews, saveViewApi, deleteViewApi } from "@/lib/api";

interface ViewState {
  views: SavedView[];
  activeViewId: string | null;
  dirty: boolean;
  loading: boolean;

  fetchViews: (projectId: string) => Promise<void>;
  saveView: (
    projectId: string,
    view: Omit<SavedView, "id"> & { id?: string },
  ) => Promise<SavedView>;
  deleteView: (projectId: string, viewId: string) => Promise<void>;
  updateViewLocal: (viewId: string, patch: Partial<SavedView>) => void;
  setActiveView: (viewId: string) => void;
  markDirty: () => void;
  markClean: () => void;
  toggleGroupCollapse: (groupKey: string) => void;
}

export const useViewStore = create<ViewState>((set, get) => ({
  views: [],
  activeViewId: null,
  dirty: false,
  loading: false,

  fetchViews: async (projectId) => {
    set({ loading: true });
    try {
      const views = await getViews(projectId);
      const current = get().activeViewId;
      set({
        views,
        loading: false,
        // Keep active if still exists, else default to first
        activeViewId: views.find((v) => v.id === current) ? current : (views[0]?.id ?? null),
        dirty: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  saveView: async (projectId, view) => {
    const isUpdate = view.id && get().views.some((v) => v.id === view.id);
    const saved = await saveViewApi(projectId, view);

    set((s) => ({
      views: isUpdate ? s.views.map((v) => (v.id === saved.id ? saved : v)) : [...s.views, saved],
      activeViewId: saved.id,
      dirty: false,
    }));
    return saved;
  },

  deleteView: async (projectId, viewId) => {
    await deleteViewApi(projectId, viewId);
    set((s) => {
      const views = s.views.filter((v) => v.id !== viewId);
      return {
        views,
        activeViewId: s.activeViewId === viewId ? (views[0]?.id ?? null) : s.activeViewId,
      };
    });
  },

  /** Optimistic local update — applies immediately without server round-trip */
  updateViewLocal: (viewId, patch) =>
    set((s) => ({
      views: s.views.map((v) => (v.id === viewId ? { ...v, ...patch } : v)),
    })),

  setActiveView: (viewId) => set({ activeViewId: viewId, dirty: false }),
  markDirty: () => set({ dirty: true }),
  markClean: () => set({ dirty: false }),

  toggleGroupCollapse: (groupKey) => {
    const { activeViewId, views } = get();
    if (!activeViewId) return;
    const view = views.find((v) => v.id === activeViewId);
    if (!view) return;
    const current = new Set(view.collapsedGroups ?? []);
    if (current.has(groupKey)) current.delete(groupKey);
    else current.add(groupKey);
    set((s) => ({
      views: s.views.map((v) =>
        v.id === activeViewId ? { ...v, collapsedGroups: [...current] } : v,
      ),
      dirty: true,
    }));
  },
}));
