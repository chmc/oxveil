import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import type { WorkspaceSessionManager } from "../core/workspaceSessionManager";
import { getPlanPath, ensureClaudeloopDir } from "../core/paths";

export function registerWritePlanCommand(
  sessionManager: WorkspaceSessionManager,
): vscode.Disposable {
  return vscode.commands.registerCommand("oxveil.writePlan", async () => {
    const active = sessionManager.getActiveSession();
    const workspaceRoot = active?.workspaceRoot;
    if (!workspaceRoot) {
      vscode.window.showWarningMessage("Oxveil: No workspace open");
      return;
    }
    const planPath = getPlanPath(workspaceRoot, active?.planFileOverride);
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
    await ensureClaudeloopDir(workspaceRoot);
    await fs.writeFile(planPath, template, "utf-8");
    await vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", true);
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(planPath));
    await vscode.window.showTextDocument(doc);
  });
}
