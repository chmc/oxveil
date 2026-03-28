import * as vscode from "vscode";
import * as path from "node:path";
import type { WorkspaceSessionManager } from "../core/workspaceSessionManager";
import type { WorkspaceSession } from "../core/workspaceSession";

interface FolderQuickPickItem extends vscode.QuickPickItem {
  session: WorkspaceSession;
}

function formatDetail(session: WorkspaceSession): string {
  const state = session.sessionState;
  const status = state.status;

  if (status === "running") {
    const progress = state.progress;
    if (progress) {
      const current = (progress.currentPhaseIndex ?? 0) + 1;
      return `Running — Phase ${current}/${progress.totalPhases}`;
    }
    return "Running";
  }

  if (status === "done") {
    const progress = state.progress;
    if (progress) {
      return `Done — ${progress.totalPhases}/${progress.totalPhases} phases`;
    }
    return "Done";
  }

  if (status === "failed") {
    return "Failed";
  }

  return "Idle — No active session";
}

export async function pickWorkspaceFolder(
  manager: WorkspaceSessionManager,
  placeHolder?: string,
): Promise<WorkspaceSession | undefined> {
  const sessions = manager.getAllSessions();

  if (sessions.length === 0) {
    return undefined;
  }

  if (sessions.length === 1) {
    return sessions[0];
  }

  const items: FolderQuickPickItem[] = sessions.map((session) => ({
    label: `$(folder) ${path.basename(session.workspaceRoot)}`,
    detail: formatDetail(session),
    session,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: placeHolder ?? "Select workspace folder",
  });

  return picked?.session;
}
