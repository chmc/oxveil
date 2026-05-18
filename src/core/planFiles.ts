import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getPlanPath } from "./paths";

export async function listPlanFiles(workspaceRoot: string): Promise<string[]> {
  const plansDir = path.join(workspaceRoot, ".claude", "plans");
  try {
    const entries = await fs.readdir(plansDir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && e.name.endsWith(".md"))
      .map(e => path.join(plansDir, e.name));
  } catch {
    return [];
  }
}

export async function readNewestClaudePlan(workspaceRoot: string): Promise<string> {
  const plansDir = path.join(workspaceRoot, ".claude", "plans");
  const entries = await fs.readdir(plansDir);
  const mdFiles = entries.filter((f) => f.endsWith(".md"));
  if (mdFiles.length === 0) throw new Error("No plan files");
  const withMtimes = await Promise.all(
    mdFiles.map(async (f) => ({ name: f, mtime: (await fs.stat(path.join(plansDir, f))).mtimeMs }))
  );
  withMtimes.sort((a, b) => b.mtime - a.mtime);
  return fs.readFile(path.join(plansDir, withMtimes[0].name), "utf-8");
}

export async function checkInitialPlanState(
  workspaceRoot: string | undefined,
  planFileOverride?: string,
): Promise<boolean> {
  if (!workspaceRoot) return false;
  const planPath = getPlanPath(workspaceRoot, planFileOverride);
  try {
    await fs.access(planPath);
    return true;
  } catch {
    return false;
  }
}
