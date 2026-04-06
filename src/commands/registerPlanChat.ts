import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import { PlanChatSession } from "../core/planChatSession";
import type { PlanPreviewPanel } from "../views/planPreviewPanel";
import { buildSystemPrompt, handleExistingPlan } from "./planChat";

export interface PlanChatCommandDeps {
  claudePath: string | null | undefined;
  getWorkspaceRoot: () => string | undefined;
  getActivePlanChatSession?: () => PlanChatSession | undefined;
  onPlanChatSessionCreated?: (session: PlanChatSession) => void;
  planPreviewPanel?: PlanPreviewPanel;
}

export function registerPlanChatCommand(deps: PlanChatCommandDeps): vscode.Disposable {
  return vscode.commands.registerCommand("oxveil.openPlanChat", async () => {
    if (!deps.claudePath) {
      vscode.window.showErrorMessage(
        "Oxveil: Claude CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-cli",
      );
      return;
    }

    // Prevent duplicate sessions
    const existingSession = deps.getActivePlanChatSession?.();
    if (existingSession?.isActive()) {
      vscode.window.showInformationMessage("Plan Chat session already active");
      existingSession.focusTerminal();
      return;
    }

    // Check for existing PLAN.md
    const workspaceRoot = deps.getWorkspaceRoot();
    if (workspaceRoot) {
      const planPath = path.join(workspaceRoot, "PLAN.md");
      if (fs.existsSync(planPath)) {
        const action = await handleExistingPlan((items) =>
          vscode.window.showQuickPick(items, {
            placeHolder: "A PLAN.md already exists",
          }) as any,
        );
        if (action === "cancel") return;
        if (action === "create") {
          fs.renameSync(planPath, `${planPath}.bak`);
        }
        // "edit" — continue with existing plan
      }
    }

    const session = new PlanChatSession({
      createTerminal: (opts) => vscode.window.createTerminal(opts as any),
      claudePath: deps.claudePath,
    });
    session.start(buildSystemPrompt());

    deps.onPlanChatSessionCreated?.(session);

    deps.planPreviewPanel?.reveal();
    await deps.planPreviewPanel?.onFileChanged();
  });
}
