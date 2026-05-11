import { useMemo } from "react";
import { useTicketStore } from "@/stores/ticket-store";
import { useFilterStore } from "@/stores/filter-store";
import { applyFiltersAndSort } from "@/lib/filter-engine";
import type { TicketSummary } from "@/lib/types";

/**
 * Derives filtered + sorted tickets from ticket data + filter state.
 * Primitive selectors prevent infinite render loops.
 */
export function useFilteredTickets(): TicketSummary[] {
  const tickets = useTicketStore((s) => s.tickets);
  const filters = useFilterStore((s) => s.filters);
  const search = useFilterStore((s) => s.search);
  const sortField = useFilterStore((s) => s.sortField);
  const sortDir = useFilterStore((s) => s.sortDir);

  return useMemo(
    () => applyFiltersAndSort({ tickets, filters, sortField, sortDir, search }),
    [tickets, filters, search, sortField, sortDir],
  );
}
