import * as vscode from "vscode";
import type { WorkspaceSessionManager } from "./core/workspaceSessionManager";

export const disposables: vscode.Disposable[] = [];

let _sessionManager: WorkspaceSessionManager | undefined;

export function setSessionManager(manager: WorkspaceSessionManager): void {
  _sessionManager = manager;
}

export async function deactivate(): Promise<void> {
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
