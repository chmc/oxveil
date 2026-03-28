import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";

export function registerCreatePlanCommand(
  getWorkspaceRoot: () => string | undefined,
): vscode.Disposable {
  return vscode.commands.registerCommand("oxveil.createPlan", async () => {
    const workspaceRoot = getWorkspaceRoot();
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
  });
}
