import { useCallback, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { TextB, TextItalic, TextStrikethrough, Code, LinkSimple } from "@phosphor-icons/react";
import { markdownToHtml, htmlToMarkdown } from "@/lib/markdown";
import { SlashCommandExtension } from "./slash-command";
import { ticketLinkPlugin } from "./ticket-link-plugin";
import { useNavigate } from "@/hooks/use-navigate";
import { useProjectStore } from "@/stores/project-store";
import { useKnownTicketIds } from "@/hooks/use-known-ticket-ids";

// ── Styles ────────────────────────────────────────────────────

const toolbarBtnCls =
  "flex size-7 items-center justify-center rounded text-zinc-400 transition-colors " +
  "hover:bg-zinc-700 hover:text-zinc-200 data-[active=true]:bg-zinc-700 data-[active=true]:text-blue-400";

// ── Component ─────────────────────────────────────────────────

export interface TicketBodyEditorHandle {
  /** Get current editor content as markdown */
  getBody: () => string | null;
  /** Set editor content from markdown without triggering onUpdate save */
  setBody: (markdown: string) => void;
}

interface TicketBodyEditorProps {
  /**
   * Identity of the ticket being edited. CONTRACT: the parent MUST also pass
   * `key={ticketId}` so this component is force-remounted on a ticket switch.
   *
   * Why: the Tiptap editor instance returned by `useEditor` is stable across
   * re-renders, and its document content is taken from the `content` option
   * at construction time only. If the parent re-renders with a new ticket but
   * the same component instance, the editor keeps showing the previous
   * ticket's body while metadata above (title, tags) reflects the new ticket.
   * Any save then writes the OLD body to the NEW ticket — silent data loss.
   *
   * Force-remounting via React key scopes the editor's lifecycle to one
   * document, which is the schema-correct shape for a Tiptap instance.
   */
  ticketId: string;
  body: string;
  onSave: (markdown: string) => void;
}

// Re-render scope is already minimised by zustand selectors in the parent
// (TicketDetail). Tiptap's useEditor hook also keeps the editor instance
// stable across re-renders. memo() was attempted here but it loses prop
// inference through forwardRef, so we rely on selectors instead.
export const TicketBodyEditor = forwardRef<TicketBodyEditorHandle, TicketBodyEditorProps>(
  function TicketBodyEditor({ ticketId, body, onSave }, ref) {
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedRef = useRef(body);
    // Latest HTML coming from the editor. Updated on every onUpdate so that the
    // unmount cleanup can flush a pending debounced save WITHOUT calling into
    // an editor that may already be tearing down.
    const latestHtmlRef = useRef<string | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [, navigate] = useNavigate();
    const { activeProjectId } = useProjectStore();
    const knownIds = useKnownTicketIds();

    const save = useCallback(
      (html: string) => {
        const md = htmlToMarkdown(html);
        if (md !== lastSavedRef.current) {
          lastSavedRef.current = md;
          onSave(md);
        }
      },
      [onSave],
    );

    const debouncedSave = useCallback(
      (html: string) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => save(html), 1500);
      },
      [save],
    );

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Table.configure({ resizable: false }),
        TableRow,
        TableCell,
        TableHeader,
        TaskList,
        TaskItem.configure({ nested: true }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: "ticket-editor-link",
            rel: "noopener noreferrer",
          },
        }),
        Placeholder.configure({
          placeholder: "Add a description…",
        }),
        Typography,
        SlashCommandExtension,
      ],
      content: markdownToHtml(body, knownIds),
      editorProps: {
        attributes: {
          class: "ticket-editor-body",
        },
      },
      onUpdate: ({ editor }) => {
        if (suppressNextUpdate.current) {
          suppressNextUpdate.current = false;
          return;
        }
        const html = editor.getHTML();
        latestHtmlRef.current = html;
        debouncedSave(html);
      },
      onBlur: ({ editor }) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        save(editor.getHTML());
      },
    });

    // Expose get/set body for external merge (CRDT watcher)
    const suppressNextUpdate = useRef(false);

    // Defense in depth: if a future caller forgets `key={ticketId}` and reuses
    // this component instance across tickets, detect the ticket switch and
    // self-heal — reset the editor body, drop any pending debounced save, and
    // realign lastSavedRef to the new ticket. Without this, the editor would
    // keep the OLD ticket's content and a subsequent edit would write the OLD
    // body to the NEW ticket. The architecturally correct fix is React's key;
    // this is a safety net.
    const initialTicketIdRef = useRef(ticketId);
    useEffect(() => {
      if (ticketId === initialTicketIdRef.current) return;
      console.error(
        `TicketBodyEditor: ticketId changed from ${initialTicketIdRef.current} ` +
          `to ${ticketId} without remount. Caller MUST pass key={ticketId}.`,
      );
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (editor) {
        suppressNextUpdate.current = true;
        lastSavedRef.current = body;
        latestHtmlRef.current = null;
        editor.commands.setContent(markdownToHtml(body, knownIds));
      }
      initialTicketIdRef.current = ticketId;
    }, [ticketId, body, editor, knownIds]);
    useImperativeHandle(
      ref,
      () => ({
        getBody: () => {
          if (!editor) return null;
          return htmlToMarkdown(editor.getHTML());
        },
        setBody: (markdown: string) => {
          if (!editor) return;
          suppressNextUpdate.current = true;
          lastSavedRef.current = markdown;
          editor.commands.setContent(markdownToHtml(markdown, knownIds));
        },
      }),
      [editor, knownIds],
    );

    // Register ticket ID decoration plugin
    useEffect(() => {
      if (editor && knownIds.size > 0) {
        const plugin = ticketLinkPlugin(knownIds);
        const pluginKey = (plugin.spec as any).key;
        const existing = editor.view.state.plugins.find((p) => (p.spec as any).key === pluginKey);
        if (!existing) {
          editor.registerPlugin(plugin);
        }
      }
    }, [editor, knownIds]);

    // Direct DOM click handler for links and ticket IDs.
    // ProseMirror's event pipeline swallows clicks, so we listen on
    // the wrapper div in the capture phase to get there first.
    useEffect(() => {
      const el = wrapperRef.current;
      if (!el) return;

      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;

        // 1. Ticket ID decoration — always clickable (plain click)
        if (target.classList.contains("ticket-id-link")) {
          const ticketId = target.getAttribute("data-ticket-id");
          if (ticketId && activeProjectId) {
            e.preventDefault();
            e.stopPropagation();
            navigate(`/${activeProjectId}/ticket/${ticketId}`);
            return;
          }
        }

        // 2. Regular <a> links — Cmd+click (or Ctrl+click) to open
        const link = target.closest("a");
        if (link && (e.metaKey || e.ctrlKey)) {
          const href = link.getAttribute("href");
          if (!href) return;

          e.preventDefault();
          e.stopPropagation();

          // Check if it's a ticket ID link
          const ticketMatch = href.match(/\/ticket\/([a-z0-9]+-[a-z0-9]+)$/);
          if (ticketMatch && activeProjectId) {
            navigate(`/${activeProjectId}/ticket/${ticketMatch[1]}`);
          } else {
            window.open(href, "_blank", "noopener");
          }
        }
      };

      // Capture phase so we get the event before ProseMirror
      el.addEventListener("click", handleClick, true);
      return () => el.removeEventListener("click", handleClick, true);
    }, [navigate, activeProjectId]);

    // Cmd+S to force save
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          if (editor) {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            save(editor.getHTML());
          }
        }
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [editor, save]);

    // Flush any pending debounced save when the component unmounts (e.g. the
    // parent force-remounted us for a different ticket, or the user navigated
    // away). Without this, a 1.5s debounce that hadn't fired yet would be
    // silently dropped, losing the user's last edit on the previous ticket.
    // We pull HTML from latestHtmlRef rather than the editor to avoid touching
    // an instance that's about to be torn down.
    useEffect(() => {
      return () => {
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          if (latestHtmlRef.current !== null) save(latestHtmlRef.current);
        }
      };
    }, [save]);

    if (!editor) return null;

    return (
      <div ref={wrapperRef}>
        <BubbleMenu
          editor={editor}
          className="flex items-center gap-0.5 rounded-lg border border-zinc-700 bg-zinc-800 p-1 shadow-xl shadow-zinc-950/80"
        >
          <button
            type="button"
            className={toolbarBtnCls}
            data-active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <TextB size={16} />
          </button>
          <button
            type="button"
            className={toolbarBtnCls}
            data-active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <TextItalic size={16} />
          </button>
          <button
            type="button"
            className={toolbarBtnCls}
            data-active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <TextStrikethrough size={16} />
          </button>
          <button
            type="button"
            className={toolbarBtnCls}
            data-active={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code size={16} />
          </button>
          <div className="mx-1 h-4 w-px bg-zinc-700" />
          <button
            type="button"
            className={toolbarBtnCls}
            data-active={editor.isActive("link")}
            onClick={() => {
              const url = window.prompt("URL:");
              if (url) editor.chain().focus().setLink({ href: url }).run();
            }}
          >
            <LinkSimple size={16} />
          </button>
        </BubbleMenu>

        <EditorContent editor={editor} />
      </div>
    );
  },
);
