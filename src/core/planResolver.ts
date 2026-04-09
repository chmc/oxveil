import * as os from "node:os";
import * as path from "node:path";

export interface PlanResolverDeps {
  readdir: (dir: string) => Promise<string[]>;
  readFile: (filePath: string) => Promise<string>;
  stat: (filePath: string) => Promise<{ mtimeMs: number }>;
  fileExists: (filePath: string) => Promise<boolean>;
}

/**
 * Derive the Claude CLI project hash from a workspace root path.
 * Convention: replace `/` with `-`, keep leading `-`.
 * Example: `/Users/aleksi/source/oxveil` → `-Users-aleksi-source-oxveil`
 */
export function deriveProjectHash(workspaceRoot: string): string {
  return workspaceRoot.replace(/\//g, "-");
}

/**
 * Scan Claude CLI session JSONL transcripts to find the most recent planFilePath
 * for the given workspace. Returns the plan path if found and the file exists on disk.
 *
 * Reads the newest 20 JSONL files backwards (tail-first) since ExitPlanMode
 * is called near the end of a session.
 */
export async function resolveFromSessionData(
  workspaceRoot: string,
  deps: PlanResolverDeps,
): Promise<{ planPath: string } | undefined> {
  const projectHash = deriveProjectHash(workspaceRoot);
  const projectDir = path.join(os.homedir(), ".claude", "projects", projectHash);

  let entries: string[];
  try {
    entries = await deps.readdir(projectDir);
  } catch {
    return undefined;
  }

  // Filter to .jsonl files only
  const jsonlFiles = entries.filter((f) => f.endsWith(".jsonl"));
  if (jsonlFiles.length === 0) return undefined;

  // Sort by mtime descending — newest first
  const withStats: Array<{ name: string; mtimeMs: number }> = [];
  for (const name of jsonlFiles) {
    try {
      const s = await deps.stat(path.join(projectDir, name));
      withStats.push({ name, mtimeMs: s.mtimeMs });
    } catch {
      // Skip unreadable files
    }
  }
  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

  // Scan newest 20 files, reading backwards for planFilePath
  const scanLimit = Math.min(withStats.length, 20);
  for (let i = 0; i < scanLimit; i++) {
    const filePath = path.join(projectDir, withStats[i].name);
    try {
      const content = await deps.readFile(filePath);
      const planPath = extractLastPlanFilePath(content);
      if (planPath && (await deps.fileExists(planPath))) {
        return { planPath };
      }
    } catch {
      // Skip unreadable files
    }
  }

  return undefined;
}

/**
 * Extract the last planFilePath from JSONL content by scanning backwards.
 * Returns the path string or undefined if not found.
 */
export function extractLastPlanFilePath(content: string): string | undefined {
  const lines = content.split("\n");

  // Scan from the end — ExitPlanMode is near the bottom
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.includes('"planFilePath"')) continue;

    try {
      const parsed = JSON.parse(line);
      // planFilePath is in ExitPlanMode tool input: message.content[].input.planFilePath
      const contents = parsed?.message?.content;
      if (Array.isArray(contents)) {
        for (const block of contents) {
          if (block?.input?.planFilePath) {
            return block.input.planFilePath;
          }
        }
      }
    } catch {
      // Not valid JSON — skip
    }
  }

  return undefined;
}
