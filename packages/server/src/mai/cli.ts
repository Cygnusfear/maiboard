/**
 * Thin wrapper around the `mai` CLI binary.
 * All ticket data now lives in git notes (refs/notes/maitake),
 * not .tickets/ files. We shell out to `mai` for everything.
 */
import { join } from "path";
import { existsSync } from "fs";
import { homedir } from "os";

/** Resolve mai binary — check PATH first, then ~/go/bin/ */
function findMaiBinary(): string {
  const gobin = join(homedir(), "go", "bin", "mai");
  if (existsSync(gobin)) return gobin;
  // Fall back to bare name (relies on PATH)
  return "mai";
}

const MAI = findMaiBinary();

export interface MaiResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const MAI_TIMEOUT_MS = 60_000;

/** Run a mai command against a project directory. */
export async function mai(projectPath: string, args: string[]): Promise<MaiResult> {
  const proc = Bun.spawn([MAI, "-C", projectPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeout = setTimeout(() => proc.kill(), MAI_TIMEOUT_MS);

  try {
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { stdout, stderr, exitCode };
  } finally {
    clearTimeout(timeout);
  }
}

/** Run mai with --json flag and parse the result. Returns null on error. */
export async function maiJson<T>(projectPath: string, args: string[]): Promise<T | null> {
  const result = await mai(projectPath, ["--json", ...args]);
  if (result.exitCode !== 0) {
    console.warn(`[mai] command failed: mai --json ${args.join(" ")}`, result.stderr);
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    // `null` from empty lists is valid JSON
    if (result.stdout.trim() === "null") return null;
    console.warn(`[mai] invalid JSON from: mai --json ${args.join(" ")}`, result.stdout);
    return null;
  }
}

// ── JSON response shapes from `mai --json` ─────────────────

export interface MaiStateSummary {
  id: string;
  kind: string;
  status: string;
  type: string;
  priority: number;
  title: string;
  tags: string[] | null;
  targets: string[] | null;
  deps: string[] | null;
  links: string[] | null;
  assignee: string;
  branch?: string;
  resolved: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaiComment {
  kind: string;
  body: string;
  timestamp: string;
  author: string;
  location?: { path: string; range?: { startLine: number; endLine?: number } };
}

export interface MaiState {
  id: string;
  kind: string;
  status: string;
  title: string;
  type: string;
  priority: number;
  assignee: string;
  tags: string[] | null;
  body: string;
  targets: string[] | null;
  deps: string[] | null;
  links: string[] | null;
  parentId: string;
  events: unknown[] | null;
  comments: MaiComment[] | null;
  branch?: string;
  resolved: boolean | null;
  createdAt: string;
  updatedAt: string;
}

/** Check if a directory is a git repo (maitake works on any git repo). */
export function isGitRepo(dirPath: string): boolean {
  return existsSync(join(dirPath, ".git"));
}
