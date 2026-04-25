import * as vscode from "vscode";
import { SelfImprovementSession, resolveClaudeModel } from "../core/selfImprovementSession";
import type { SelfImprovementPanel } from "../views/selfImprovementPanel";
import type { SidebarMutableState } from "../activateSidebar";

export interface SelfImprovementCommandDeps {
  claudePath: string | null | undefined;
  extensionMode?: number;
  getSelfImprovementPanel: () => SelfImprovementPanel | undefined;
  getMutableState: () => SidebarMutableState | undefined;
  refreshSidebar: () => void;
  getActiveSelfImprovementSession?: () => SelfImprovementSession | undefined;
  onSelfImprovementSessionCreated?: (session: SelfImprovementSession) => void;
}

export function registerSelfImprovementCommands(
  deps: SelfImprovementCommandDeps,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("oxveil.selfImprovement.start", () => {
      if (!deps.claudePath) {
        vscode.window.showErrorMessage(
          "Oxveil: Claude CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-cli",
        );
        return;
      }

      // Prevent duplicate sessions
      const existingSession = deps.getActiveSelfImprovementSession?.();
      if (existingSession?.isActive()) {
        vscode.window.showInformationMessage("Self-improvement session already active");
        existingSession.focusTerminal();
        return;
      }

      const panel = deps.getSelfImprovementPanel();
      const lessons = panel?.currentLessons ?? [];
      if (lessons.length === 0) {
        vscode.window.showWarningMessage("Oxveil: No lessons captured for this session");
        return;
      }

      const claudeModel = resolveClaudeModel(
        process.env.OXVEIL_CLAUDE_MODEL,
        deps.extensionMode,
      );
      const session = new SelfImprovementSession({
        createTerminal: (opts) => vscode.window.createTerminal(opts as vscode.TerminalOptions),
        claudePath: deps.claudePath,
        claudeModel,
      });
      session.start(lessons);

      deps.onSelfImprovementSessionCreated?.(session);
    }),

    vscode.commands.registerCommand("oxveil.selfImprovement.skip", () => {
      const ms = deps.getMutableState();
      if (ms) {
        ms.selfImprovementActive = false;
      }

      const panel = deps.getSelfImprovementPanel();
      panel?.close();

      deps.refreshSidebar();
    }),
  ];
}
