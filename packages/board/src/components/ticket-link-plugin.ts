import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { TICKET_ID_RE } from "@/lib/linkify-ticket-ids";

/**
 * ProseMirror plugin that finds plain-text ticket IDs (e.g. t-8f99)
 * and renders them as styled, clickable inline decorations.
 *
 * These are read-only visual overlays — they don't modify the document.
 * Click handling is done in the editor's handleDOMEvents.
 */

const pluginKey = new PluginKey("ticketIdLinks");

export function ticketLinkPlugin(knownIds: Set<string>) {
  return new Plugin({
    key: pluginKey,

    state: {
      init(_, state) {
        return buildDecorations(state.doc, knownIds);
      },
      apply(tr, decorations) {
        if (tr.docChanged) {
          return buildDecorations(tr.doc, knownIds);
        }
        return decorations.map(tr.mapping, tr.doc);
      },
    },

    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}

function buildDecorations(doc: any, knownIds: Set<string>): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;

    const text = node.text ?? "";
    TICKET_ID_RE.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = TICKET_ID_RE.exec(text)) !== null) {
      const id = match[1];
      if (!knownIds.has(id)) continue;

      // Don't decorate if this text is already inside a link mark
      const resolvedPos = doc.resolve(pos + match.index);
      const marks = resolvedPos.marks();
      if (marks.some((m: any) => m.type.name === "link")) continue;

      const from = pos + match.index;
      const to = from + id.length;

      decorations.push(
        Decoration.inline(from, to, {
          class: "ticket-id-link",
          "data-ticket-id": id,
          nodeName: "span",
        }),
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}
