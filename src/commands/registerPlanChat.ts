import * as path from "node:path";
import * as vscode from "vscode";
import { PlanChatSession } from "../core/planChatSession";
import type { PlanPreviewPanel } from "../views/planPreviewPanel";
import { buildSystemPrompt, resolveClaudeModel } from "./planChat";

export interface PlanChatCommandDeps {
  claudePath: string | null | undefined;
  getWorkspaceRoot: () => string | undefined;
  getActivePlanChatSession?: () => PlanChatSession | undefined;
  onPlanChatSessionCreated?: (session: PlanChatSession) => void;
  planPreviewPanel?: PlanPreviewPanel;
  extensionMode?: number;
}

export function registerPlanChatCommand(deps: PlanChatCommandDeps): vscode.Disposable {
  return vscode.commands.registerCommand("oxveil.openPlanChat", async () => {
    const config = vscode.workspace.getConfiguration("oxveil");
    const provider = config.get<"claude" | "opencode">("provider", "claude");
    const opencodePath = config.get<string>("opencodePath", "");

    if (provider === "opencode") {
      if (!opencodePath) {
        vscode.window.showErrorMessage(
          "Oxveil: OpenCode path not configured. Set oxveil.opencodePath in settings.",
        );
        return;
      }
    } else {
      if (!deps.claudePath) {
        vscode.window.showErrorMessage(
          "Oxveil: Claude CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-cli",
        );
        return;
      }
    }

    // Prevent duplicate sessions
    const existingSession = deps.getActivePlanChatSession?.();
    if (existingSession?.isActive()) {
      vscode.window.showInformationMessage("Plan Chat session already active");
      existingSession.focusTerminal();
      return;
    }

    const claudeModel = resolveClaudeModel(
      process.env.OXVEIL_CLAUDE_MODEL,
      deps.extensionMode,
    );
    const allowSkipPermissions = config.get<boolean>("planChat.allowSkipPermissions", false);
    const workspaceRoot = deps.getWorkspaceRoot();
    const markerPath = workspaceRoot
      ? path.join(workspaceRoot, ".claude", "oxveil-plan-active")
      : undefined;
    const session = new PlanChatSession({
      createTerminal: (opts) => vscode.window.createTerminal(opts as any),
      claudePath: deps.claudePath ?? "",
      claudeModel,
      allowSkipPermissions,
      provider,
      opencodePath,
      markerPath,
    });
    deps.planPreviewPanel?.beginSession();
    session.start(buildSystemPrompt());

    deps.onPlanChatSessionCreated?.(session);

    deps.planPreviewPanel?.reveal();
    await deps.planPreviewPanel?.onFileChanged();
  });
}
