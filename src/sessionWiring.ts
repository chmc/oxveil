import * as vscode from "vscode";
import type { SessionState } from "./core/sessionState";
import type { StatusBarManager } from "./views/statusBar";
import type { LiveRunPanel } from "./views/liveRunPanel";
import type { NotificationManager } from "./views/notifications";
import type { ElapsedTimer } from "./views/elapsedTimer";
import type { ProgressState } from "./types";
import type { DependencyGraphPanel } from "./views/dependencyGraph";
import type { ExecutionTimelinePanel } from "./views/executionTimeline";
import type { SidebarPanel } from "./views/sidebarPanel";
import { mapPhases } from "./views/sidebarState";
import type { SidebarState } from "./views/sidebarState";
import type { SidebarMutableState } from "./activateSidebar";
import { deriveStatusBarFromView } from "./views/deriveStatusBar";

export interface SessionWiringDeps {
  session: SessionState;
  statusBar: StatusBarManager;
  liveRunPanel?: LiveRunPanel;
  notifications: NotificationManager;
  elapsedTimer: ElapsedTimer;
  dependencyGraph?: DependencyGraphPanel;
  executionTimeline?: ExecutionTimelinePanel;
  folderUri: string;
  folderName?: string;
  getOtherRootsSummary?: () => string | undefined;
  getConfig?: (key: string) => any;
  isActiveSession: () => boolean;
  sidebarPanel?: SidebarPanel;
  buildSidebarState?: () => SidebarState;
  sidebarMutableState?: SidebarMutableState;
}

export function wireSessionEvents(deps: SessionWiringDeps): void {
  const {
    session,
    statusBar,
    notifications,
    elapsedTimer,
  } = deps;

  let lastProgress: ProgressState | undefined;
  const ms = deps.sidebarMutableState;

  function buildAndSendSidebarState(): void {
    if (!deps.sidebarPanel || !deps.buildSidebarState) return;
    deps.sidebarPanel.updateState(deps.buildSidebarState());
  }

  session.on("state-changed", (_from, to) => {
    if (!deps.isActiveSession()) return;

    vscode.commands.executeCommand(
      "setContext",
      "oxveil.processRunning",
      to === "running",
    );

    // Reset cost/todo/notification tracking on new run
    if (to === "running") {
      if (ms) {
        ms.cost = 0;
        ms.todoDone = 0;
        ms.todoTotal = 0;
      }
      notifications.reset();
      lastProgress = undefined;
    }

    switch (to) {
      case "running": {
        elapsedTimer.start();
        const p = session.progress;
        const currentPhase = p?.currentPhaseIndex !== undefined
          ? (p.phases[p.currentPhaseIndex]?.number as number) ?? 1
          : 1;
        statusBar.update({
          kind: "running",
          currentPhase,
          totalPhases: p?.totalPhases ?? 0,
          elapsed: elapsedTimer.elapsed,
          folderName: deps.folderName,
          otherRootsSummary: deps.getOtherRootsSummary?.(),
        });
        if (deps.liveRunPanel) {
          const autoOpen = deps.getConfig?.("liveRunAutoOpen") ?? true;
          if (autoOpen) {
            deps.liveRunPanel.reveal(p ?? { phases: [], totalPhases: 0 }, deps.folderUri);
          } else {
            // Clear ai-parse status even when not auto-opening the panel
            deps.liveRunPanel.clearAiParseStatus();
          }
        }
        break;
      }
      case "done": {
        elapsedTimer.stop();
        const view = deps.buildSidebarState?.().view;
        if (view === "stopped") {
          statusBar.update({
            kind: "stopped",
            folderName: deps.folderName,
            otherRootsSummary: deps.getOtherRootsSummary?.(),
          });
        } else {
          statusBar.update({
            kind: "done",
            elapsed: elapsedTimer.elapsed,
            folderName: deps.folderName,
            otherRootsSummary: deps.getOtherRootsSummary?.(),
          });
        }
        deps.liveRunPanel?.onRunFinished(view === "stopped" ? "stopped" : "done");
        vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasRun", true);
        break;
      }
      case "failed": {
        elapsedTimer.stop();
        const fp = session.progress?.phases.find(
          (p) => p.status === "failed",
        );
        statusBar.update({
          kind: "failed",
          failedPhase: (fp?.number as number) ?? 0,
          folderName: deps.folderName,
          otherRootsSummary: deps.getOtherRootsSummary?.(),
        });
        deps.liveRunPanel?.onRunFinished("failed");
        break;
      }
      case "idle":
        elapsedTimer.stop();
        if (deps.buildSidebarState) {
          const sidebarState = deps.buildSidebarState();
          statusBar.update(deriveStatusBarFromView(
            sidebarState.view,
            session.progress,
            deps.folderName,
            deps.getOtherRootsSummary?.(),
          ));
        } else {
          statusBar.update({ kind: "idle" });
        }
        break;
    }

    buildAndSendSidebarState();
  });

  session.on("phases-changed", (progress) => {
    if (deps.isActiveSession()) {
      deps.dependencyGraph?.update(progress);
      deps.executionTimeline?.update(progress);
      deps.liveRunPanel?.onProgressChanged(progress);
    }

    if (lastProgress) {
      notifications.onPhasesChanged(lastProgress, progress);
    }
    lastProgress = progress;

    if (deps.isActiveSession() && session.status === "running" && progress.currentPhaseIndex !== undefined) {
      const phase = progress.phases[progress.currentPhaseIndex];
      statusBar.update({
        kind: "running",
        currentPhase: phase?.number as number ?? 1,
        totalPhases: progress.totalPhases,
        elapsed: elapsedTimer.elapsed,
        folderName: deps.folderName,
        otherRootsSummary: deps.getOtherRootsSummary?.(),
      });
    }

    if (deps.sidebarPanel && deps.isActiveSession()) {
      deps.sidebarPanel.sendProgressUpdate({
        phases: mapPhases(progress.phases),
        elapsed: deps.elapsedTimer?.elapsed ?? "0m",
        cost: (ms?.cost ?? 0) > 0 ? `$${ms!.cost.toFixed(2)}` : undefined,
        todos: (ms?.todoTotal ?? 0) > 0 ? { done: ms!.todoDone, total: ms!.todoTotal } : undefined,
        currentPhase: progress.currentPhaseIndex,
      });
    }
  });

  session.on("log-appended", (content) => {
    deps.liveRunPanel?.onLogAppended(content);

    // Extract cost and todo data for sidebar
    if (ms && deps.sidebarPanel && deps.isActiveSession()) {
      const lines = content.split("\n");
      let updated = false;
      for (const line of lines) {
        const costMatch = line.match(/cost=\$([0-9.]+)/);
        if (costMatch) {
          ms.cost += parseFloat(costMatch[1]) || 0;
          updated = true;
        }
        const todoMatch = line.match(/\[Todos:\s*(\d+)\/(\d+)\s+done\]/);
        if (todoMatch) {
          ms.todoDone = parseInt(todoMatch[1], 10);
          ms.todoTotal = parseInt(todoMatch[2], 10);
          updated = true;
        }
      }
      if (updated && session.progress) {
        deps.sidebarPanel.sendProgressUpdate({
          phases: mapPhases(session.progress.phases),
          elapsed: deps.elapsedTimer?.elapsed ?? "0m",
          cost: ms.cost > 0 ? `$${ms.cost.toFixed(2)}` : undefined,
          todos: ms.todoTotal > 0 ? { done: ms.todoDone, total: ms.todoTotal } : undefined,
          currentPhase: session.progress.currentPhaseIndex,
        });
      }
    }
  });
}
