import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import { PluginKey, Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/core";
import {
  TextH,
  TextHOne,
  TextHTwo,
  TextHThree,
  ListBullets,
  ListNumbers,
  ListChecks,
  Quotes,
  CodeBlock,
  Table,
  LineSegment,
} from "@phosphor-icons/react";

// ── Command definitions ───────────────────────────────────────

interface SlashItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (editor: Editor) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  {
    title: "Heading 1",
    description: "Large section heading",
    icon: <TextHOne size={18} />,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: <TextHTwo size={18} />,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: <TextHThree size={18} />,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: "Bullet List",
    description: "Unordered list",
    icon: <ListBullets size={18} />,
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    title: "Numbered List",
    description: "Ordered list",
    icon: <ListNumbers size={18} />,
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    title: "Task List",
    description: "Checklist with checkboxes",
    icon: <ListChecks size={18} />,
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    title: "Blockquote",
    description: "Quote block",
    icon: <Quotes size={18} />,
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    title: "Code Block",
    description: "Fenced code block",
    icon: <CodeBlock size={18} />,
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: "Table",
    description: "Insert a table",
    icon: <Table size={18} />,
    command: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: "Divider",
    description: "Horizontal rule",
    icon: <LineSegment size={18} />,
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
];

// ── Slash command menu component ──────────────────────────────

interface CommandListProps {
  items: SlashItem[];
  editor: Editor;
  range: { from: number; to: number };
  query: string;
}

function CommandList({ items, editor, range, query }: CommandListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = items.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));

  const selectItem = useCallback(
    (index: number) => {
      const item = filtered[index];
      if (item) {
        editor.chain().focus().deleteRange(range).run();
        item.command(editor);
      }
    },
    [filtered, editor, range],
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        selectItem(selectedIndex);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        editor.chain().focus().deleteRange(range).run();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [filtered, selectedIndex, selectItem, editor, range]);

  // Scroll selected into view
  useLayoutEffect(() => {
    const el = containerRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (filtered.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 shadow-xl shadow-zinc-950/80">
        <span className="text-xs text-zinc-500">No commands found</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="max-h-[280px] min-w-[240px] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl shadow-zinc-950/80"
    >
      {filtered.map((item, index) => (
        <button
          key={item.title}
          type="button"
          className={`flex w-full items-center gap-3 px-3 py-2 text-left outline-none ${
            index === selectedIndex
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-300 hover:bg-zinc-800/50"
          }`}
          onClick={() => selectItem(index)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 text-zinc-400">
            {item.icon}
          </span>
          <div>
            <div className="text-[13px] font-medium">{item.title}</div>
            <div className="text-[11px] text-zinc-500">{item.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── TipTap Extension ──────────────────────────────────────────

const slashPluginKey = new PluginKey("slashCommand");

export const SlashCommandExtension = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    const editor = this.editor;
    let popup: HTMLDivElement | null = null;
    let renderer: ReactRenderer | null = null;
    let active = false;
    let slashPos = -1;

    const destroy = () => {
      if (renderer) {
        renderer.destroy();
        renderer = null;
      }
      if (popup) {
        popup.remove();
        popup = null;
      }
      active = false;
      slashPos = -1;
    };

    return [
      new Plugin({
        key: slashPluginKey,

        props: {
          handleKeyDown(view, event) {
            if (event.key === "/" && !active) {
              const { from } = view.state.selection;
              // Only trigger at start of empty line or after space
              const textBefore = view.state.doc.textBetween(Math.max(0, from - 1), from, "\n");
              if (from === 1 || textBefore === "" || textBefore === "\n" || textBefore === " ") {
                // Will be handled in appendTransaction
              }
            }
            return false;
          },
        },

        view() {
          return {
            update(view) {
              const { state } = view;
              const { from } = state.selection;

              // Find if there's a slash command being typed
              const textBefore = state.doc.textBetween(Math.max(0, from - 50), from, "\n", "\0");
              const match = textBefore.match(/\/([a-zA-Z0-9 ]*)$/);

              if (!match) {
                if (active) destroy();
                return;
              }

              const query = match[1];
              const matchStart = from - match[0].length;
              const range = { from: matchStart, to: from };

              if (!active) {
                active = true;
                slashPos = matchStart;
                popup = document.createElement("div");
                popup.style.position = "absolute";
                popup.style.zIndex = "100";
                document.body.appendChild(popup);
              }

              // Position popup near cursor
              const coords = view.coordsAtPos(from);
              if (popup) {
                popup.style.left = `${coords.left}px`;
                popup.style.top = `${coords.bottom + 4}px`;
              }

              // Render or update the React component
              if (renderer) {
                renderer.updateProps({ query, range });
              } else if (popup) {
                renderer = new ReactRenderer(CommandList, {
                  props: {
                    items: SLASH_ITEMS,
                    editor,
                    range,
                    query,
                  },
                  editor,
                });
                popup.appendChild(renderer.element);
              }
            },
            destroy() {
              destroy();
            },
          };
        },
      }),
    ];
  },
});
