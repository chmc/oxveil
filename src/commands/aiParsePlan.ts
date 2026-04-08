import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import type { WorkspaceSessionManager } from "../core/workspaceSessionManager";
import { pickGranularity } from "./granularityPicker";

export function registerAiParsePlanCommand(
  sessionManager: WorkspaceSessionManager,
): vscode.Disposable {
  return vscode.commands.registerCommand("oxveil.aiParsePlan", async () => {
    const active = sessionManager.getActiveSession();
    const processManager = active?.processManager;
    const workspaceRoot = active?.workspaceRoot;
    if (!processManager || !workspaceRoot) return;

    const planPath = path.join(workspaceRoot, "PLAN.md");
    if (!fs.existsSync(planPath)) {
      vscode.window.showErrorMessage(
        "No plan file found. Create a PLAN.md first.",
      );
      return;
    }

    const granularity = await pickGranularity();
    if (!granularity) return;

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Parsing plan...",
        },
        () => processManager.aiParse(granularity),
      );

      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(planPath),
      );
      await vscode.window.showTextDocument(doc);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const action = await vscode.window.showErrorMessage(
        `Oxveil: Failed to parse plan — ${msg}`,
        "View Output",
      );
      if (action === "View Output") {
        vscode.commands.executeCommand(
          "workbench.action.output.toggleOutput",
        );
      }
    }
  });
}
