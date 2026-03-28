import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { ProcessManager } from "./core/processManager";
import type { Installer } from "./core/installer";
import type { SessionState } from "./core/sessionState";
import type { StatusBarManager } from "./views/statusBar";
import { findPhaseLogs } from "./views/logViewer";
import type { PhaseTreeItem } from "./views/phaseTree";
import type { ArchiveTreeItem } from "./views/archiveTree";
import type { DependencyGraphPanel } from "./views/dependencyGraph";
import type { ConfigWizardPanel } from "./views/configWizard";
import type { ReplayViewerPanel } from "./views/replayViewer";
import { findPhaseCommits, getPhaseUnifiedDiff } from "./core/gitIntegration";
import type { GitExecDeps } from "./core/gitIntegration";
import { DIFF_URI_SCHEME, encodeDiffUri } from "./views/diffProvider";
import { registerAiParsePlanCommand } from "./commands/aiParsePlan";

export interface CommandDeps {
  processManager: ProcessManager | undefined;
  installer: Installer;
  session: SessionState;
  statusBar: StatusBarManager;
  workspaceRoot: string | undefined;
  readdir: (dir: string) => Promise<string[]>;
  onArchiveRefresh?: () => void;
  dependencyGraph?: DependencyGraphPanel;
  configWizard?: ConfigWizardPanel;
  replayViewer?: ReplayViewerPanel;
  gitExec?: GitExecDeps;
  resolvePhaseItem?: (element: string) => { phaseNumber?: number | string } | undefined;
  resolveArchiveItem?: (element: string) => { archiveName?: string } | undefined;
}

