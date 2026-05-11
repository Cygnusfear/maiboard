import { execFile } from "node:child_process";

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function git(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd, maxBuffer: 64 * 1024 * 1024, timeout: 60_000 },
      (error, stdout, stderr) => {
        const code =
          typeof (error as { code?: unknown } | null)?.code === "number"
            ? (error as { code: number }).code
            : error
              ? 1
              : 0;
        resolve({
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
          exitCode: code,
        });
      },
    );
  });
}

export async function gitOut(cwd: string, args: string[]): Promise<string> {
  const result = await git(cwd, args);
  return result.exitCode === 0 ? result.stdout : "";
}

export interface GitCommit {
  hash: string;
  short: string;
  subject: string;
  author: string;
  date: string;
}

export interface GitRefs {
  defaultBranch: string;
  currentBranch: string | null;
  branches: string[];
}

export async function getRefs(cwd: string): Promise<GitRefs> {
  const heads = (await gitOut(cwd, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const remotes = (await gitOut(cwd, ["for-each-ref", "--format=%(refname:short)", "refs/remotes"]))
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.endsWith("/HEAD"));
  const branches = Array.from(new Set([...heads, ...remotes]));

  let defaultBranch = "";
  const remoteHead = (
    await gitOut(cwd, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])
  ).trim();
  if (remoteHead) defaultBranch = remoteHead.replace(/^origin\//, "");
  if (!defaultBranch) {
    if (heads.includes("main")) defaultBranch = "main";
    else if (heads.includes("master")) defaultBranch = "master";
    else if (heads[0]) defaultBranch = heads[0];
    else defaultBranch = "HEAD";
  }
  const currentBranch = (await gitOut(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim() || null;

  return { defaultBranch, currentBranch, branches };
}

export async function getLog(cwd: string, base: string, head: string): Promise<GitCommit[]> {
  const range = base ? `${base}..${head}` : head;
  const result = await git(cwd, [
    "log",
    "--pretty=%H%x09%h%x09%s%x09%an%x09%aI",
    "--no-merges",
    "-n",
    "200",
    range,
    "--",
  ]);
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash = "", short = "", subject = "", author = "", date = ""] = line.split("\t");
      return { hash, short, subject, author, date };
    });
}

export interface DiffLine {
  type: "context" | "add" | "remove";
  oldLine: number | null;
  newLine: number | null;
  content: string;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  oldPath: string | null;
  status: "added" | "deleted" | "modified" | "renamed" | "binary";
  hunks: DiffHunk[];
  binary: boolean;
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function parseFileChunk(chunkLines: string[]): DiffFile | null {
  const first = chunkLines[0] ?? "";
  const match = first.match(/^diff --git a\/(.+) b\/(.+)$/);
  if (!match) return null;
  let oldPath = match[1] ?? "";
  let newPath = match[2] ?? "";
  let status: DiffFile["status"] = "modified";
  let binary = false;

  let i = 1;
  while (i < chunkLines.length) {
    const line = chunkLines[i] ?? "";
    if (line.startsWith("@@ ")) break;
    if (line.startsWith("new file mode")) status = "added";
    else if (line.startsWith("deleted file mode")) status = "deleted";
    else if (line.startsWith("rename from ")) {
      oldPath = line.slice("rename from ".length);
      status = "renamed";
    } else if (line.startsWith("rename to ")) {
      newPath = line.slice("rename to ".length);
      status = "renamed";
    } else if (line.startsWith("Binary files")) {
      binary = true;
      status = status === "modified" ? "binary" : status;
    }
    i++;
  }

  const hunks: DiffHunk[] = [];
  let oldLine = 0;
  let newLine = 0;
  let currentHunk: DiffHunk | null = null;

  while (i < chunkLines.length) {
    const line = chunkLines[i] ?? "";
    const hunkMatch = line.match(HUNK_RE);
    if (hunkMatch) {
      const oldStart = Number(hunkMatch[1] ?? "0");
      const oldLines = Number(hunkMatch[2] ?? "1");
      const newStart = Number(hunkMatch[3] ?? "0");
      const newLines = Number(hunkMatch[4] ?? "1");
      currentHunk = {
        header: line,
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: [],
      };
      hunks.push(currentHunk);
      oldLine = oldStart;
      newLine = newStart;
    } else if (currentHunk) {
      if (line.startsWith("\\ ")) {
        // No newline at end of file marker — skip but keep counters
      } else if (line.startsWith("+")) {
        currentHunk.lines.push({
          type: "add",
          oldLine: null,
          newLine,
          content: line.slice(1),
        });
        newLine++;
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({
          type: "remove",
          oldLine,
          newLine: null,
          content: line.slice(1),
        });
        oldLine++;
      } else if (line.startsWith(" ")) {
        currentHunk.lines.push({
          type: "context",
          oldLine,
          newLine,
          content: line.slice(1),
        });
        oldLine++;
        newLine++;
      } else if (line === "") {
        currentHunk.lines.push({
          type: "context",
          oldLine,
          newLine,
          content: "",
        });
        oldLine++;
        newLine++;
      }
    }
    i++;
  }

  const path = newPath || oldPath;
  return {
    path,
    oldPath: oldPath !== newPath ? oldPath : null,
    status,
    hunks,
    binary,
  };
}

export function parseUnifiedDiff(text: string): DiffFile[] {
  if (!text) return [];
  const lines = text.split("\n");
  const chunks: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) chunks.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) chunks.push(current);
  return chunks
    .map((chunk) => parseFileChunk(chunk))
    .filter((file): file is DiffFile => file !== null);
}

