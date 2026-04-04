import * as vscode from "vscode";
import type { SessionState } from "./core/sessionState";
import type { StatusBarManager } from "./views/statusBar";
import type { PhaseTreeProvider } from "./views/phaseTree";
import type { LiveRunPanel } from "./views/liveRunPanel";
import type { NotificationManager } from "./views/notifications";
import type { ElapsedTimer } from "./views/elapsedTimer";
import type { ProgressState } from "./types";
import type { DependencyGraphPanel } from "./views/dependencyGraph";
import type { ExecutionTimelinePanel } from "./views/executionTimeline";

export interface SessionWiringDeps {
  session: SessionState;
  statusBar: StatusBarManager;
  phaseTree: PhaseTreeProvider;
  onDidChangeTreeData: vscode.EventEmitter<string | undefined>;
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
}

export function wireSessionEvents(deps: SessionWiringDeps): void {
  const {
    session,
    statusBar,
    phaseTree,
    onDidChangeTreeData,
    notifications,
    elapsedTimer,
  } = deps;

  let lastProgress: ProgressState | undefined;

  session.on("state-changed", (_from, to) => {
    if (!deps.isActiveSession()) return;

    vscode.commands.executeCommand(
      "setContext",
      "oxveil.processRunning",
      to === "running",
    );

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
  });

  session.on("phases-changed", (progress) => {
    if (deps.isActiveSession()) {
      phaseTree.update(deps.folderUri, deps.folderName ?? "", progress);
      onDidChangeTreeData.fire(undefined);
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
  });

  session.on("log-appended", (content) => {
    deps.liveRunPanel?.onLogAppended(content);
  });
}
