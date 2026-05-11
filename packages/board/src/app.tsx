import { useEffect } from "react";
import { Route, Switch, Redirect, useRoute } from "wouter";
import { useProjectStore } from "@/stores/project-store";
import { useTicketStore } from "@/stores/ticket-store";
import { useKeyboard } from "@/hooks/use-keyboard";
import { useFilterUrlSync } from "@/hooks/use-filter-url-sync";
import { useProjectViewSetup } from "@/hooks/use-project-view-setup";
import { ProjectRail } from "@/components/project-rail";
import { HeaderBar } from "@/components/header-bar";
import { ListView } from "@/components/list-view";
import { BoardView } from "@/components/board-view";
import { GraphView } from "@/components/graph-view";
import { TicketDetail } from "@/components/ticket-detail";
import { ReviewView } from "@/components/review-view";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { CommandPalette } from "@/components/command-palette";
import { KeyboardHelp } from "@/components/keyboard-help";

/** Redirect `/` to the first project once loaded */
function RootRedirect() {
  const { projects, loading } = useProjectStore();
  if (loading || projects.length === 0) return null;
  const target = projects.find((project) => project.current) ?? projects[0];
  return <Redirect to={`/${target.id}`} />;
}

/** Syncs route params → stores */
function ViewContent({ viewMode, loading }: { viewMode: string; loading: boolean }) {
  // Only show the full-page spinner on the INITIAL load (no tickets yet).
  // Once we have data, every subsequent refresh — whether triggered by a
  // `maiboard:changed` file-watcher event or by a user-driven mutation —
  // must keep the active view mounted. Otherwise the entire view unmounts
  // for the ~hundred milliseconds of the API roundtrip, scroll position
  // resets, expanded groups collapse, selection clears, and the user
  // experiences a "full page refresh" on every mai write.
  const hasTickets = useTicketStore((s) => s.tickets.length > 0);
  if (loading && !hasTickets) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-sm text-zinc-500">Loading tickets...</div>
      </div>
    );
  }
  if (viewMode === "graph") return <GraphView />;
  if (viewMode === "board") return <BoardView />;
  return <ListView />;
}

/** Subtle "refreshing in the background" pulse for the header so the user
 *  has feedback that data is in flight without losing their view. */
function RefreshIndicator() {
  const loading = useTicketStore((s) => s.loading);
  const hasTickets = useTicketStore((s) => s.tickets.length > 0);
  if (!loading || !hasTickets) return null;
  return (
    <div
      aria-label="Refreshing"
      title="Refreshing tickets from mai"
      className="pointer-events-none absolute top-2 right-3 z-50 size-2 animate-pulse rounded-full bg-blue-400/80"
    />
  );
}

/** Single project view component — handles both /:projectId and /:projectId/view/:viewId */
function ProjectView() {
  const [, projectParams] = useRoute("/:projectId/view/:viewId");
  const [, bareParams] = useRoute("/:projectId");

  const projectId = projectParams?.projectId ?? bareParams?.projectId ?? null;
  const viewId = projectParams?.viewId ?? null;
  const { loading, viewMode } = useProjectViewSetup(projectId, viewId);

  return (
    <>
      <HeaderBar />
      <ViewContent viewMode={viewMode} loading={loading} />
    </>
  );
}

function ReviewRoute() {
  const [, params] = useRoute("/:projectId/review/:ticketId");
  const projectId = params?.projectId ?? null;
  const ticketId = params?.ticketId ?? null;
  if (!projectId || !ticketId) return null;
  return <ReviewView projectId={projectId} ticketId={ticketId} />;
}

function TicketDetailView() {
  const [, params] = useRoute("/:projectId/ticket/:ticketId");
  const projectId = params?.projectId ?? null;
  const ticketId = params?.ticketId ?? null;
  const { fetchTickets, fetchTicketDetail, activeTicket } = useTicketStore();
  const { setActiveProject } = useProjectStore();

  useEffect(() => {
    if (projectId) setActiveProject(projectId);
  }, [projectId, setActiveProject]);

  // Load the project's ticket summary list. TicketDetail derives reverse
  // relationships ("Depended on by", "Referenced by") and the parent/child
  // epic graph FROM this list. Without this fetch, deep-linking into a
  // ticket (Cmd+Shift+T, mai://ticket/..., command palette) shows an empty
  // tickets[] in the store and silently hides every reverse relationship.
  useEffect(() => {
    if (projectId) void fetchTickets(projectId);
  }, [projectId, fetchTickets]);

  useEffect(() => {
    if (projectId && ticketId) {
      if (!activeTicket || activeTicket.id !== ticketId) {
        fetchTicketDetail(projectId, ticketId);
      }
    }
  }, [projectId, ticketId, activeTicket, fetchTicketDetail]);

  return <TicketDetail />;
}

export function App() {
  // Selectors — App() should only re-render when activeProjectId or
  // activeTicket?.id change, not on every store mutation (e.g. on every
  // tickets-array refresh).
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const fetchTickets = useTicketStore((s) => s.fetchTickets);
  const fetchTicketDetail = useTicketStore((s) => s.fetchTicketDetail);
  const activeTicketId = useTicketStore((s) => s.activeTicket?.id ?? null);

  useKeyboard();
  useFilterUrlSync();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Refetch on host bridge change events. The bridge already debounces 250 ms
  // on the host side; we add another 300 ms here so that bursts of file events
  // collapse into a single round of refetches. Without this debounce, a noisy
  // .maitake/ daemon can trigger fetchProjects + fetchTickets + fetchTicketDetail
  // on every keystroke-adjacent file event, re-rendering the whole app and
  // making in-webview typing feel laggy.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (activeProjectId) {
          void fetchProjects();
          void fetchTickets(activeProjectId);
          if (activeTicketId) void fetchTicketDetail(activeProjectId, activeTicketId);
        }
      }, 300);
    };
    window.addEventListener("maiboard:changed", handler);
    return () => {
      window.removeEventListener("maiboard:changed", handler);
      if (timer) clearTimeout(timer);
    };
  }, [activeProjectId, activeTicketId, fetchProjects, fetchTickets, fetchTicketDetail]);

  return (
    <div className="flex h-screen min-h-0 overflow-hidden">
      <ProjectRail />

      <div
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        style={{ viewTransitionName: "content" }}
      >
        <RefreshIndicator />
        <Switch>
          <Route path="/:projectId/review/:ticketId" component={ReviewRoute} />
          <Route path="/:projectId/ticket/:ticketId" component={TicketDetailView} />
          <Route path="/:projectId/view/:viewId" component={ProjectView} />
          <Route path="/:projectId" component={ProjectView} />
          <Route path="/" component={RootRedirect} />
        </Switch>
      </div>

      <BulkActionBar />
      <CommandPalette />
      <KeyboardHelp />
    </div>
  );
}
