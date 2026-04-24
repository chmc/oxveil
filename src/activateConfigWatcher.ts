import * as vscode from "vscode";
import type { Detection } from "./core/detection";
import type { StatusBarManager } from "./views/statusBar";
import type { SidebarPanel } from "./views/sidebarPanel";
import type { SidebarMutableState } from "./activateSidebar";
import type { SidebarState } from "./views/sidebarState";
import type { WorkspaceSessionManager } from "./core/workspaceSessionManager";
import { resolveClaudeloopPath, createPathResolverDeps } from "./core/pathResolver";
import { deriveStatusBarFromView } from "./views/deriveStatusBar";

export interface ConfigWatcherDeps {
  detection: Detection;
  folderChangeOpts: { resolvedPath?: string; detected: boolean };
  sidebarState: SidebarMutableState;
  buildFullState: () => SidebarState;
  sidebarPanel: SidebarPanel;
  statusBar: StatusBarManager;
  manager: WorkspaceSessionManager;
}

/**
 * Creates a config watcher that handles claudeloopPath changes.
 * Re-resolves the path and updates detection state when config changes.
 */
export function createConfigWatcher(deps: ConfigWatcherDeps): vscode.Disposable {
  const pathResolverDeps = createPathResolverDeps();

  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("oxveil.claudeloopPath")) {
      const configuredPath = vscode.workspace
        .getConfiguration("oxveil")
        .get<string>("claudeloopPath", "claudeloop");

      resolveClaudeloopPath(configuredPath, pathResolverDeps).then((resolved) => {
        const resolvedPath = resolved?.path ?? configuredPath;
        if (resolved) {
          console.log(`[Oxveil] claudeloop re-resolved via ${resolved.source}: ${resolved.path}`);
        }
        deps.detection.updatePath(resolvedPath);
        deps.folderChangeOpts.resolvedPath = resolvedPath;

        deps.detection.detect().then((r) => {
          deps.folderChangeOpts.detected = r.status === "detected";
          vscode.commands.executeCommand("setContext", "oxveil.detected", r.status === "detected");
          deps.sidebarState.detectionStatus = r.status;
          const fullState = deps.buildFullState();
          deps.sidebarPanel.updateState(fullState);
          deps.statusBar.update(deriveStatusBarFromView(
            fullState.view,
            deps.manager.getActiveSession()?.sessionState.progress,
          ));
        });
      });
    }
  });
}
