import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { ArchiveTimelinePanel } from "./views/archiveTimelinePanel";
import { registerCreatePlanCommand } from "./commands/createPlan";
import { registerWritePlanCommand } from "./commands/writePlan";
import { registerArchiveCommands } from "./commands/archive";
import { registerPhaseCommands } from "./commands/phaseOps";
import type { Installer } from "./core/installer";
import type { StatusBarManager } from "./views/statusBar";
import type { ArchiveTreeItem } from "./views/archiveTree";
import type { DependencyGraphPanel } from "./views/dependencyGraph";
import type { ExecutionTimelinePanel } from "./views/executionTimeline";
import type { ConfigWizardPanel } from "./views/configWizard";
import type { ReplayViewerPanel } from "./views/replayViewer";
import type { LiveRunPanel } from "./views/liveRunPanel";
import type { PlanPreviewPanel } from "./views/planPreviewPanel";
import type { NotificationManager } from "./views/notifications";
import { registerAiParsePlanCommand } from "./commands/aiParsePlan";
import type { WorkspaceSessionManager } from "./core/workspaceSessionManager";
import { pickWorkspaceFolder } from "./views/folderPicker";
import { registerPlanChatCommand } from "./commands/registerPlanChat";
import { registerFormPlanCommand } from "./commands/formPlan";
import type { PlanChatSession } from "./core/planChatSession";

export interface CommandDeps {
  sessionManager: WorkspaceSessionManager;
  installer: Installer;
  statusBar: StatusBarManager;
  readdir: (dir: string) => Promise<string[]>;
  onArchiveRefresh?: () => void;
  dependencyGraph?: DependencyGraphPanel;
  executionTimeline?: ExecutionTimelinePanel;
  configWizard?: ConfigWizardPanel;
  replayViewer?: ReplayViewerPanel;
  archiveTimelinePanel?: ArchiveTimelinePanel;
  liveRunPanel?: LiveRunPanel;
  planPreviewPanel?: PlanPreviewPanel;
  resolveArchiveItem?: (element: string) => { archiveName?: string } | undefined;
  claudePath?: string | null;
  extensionMode?: number;
  onPlanChatSessionCreated?: (session: PlanChatSession) => void;
  getActivePlanChatSession?: () => PlanChatSession | undefined;
  onPlanFormed?: () => void;
  notificationManager?: NotificationManager;
}

