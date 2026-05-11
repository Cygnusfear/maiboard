/**
 * Normalize a raw tag string: trim whitespace, lowercase, replace spaces with hyphens.
 */
export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Pure business rule for tag toggling across one or more tickets.
 *
 * If ALL given tickets already have the tag → remove it from all.
 * Otherwise → add it to any ticket that doesn't have it yet.
 *
 * Returns a map of ticketId → new tags array.
 */
export function toggleTagForTickets(
  tickets: Array<{ id: string; tags?: string[] }>,
  ids: string[],
  tag: string,
): Map<string, string[]> {
  const allHave = ids.every((id) => (tickets.find((t) => t.id === id)?.tags ?? []).includes(tag));
  const result = new Map<string, string[]>();
  for (const id of ids) {
    const ticket = tickets.find((t) => t.id === id);
    if (!ticket) continue;
    const current = ticket.tags ?? [];
    result.set(
      id,
      allHave
        ? current.filter((t) => t !== tag)
        : current.includes(tag)
          ? current
          : [...current, tag],
    );
  }
  return result;
}
