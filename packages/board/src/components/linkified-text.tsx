import { tokenizeTicketIds } from "@/lib/linkify-ticket-ids";
import { TicketLink } from "@/components/ticket-link";
import { useKnownTicketIds } from "@/hooks/use-known-ticket-ids";

interface LinkifiedTextProps {
  children: string;
  className?: string;
}

/**
 * Renders plain text with ticket IDs auto-linked to their detail views.
 * Only links IDs that actually exist in the current project's ticket store.
 *
 * Use for titles, descriptions, and any non-markdown text that may
 * reference ticket IDs inline.
 */
export function LinkifiedText({ children, className }: LinkifiedTextProps) {
  const knownIds = useKnownTicketIds();
  const tokens = tokenizeTicketIds(children, knownIds);

  const hasLinks = tokens.some((t) => t.isTicketId);

  const content = hasLinks
    ? tokens.map((token, i) =>
        token.isTicketId ? (
          <TicketLink key={`${token.text}-${i}`} id={token.text} className="text-[inherit]" />
        ) : (
          token.text
        ),
      )
    : children;

  if (className) {
    return <span className={className}>{content}</span>;
  }

  if (!hasLinks) return <>{children}</>;

  return <>{content}</>;
}
