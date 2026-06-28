import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { pickGranularity } from "./granularityPicker";
import { parsePlan } from "../parsers/plan";
import type { IProcessManager } from "../core/interfaces";
import type { LiveRunPanel } from "../views/liveRunPanel";
import type { NotificationManager } from "../views/notifications";
import { aiParseLoop, type AiParseLoopResult } from "./aiParseLoop";
import { getPlanPath } from "../core/paths";

export interface FormPlanCommandDeps {
  resolveFolder: () => Promise<
    | { workspaceRoot: string; processManager: IProcessManager; liveRunPanel?: LiveRunPanel; planFileOverride?: string }
    | undefined
  >;
  getActivePreviewFile: () => string | undefined;
  onPlanFormed?: () => void | Promise<void>;
  notificationManager?: NotificationManager;
  onAiParseStarted?: () => void;
  onAiParseEnded?: (skipRefresh?: boolean) => void;
  isAiParsing?: () => boolean;
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

      const { workspaceRoot, processManager, liveRunPanel, planFileOverride } = resolved;
      if (!liveRunPanel) return;

      // Guard against concurrent AI parse calls
      if (deps.isAiParsing?.()) {
        vscode.window.showWarningMessage("Oxveil: AI parsing already in progress");
        return;
      }

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

      // 4. Check for existing plan file
      const planPath = getPlanPath(workspaceRoot, planFileOverride);
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

      // 5. Write source to PLAN.md (.claudeloop/ may not exist in fresh worktrees)
      await fs.mkdir(path.dirname(planPath), { recursive: true });
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
      let planFormedCompleted = false;
      deps.onAiParseStarted?.();
      try {
        try {
          const result = await aiParseLoop({
            processManager,
            liveRunPanel,
            granularity,
            readVerifyReason,
            options: { dryRun: true, planFile: planPath },
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
          await deps.onPlanFormed?.();
          planFormedCompleted = true;
        } else {
          // Ensure ai-parsed-plan.md exists for claudeloop execution
          if (resultPath === planPath) {
            const claudeloopDir = path.join(workspaceRoot, ".claudeloop");
            await fs.mkdir(claudeloopDir, { recursive: true });
            await fs.writeFile(parsedPlanPath, resultContent, "utf-8");
          }
          // Signal success — sidebar transitions to Ready with phases
          await deps.onPlanFormed?.();
          planFormedCompleted = true;
        }

        // Open result in editor
        const doc = await vscode.workspace.openTextDocument(
          vscode.Uri.file(resultPath),
        );
        await vscode.window.showTextDocument(doc);
      } finally {
        deps.onAiParseEnded?.(planFormedCompleted);
      }
    },
  );
}
