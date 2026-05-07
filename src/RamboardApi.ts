import * as vscode from "vscode";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { mai, maiJson } from "./mai.ts";
import { getDiff, getLog, getRefs, type DiffFile, type GitCommit, type GitRefs } from "./git.ts";
import { ViewStore } from "./views.ts";
import type { ProjectSummary, SavedView, Ticket, TicketSummary } from "./types.ts";

interface MaiStateSummary {
  id: string;
  kind: string;
  status: string;
  type: string;
  priority: number;
  title: string;
  tags: string[] | null;
  deps: string[] | null;
  links: string[] | null;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
}
interface MaiState extends MaiStateSummary {
  body?: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

function hashPath(path: string): string {
  return createHash("sha1").update(path).digest("hex").slice(0, 8);
}

function parseTicketId(output: string): string | null {
  const text = output.trim();
  if (!text) return null;
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as { id?: unknown };
      if (typeof parsed.id === "string" && parsed.id.length > 0) return parsed.id;
    } catch {
      // fall through
    }
  }
  const match = text.match(/[a-z][a-z0-9-]+-[a-z0-9]{3,}/i);
  return match ? match[0] : null;
}

function projectIdForPath(path: string): string {
  return (
    basename(path)
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .toLowerCase() +
    "-" +
    hashPath(path)
  );
}

function normalizeStatus(status: string): TicketSummary["status"] {
  if (
    status === "open" ||
    status === "in_progress" ||
    status === "closed" ||
    status === "cancelled"
  )
    return status;
  return "open";
}

function summaryFromMai(state: MaiStateSummary, project: string): TicketSummary {
  return {
    id: state.id,
    status: normalizeStatus(state.status),
    type: state.type || state.kind || "task",
    priority: state.priority ?? 2,
    tags: state.tags ?? [],
    deps: state.deps ?? [],
    links: state.links ?? [],
    created: state.createdAt || "",
    modified: state.updatedAt || state.createdAt || "",
    assignee: state.assignee || undefined,
    title: state.title || state.id,
    project,
  };
}

function ticketFromMai(state: MaiState, project: string): Ticket {
  return { ...summaryFromMai(state, project), body: state.body || "" };
}

export class RamboardApi {
  private readonly views: ViewStore;

  constructor(context: vscode.ExtensionContext) {
    this.views = new ViewStore(context);
  }

  get defaultProjectId(): string | null {
    return this.projects()[0]?.id ?? null;
  }

  routeFor(kind: "board" | "tickets" | "ticket" | "review", ticketId?: string): string {
    const projectId = this.defaultProjectId;
    if (!projectId) return "/";
    if (kind === "board") return `/${projectId}/view/status-board`;
    if (kind === "tickets") return `/${projectId}/view/default`;
    if (kind === "ticket" && ticketId)
      return `/${projectId}/ticket/${encodeURIComponent(ticketId)}`;
    if (kind === "review" && ticketId)
      return `/${projectId}/review/${encodeURIComponent(ticketId)}`;
    if (kind === "review") return `/${projectId}/view/status-board`;
    return `/${projectId}`;
  }

