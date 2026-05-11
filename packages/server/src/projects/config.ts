/**
 * Persistent config stored in ~/.maiboard/config.json
 * Source of truth for project list and server settings.
 */
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";

export interface ProjectEntry {
  id: string;
  name: string;
  path: string;
}

export interface MaiboardConfig {
  projects: ProjectEntry[];
  server: { port: number };
}

const CONFIG_DIR = join(homedir(), ".maiboard");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: MaiboardConfig = {
  projects: [],
  server: { port: 4000 },
};

/** Read config from disk, creating default if missing */
export function readConfig(): MaiboardConfig {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(CONFIG_PATH)) {
    writeConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** Write config to disk */
export function writeConfig(config: MaiboardConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

/** Derive a short id from a directory name */
export function dirToId(dirPath: string): string {
  const name = dirPath.split("/").filter(Boolean).pop() ?? "unknown";
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

/** Derive a display name from a directory name */
export function dirToName(dirPath: string): string {
  const name = dirPath.split("/").filter(Boolean).pop() ?? "Unknown";
  // Capitalize first letter, keep rest
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Add a project if not already present. Returns the project entry. */
export function addProject(dirPath: string): ProjectEntry {
  const config = readConfig();
  const resolved = dirPath.replace(/\/$/, "");

  // Already exists?
  const existing = config.projects.find((p) => p.path === resolved);
  if (existing) return existing;

  const entry: ProjectEntry = {
    id: dirToId(resolved),
    name: dirToName(resolved),
    path: resolved,
  };
  config.projects.push(entry);
  writeConfig(config);
  return entry;
}

/** Remove a project by id */
export function removeProject(id: string): boolean {
  const config = readConfig();
  const before = config.projects.length;
  config.projects = config.projects.filter((p) => p.id !== id);
  if (config.projects.length < before) {
    writeConfig(config);
    // Clean up project data folder (~/.maiboard/<id>/)
    const projectDir = join(CONFIG_DIR, id);
    if (existsSync(projectDir)) {
      rmSync(projectDir, { recursive: true, force: true });
    }
    return true;
  }
  return false;
}

/** Check if a directory is a git repo (maitake works on any git repo) */
export function hasTickets(dirPath: string): boolean {
  return existsSync(join(dirPath, ".git"));
}

/** Reorder projects by providing the full list of ids in desired order */
export function reorderProjects(ids: string[]): boolean {
  const config = readConfig();
  const byId = new Map(config.projects.map((p) => [p.id, p]));
  const reordered: ProjectEntry[] = [];
  for (const id of ids) {
    const entry = byId.get(id);
    if (!entry) return false;
    reordered.push(entry);
  }
  // Keep any projects not in the list at the end (safety net)
  for (const p of config.projects) {
    if (!ids.includes(p.id)) reordered.push(p);
  }
  config.projects = reordered;
  writeConfig(config);
  return true;
}

export { CONFIG_PATH };
