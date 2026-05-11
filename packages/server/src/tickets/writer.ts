/**
 * Ticket writer — mutates ticket state via `mai` CLI commands.
 *
 * Maitake is event-sourced. All mutations are append-only events.
 * Status, priority, tags, assignee, and body are all mutable via events.
 */
import { mai } from "../mai/cli";

export interface TicketUpdate {
  status?: string;
  priority?: number;
  type?: string;
  tags?: string[];
  assignee?: string;
  title?: string;
  body?: string;
}

/**
 * Apply a partial update to a ticket via mai lifecycle commands.
 * Returns true if all commands succeeded.
 */
export async function updateTicket(
  projectPath: string,
  ticketId: string,
  update: TicketUpdate,
): Promise<boolean> {
  const results: boolean[] = [];

  // Status change → mai start / close / reopen
  if (update.status) {
    let cmd: string[];
    switch (update.status) {
      case "in_progress":
        cmd = ["start", ticketId];
        break;
      case "closed":
        cmd = ["close", ticketId];
        break;
      case "open":
        cmd = ["reopen", ticketId];
        break;
      default:
        console.warn(`[mai-writer] unsupported status: ${update.status}`);
        cmd = [];
    }
    if (cmd.length) {
      const r = await mai(projectPath, cmd);
      results.push(r.exitCode === 0);
      if (r.exitCode !== 0) console.warn(`[mai-writer] ${cmd.join(" ")} failed:`, r.stderr);
    }
  }

  // Priority → mai priority <id> <N>
  if (update.priority !== undefined) {
    const r = await mai(projectPath, ["priority", ticketId, String(update.priority)]);
    results.push(r.exitCode === 0);
    if (r.exitCode !== 0) console.warn(`[mai-writer] priority failed:`, r.stderr);
  }

  // Tags → mai tag <id> +tag / -tag
  if (update.tags) {
    // We need to diff current tags vs new tags. For simplicity,
    // fetch current state, compute diff, apply.
    const { maiJson } = await import("../mai/cli");
    const state = await maiJson<{ tags: string[] | null }>(projectPath, ["show", ticketId]);
    const currentTags = new Set(state?.tags ?? []);
    const newTags = new Set(update.tags);

    // Remove tags not in new set
    for (const tag of currentTags) {
      if (!newTags.has(tag)) {
        const r = await mai(projectPath, ["tag", ticketId, `-${tag}`]);
        results.push(r.exitCode === 0);
      }
    }
    // Add tags not in current set
    for (const tag of newTags) {
      if (!currentTags.has(tag)) {
        const r = await mai(projectPath, ["tag", ticketId, `+${tag}`]);
        results.push(r.exitCode === 0);
      }
    }
  }

  // Assignee → mai assign <id> <name>
  if (update.assignee !== undefined) {
    const r = await mai(projectPath, ["assign", ticketId, update.assignee]);
    results.push(r.exitCode === 0);
  }

  // Title → mai title <id> <new title>
  if (update.title !== undefined) {
    const r = await mai(projectPath, ["title", ticketId, update.title]);
    results.push(r.exitCode === 0);
    if (r.exitCode !== 0) console.warn(`[mai-writer] title failed:`, r.stderr);
  }

  // Type → mai type <id> <new type>
  if (update.type !== undefined) {
    const r = await mai(projectPath, ["type", ticketId, update.type]);
    results.push(r.exitCode === 0);
    if (r.exitCode !== 0) console.warn(`[mai-writer] type failed:`, r.stderr);
  }

  // Body → mai edit <id> -d "..."
  if (update.body !== undefined) {
    const r = await mai(projectPath, ["edit", ticketId, "-d", update.body]);
    results.push(r.exitCode === 0);
    if (r.exitCode !== 0) console.warn(`[mai-writer] body edit failed:`, r.stderr);
  }

  // If no commands were run, that's fine (empty update)
  if (results.length === 0) return true;

  return results.every(Boolean);
}
