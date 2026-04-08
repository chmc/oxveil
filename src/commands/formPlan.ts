import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { pickGranularity } from "./granularityPicker";
import { parsePlan } from "../parsers/plan";
import type { IProcessManager } from "../core/interfaces";

export interface FormPlanCommandDeps {
  resolveFolder: () => Promise<
    | { workspaceRoot: string; processManager: IProcessManager }
    | undefined
  >;
  getActivePreviewFile: () => string | undefined;
}

export function registerFormPlanCommand(
  deps: FormPlanCommandDeps,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "oxveil.formPlan",
    async (arg?: { filePath?: string }) => {
      // 1. Determine source file
      const filePath = arg?.filePath ?? deps.getActivePreviewFile();
      if (!filePath) {
        vscode.window.showErrorMessage(
          "Oxveil: No plan file available. Open a plan in Plan Preview first.",
        );
        return;
      }

      // 2. Resolve workspace + processManager
      const resolved = await deps.resolveFolder();
      if (!resolved) {
        vscode.window.showWarningMessage("Oxveil: No workspace open");
        return;
      }

      const { workspaceRoot, processManager } = resolved;

      // 3. Read source content (keep for retry)
      let sourceContent: string;
      try {
        sourceContent = await fs.readFile(filePath, "utf-8");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(
          `Oxveil: Failed to read ${path.basename(filePath)} — ${msg}`,
        );
        return;
      }

      // 4. Check for existing PLAN.md
      const planPath = path.join(workspaceRoot, "PLAN.md");
      try {
        await fs.access(planPath);
        const confirm = await vscode.window.showWarningMessage(
          "PLAN.md already exists. Replace?",
          { modal: true },
          "Replace",
        );
        if (confirm !== "Replace") return;
      } catch {
        // File doesn't exist — proceed
      }

      // 5. Write source to PLAN.md + run ai-parse loop
      await formPlanLoop(
        sourceContent,
        planPath,
        processManager,
      );
    },
  );
}

async function formPlanLoop(
  sourceContent: string,
  planPath: string,
  processManager: IProcessManager,
): Promise<void> {
  // Write source content to PLAN.md (fresh on each attempt)
  await fs.writeFile(planPath, sourceContent, "utf-8");
  await vscode.commands.executeCommand(
    "setContext",
    "oxveil.walkthrough.hasPlan",
    true,
  );

  // Show granularity picker
  const granularity = await pickGranularity();
  if (!granularity) {
    // User cancelled — open the raw plan
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(planPath),
    );
    await vscode.window.showTextDocument(doc);
    return;
  }

  // Run ai-parse
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Forming claudeloop plan...",
      },
      () => processManager.aiParse(granularity),
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const action = await vscode.window.showErrorMessage(
      `Oxveil: Failed to form plan — ${msg}`,
      "Retry",
      "View Output",
    );
    if (action === "Retry") {
      return formPlanLoop(sourceContent, planPath, processManager);
    }
    if (action === "View Output") {
      vscode.commands.executeCommand(
        "workbench.action.output.toggleOutput",
      );
    }
    return;
  }

  // Validate result
  const resultContent = await fs.readFile(planPath, "utf-8");
  const parsed = parsePlan(resultContent);

  if (parsed.phases.length === 0) {
    const action = await vscode.window.showWarningMessage(
      "Plan formed but no valid phases detected. Try a different granularity?",
      "Retry",
      "Open PLAN.md",
    );
    if (action === "Retry") {
      return formPlanLoop(sourceContent, planPath, processManager);
    }
  }

  // Open result in editor
  const doc = await vscode.workspace.openTextDocument(
    vscode.Uri.file(planPath),
  );
  await vscode.window.showTextDocument(doc);
}
