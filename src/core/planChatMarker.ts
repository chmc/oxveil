import * as fs from "node:fs/promises";
import * as path from "node:path";
import type * as vscode from "vscode";

export const PLAN_MARKER_FILENAME = "oxveil-plan-active";
export const MARKER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PlanChatMarker {
  sessionId: string;
  denyCount: number;
}

export function getMarkerPath(storageUri: vscode.Uri): string {
  return path.join(storageUri.fsPath, PLAN_MARKER_FILENAME);
}

export async function ensureMarkerDir(storageUri: vscode.Uri): Promise<void> {
  await fs.mkdir(storageUri.fsPath, { recursive: true });
}

export async function initPlanChatMarkerState(markerPath: string | undefined): Promise<boolean> {
  if (!markerPath) return false;
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
