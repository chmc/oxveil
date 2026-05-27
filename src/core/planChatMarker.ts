import * as fs from "node:fs/promises";
import * as path from "node:path";

export const PLAN_MARKER_FILENAME = "oxveil-plan-active";
export const MARKER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PlanChatMarker {
  sessionId: string;
  denyCount: number;
}

export async function initPlanChatMarkerState(workspaceRoot: string | undefined): Promise<boolean> {
  if (!workspaceRoot) return false;
  const markerPath = path.join(workspaceRoot, ".claude", PLAN_MARKER_FILENAME);
  try {
    const stat = await fs.stat(markerPath);
    const age = Date.now() - stat.mtimeMs;
    if (age > MARKER_MAX_AGE_MS) {
      await fs.unlink(markerPath).catch(() => {});
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
