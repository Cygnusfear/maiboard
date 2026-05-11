/**
 * Parse timestamped notes from ticket body's ## Notes section.
 * Read-only — body stays as single source of truth.
 *
 * Format (from `tk add-note`):
 *   ## Notes
 *
 *   **2026-02-27T12:53:43Z**
 *
 *   Content here (can be multi-line markdown)
 *
 *   **2026-02-27T14:00:00Z**
 *
 *   Another note...
 */

export interface TicketNote {
  timestamp: string;
  content: string;
}

const TIMESTAMP_RE = /^\*\*(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\*\*$/;

export function parseNotes(body: string): TicketNote[] {
  // Find ## Notes section
  const notesIdx = body.indexOf("## Notes");
  if (notesIdx === -1) return [];

  // Get everything after ## Notes, but stop at the next ## section (if any)
  const afterNotes = body.slice(notesIdx + "## Notes".length);
  const nextSectionMatch = afterNotes.match(/\n## [^#]/);
  const notesBlock = nextSectionMatch ? afterNotes.slice(0, nextSectionMatch.index!) : afterNotes;

  const lines = notesBlock.split("\n");
  const notes: TicketNote[] = [];
  let currentTimestamp: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(TIMESTAMP_RE);
    if (match) {
      // Flush previous note
      if (currentTimestamp) {
        notes.push({
          timestamp: currentTimestamp,
          content: currentLines.join("\n").trim(),
        });
      }
      currentTimestamp = match[1];
      currentLines = [];
    } else if (currentTimestamp !== null) {
      currentLines.push(line);
    }
  }

  // Flush last note
  if (currentTimestamp) {
    notes.push({
      timestamp: currentTimestamp,
      content: currentLines.join("\n").trim(),
    });
  }

  return notes;
}
