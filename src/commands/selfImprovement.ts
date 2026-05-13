import * as vscode from "vscode";
import { SelfImprovementSession, resolveClaudeModel } from "../core/selfImprovementSession";
import type { SelfImprovementPanel } from "../views/selfImprovementPanel";
import type { SidebarMutableState } from "../activateSidebar";
import type { Lesson } from "../types";
import { findLessonsContent } from "../sessionWiring";
import { parseLessons } from "../parsers/lessons";

export interface SelfImprovementCommandDeps {
  claudePath: string | null | undefined;
  provider?: "claude" | "opencode";
  opencodePath?: string | null;
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
    vscode.commands.registerCommand("oxveil.selfImprovement.start", async (lessonsArg?: Lesson[]) => {
      if (deps.provider === "opencode") {
        if (!deps.opencodePath) {
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
      const existingSession = deps.getActiveSelfImprovementSession?.();
      if (existingSession?.isActive()) {
        vscode.window.showInformationMessage("Self-improvement session already active");
        existingSession.focusTerminal();
        return;
      }

      const panel = deps.getSelfImprovementPanel();
      let lessons = lessonsArg ?? panel?.currentLessons ?? [];
      let fromDisk = false;
      if (lessons.length === 0) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
          const foundContent = await findLessonsContent(workspaceRoot);
          if (foundContent) {
            lessons = parseLessons(foundContent);
            fromDisk = true;
          }
        }
      }
      if (lessons.length === 0) {
        vscode.window.showWarningMessage("Oxveil: No lessons captured for this session");
        return;
      }

      // If called with lessons (external trigger) or loaded from disk, reveal panel and wait for user action
      if ((lessonsArg || fromDisk) && panel) {
        panel.reveal(lessons);
        return; // User clicks Start/Skip in panel
      }

      const claudeModel = resolveClaudeModel(
        process.env.OXVEIL_CLAUDE_MODEL,
        deps.extensionMode,
      );
      const config = vscode.workspace.getConfiguration("oxveil");
      const allowSkipPermissions = config.get<boolean>("selfImprovement.allowSkipPermissions", false);
      const session = new SelfImprovementSession({
        createTerminal: (opts) => vscode.window.createTerminal(opts as vscode.TerminalOptions),
        claudePath: deps.claudePath ?? "",
        claudeModel,
        allowSkipPermissions,
        provider: deps.provider,
        opencodePath: deps.opencodePath ?? undefined,
      });
      session.start(lessons);

      deps.onSelfImprovementSessionCreated?.(session);
    }),

    vscode.commands.registerCommand("oxveil.selfImprovement.skip", () => {
      const ms = deps.getMutableState();
      if (ms) {
        ms.setSelfImprovementActive(false);
      }

      const panel = deps.getSelfImprovementPanel();
      panel?.close();

      deps.refreshSidebar();
    }),

    vscode.commands.registerCommand("oxveil.selfImprovement.focus", () => {
      const panel = deps.getSelfImprovementPanel();
      if (panel?.visible) {
        // Panel already has lessons from reveal() call - just reveal it again to focus
        panel.panel?.reveal();
      } else {
        // Panel not visible - need lessons to reveal
        vscode.window.showWarningMessage("Oxveil: No self-improvement session active");
      }
    }),
  ];
}
