import * as vscode from "vscode";
import { NotificationManager } from "./views/notifications";
import type { WorkspaceSessionManager } from "./core/workspaceSessionManager";
import type { LiveRunPanel } from "./views/liveRunPanel";
import type { DetectionStatus } from "./types";

export interface NotificationFactoryDeps {
  manager: WorkspaceSessionManager;
  liveRunPanel: LiveRunPanel;
}

/**
 * Creates a NotificationManager with VS Code command callbacks wired up.
 */
export function createNotificationManager(deps: NotificationFactoryDeps): NotificationManager {
  return new NotificationManager({
    window: vscode.window,
    onShowOutput: () => {
      const active = deps.manager.getActiveSession();
      const progress = active?.sessionState.progress ?? { phases: [], totalPhases: 0 };
      deps.liveRunPanel.reveal(progress, active?.folderUri);
    },
    onViewLog: (phaseNumber) =>
      vscode.commands.executeCommand("oxveil.viewLog", { phaseNumber }),
    onInstall: () => vscode.commands.executeCommand("oxveil.install"),
    onSetPath: () =>
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "oxveil.claudeloopPath",
      ),
    onStop: () => vscode.commands.executeCommand("oxveil.stop"),
    onForceUnlock: () => vscode.commands.executeCommand("oxveil.forceUnlock"),
    onOpenFile: (filePath) =>
      vscode.workspace.openTextDocument(filePath).then(vscode.window.showTextDocument),
    onFocusLiveRun: () => deps.liveRunPanel.panel?.reveal(),
  });
}

/**
 * Shows detection notifications if needed.
 */
export function showDetectionNotifications(
  notifications: NotificationManager,
  status: DetectionStatus,
  version: string | undefined,
  minimumVersion: string,
): void {
  if (status === "not-found") {
    notifications.onDetection("not-found");
  } else if (status === "version-incompatible") {
    notifications.onDetection("version-incompatible", {
      found: version ?? "unknown",
      required: minimumVersion,
    });
  }
}
