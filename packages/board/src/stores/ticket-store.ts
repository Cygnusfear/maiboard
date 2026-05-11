import { create } from "zustand";
import type { TicketSummary, Ticket } from "@/lib/types";
import { getTickets, getTicket, updateTicket } from "@/lib/api";

interface TicketState {
  tickets: TicketSummary[];
  activeTicket: Ticket | null;
  loading: boolean;

  fetchTickets: (projectId: string) => Promise<void>;
  fetchTicketDetail: (projectId: string, ticketId: string) => Promise<void>;
  clearActiveTicket: () => void;
  updateField: (projectId: string, ticketId: string, update: Partial<Ticket>) => Promise<void>;
}

export const useTicketStore = create<TicketState>((set) => ({
  tickets: [],
  activeTicket: null,
  loading: false,

  fetchTickets: async (projectId) => {
    set({ loading: true });
    try {
      const tickets = await getTickets(projectId);
      set({ tickets, loading: false });
    } catch (e) {
      console.error("Failed to fetch tickets:", e);
      set({ loading: false });
    }
  },

  fetchTicketDetail: async (projectId, ticketId) => {
    set({ loading: true });
    try {
      const ticket = await getTicket(projectId, ticketId);
      set({ activeTicket: ticket, loading: false });
    } catch (e) {
      console.error("Failed to fetch ticket:", e);
      set({ loading: false });
    }
  },

  clearActiveTicket: () => set({ activeTicket: null }),

  updateField: async (projectId, ticketId, update) => {
    await updateTicket(projectId, ticketId, update);
    // body lives only on Ticket (full), not TicketSummary (list row).
    // Strip it out before touching tickets[] so the list stays type-safe.
    const { body: _body, ...summaryFields } = update;
    set((state) => ({
      tickets:
        Object.keys(summaryFields).length > 0
          ? state.tickets.map((t) => (t.id === ticketId ? { ...t, ...summaryFields } : t))
          : state.tickets,
      activeTicket:
        state.activeTicket?.id === ticketId
          ? { ...state.activeTicket, ...update }
          : state.activeTicket,
    }));
  },
}));
