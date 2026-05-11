/**
 * Broad regex for anything that looks like a ticket ID:
 * alphanumeric prefix (1-5 chars), dash, alphanumeric suffix (3-5 chars).
 * We cast a wide net, then verify against known IDs.
 */
export const TICKET_ID_RE = /\b([a-z0-9]{1,5}-[a-z0-9]{3,5})\b/gi;

export interface TicketIdToken {
  text: string;
  isTicketId: boolean;
}

/**
 * Splits text into tokens — plain strings and verified ticket ID strings.
 * Pure function: no React, no imports from presentation layer.
 * Consumers render tokens however they like (e.g. <TicketLink> for IDs).
 */
export function tokenizeTicketIds(text: string, knownIds: Set<string>): TicketIdToken[] {
  if (knownIds.size === 0) return [{ text, isTicketId: false }];
  const tokens: TicketIdToken[] = [];
  let lastIndex = 0;
  TICKET_ID_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TICKET_ID_RE.exec(text)) !== null) {
    const candidate = match[1];
    if (!knownIds.has(candidate)) continue;
    if (match.index > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, match.index), isTicketId: false });
    }
    tokens.push({ text: candidate, isTicketId: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), isTicketId: false });
  }
  return tokens.length === 0 ? [{ text, isTicketId: false }] : tokens;
}
