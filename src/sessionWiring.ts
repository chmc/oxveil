import * as vscode from "vscode";
import type { SessionState } from "./core/sessionState";
import type { StatusBarManager } from "./views/statusBar";
import type { LiveRunPanel } from "./views/liveRunPanel";
import type { NotificationManager } from "./views/notifications";
import type { ElapsedTimer } from "./views/elapsedTimer";
import type { ProgressState, DetectionStatus } from "./types";
import type { DependencyGraphPanel } from "./views/dependencyGraph";
import type { ExecutionTimelinePanel } from "./views/executionTimeline";
import type { SidebarPanel } from "./views/sidebarPanel";
import { deriveViewState, mapPhases } from "./views/sidebarState";
import type { ArchiveView } from "./views/sidebarState";

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
  detectionStatus?: DetectionStatus;
  planDetected?: boolean;
  planFilename?: string;
  getArchives?: () => ArchiveView[];
}

export function wireSessionEvents(deps: SessionWiringDeps): void {
  const {
    session,
    statusBar,
    notifications,
    elapsedTimer,
  } = deps;

  let lastProgress: ProgressState | undefined;
  let sidebarCost = 0;
  let sidebarTodoDone = 0;
  let sidebarTodoTotal = 0;

  function buildAndSendSidebarState(sessionStatus: string): void {
    if (!deps.sidebarPanel) return;
    const viewState = deriveViewState(
      deps.detectionStatus ?? "detected",
      sessionStatus as any,
      deps.planDetected ?? false,
      session.progress,
    );
    deps.sidebarPanel.updateState({
      view: viewState,
      plan: session.progress ? {
        filename: deps.planFilename ?? "PLAN.md",
        phases: mapPhases(session.progress.phases),
      } : undefined,
      session: sessionStatus === "running" || sessionStatus === "done" || sessionStatus === "failed" ? {
        elapsed: deps.elapsedTimer?.elapsed ?? "0m",
        cost: sidebarCost > 0 ? `$${sidebarCost.toFixed(2)}` : undefined,
        todos: sidebarTodoTotal > 0 ? { done: sidebarTodoDone, total: sidebarTodoTotal } : undefined,
      } : undefined,
      archives: deps.getArchives?.() ?? [],
    });
  }

  session.on("state-changed", (_from, to) => {
    if (!deps.isActiveSession()) return;

    vscode.commands.executeCommand(
      "setContext",
      "oxveil.processRunning",
      to === "running",
    );

    // Reset cost/todo tracking on new run
    if (to === "running") {
      sidebarCost = 0;
      sidebarTodoDone = 0;
      sidebarTodoTotal = 0;
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
          }
        }
        break;
      }
      case "done":
        elapsedTimer.stop();
        statusBar.update({
          kind: "done",
          elapsed: elapsedTimer.elapsed,
          folderName: deps.folderName,
          otherRootsSummary: deps.getOtherRootsSummary?.(),
        });
        deps.liveRunPanel?.onRunFinished("done");
        vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasRun", true);
        break;
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
        statusBar.update({ kind: "idle" });
        break;
    }

    buildAndSendSidebarState(to);
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
        cost: sidebarCost > 0 ? `$${sidebarCost.toFixed(2)}` : undefined,
        todos: sidebarTodoTotal > 0 ? { done: sidebarTodoDone, total: sidebarTodoTotal } : undefined,
        currentPhase: progress.currentPhaseIndex,
      });
    }
  });

  session.on("log-appended", (content) => {
    deps.liveRunPanel?.onLogAppended(content);

    // Extract cost and todo data for sidebar
    if (deps.sidebarPanel && deps.isActiveSession()) {
      const lines = content.split("\n");
      let updated = false;
      for (const line of lines) {
        const costMatch = line.match(/cost=\$([0-9.]+)/);
        if (costMatch) {
          sidebarCost += parseFloat(costMatch[1]) || 0;
          updated = true;
        }
        const todoMatch = line.match(/\[Todos:\s*(\d+)\/(\d+)\s+done\]/);
        if (todoMatch) {
          sidebarTodoDone = parseInt(todoMatch[1], 10);
          sidebarTodoTotal = parseInt(todoMatch[2], 10);
          updated = true;
        }
      }
      if (updated && session.progress) {
        deps.sidebarPanel.sendProgressUpdate({
          phases: mapPhases(session.progress.phases),
          elapsed: deps.elapsedTimer?.elapsed ?? "0m",
          cost: sidebarCost > 0 ? `$${sidebarCost.toFixed(2)}` : undefined,
          todos: sidebarTodoTotal > 0 ? { done: sidebarTodoDone, total: sidebarTodoTotal } : undefined,
          currentPhase: session.progress.currentPhaseIndex,
        });
      }
    }
  });
}
