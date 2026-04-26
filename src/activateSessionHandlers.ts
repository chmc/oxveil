import * as vscode from "vscode";
import type { PlanChatSession } from "./core/planChatSession";
import type { SelfImprovementSession } from "./core/selfImprovementSession";
import type { PlanPreviewPanel } from "./views/planPreviewPanel";
import type { WorkspaceSessionManager } from "./core/workspaceSessionManager";
import type { DependencyGraphPanel } from "./views/dependencyGraph";
import type { ExecutionTimelinePanel } from "./views/executionTimeline";
import type { LiveRunPanel } from "./views/liveRunPanel";
import type { SidebarPanel } from "./views/sidebarPanel";
import type { SidebarState } from "./views/sidebarState";
import type { StatusBarManager } from "./views/statusBar";
import { ElapsedTimer } from "./views/elapsedTimer";

export interface ElapsedTimerDeps {
  manager: WorkspaceSessionManager;
  statusBar: StatusBarManager;
}

/**
 * Creates an ElapsedTimer that updates the status bar during running sessions.
 */
export function createElapsedTimer(deps: ElapsedTimerDeps): ElapsedTimer {
  return new ElapsedTimer((elapsed) => {
    const active = deps.manager.getActiveSession();
    if (active?.sessionState.status === "running") {
      const p = active.sessionState.progress;
      const currentPhase = p?.currentPhaseIndex !== undefined
        ? (p.phases[p.currentPhaseIndex]?.number as number) ?? 1
        : 1;
      deps.statusBar.update({
        kind: "running",
        currentPhase,
        totalPhases: p?.totalPhases ?? 0,
        elapsed,
      });
    }
  });
}

export interface TerminalHandlerDeps {
  getActivePlanChatSession: () => PlanChatSession | undefined;
  setActivePlanChatSession: (session: PlanChatSession | undefined) => void;
  planPreviewPanel: PlanPreviewPanel;
  onPlanChatEnded: () => void;
}

/**
 * Creates a terminal close handler that tracks plan chat session lifecycle.
 */
export function createTerminalCloseHandler(deps: TerminalHandlerDeps): vscode.Disposable {
  return vscode.window.onDidCloseTerminal((terminal) => {
    const session = deps.getActivePlanChatSession();
    if (session?.matchesTerminal(terminal)) {
      deps.setActivePlanChatSession(undefined);
      deps.planPreviewPanel.setSessionActive(false);
      deps.planPreviewPanel.endSession();
      deps.onPlanChatEnded();
      vscode.commands.executeCommand("setContext", "oxveil.planChatActive", false);
    }
  });
}

export interface SelfImprovementTerminalHandlerDeps {
  getActiveSelfImprovementSession: () => SelfImprovementSession | undefined;
  setActiveSelfImprovementSession: (session: SelfImprovementSession | undefined) => void;
  setSelfImprovementActive: (active: boolean) => void;
  refreshSidebar: () => void;
}

/**
 * Creates a terminal close handler that tracks self-improvement session lifecycle.
 * When terminal closes, resets selfImprovementActive to transition sidebar back to completed view.
 */
export function createSelfImprovementTerminalCloseHandler(
  deps: SelfImprovementTerminalHandlerDeps,
): vscode.Disposable {
  return vscode.window.onDidCloseTerminal((terminal) => {
    const session = deps.getActiveSelfImprovementSession();
    if (session?.matchesTerminal(terminal)) {
      deps.setActiveSelfImprovementSession(undefined);
      deps.setSelfImprovementActive(false);
      deps.refreshSidebar();
    }
  });
}

/**
 * Creates a test annotation command for visual verification.
 */
export function createTestAnnotationCommand(
  getActivePlanChatSession: () => PlanChatSession | undefined,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "oxveil._testAnnotation",
    (args: { phase: string; text: string }) => {
      if (!args?.phase || !args?.text) return;
      const session = getActivePlanChatSession();
      if (!session) {
        vscode.window.showWarningMessage("No active Plan Chat session. Start Plan Chat first.");
        return;
      }
      session.sendAnnotation(args.phase, args.text);
      session.focusTerminal();
    },
  );
}

export interface SessionChangeHandlerDeps {
  sidebarPanel: SidebarPanel;
  buildFullState: () => SidebarState;
  dependencyGraph: DependencyGraphPanel;
  executionTimeline: ExecutionTimelinePanel;
  liveRunPanel: LiveRunPanel;
}

/**
 * Sets up the active session change handler on the workspace manager.
 */
export function setupSessionChangeHandler(
  manager: WorkspaceSessionManager,
  deps: SessionChangeHandlerDeps,
): void {
  manager.on("active-session-changed", (session) => {
    deps.sidebarPanel.updateState(deps.buildFullState());

    if (!session) return;
    const folderUri = session.folderUri;
    if (deps.dependencyGraph?.visible && deps.dependencyGraph.currentFolderUri !== folderUri) {
      deps.dependencyGraph.reveal(session.sessionState.progress, folderUri);
    }
    if (deps.executionTimeline?.visible && deps.executionTimeline.currentFolderUri !== folderUri) {
      deps.executionTimeline.reveal(session.sessionState.progress, folderUri);
    }
    if (deps.liveRunPanel?.visible && deps.liveRunPanel.currentFolderUri !== folderUri) {
      deps.liveRunPanel.reveal(
        session.sessionState.progress ?? { phases: [], totalPhases: 0 },
        folderUri,
      );
    }
  });
}
