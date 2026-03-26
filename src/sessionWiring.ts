import * as vscode from "vscode";
import type { SessionState } from "./core/sessionState";
import type { StatusBarManager } from "./views/statusBar";
import type { PhaseTreeProvider } from "./views/phaseTree";
import type { OutputChannelManager } from "./views/outputChannel";
import type { NotificationManager } from "./views/notifications";
import type { ElapsedTimer } from "./views/elapsedTimer";
import type { ProgressState } from "./types";

export interface SessionWiringDeps {
  session: SessionState;
  statusBar: StatusBarManager;
  phaseTree: PhaseTreeProvider;
  onDidChangeTreeData: vscode.EventEmitter<string | undefined>;
  outputManager: OutputChannelManager;
  notifications: NotificationManager;
  elapsedTimer: ElapsedTimer;
}

export function wireSessionEvents(deps: SessionWiringDeps): void {
  const {
    session,
    statusBar,
    phaseTree,
    onDidChangeTreeData,
    outputManager,
    notifications,
    elapsedTimer,
  } = deps;

  let lastProgress: ProgressState | undefined;

  session.on("state-changed", (_from, to) => {
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
        });
        break;
      }
      case "done":
        elapsedTimer.stop();
        statusBar.update({ kind: "done", elapsed: elapsedTimer.elapsed });
        break;
      case "failed": {
        elapsedTimer.stop();
        const fp = session.progress?.phases.find(
          (p) => p.status === "failed",
        );
        statusBar.update({
          kind: "failed",
          failedPhase: (fp?.number as number) ?? 0,
        });
        break;
      }
      case "idle":
        elapsedTimer.stop();
        statusBar.update({ kind: "idle" });
        break;
    }
  });

  session.on("phases-changed", (progress) => {
    phaseTree.update({ progress });
    onDidChangeTreeData.fire(undefined);

    if (lastProgress) {
      notifications.onPhasesChanged(lastProgress, progress);
    }
    lastProgress = progress;

    if (session.status === "running" && progress.currentPhaseIndex !== undefined) {
      const phase = progress.phases[progress.currentPhaseIndex];
      statusBar.update({
        kind: "running",
        currentPhase: phase?.number as number ?? 1,
        totalPhases: progress.totalPhases,
        elapsed: elapsedTimer.elapsed,
      });
    }
  });

  session.on("log-appended", (content) => {
    outputManager.onLogAppended(content);
  });
}
