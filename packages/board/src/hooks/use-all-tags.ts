import { useMemo } from "react";
import { useTicketStore } from "@/stores/ticket-store";

/** All unique tags across all tickets in the current project, sorted. */
export function useAllTags(): string[] {
  const tickets = useTicketStore((s) => s.tickets);
  return useMemo(() => {
    const set = new Set<string>();
    tickets.forEach((t) => t.tags?.forEach((tag) => set.add(tag)));
    return [...set].sort();
  }, [tickets]);
}