export function registerCommands(deps: CommandDeps): vscode.Disposable[] {
  const { processManager, installer, session, statusBar, workspaceRoot, readdir, onArchiveRefresh, dependencyGraph, configWizard, replayViewer, gitExec, resolvePhaseItem, resolveArchiveItem } = deps;

  return [
    vscode.commands.registerCommand("oxveil.start", async () => {
      if (!processManager) return;
      try {
        await processManager.spawn();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Oxveil: Failed to start — ${msg}`);
      }
    }),
    vscode.commands.registerCommand("oxveil.stop", async () => {
      if (!processManager) return;
      await processManager.stop();
    }),
    vscode.commands.registerCommand("oxveil.reset", async () => {
      if (!processManager) return;
      try {
        await processManager.reset();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Oxveil: Failed to reset — ${msg}`);
      }
    }),
    vscode.commands.registerCommand("oxveil.forceUnlock", async () => {
      if (!processManager) return;
      await processManager.forceUnlock();
      session.onLockChanged({ locked: false });
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
    vscode.commands.registerCommand(
      "oxveil.viewLog",
      async (arg?: string | { phaseNumber?: number | string }) => {
        if (!workspaceRoot) {
          vscode.window.showWarningMessage("Oxveil: No workspace open");
          return;
        }

        const resolved = typeof arg === "string" ? resolvePhaseItem?.(arg) : arg;
        const phaseNumber = resolved?.phaseNumber;
        if (phaseNumber === undefined) {
          vscode.window.showWarningMessage(
            "Oxveil: No phase selected",
          );
          return;
        }

        const logs = await findPhaseLogs(
          { workspaceRoot, readdir },
          phaseNumber,
        );

        if (logs.length === 0) {
          vscode.window.showInformationMessage(
            `Oxveil: No logs available for phase ${phaseNumber}`,
          );
          return;
        }

        let selected: string;
        if (logs.length === 1) {
          selected = logs[0];
        } else {
          const items = logs.map((l) => ({
            label: path.basename(l),
            logPath: l,
          }));
          const pick = await vscode.window.showQuickPick(items, {
            placeHolder: `Select log for phase ${phaseNumber}`,
          });
          if (!pick) return;
          selected = pick.logPath;
        }

        const doc = await vscode.workspace.openTextDocument(
          vscode.Uri.file(selected),
        );
        await vscode.window.showTextDocument(doc);
      },
    ),
    vscode.commands.registerCommand(
      "oxveil.archiveReplay",
      async (arg?: string | { archiveName?: string }) => {
        const resolved = typeof arg === "string" ? resolveArchiveItem?.(arg) : arg;
        if (!workspaceRoot || !resolved?.archiveName) return;
        const replayPath = path.join(
          workspaceRoot,
          ".claudeloop",
          "archive",
          resolved.archiveName,
          "replay.html",
        );
        const claudeloopRoot = path.join(workspaceRoot, ".claudeloop");
        await replayViewer?.reveal(replayPath, claudeloopRoot);
      },
    ),
    vscode.commands.registerCommand(
      "oxveil.archiveRestore",
      async (arg?: string | { archiveName?: string }) => {
        const resolved = typeof arg === "string" ? resolveArchiveItem?.(arg) : arg;
        if (!processManager || !workspaceRoot || !resolved?.archiveName) return;

        if (processManager.isRunning) {
          vscode.window.showErrorMessage(
            "Oxveil: Stop the current session first",
          );
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          "Restore will overwrite current session state. Continue?",
          { modal: true },
          "Restore",
        );
        if (confirm !== "Restore") return;

        try {
          await processManager.restore(resolved.archiveName);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          vscode.window.showErrorMessage(`Oxveil: Failed to restore — ${msg}`);
        }
      },
    ),
    vscode.commands.registerCommand("oxveil.archiveRefresh", () => {
      onArchiveRefresh?.();
    }),
    vscode.commands.registerCommand(
      "oxveil.viewDiff",
      async (arg?: string | { phaseNumber?: number | string }) => {
        const resolved = typeof arg === "string" ? resolvePhaseItem?.(arg) : arg;
        const phaseNumber = resolved?.phaseNumber;
        if (phaseNumber === undefined || !gitExec) {
          vscode.window.showWarningMessage("Oxveil: No phase selected");
          return;
        }

        const range = await findPhaseCommits(gitExec, phaseNumber);
        if (!range) {
          vscode.window.showInformationMessage(
            `No commits found for Phase ${phaseNumber}`,
          );
          return;
        }

        const uri = vscode.Uri.parse(encodeDiffUri(phaseNumber));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: true });
      },
    ),
    vscode.commands.registerCommand(
      "oxveil.runFromPhase",
      async (arg?: { phaseNumber?: number | string }) => {
        if (!processManager) return;
        const phaseNumber = arg?.phaseNumber;
        if (phaseNumber === undefined) {
          vscode.window.showWarningMessage("Oxveil: No phase specified");
          return;
        }

        if (processManager.isRunning) {
          vscode.window.showErrorMessage(
            "Oxveil: Stop the current session first",
          );
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          `This will mark all phases before ${phaseNumber} as complete. Continue?`,
          { modal: true },
          "Run",
        );
        if (confirm !== "Run") return;

        try {
          await processManager.spawnFromPhase(phaseNumber);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          vscode.window.showErrorMessage(
            `Oxveil: Failed to run from phase — ${msg}`,
          );
        }
      },
    ),
    vscode.commands.registerCommand(
      "oxveil.markPhaseComplete",
      async (arg?: { phaseNumber?: number | string }) => {
        if (!processManager) return;
        const phaseNumber = arg?.phaseNumber;
        if (phaseNumber === undefined) {
          vscode.window.showWarningMessage("Oxveil: No phase specified");
          return;
        }

        try {
          await processManager.markComplete(phaseNumber);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          vscode.window.showErrorMessage(
            `Oxveil: Failed to mark phase complete — ${msg}`,
          );
        }
      },
    ),
    vscode.commands.registerCommand("oxveil.openReplayViewer", async () => {
      if (!workspaceRoot) {
        vscode.window.showWarningMessage("Oxveil: No workspace open");
        return;
      }
      const replayPath = path.join(workspaceRoot, ".claudeloop", "replay.html");
      const claudeloopRoot = path.join(workspaceRoot, ".claudeloop");
      await replayViewer?.reveal(replayPath, claudeloopRoot);
    }),
    vscode.commands.registerCommand("oxveil.showDependencyGraph", () => {
      dependencyGraph?.reveal(session.progress);
    }),
    vscode.commands.registerCommand("oxveil.openConfigWizard", () => {
      if (!workspaceRoot) {
        vscode.window.showWarningMessage("Oxveil: No workspace open");
        return;
      }
      const configPath = path.join(
        workspaceRoot,
        ".claudeloop",
        ".claudeloop.conf",
      );
      configWizard?.reveal(configPath);
    }),
    registerAiParsePlanCommand(processManager, workspaceRoot),
    vscode.commands.registerCommand("oxveil.createPlan", async () => {
      if (!workspaceRoot) {
        vscode.window.showWarningMessage("Oxveil: No workspace open");
        return;
      }
      const planPath = path.join(workspaceRoot, "PLAN.md");
      try {
        await fs.access(planPath);
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(planPath));
        await vscode.window.showTextDocument(doc);
        return;
      } catch {
        // File doesn't exist — create it
      }
      const template = `# Plan

## Phase 1: Set up project

Describe what this phase should accomplish.

## Phase 2: Implement core logic

Describe the next step.
`;
      await fs.writeFile(planPath, template, "utf-8");
      await vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", true);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(planPath));
      await vscode.window.showTextDocument(doc);
    }),
  ];
}
