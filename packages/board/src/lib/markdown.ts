import { marked } from "marked";
import TurndownService from "turndown";

// ── Markdown → HTML (for loading into TipTap) ────────────────

/**
 * Convert markdown to HTML for TipTap consumption.
 * Optionally auto-links known ticket IDs in the output.
 */
export function markdownToHtml(md: string, _knownIds?: Set<string>): string {
  if (!md?.trim()) return "<p></p>";
  return marked.parse(md, { async: false, gfm: true }) as string;
}

// ── HTML → Markdown (for saving from TipTap) ─────────────────

const turndown = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  fence: "```",
  emDelimiter: "_",
  strongDelimiter: "**",
  linkStyle: "inlined",
});

// Task list items
turndown.addRule("taskListItem", {
  filter: (node) => {
    return node.nodeName === "LI" && node.getAttribute("data-type") === "taskItem";
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const checked = el.getAttribute("data-checked") === "true";
    const text = el.textContent?.trim() ?? "";
    return `- [${checked ? "x" : " "}] ${text}\n`;
  },
});

// Table support
turndown.addRule("table", {
  filter: "table",
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const rows = Array.from(el.querySelectorAll("tr"));
    if (rows.length === 0) return "";

    const matrix = rows.map((row) =>
      Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent?.trim() ?? ""),
    );

    if (matrix.length === 0 || !matrix[0].length) return "";

    const colWidths = matrix[0].map((_, ci) =>
      Math.max(3, ...matrix.map((row) => (row[ci] ?? "").length)),
    );

    const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
    const formatRow = (row: string[]) =>
      "| " + row.map((cell, i) => pad(cell, colWidths[i])).join(" | ") + " |";

    const header = formatRow(matrix[0]);
    const separator = "| " + colWidths.map((w) => "-".repeat(w)).join(" | ") + " |";
    const body = matrix.slice(1).map(formatRow).join("\n");

    return `\n${header}\n${separator}\n${body}\n\n`;
  },
});

// Strikethrough
turndown.addRule("strikethrough", {
  filter: ["del", "s"],
  replacement: (content) => `~~${content}~~`,
});

export function htmlToMarkdown(html: string): string {
  if (!html?.trim()) return "";
  return turndown.turndown(html).trim() + "\n";
}
