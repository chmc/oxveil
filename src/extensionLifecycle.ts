import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import type { WorkspaceSessionManager } from "./core/workspaceSessionManager";
import { uninstallPlanInterceptHook } from "./planInterceptInstaller";

export const disposables: vscode.Disposable[] = [];

let _sessionManager: WorkspaceSessionManager | undefined;
let _markerPath: string | undefined;

export function setMarkerPath(path: string | undefined): void {
  _markerPath = path;
}

export function setSessionManager(manager: WorkspaceSessionManager): void {
  _sessionManager = manager;
}

export async function deactivate(): Promise<void> {
  await uninstallPlanInterceptHook().catch(() => {});

  if (_markerPath) {
    await fs.unlink(_markerPath).catch(() => {});
  }

  if (_sessionManager) {
    for (const ws of _sessionManager.getAllSessions()) {
      if (ws.processManager?.isRunning) {
        await ws.processManager.deactivate();
      }
    }
    _sessionManager.dispose();
  }

  for (const d of disposables) {
    d.dispose();
  }
}