export function registerCommands(deps: CommandDeps): vscode.Disposable[] {
  const { sessionManager, installer, statusBar, readdir, onArchiveRefresh, dependencyGraph, executionTimeline, configWizard, replayViewer, archiveTimelinePanel, liveRunPanel, planPreviewPanel, resolveArchiveItem, claudePath, notificationManager } = deps;

  function getActive() {
    const active = sessionManager.getActiveSession();
    if (!active) return undefined;
    return {
      processManager: active.processManager,
      session: active.sessionState,
      workspaceRoot: active.workspaceRoot,
      gitExec: active.gitExec,
      folderUri: active.folderUri,
    };
  }

  async function resolveFolder() {
    const active = sessionManager.getActiveSession();
    if (active) {
      return {
        processManager: active.processManager,
        session: active.sessionState,
        workspaceRoot: active.workspaceRoot,
        gitExec: active.gitExec,
        folderUri: active.folderUri,
      };
    }
    const picked = await pickWorkspaceFolder(sessionManager);
    if (!picked) return undefined;
    return {
      processManager: picked.processManager,
      session: picked.sessionState,
      workspaceRoot: picked.workspaceRoot,
      gitExec: picked.gitExec,
      folderUri: picked.folderUri,
    };
  }

  return [
    vscode.commands.registerCommand("oxveil.start", async () => {
      try {
        const resolved = await resolveFolder();
        if (!resolved) {
          vscode.window.showWarningMessage("Oxveil: No workspace session found. Open a folder with claudeloop detected.");
          return;
        }
        if (!resolved.processManager) {
          vscode.window.showErrorMessage("Oxveil: claudeloop not detected. Install it or check the oxveil.claudeloopPath setting.");
          return;
        }
        await resolved.processManager.spawn();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Oxveil: Failed to start — ${msg}`);
      }
    }),
    vscode.commands.registerCommand("oxveil.stop", async () => {
      const active = getActive();
      if (!active?.processManager) {
        vscode.window.showWarningMessage("Oxveil: No active session to stop.");
        return;
      }
      await active.processManager.stop();
    }),
    vscode.commands.registerCommand("oxveil.reset", async () => {
      const active = getActive();
      if (!active?.processManager) {
        vscode.window.showWarningMessage("Oxveil: No active session to reset.");
        return;
      }
      try {
        await active.processManager.reset();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Oxveil: Failed to reset — ${msg}`);
      }
    }),
    vscode.commands.registerCommand("oxveil.forceUnlock", async () => {
      const active = getActive();
      if (!active?.processManager) {
        vscode.window.showWarningMessage("Oxveil: No active session to unlock.");
        return;
      }
      await active.processManager.forceUnlock();
      active.session.onLockChanged({ locked: false });
    }),
    vscode.commands.registerCommand("oxveil.install", async () => {
      if (!installer.isSupported()) {
        vscode.window.showErrorMessage(
          "Oxveil: claudeloop installation is not supported on this platform",
        );
        return;
      }
      statusBar.update({ kind: "installing" });
      await installer.install();
    }),
    ...registerPhaseCommands({ getActive, readdir }),
    ...registerArchiveCommands({
      getActive,
      resolveArchiveItem,
      onArchiveRefresh,
      replayViewer,
      archiveTimelinePanel,
    }),
    vscode.commands.registerCommand("oxveil.openReplayViewer", async () => {
      const resolved = await resolveFolder();
      if (!resolved?.workspaceRoot) {
        vscode.window.showWarningMessage("Oxveil: No workspace open");
        return;
      }
      const replayPath = path.join(resolved.workspaceRoot, ".claudeloop", "replay.html");
      const claudeloopRoot = path.join(resolved.workspaceRoot, ".claudeloop");
      await replayViewer?.reveal(replayPath, claudeloopRoot, resolved.folderUri);
    }),
    vscode.commands.registerCommand("oxveil.showDependencyGraph", async () => {
      const resolved = await resolveFolder();
      dependencyGraph?.reveal(resolved?.session.progress, resolved?.folderUri);
    }),
    vscode.commands.registerCommand("oxveil.showTimeline", async () => {
      const resolved = await resolveFolder();
      executionTimeline?.reveal(resolved?.session.progress, resolved?.folderUri);
    }),
    vscode.commands.registerCommand("oxveil.openConfigWizard", async () => {
      const resolved = await resolveFolder();
      if (!resolved?.workspaceRoot) {
        vscode.window.showWarningMessage("Oxveil: No workspace open");
        return;
      }
      const configPath = path.join(
        resolved.workspaceRoot,
        ".claudeloop",
        ".claudeloop.conf",
      );
      configWizard?.reveal(configPath, resolved.folderUri);
      vscode.commands.executeCommand("setContext", "oxveil.walkthrough.configured", true);
    }),
    vscode.commands.registerCommand("oxveil.showLiveRun", async () => {
      const resolved = await resolveFolder();
      if (!resolved) return;
      liveRunPanel?.reveal(resolved.session.progress ?? { phases: [], totalPhases: 0 }, resolved.folderUri);
    }),
    vscode.commands.registerCommand("oxveil.showPlanPreview", async () => {
      planPreviewPanel?.reveal();
      await planPreviewPanel?.onFileChanged();
    }),
    registerAiParsePlanCommand(sessionManager, liveRunPanel, notificationManager),
    registerCreatePlanCommand(),
    registerWritePlanCommand(() => getActive()?.workspaceRoot),
    vscode.commands.registerCommand("oxveil.welcome", () =>
      vscode.commands.executeCommand(
        "workbench.action.openWalkthrough",
        "chmc.oxveil#oxveil.welcome",
        false,
      ),
    ),
    registerPlanChatCommand({
      claudePath,
      extensionMode: deps.extensionMode,
      getWorkspaceRoot: () => getActive()?.workspaceRoot
        ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      getActivePlanChatSession: deps.getActivePlanChatSession,
      onPlanChatSessionCreated: deps.onPlanChatSessionCreated,
      planPreviewPanel,
    }),
    vscode.commands.registerCommand("oxveil.planPreviewNextTab", () =>
      planPreviewPanel?.nextTab(),
    ),
    registerFormPlanCommand({
      resolveFolder: async () => {
        const resolved = await resolveFolder();
        if (!resolved?.processManager) return undefined;
        return {
          workspaceRoot: resolved.workspaceRoot,
          processManager: resolved.processManager,
          liveRunPanel,
        };
      },
      getActivePreviewFile: () => planPreviewPanel?.getActiveFilePath(),
      onPlanFormed: deps.onPlanFormed,
      notificationManager,
    }),
    vscode.commands.registerCommand("oxveil._liveRunRetry", () => {
      liveRunPanel?.triggerAiParseAction("ai-parse-retry");
    }),
    vscode.commands.registerCommand("oxveil._liveRunContinue", () => {
      liveRunPanel?.triggerAiParseAction("ai-parse-continue");
    }),
    vscode.commands.registerCommand("oxveil._liveRunAbort", () => {
      liveRunPanel?.triggerAiParseAction("ai-parse-abort");
    }),
    vscode.commands.registerCommand("oxveil.discardPlan", async () => {
      const active = getActive();
      if (active?.processManager?.isRunning) {
        vscode.window.showErrorMessage("Oxveil: Stop the current session first");
        return;
      }
      const workspaceRoot = active?.workspaceRoot
        ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      const confirm = await vscode.window.showWarningMessage(
        "Delete PLAN.md? This cannot be undone.",
        { modal: true },
        "Delete",
      );
      if (confirm !== "Delete") return;

      const planPath = path.join(workspaceRoot, "PLAN.md");
      await fs.unlink(planPath);
      // Clean up stale ai-parsed-plan.md
      try {
        await fs.unlink(path.join(workspaceRoot, ".claudeloop", "ai-parsed-plan.md"));
      } catch {
        // May not exist
      }
    }),
  ];
}
