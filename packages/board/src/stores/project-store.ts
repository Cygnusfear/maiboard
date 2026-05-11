import { create } from "zustand";
import type { ProjectSummary } from "@/lib/types";
import {
  getProjects,
  deleteProject as apiDeleteProject,
  reorderProjects as apiReorderProjects,
} from "@/lib/api";

interface ProjectState {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  loading: boolean;
  fetchProjects: () => Promise<void>;
  setActiveProject: (id: string) => void;
  deleteProject: (id: string) => Promise<void>;
  reorderProjects: (ids: string[]) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  loading: false,

  fetchProjects: async () => {
    set({ loading: true });
    try {
      const projects = await getProjects();
      const current = get().activeProjectId;
      const nextActive =
        current && projects.some((p) => p.id === current)
          ? current
          : (projects.find((p) => p.current)?.id ?? projects[0]?.id ?? null);
      set({
        projects,
        loading: false,
        activeProjectId: nextActive,
      });
    } catch (e) {
      console.error("Failed to fetch projects:", e);
      set({ loading: false });
    }
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  deleteProject: async (id) => {
    await apiDeleteProject(id);
    set((s) => {
      const projects = s.projects.filter((p) => p.id !== id);
      const activeProjectId =
        s.activeProjectId === id ? (projects[0]?.id ?? null) : s.activeProjectId;
      return { projects, activeProjectId };
    });
  },

  reorderProjects: async (ids) => {
    // Optimistic reorder
    set((s) => {
      const byId = new Map(s.projects.map((p) => [p.id, p]));
      const reordered = ids.map((id) => byId.get(id)!).filter(Boolean);
      return { projects: reordered };
    });
    await apiReorderProjects(ids);
  },
}));
