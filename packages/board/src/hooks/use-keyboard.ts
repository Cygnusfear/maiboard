import { useEffect, useRef } from "react";
import { useNavigate } from "@/hooks/use-navigate";
import { useUIStore } from "@/stores/ui-store";
import { useTicketStore } from "@/stores/ticket-store";
import { useProjectStore } from "@/stores/project-store";
import { useFilterStore } from "@/stores/filter-store";
import { useViewStore } from "@/stores/view-store";
import { applyFiltersAndSort } from "@/lib/filter-engine";

/** Get current filtered tickets imperatively (outside React render) */
function getVisibleTickets() {
  const { filters, search, sortField, sortDir } = useFilterStore.getState();
  return applyFiltersAndSort({
    tickets: useTicketStore.getState().tickets,
    filters,
    search,
    sortField,
    sortDir,
  });
}

export function useKeyboard() {
  const gPending = useRef(false);
  const gTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [, navigate] = useNavigate();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      // Command palette always works
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        useUIStore.getState().setShowCommandPalette(true);
        return;
      }

      if (isInput) return;

      const ui = useUIStore.getState();
      const tickets = getVisibleTickets();
      const projects = useProjectStore.getState();
      const ticketStore = useTicketStore.getState();

      // Number keys — switch project
      if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        if (idx < projects.projects.length) {
          navigate(`/${projects.projects[idx].id}`);
        }
        return;
      }

      switch (e.key) {
        case "j":
          e.preventDefault();
          ui.moveHighlight(1, tickets.length);
          break;
        case "k":
          e.preventDefault();
          ui.moveHighlight(-1, tickets.length);
          break;
        case "g":
          if (gPending.current) {
            // gg — go to first
            e.preventDefault();
            ui.setHighlightIndex(0);
            gPending.current = false;
            clearTimeout(gTimeout.current);
          } else {
            gPending.current = true;
            gTimeout.current = setTimeout(() => {
              gPending.current = false;
            }, 300);
          }
          break;
        case "G":
          e.preventDefault();
          ui.setHighlightIndex(tickets.length - 1);
          break;
        case "d":
          if (e.ctrlKey) {
            e.preventDefault();
            ui.moveHighlight(Math.floor(tickets.length / 2), tickets.length);
          }
          break;
        case "u":
          if (e.ctrlKey) {
            e.preventDefault();
            ui.moveHighlight(-Math.floor(tickets.length / 2), tickets.length);
          }
          break;
        case "H":
          e.preventDefault();
          const pIdx = projects.projects.findIndex((p) => p.id === projects.activeProjectId);
          if (pIdx > 0) navigate(`/${projects.projects[pIdx - 1].id}`);
          break;
        case "L":
          e.preventDefault();
          const nIdx = projects.projects.findIndex((p) => p.id === projects.activeProjectId);
          if (nIdx < projects.projects.length - 1) navigate(`/${projects.projects[nIdx + 1].id}`);
          break;
        case "Enter":
          e.preventDefault();
          if (tickets[ui.highlightIndex] && projects.activeProjectId) {
            navigate(`/${projects.activeProjectId}/ticket/${tickets[ui.highlightIndex].id}`);
          }
          break;
        case "Escape":
          e.preventDefault();
          if (ticketStore.activeTicket && projects.activeProjectId) {
            navigate(`/${projects.activeProjectId}`);
          } else if (ui.selectedIds.size > 0) {
            ui.clearSelection();
          } else if (ui.showCommandPalette) {
            ui.setShowCommandPalette(false);
          } else if (ui.showKeyboardHelp) {
            ui.setShowKeyboardHelp(false);
          }
          break;
        case "x":
          e.preventDefault();
          if (tickets[ui.highlightIndex]) {
            ui.toggleSelection(tickets[ui.highlightIndex].id);
          }
          break;
        case "o":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            if (tickets[ui.highlightIndex] && projects.activeProjectId) {
              ticketStore.updateField(projects.activeProjectId, tickets[ui.highlightIndex].id, {
                status: "open",
              });
            }
          }
          break;
        case "i":
          e.preventDefault();
          if (tickets[ui.highlightIndex] && projects.activeProjectId) {
            ticketStore.updateField(projects.activeProjectId, tickets[ui.highlightIndex].id, {
              status: "in_progress",
            });
          }
          break;
        case "c":
          e.preventDefault();
          if (tickets[ui.highlightIndex] && projects.activeProjectId) {
            ticketStore.updateField(projects.activeProjectId, tickets[ui.highlightIndex].id, {
              status: "closed",
            });
          }
          break;
        case "v": {
          e.preventDefault();
          const viewStore = useViewStore.getState();
          const activeView = viewStore.views.find((v) => v.id === viewStore.activeViewId);
          const currentMode = activeView?.mode ?? "list";
          const targetMode = currentMode === "list" ? "board" : "list";
          const target = viewStore.views.find((v) => v.mode === targetMode);
          if (target && projects.activeProjectId) {
            navigate(`/${projects.activeProjectId}/view/${target.id}`);
          } else if (activeView) {
            viewStore.updateViewLocal(activeView.id, { mode: targetMode });
          }
          break;
        }
        case "p": {
          e.preventDefault();
          const ticket = tickets[ui.highlightIndex];
          if (ticket && projects.activeProjectId) {
            const next = (ticket.priority + 1) % 4;
            ticketStore.updateField(projects.activeProjectId, ticket.id, { priority: next });
          }
          break;
        }
        case "X": {
          e.preventDefault();
          const highlighted = tickets[ui.highlightIndex];
          if (!highlighted) break;
          const anchor = ui.selectionAnchor;
          if (!anchor) {
            ui.toggleSelection(highlighted.id);
          } else {
            const visibleIds = tickets.map((t) => t.id);
            ui.rangeSelect(visibleIds, anchor, highlighted.id);
          }
          break;
        }
        case "?":
          e.preventDefault();
          ui.setShowKeyboardHelp(!ui.showKeyboardHelp);
          break;
        case "/":
          e.preventDefault();
          ui.setShowCommandPalette(true);
          break;
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);
}
