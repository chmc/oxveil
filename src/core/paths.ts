import * as path from "node:path";
import * as fs from "node:fs/promises";

export const CLAUDELOOP_DIR = ".claudeloop";
export const PLAN_FILENAME = "PLAN.md";

export function getPlanPath(workspaceRoot: string, planFileOverride?: string): string {
  if (planFileOverride) return planFileOverride;
  return path.join(workspaceRoot, CLAUDELOOP_DIR, PLAN_FILENAME);
}

export function getClaudeloopDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, CLAUDELOOP_DIR);
}

export async function ensureClaudeloopDir(workspaceRoot: string): Promise<void> {
  await fs.mkdir(getClaudeloopDir(workspaceRoot), { recursive: true });
}

/** Load PLAN_FILE from .claudeloop/.claudeloop.conf if it exists and the path is accessible */
export async function loadPlanFileOverride(workspaceRoot: string): Promise<string | undefined> {
  const confPath = path.join(workspaceRoot, CLAUDELOOP_DIR, ".claudeloop.conf");
  try {
    const content = await fs.readFile(confPath, "utf-8");
    const match = content.match(/^PLAN_FILE=(.+)$/m);
    const rawPath = match?.[1]?.trim();
    if (!rawPath) return undefined;
    const resolved = path.isAbsolute(rawPath) ? rawPath : path.join(workspaceRoot, rawPath);
    await fs.access(resolved);
    return resolved;
  } catch {
    return undefined;
  }
}