export async function getDiff(
  cwd: string,
  base: string,
  head: string,
  paths: string[] = [],
): Promise<DiffFile[]> {
  const args = ["diff", "--no-color", "--no-ext-diff"];
  if (base) args.push(`${base}..${head}`);
  else args.push(head);
  if (paths.length > 0) args.push("--", ...paths);
  const result = await git(cwd, args);
  if (result.exitCode !== 0) return [];
  return parseUnifiedDiff(result.stdout);
}

export async function getRawDiff(
  cwd: string,
  base: string,
  head: string,
  paths: string[] = [],
  options: { detectRenames?: boolean } = {},
): Promise<string> {
  const args = ["diff", "--no-color", "--no-ext-diff"];
  if (options.detectRenames === false) args.push("--no-renames");
  if (base) args.push(`${base}..${head}`);
  else args.push(head);
  if (paths.length > 0) args.push("--", ...paths);
  const result = await git(cwd, args);
  return result.exitCode === 0 ? result.stdout : "";
}

export async function getRawWorkingTreeDiff(
  cwd: string,
  base: string,
  paths: string[] = [],
  options: { detectRenames?: boolean } = {},
): Promise<string> {
  const trackedArgs = ["diff", "--no-color", "--no-ext-diff"];
  if (options.detectRenames === false) trackedArgs.push("--no-renames");
  trackedArgs.push(base);
  if (paths.length > 0) trackedArgs.push("--", ...paths);

  const patches: string[] = [];
  const tracked = await git(cwd, trackedArgs);
  if (tracked.exitCode === 0 && tracked.stdout.trim()) patches.push(tracked.stdout);

  const lsArgs = ["ls-files", "--others", "--exclude-standard"];
  if (paths.length > 0) lsArgs.push("--", ...paths);
  const untracked = await git(cwd, lsArgs);
  if (untracked.exitCode !== 0) return patches.join("\n");

  const files = untracked.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const file of files) {
    const fileDiff = await git(cwd, [
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-index",
      "--",
      "/dev/null",
      file,
    ]);
    if ((fileDiff.exitCode === 0 || fileDiff.exitCode === 1) && fileDiff.stdout.trim()) {
      patches.push(fileDiff.stdout);
    }
  }

  return patches.join("\n");
}

export async function getRawCommitDiffs(
  cwd: string,
  commits: string[],
  paths: string[] = [],
): Promise<string> {
  const patches: string[] = [];
  for (const commit of commits) {
    // --first-parent: on a merge commit, `git show` defaults to --cc (combined
    // diff), which silently omits files that came in cleanly from one parent.
    // For a review listing the merge as a single unit, we want the diff
    // against the first parent so every file the merge introduces is visible.
    const args = ["show", "--format=", "--no-color", "--no-ext-diff", "--first-parent", commit];
    if (paths.length > 0) args.push("--", ...paths);
    const result = await git(cwd, args);
    if (result.exitCode === 0 && result.stdout.trim()) patches.push(result.stdout);
  }
  return patches.join("\n");
}

/**
 * Check whether `commits` is exactly the contiguous first-parent range
 * `${oldest}^..${newest}`. Used by the diff endpoint to decide between a
 * single `git diff base..head` (clean, deduplicated, correct for ranges) and
 * the per-commit `git show` fallback (needed for cherry-picked subsets).
 *
 * `commits` must be ordered oldest-to-newest.
 */
export async function commitsAreContiguousFirstParent(
  cwd: string,
  commits: string[],
): Promise<boolean> {
  if (commits.length === 0) return false;
  const oldest = commits[0]!;
  const newest = commits[commits.length - 1]!;
  const result = await git(cwd, ["rev-list", "--first-parent", `${oldest}^..${newest}`]);
  if (result.exitCode !== 0) return false;
  const range = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (range.length !== commits.length) return false;
  const want = new Set(commits.map((c) => c.toLowerCase()));
  return range.every((hash) => want.has(hash.toLowerCase()));
}
