import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { ProcessManager } from "../core/processManager";
import type { WorkspaceSessionManager } from "../core/workspaceSessionManager";

export interface PlanLifecycleDeps {
  sessionManager: WorkspaceSessionManager;
  getActive: () => {
    processManager: ProcessManager | undefined;
    workspaceRoot: string;
  } | undefined;
  onFullReset?: () => void;
}

export function registerPlanLifecycleCommands(deps: PlanLifecycleDeps): vscode.Disposable[] {
  const { sessionManager, getActive, onFullReset } = deps;

  return [
    vscode.commands.registerCommand("oxveil._openParsedPlan", async (folderUri?: string) => {
      let workspaceRoot: string | undefined;
      if (folderUri) {
        workspaceRoot = vscode.Uri.parse(folderUri).fsPath;
      } else {
        workspaceRoot = sessionManager.getActiveSession()?.workspaceRoot;
      }
      if (!workspaceRoot) return;
      const parsedPath = path.join(workspaceRoot, ".claudeloop", "ai-parsed-plan.md");
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(parsedPath));
        await vscode.window.showTextDocument(doc);
      } catch {
        const planPath = path.join(workspaceRoot, "PLAN.md");
        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(planPath));
          await vscode.window.showTextDocument(doc);
        } catch { /* ignore */ }
      }
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
      try {
        await fs.unlink(path.join(workspaceRoot, ".claudeloop", "ai-parsed-plan.md"));
      } catch {
        // May not exist
      }
    }),
    vscode.commands.registerCommand("oxveil.fullReset", async () => {
      const active = getActive();
      const workspaceRoot = active?.workspaceRoot
        ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showWarningMessage("Oxveil: No workspace open");
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        "This will delete PLAN.md and clear all session state. This cannot be undone.",
        { modal: true },
        "Reset",
      );
      if (confirm !== "Reset") return;

      if (active?.processManager?.isRunning) {
        await active.processManager.stop();
      }

      try {
        await fs.unlink(path.join(workspaceRoot, "PLAN.md"));
      } catch {
        // May not exist
      }

      try {
        await fs.unlink(path.join(workspaceRoot, ".claudeloop", "ai-parsed-plan.md"));
      } catch {
        // May not exist
      }

      const claudeloopDir = path.join(workspaceRoot, ".claudeloop");
      try {
        const entries = await fs.readdir(claudeloopDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === "archive") continue;
          const entryPath = path.join(claudeloopDir, entry.name);
          if (entry.isDirectory()) {
            await fs.rm(entryPath, { recursive: true });
          } else {
            await fs.unlink(entryPath);
          }
        }
      } catch {
        // .claudeloop directory may not exist
      }

      onFullReset?.();
    }),
  ];
}
