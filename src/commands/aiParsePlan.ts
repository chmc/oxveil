import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import type { WorkspaceSessionManager } from "../core/workspaceSessionManager";

interface GranularityItem extends vscode.QuickPickItem {
  value: string;
}

const GRANULARITY_ITEMS: GranularityItem[] = [
  {
    label: "Coarse — 3-5 phases",
    description:
      "High-level phases. Good for small tasks or quick iterations.",
    value: "coarse",
  },
  {
    label: "Medium — 5-10 phases (default)",
    description:
      "Balanced breakdown. Each phase is a meaningful unit of work.",
    value: "medium",
  },
  {
    label: "Fine — 10-20 phases",
    description:
      "Granular phases. Best for complex tasks requiring careful monitoring.",
    value: "fine",
  },
  {
    label: "Custom...",
    description: "Enter a custom prompt to guide phase generation.",
    value: "custom",
  },
];

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

    const picked = await vscode.window.showQuickPick(GRANULARITY_ITEMS, {
      placeHolder: "Select parse granularity...",
    });
    if (!picked) return;

    let granularity = picked.value;
    if (granularity === "custom") {
      const custom = await vscode.window.showInputBox({
        prompt: "Enter custom granularity prompt",
      });
      if (!custom) return;
      granularity = custom;
    }

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
