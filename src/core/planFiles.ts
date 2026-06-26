import * as fs from "node:fs/promises";
import { getPlanPath } from "./paths";


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
