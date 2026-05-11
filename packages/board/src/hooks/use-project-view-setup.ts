import { useEffect, useRef } from "react";
import { useTicketStore } from "@/stores/ticket-store";
import { useProjectStore } from "@/stores/project-store";
import { useViewStore } from "@/stores/view-store";
import { useFilterStore } from "@/stores/filter-store";
import { hasUrlFilterParams } from "@/hooks/use-filter-url-sync";

/** Core project view — handles data loading + view resolution */
export function useProjectViewSetup(projectId: string | null, viewId: string | null) {
  const { fetchTickets, clearActiveTicket, loading } = useTicketStore();
  const { setActiveProject, activeProjectId } = useProjectStore();
  const { fetchViews, views, activeViewId, setActiveView } = useViewStore();

  const activeView = views.find((v) => v.id === activeViewId);
  const viewMode = activeView?.mode ?? "list";

  // Track which viewId we last loaded filters for — prevents resetting
  // filter state when remounting with the same view (e.g. back from ticket detail)
  const lastLoadedViewId = useRef<string | null>(null);

  // Subscribe to filter changes → mark active view dirty so it can be saved
  useEffect(() => {
    const unsub = useFilterStore.subscribe(() => {
      useViewStore.getState().markDirty();
    });
    return unsub;
  }, []);

  useEffect(() => {
    clearActiveTicket();
    if (projectId && projectId !== activeProjectId) {
      setActiveProject(projectId);
    }
  }, [projectId, activeProjectId, setActiveProject, clearActiveTicket]);

  useEffect(() => {
    if (projectId) {
      fetchTickets(projectId);
      fetchViews(projectId);
    }
  }, [projectId, fetchTickets, fetchViews]);

  // Sync URL viewId → store (only after views are loaded)
  useEffect(() => {
    if (viewId && views.length > 0 && activeViewId !== viewId) {
      const exists = views.find((v) => v.id === viewId);
      if (exists) setActiveView(viewId);
    }
  }, [viewId, views, activeViewId, setActiveView]);

  // When active view CHANGES, load its saved filters + groupBy into filter store.
  // Skip if we already loaded this view (e.g. remount after back-navigation).
  // Skip if URL has filter params (URL takes priority — shareable links).
  useEffect(() => {
    if (!activeViewId || activeViewId === lastLoadedViewId.current) return;
    if (hasUrlFilterParams()) {
      // URL params are authoritative — useFilterUrlSync will handle them
      useViewStore.getState().markClean();
      lastLoadedViewId.current = activeViewId;
      return;
    }
    if (activeView?.mode === "list" && activeView.list) {
      const { filters, sortField, sortDir, groupBy } = activeView.list;
      useFilterStore.setState({ filters, sortField, sortDir, groupBy: groupBy ?? null });
      useViewStore.getState().markClean();
    }
    lastLoadedViewId.current = activeViewId;
  }, [activeViewId, activeView]);

  return { loading, viewMode };
}
