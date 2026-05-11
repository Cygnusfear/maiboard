import { create } from "zustand";

interface UIState {
  highlightIndex: number;
  selectedIds: Set<string>;
  selectionAnchor: string | null;
  showCommandPalette: boolean;
  showKeyboardHelp: boolean;

  setHighlightIndex: (index: number) => void;
  moveHighlight: (delta: number, max: number) => void;
  toggleSelection: (id: string) => void;
  rangeSelect: (ids: string[], fromId: string, toId: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  setShowCommandPalette: (show: boolean) => void;
  setShowKeyboardHelp: (show: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  highlightIndex: 0,
  selectedIds: new Set(),
  selectionAnchor: null,
  showCommandPalette: false,
  showKeyboardHelp: false,

  setHighlightIndex: (index) => set({ highlightIndex: index }),
  moveHighlight: (delta, max) =>
    set((s) => ({
      highlightIndex: Math.max(0, Math.min(max - 1, s.highlightIndex + delta)),
    })),

  toggleSelection: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next, selectionAnchor: id };
    }),

  rangeSelect: (ids, fromId, toId) =>
    set((s) => {
      const fromIdx = ids.indexOf(fromId);
      const toIdx = ids.indexOf(toId);
      if (fromIdx === -1 || toIdx === -1) return s;
      const start = Math.min(fromIdx, toIdx);
      const end = Math.max(fromIdx, toIdx);
      const next = new Set(s.selectedIds);
      for (let i = start; i <= end; i++) next.add(ids[i]);
      return { selectedIds: next };
    }),

  selectAll: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set(), selectionAnchor: null }),

  setShowCommandPalette: (show) => set({ showCommandPalette: show }),
  setShowKeyboardHelp: (show) => set({ showKeyboardHelp: show }),
}));
