import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { pickGranularity } from "./granularityPicker";
import { parsePlan } from "../parsers/plan";
import type { IProcessManager } from "../core/interfaces";
import type { LiveRunPanel } from "../views/liveRunPanel";
import type { NotificationManager } from "../views/notifications";
import { aiParseLoop, type AiParseLoopResult } from "./aiParseLoop";

export interface FormPlanCommandDeps {
  resolveFolder: () => Promise<
    | { workspaceRoot: string; processManager: IProcessManager; liveRunPanel?: LiveRunPanel }
    | undefined
  >;
  getActivePreviewFile: () => string | undefined;
  onPlanFormed?: () => void | Promise<void>;
  notificationManager?: NotificationManager;
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

      const { workspaceRoot, processManager, liveRunPanel } = resolved;
      if (!liveRunPanel) return;

      // 3. Read source content
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

      // 5. Write source to PLAN.md
      await fs.writeFile(planPath, sourceContent, "utf-8");
      await vscode.commands.executeCommand(
        "setContext",
        "oxveil.walkthrough.hasPlan",
        true,
      );

      // 6. Show granularity picker
      const granularity = await pickGranularity();
      if (!granularity) {
        // User cancelled — open the raw plan
        const doc = await vscode.workspace.openTextDocument(
          vscode.Uri.file(planPath),
        );
        await vscode.window.showTextDocument(doc);
        return;
      }

      // 7. Run ai-parse loop
      const parsedPlanPath = path.join(workspaceRoot, ".claudeloop", "ai-parsed-plan.md");

      const readVerifyReason = async () => {
        const reasonPath = path.join(workspaceRoot, ".claudeloop", "ai-verify-reason.txt");
        return fs.readFile(reasonPath, "utf-8");
      };

      let outcome: AiParseLoopResult["outcome"];
      try {
        const result = await aiParseLoop({
          processManager,
          liveRunPanel,
          granularity,
          readVerifyReason,
          options: { dryRun: true },
          notificationManager: deps.notificationManager,
          parsedPlanPath,
        });
        outcome = result.outcome;
      } catch {
        // Clean up partial ai-parsed-plan.md if claudeloop wrote one before crashing
        try { await fs.unlink(parsedPlanPath); } catch { /* may not exist */ }
        // Fall through to validation — claudeloop will re-parse on Start
        outcome = "pass";
      }

      if (outcome === "aborted") return;

      // 8. Validate result
      let resultPath = planPath;
      let resultContent: string;
      try {
        resultContent = await fs.readFile(parsedPlanPath, "utf-8");
        resultPath = parsedPlanPath;
      } catch {
        // Fallback to PLAN.md if ai-parsed-plan.md doesn't exist (dry-run mode or error)
        resultContent = await fs.readFile(planPath, "utf-8");
      }

      const parsed = parsePlan(resultContent);

      if (parsed.phases.length === 0) {
        await vscode.window.showWarningMessage(
          "Plan formed but no valid phases detected. Claudeloop will re-parse on start.",
          "OK",
        );
        // Still signal plan formed so sidebar transitions to Ready
        deps.onPlanFormed?.();
      } else {
        // Ensure ai-parsed-plan.md exists for claudeloop execution
        if (resultPath === planPath) {
          const claudeloopDir = path.join(workspaceRoot, ".claudeloop");
          await fs.mkdir(claudeloopDir, { recursive: true });
          await fs.writeFile(parsedPlanPath, resultContent, "utf-8");
        }
        // Signal success — sidebar transitions to Ready with phases
        deps.onPlanFormed?.();
      }

      // Open result in editor
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(resultPath),
      );
      await vscode.window.showTextDocument(doc);
    },
  );
}
