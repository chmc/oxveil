import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import type { WorkspaceSessionManager } from "../core/workspaceSessionManager";
import type { LiveRunPanel } from "../views/liveRunPanel";
import { pickGranularity } from "./granularityPicker";
import { aiParseLoop } from "./aiParseLoop";

export function registerAiParsePlanCommand(
  sessionManager: WorkspaceSessionManager,
  liveRunPanel?: LiveRunPanel,
): vscode.Disposable {
  return vscode.commands.registerCommand("oxveil.aiParsePlan", async () => {
    const active = sessionManager.getActiveSession();
    const processManager = active?.processManager;
    const workspaceRoot = active?.workspaceRoot;
    if (!processManager || !workspaceRoot) return;

    if (!liveRunPanel) return;

    const planPath = path.join(workspaceRoot, "PLAN.md");
    if (!fs.existsSync(planPath)) {
      vscode.window.showErrorMessage(
        "No plan file found. Create a PLAN.md first.",
      );
      return;
    }

    const granularity = await pickGranularity();
    if (!granularity) return;

    const readVerifyReason = async () => {
      const reasonPath = path.join(workspaceRoot, ".claudeloop", "ai-verify-reason.txt");
      return fsp.readFile(reasonPath, "utf-8");
    };

    let outcome: string;
    try {
      const result = await aiParseLoop({
        processManager,
        liveRunPanel,
        granularity,
        readVerifyReason,
      });
      outcome = result.outcome;
    } catch (e: unknown) {
      // Clean up partial ai-parsed-plan.md
      const parsedPath = path.join(workspaceRoot, ".claudeloop", "ai-parsed-plan.md");
      try { await fsp.unlink(parsedPath); } catch { /* may not exist */ }
      const msg = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`Oxveil: AI parsing failed — ${msg}`);
      return;
    }

    if (outcome === "aborted") return;

    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(planPath),
    );
    await vscode.window.showTextDocument(doc);
  });
}