  projects(): Array<ProjectSummary & { path: string }> {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
      id: projectIdForPath(folder.uri.fsPath),
      name: folder.name || basename(folder.uri.fsPath),
      path: folder.uri.fsPath,
    }));
  }

  projectPath(projectId: string): string | null {
    return this.projects().find((project) => project.id === projectId)?.path ?? null;
  }

  async handle(input: { method: string; url: string; body?: unknown }): Promise<ApiResponse> {
    try {
      const url = new URL(input.url, "https://maiboard.local");
      return await this.dispatch(input.method.toUpperCase(), url, input.body);
    } catch (error) {
      return {
        status: 500,
        body: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  private async dispatch(method: string, url: URL, body: unknown): Promise<ApiResponse> {
    const path = url.pathname;

    if (method === "GET" && path === "/api/projects") {
      return { status: 200, body: this.projects().map(({ id, name }) => ({ id, name })) };
    }
    if (method === "PUT" && path === "/api/projects/reorder")
      return { status: 200, body: { ok: true } };
    if (method === "DELETE" && path.match(/^\/api\/projects\/([^/]+)$/))
      return { status: 200, body: { ok: true } };

    const ticketList = path.match(/^\/api\/projects\/([^/]+)\/tickets$/);
    if (method === "GET" && ticketList?.[1]) {
      const projectId = ticketList[1];
      const projectPath = this.projectPath(projectId);
      if (!projectPath) return { status: 404, body: { error: "project not found" } };
      const tickets = (await maiJson<MaiStateSummary[]>(projectPath, ["ls", "--status=all"])) ?? [];
      let mapped = tickets.map((ticket) => summaryFromMai(ticket, projectId));
      const status = url.searchParams.get("status");
      const priority = url.searchParams.get("priority");
      const tag = url.searchParams.get("tag");
      if (status) mapped = mapped.filter((ticket) => ticket.status === status);
      if (priority) mapped = mapped.filter((ticket) => ticket.priority === Number(priority));
      if (tag) mapped = mapped.filter((ticket) => ticket.tags.includes(tag));
      return { status: 200, body: mapped };
    }

    const ticketDetail = path.match(/^\/api\/projects\/([^/]+)\/tickets\/([^/]+)$/);
    if (ticketDetail?.[1] && ticketDetail[2]) {
      const projectId = ticketDetail[1];
      const ticketId = decodeURIComponent(ticketDetail[2]);
      const projectPath = this.projectPath(projectId);
      if (!projectPath) return { status: 404, body: { error: "project not found" } };
      if (method === "GET") {
        const ticket = await maiJson<MaiState>(projectPath, ["show", ticketId]);
        return ticket
          ? { status: 200, body: ticketFromMai(ticket, projectId) }
          : { status: 404, body: { error: "ticket not found" } };
      }
      if (method === "PATCH") {
        const ok = await this.updateTicket(
          projectPath,
          ticketId,
          (body ?? {}) as Record<string, unknown>,
        );
        return ok
          ? { status: 200, body: { ok: true } }
          : { status: 500, body: { error: "update failed" } };
      }
    }

    const viewsList = path.match(/^\/api\/projects\/([^/]+)\/views$/);
    if (viewsList?.[1]) {
      const projectId = viewsList[1];
      if (!this.projectPath(projectId))
        return { status: 404, body: { error: "project not found" } };
      if (method === "GET") return { status: 200, body: this.views.read(projectId) };
      if (method === "POST")
        return { status: 201, body: this.views.create(projectId, body as Omit<SavedView, "id">) };
    }

    const viewDetail = path.match(/^\/api\/projects\/([^/]+)\/views\/([^/]+)$/);
    if (viewDetail?.[1] && viewDetail[2]) {
      const projectId = viewDetail[1];
      const viewId = viewDetail[2];
      if (!this.projectPath(projectId))
        return { status: 404, body: { error: "project not found" } };
      if (method === "PUT") {
        const updated = this.views.update(projectId, viewId, body as Partial<SavedView>);
        return updated
          ? { status: 200, body: updated }
          : { status: 404, body: { error: "view not found" } };
      }
      if (method === "DELETE") {
        return this.views.delete(projectId, viewId)
          ? { status: 200, body: { ok: true } }
          : { status: 404, body: { error: "view not found" } };
      }
    }

    const refsMatch = path.match(/^\/api\/projects\/([^/]+)\/git\/refs$/);
    if (method === "GET" && refsMatch?.[1]) {
      const projectPath = this.projectPath(refsMatch[1]);
      if (!projectPath) return { status: 404, body: { error: "project not found" } };
      const refs: GitRefs = await getRefs(projectPath);
      return { status: 200, body: refs };
    }

    const logMatch = path.match(/^\/api\/projects\/([^/]+)\/git\/log$/);
    if (method === "GET" && logMatch?.[1]) {
      const projectPath = this.projectPath(logMatch[1]);
      if (!projectPath) return { status: 404, body: { error: "project not found" } };
      const base = url.searchParams.get("base") ?? "";
      const head = url.searchParams.get("head") ?? "HEAD";
      const commits: GitCommit[] = await getLog(projectPath, base, head);
      return { status: 200, body: { commits } };
    }

    const diffMatch = path.match(/^\/api\/projects\/([^/]+)\/git\/diff$/);
    if (method === "POST" && diffMatch?.[1]) {
      const projectPath = this.projectPath(diffMatch[1]);
      if (!projectPath) return { status: 404, body: { error: "project not found" } };
      const payload = (body ?? {}) as {
        base?: string;
        head?: string;
        paths?: string[];
        commits?: string[];
      };
      let base = payload.base ?? "";
      let head = payload.head ?? "HEAD";
      if (Array.isArray(payload.commits) && payload.commits.length > 0) {
        const oldest = payload.commits[payload.commits.length - 1];
        const newest = payload.commits[0];
        base = `${oldest}^`;
        head = newest ?? head;
      }
      const files: DiffFile[] = await getDiff(projectPath, base, head, payload.paths ?? []);
      return { status: 200, body: { base, head, files } };
    }

    const reviewCommentMatch = path.match(
      /^\/api\/projects\/([^/]+)\/tickets\/([^/]+)\/review\/comments$/,
    );
    if (method === "POST" && reviewCommentMatch?.[1] && reviewCommentMatch[2]) {
      const projectPath = this.projectPath(reviewCommentMatch[1]);
      if (!projectPath) return { status: 404, body: { error: "project not found" } };
      const ticketId = decodeURIComponent(reviewCommentMatch[2]);
      const payload = (body ?? {}) as {
        file?: string;
        line?: number;
        endLine?: number;
        body?: string;
      };
      const text = String(payload.body ?? "").trim();
      if (!text) return { status: 400, body: { error: "comment body required" } };
      const args = ["add-note", ticketId, text];
      if (payload.file) {
        args.push("--file", payload.file);
        if (typeof payload.line === "number") args.push("--line", String(payload.line));
        if (typeof payload.endLine === "number") args.push("--end-line", String(payload.endLine));
      }
      const result = await mai(projectPath, args);
      if (result.exitCode !== 0)
        return { status: 500, body: { error: result.stderr || "mai add-note failed" } };
      return { status: 201, body: { ok: true } };
    }

    const reviewVerdictMatch = path.match(
      /^\/api\/projects\/([^/]+)\/tickets\/([^/]+)\/review\/verdict$/,
    );
    if (method === "POST" && reviewVerdictMatch?.[1] && reviewVerdictMatch[2]) {
      const projectPath = this.projectPath(reviewVerdictMatch[1]);
      if (!projectPath) return { status: 404, body: { error: "project not found" } };
      const ticketId = decodeURIComponent(reviewVerdictMatch[2]);
      const payload = (body ?? {}) as { kind?: string; message?: string };
      const kind = payload.kind === "request" ? "request" : "approve";
      const message = String(payload.message ?? "").trim();
      const ticket = await maiJson<{ kind?: string }>(projectPath, ["show", ticketId]);
      const isPr = ticket?.kind === "pr";
      let result: { exitCode: number; stderr: string };
      if (isPr) {
        const args = kind === "approve" ? ["pr", "accept", ticketId] : ["pr", "reject", ticketId];
        if (message) args.push("-m", message);
        result = await mai(projectPath, args);
      } else {
        const note =
          kind === "approve"
            ? "Approved" + (message ? ": " + message : "")
            : "Changes requested" + (message ? ": " + message : "");
        result = await mai(projectPath, ["add-note", ticketId, note]);
      }
      if (result.exitCode !== 0)
        return { status: 500, body: { error: result.stderr || "verdict failed" } };
      return { status: 200, body: { ok: true } };
    }

    return { status: 404, body: { error: `No Maiboard API route for ${method} ${path}` } };
  }

  /**
   * Create a review-shaped ticket for the current workspace.
   *
   * Picks `mai pr "title" --into <defaultBranch>` when the current branch
   * differs from the default branch, otherwise falls back to a generic
   * `mai review "title"`. Starts the ticket so it shows up as in_progress.
   * Returns the new ticket id, or throws if creation failed.
   */
  async createReviewTicket(): Promise<string> {
    const project = this.projects()[0];
    if (!project) throw new Error("no workspace folder open");
    const projectPath = project.path;

    const refs = await getRefs(projectPath);
    const current = refs.currentBranch;
    const def = refs.defaultBranch;

    let result;
    if (current && def && current !== def) {
      const title = `Review ${current} → ${def}`;
      result = await mai(projectPath, ["pr", title, "--into", def, "--json"]);
    } else {
      const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
      const title = `Review ${stamp}`;
      result = await mai(projectPath, ["review", title, "--json"]);
    }
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || "mai create failed");
    }

    const id = parseTicketId(result.stdout);
    if (!id) throw new Error("could not parse new ticket id from mai output");

    await mai(projectPath, ["start", id]);
    return id;
  }

  private async updateTicket(
    projectPath: string,
    ticketId: string,
    update: Record<string, unknown>,
  ): Promise<boolean> {
    const results: boolean[] = [];
    const run = async (args: string[]) => {
      const result = await mai(projectPath, args);
      results.push(result.exitCode === 0);
    };

    if (typeof update.status === "string") {
      if (update.status === "in_progress") await run(["start", ticketId]);
      else if (update.status === "closed") await run(["close", ticketId]);
      else if (update.status === "open") await run(["reopen", ticketId]);
    }
    if (typeof update.priority === "number")
      await run(["priority", ticketId, String(update.priority)]);
    if (typeof update.assignee === "string") await run(["assign", ticketId, update.assignee]);
    if (typeof update.title === "string") await run(["title", ticketId, update.title]);
    if (typeof update.type === "string") await run(["type", ticketId, update.type]);
    if (typeof update.body === "string") await run(["edit", ticketId, "-d", update.body]);

    if (Array.isArray(update.tags)) {
      const state = await maiJson<{ tags: string[] | null }>(projectPath, ["show", ticketId]);
      const current = new Set(state?.tags ?? []);
      const next = new Set(update.tags.filter((tag): tag is string => typeof tag === "string"));
      for (const tag of current) if (!next.has(tag)) await run(["tag", ticketId, `-${tag}`]);
      for (const tag of next) if (!current.has(tag)) await run(["tag", ticketId, `+${tag}`]);
    }

    return results.every(Boolean);
  }
}
