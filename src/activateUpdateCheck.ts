import * as vscode from "vscode";
import { checkForUpdate } from "./core/updateChecker";
import type { NotificationManager } from "./views/notifications";

export interface UpdateCheckDeps {
  config: vscode.WorkspaceConfiguration;
  result: { status: string; version?: string };
  notifications: NotificationManager;
  globalState: vscode.Memento;
}

export function activateUpdateCheck(deps: UpdateCheckDeps): vscode.Disposable {
  const { config, result, notifications, globalState } = deps;
  const autoCheck = config.get<boolean>("autoCheckForUpdates", true);
  if (autoCheck && result.status === "detected" && result.version) {
    checkForUpdate({ fetch: globalThis.fetch, currentVersion: result.version, globalState })
      .then((r) => {
        if (r?.updateAvailable) {
          notifications.onUpdateAvailable(r.currentVersion, r.latestVersion, r.releaseUrl);
        }
      })
      .catch((err) => console.warn("[Oxveil] Update check failed:", err));
  }

  return vscode.commands.registerCommand("oxveil.checkForUpdates", async () => {
    if (result.status !== "detected" || !result.version) {
      vscode.window.showWarningMessage("claudeloop not detected. Cannot check for updates.");
      return;
    }
    try {
      const updateResult = await checkForUpdate({
        fetch: globalThis.fetch,
        currentVersion: result.version,
        globalState,
      });
      if (updateResult?.updateAvailable) {
        notifications.onUpdateAvailable(
          updateResult.currentVersion,
          updateResult.latestVersion,
          updateResult.releaseUrl,
        );
      } else {
        vscode.window.showInformationMessage("claudeloop is up to date");
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to check for updates: ${err}`);
    }
  });
}
