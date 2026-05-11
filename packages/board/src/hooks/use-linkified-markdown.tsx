import { useMemo } from "react";
import { tokenizeTicketIds } from "@/lib/linkify-ticket-ids";
import { TicketLink } from "@/components/ticket-link";
import { useKnownTicketIds } from "./use-known-ticket-ids";
import type { Components } from "react-markdown";
import type { ReactNode } from "react";

/**
 * Returns ReactMarkdown `components` that auto-link ticket IDs in text content.
 * Validates candidate IDs against the ticket store — only real tickets get linked.
 *
 * Usage:
 *   const components = useLinkifiedMarkdown()
 *   <ReactMarkdown components={components}>{body}</ReactMarkdown>
 */
export function useLinkifiedMarkdown(): Components {
  const knownIds = useKnownTicketIds();

  return useMemo(() => {
    function linkifyChildren(children: ReactNode): ReactNode {
      if (typeof children === "string") {
        const tokens = tokenizeTicketIds(children, knownIds);
        const hasLinks = tokens.some((t) => t.isTicketId);
        if (!hasLinks) return children;
        return tokens.map((token, i) =>
          token.isTicketId ? (
            <TicketLink key={`${token.text}-${i}`} id={token.text} className="text-[inherit]" />
          ) : (
            token.text
          ),
        );
      }
      if (Array.isArray(children))
        return children.map((c, i) =>
          typeof c === "string" ? <span key={i}>{linkifyChildren(c)}</span> : c,
        );
      return children;
    }

    const wrap =
      (Tag: string) =>
      ({ children, ...props }: any) => {
        const El = Tag as any;
        return <El {...props}>{linkifyChildren(children)}</El>;
      };

    return {
      p: wrap("p"),
      li: wrap("li"),
      td: wrap("td"),
      th: wrap("th"),
      strong: wrap("strong"),
      em: wrap("em"),
      h1: wrap("h1"),
      h2: wrap("h2"),
      h3: wrap("h3"),
      h4: wrap("h4"),
      h5: wrap("h5"),
      h6: wrap("h6"),
    };
  }, [knownIds]);
}
