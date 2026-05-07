import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface MaiResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function findMaiBinary(): string {
  const candidates = [
    join(homedir(), ".bun", "bin", "mai"),
    join(homedir(), ".local", "bin", "mai"),
    join(homedir(), "go", "bin", "mai"),
  ];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  return "mai";
}

export async function mai(projectPath: string, args: string[]): Promise<MaiResult> {
  return new Promise((resolve) => {
    execFile(
      findMaiBinary(),
      ["-C", projectPath, ...args],
      { timeout: 60_000 },
      (error, stdout, stderr) => {
        const code =
          typeof (error as { code?: unknown } | null)?.code === "number"
            ? (error as { code: number }).code
            : error
              ? 1
              : 0;
        resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), exitCode: code });
      },
    );
  });
}

export async function maiJson<T>(projectPath: string, args: string[]): Promise<T | null> {
  const result = await mai(projectPath, ["--json", ...args]);
  if (result.exitCode !== 0) return null;
  const text = result.stdout.trim();
  if (!text || text === "null") return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
