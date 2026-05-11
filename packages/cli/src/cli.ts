#!/usr/bin/env bun
/**
 * mai-board — standalone Maiboard launcher and maitake plugin binary.
 *
 * Usage:
 *   mai-board              Run from any git/maitake repo: add it, start server/client, open browser
 *   mai-board --register   Register `board = "mai-board"` in ~/.maitake/plugins.toml
 *   mai-board add <path>   Manually add a project directory
 *   mai-board rm <id>      Remove a project from the sidebar
 *   mai-board ls           List configured projects
 *   mai-board server       Start server/client only (no browser)
 *
 * Maitake plugin mode:
 *   mai board              mai resolves this binary from plugins.toml and sets MAI_REPO_PATH.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { addProject, hasTickets, readConfig, removeProject } from "@maiboard/server/config";

const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..", "..");
const SERVER_DIR = join(MONOREPO_ROOT, "packages", "server");
const BOARD_DIR = join(MONOREPO_ROOT, "packages", "board");
const API_PORT = readConfig().server.port;
const CLIENT_PORT = 4001;
const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;
const PLUGINS_PATH = join(homedir(), ".maitake", "plugins.toml");

// ── Plugin registration ──────────────────────────────────────

function pluginFileRegistersBoard(text: string): boolean {
  return /^\s*board\s*=\s*["']mai-board["']\s*$/m.test(text);
}

function ensurePluginRegistered({ assumeYes = false }: { assumeYes?: boolean } = {}): void {
  const current = existsSync(PLUGINS_PATH) ? readFileSync(PLUGINS_PATH, "utf-8") : "";
  if (pluginFileRegistersBoard(current)) return;

  if (!assumeYes && process.stdin.isTTY) {
    const answer = prompt("Register mai-board as the `mai board` plugin? [Y/n]") ?? "";
    if (answer.trim().toLowerCase().startsWith("n")) return;
  } else if (!assumeYes) {
    return;
  }

  mkdirSync(dirname(PLUGINS_PATH), { recursive: true });
  const next = withBoardPlugin(current);
  writeFileSync(PLUGINS_PATH, next);
  console.log(`Registered mai-board in ${PLUGINS_PATH}`);
}

function withBoardPlugin(text: string): string {
  const body = text.trimEnd();
  if (!body) {
    return '[plugins]\npr = "mai-pr"\ndocs = "mai-docs"\nchangelog = "mai-changelog"\nboard = "mai-board"\n';
  }

  const boardOther = /^\s*board\s*=\s*.+$/m.exec(body);
  if (boardOther) {
    console.warn(`plugins.toml already has a board plugin: ${boardOther[0]}`);
    console.warn(
      "Leaving it unchanged. Edit ~/.maitake/plugins.toml if you want `mai board` to use mai-board.",
    );
    return `${body}\n`;
  }

  if (/^\s*\[plugins\]\s*$/m.test(body)) {
    return `${body.replace(/(^\s*\[plugins\]\s*$)/m, '$1\nboard = "mai-board"')}\n`;
  }

  return `${body}\n\n[plugins]\nboard = "mai-board"\n`;
}

// ── Process helpers ──────────────────────────────────────────

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/projects`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function startServer(): Promise<void> {
  console.log("Starting Maiboard server...");
  Bun.spawn(["bun", "run", "dev"], {
    cwd: SERVER_DIR,
    stdio: ["ignore", "ignore", "ignore"],
  });
  Bun.spawn(["bun", "run", "dev"], {
    cwd: BOARD_DIR,
    stdio: ["ignore", "ignore", "ignore"],
  });
  for (let i = 0; i < 30; i++) {
    if (await isServerRunning()) return;
    await Bun.sleep(200);
  }
  console.error("Server failed to start within 6s");
  process.exit(1);
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  Bun.spawn([cmd, url], { stdio: ["ignore", "ignore", "ignore"] });
}

// ── Commands ─────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "--register" || cmd === "register") {
  ensurePluginRegistered({ assumeYes: true });
  process.exit(0);
}

// First-run direct invocation can register the maitake plugin. If mai already
// exec'd us, MAI_REPO_PATH is set, so registration already happened elsewhere.
if (!process.env.MAI_REPO_PATH) {
  ensurePluginRegistered({
    assumeYes: process.env.MAI_YES === "1" || process.env.MAI_YES === "true",
  });
}

if (cmd === "ls" || cmd === "list") {
  const config = readConfig();
  if (config.projects.length === 0) {
    console.log("No projects configured. Run `mai-board` from a project directory to add one.");
  } else {
    console.log("Projects:");
    for (const p of config.projects) {
      const hasGit = existsSync(resolve(p.path, ".git"));
      console.log(
        `${p.id.padEnd(20)} ${p.name.padEnd(16)} ${p.path} ${hasGit ? "✓" : "✗ not a git repo"}`,
      );
    }
  }
  process.exit(0);
}

if (cmd === "add") {
  const dir = resolve(args[0] ?? process.cwd());
  if (!hasTickets(dir)) {
    console.error(`Not a git repository: ${dir}`);
    process.exit(1);
  }
  const entry = addProject(dir);
  console.log(`Added: ${entry.id} (${entry.name}) — ${entry.path}`);
  process.exit(0);
}

if (cmd === "rm" || cmd === "remove") {
  if (!args[0]) {
    console.error("Usage: mai-board rm <project-id>");
    process.exit(1);
  }
  const removed = removeProject(args[0]);
  console.log(removed ? `Removed: ${args[0]}` : `Not found: ${args[0]}`);
  process.exit(0);
}

if (cmd === "server") {
  if (await isServerRunning()) {
    console.log("Server already running.");
  } else {
    await startServer();
    console.log("Server started.");
  }
  process.exit(0);
}

// ── Default/plugin mode: add repo + start + open browser ─────

const projectPath = resolve(process.env.MAI_REPO_PATH ?? process.cwd());
let projectId: string | null = null;

if (hasTickets(projectPath)) {
  const entry = addProject(projectPath);
  projectId = entry.id;
  console.log(`Project: ${entry.name} (${entry.id})`);
} else if (process.env.MAI_REPO_PATH) {
  console.error(`MAI_REPO_PATH is not a git repository: ${projectPath}`);
  process.exit(1);
}

if (!(await isServerRunning())) {
  await startServer();
  console.log("Server started.");
} else {
  console.log("Server already running.");
}

const url = projectId ? `${CLIENT_URL}/${projectId}` : CLIENT_URL;
openBrowser(url);
console.log(`Opened: ${url}`);
