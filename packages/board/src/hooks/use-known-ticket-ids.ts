import { useMemo } from "react";
import { useTicketStore } from "@/stores/ticket-store";

/**
 * Returns a stable Set of all known ticket IDs from the store.
 * Used by linkifiers to verify candidates against real tickets.
 */
export function useKnownTicketIds(): Set<string> {
  const { tickets } = useTicketStore();
  return useMemo(() => new Set(tickets.map((t) => t.id)), [tickets]);
}
