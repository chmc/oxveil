import * as vscode from "vscode";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
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
import { renderPhaseList } from "./views/sidebarPhaseHelpers";
import type { SidebarState } from "./views/sidebarState";
import type { SidebarMutableState } from "./activateSidebar";
import { deriveStatusBarFromView } from "./views/deriveStatusBar";
import { parseLessons } from "./parsers/lessons";
import type { SelfImprovementPanel } from "./views/selfImprovementPanel";
import type { PlanPreviewPanel } from "./views/planPreviewPanel";

/**
 * Find lessons.md in .claudeloop or the most recent archive.
 * Claudeloop archives files immediately on completion, so lessons.md
 * may have been moved to archive before the "done" event fires.
 */
export async function findLessonsContent(folderPath: string): Promise<string | null> {
  const claudeloopDir = join(folderPath, ".claudeloop");

  // Try .claudeloop/lessons.md first
  try {
    return await readFile(join(claudeloopDir, "lessons.md"), "utf-8");
  } catch {
    // Not in main directory, check archive
  }

  // Find most recent archive
  const archiveDir = join(claudeloopDir, "archive");
  try {
    const entries = await readdir(archiveDir);
    const archiveDirs = [];
    for (const entry of entries) {
      const entryPath = join(archiveDir, entry);
      const s = await stat(entryPath).catch(() => null);
      if (s?.isDirectory()) {
        archiveDirs.push({ name: entry, mtime: s.mtimeMs });
      }
    }
    // Sort by mtime descending (most recent first)
    archiveDirs.sort((a, b) => b.mtime - a.mtime);
    if (archiveDirs.length > 0) {
      const mostRecent = archiveDirs[0].name;
      return await readFile(join(archiveDir, mostRecent, "lessons.md"), "utf-8");
    }
  } catch {
    // Archive doesn't exist or isn't readable
  }

  return null;
}

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
  isDisposed?: () => boolean;
  sidebarPanel?: SidebarPanel;
  buildSidebarState?: () => SidebarState;
  sidebarMutableState?: SidebarMutableState;
  selfImprovementPanel?: SelfImprovementPanel;
  clearSessionPlanFiles?: () => Promise<void>;
  planPreviewPanel?: PlanPreviewPanel;
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

  session.on("state-changed", (_from, to) => { void (async () => {
    // Removed isActiveSession() guard - sidebar should show whichever session is running
    vscode.commands.executeCommand(
      "setContext",
      "oxveil.processRunning",
      to === "running",
    );

    // Reset cost/todo/notification tracking on new run
    if (to === "running") {
      if (ms) {
        ms.resetForNewRun();
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
        deps.planPreviewPanel?.setSessionActive(false);
        vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasRun", true);
        // Self-improvement trigger
        const selfImprovementEnabled = deps.getConfig?.("selfImprovement") ?? false;
        const snap = session.readSnapshot();
        const allCompleted = !!snap.progress?.phases.length &&
          snap.progress.phases.every((p) => p.status === "completed");
        console.log("[oxveil] Self-improvement check:", { selfImprovementEnabled, allCompleted, sessionStatus: snap.status });
        if (selfImprovementEnabled && allCompleted) {
          const folderPath = vscode.Uri.parse(deps.folderUri).fsPath;
          const lessonsContent = await findLessonsContent(folderPath);
          try { session.assertFresh(snap.seq); } catch { break; }
          if (deps.isDisposed?.()) break;
          console.log("[oxveil] Lessons content:", { found: !!lessonsContent });
          if (lessonsContent) {
            const lessons = parseLessons(lessonsContent);
            console.log("[oxveil] Parsed lessons:", { count: lessons.length });
            if (lessons.length > 0) {
              try {
                await vscode.commands.executeCommand("oxveil.selfImprovement.start", lessons);
                if (ms) {
                  ms.setSelfImprovementActive(true);
                  ms.setLessonsAvailable(true);
                  buildAndSendSidebarState();
                }
              } catch (err) {
                console.error("[oxveil] Self-improvement command failed:", err);
              }
            }
          }
        }
        // Prevent stale plans from surfacing as "Resume" on next session start
        if (allCompleted) {
          deps.clearSessionPlanFiles?.().catch((err) => {
            console.error("[oxveil] clearSessionPlanFiles failed:", err);
          });
        }
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
        notifications.onSessionFailed(
          session.progress ?? { phases: [], totalPhases: 0 },
        );
        deps.liveRunPanel?.onRunFinished("failed");
        deps.planPreviewPanel?.setSessionActive(false);
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
            sidebarState.provider,
          ));
        } else {
          statusBar.update({ kind: "idle" });
        }
        break;
    }

    buildAndSendSidebarState();
  })(); });

  session.on("phases-changed", (progress) => {
    // Removed isActiveSession() guards - UI should show whichever session is running
    deps.dependencyGraph?.update(progress);
    deps.executionTimeline?.update(progress);
    deps.liveRunPanel?.onProgressChanged(progress);

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
        folderName: deps.folderName,
        otherRootsSummary: deps.getOtherRootsSummary?.(),
      });
    }

    if (deps.sidebarPanel) {
      const phases = mapPhases(progress.phases);
      deps.sidebarPanel.sendProgressUpdate({
        phases,
        elapsed: deps.elapsedTimer?.elapsed ?? "0m",
        cost: (ms?.cost ?? 0) > 0 ? `$${ms!.cost.toFixed(2)}` : undefined,
        todos: (ms?.todoTotal ?? 0) > 0 ? { done: ms!.todoDone, total: ms!.todoTotal } : undefined,
        currentPhase: progress.currentPhaseIndex,
        phaseListHtml: renderPhaseList(phases, session.status),
      });
    }
  });

  session.on("log-appended", (content) => {
    deps.liveRunPanel?.onLogAppended(content);

    // Extract cost and todo data for sidebar
    // Removed isActiveSession() guard - sidebar should show whichever session is running
    if (ms && deps.sidebarPanel) {
      const lines = content.split("\n");
      let updated = false;
      for (const line of lines) {
        const costMatch = line.match(/cost=\$([0-9.]+)/);
        if (costMatch) {
          ms.addCost(parseFloat(costMatch[1]) || 0);
          updated = true;
        }
        const todoMatch = line.match(/\[Todos:\s*(\d+)\/(\d+)\s+done\]/);
        if (todoMatch) {
          ms.setTodos(parseInt(todoMatch[1], 10), parseInt(todoMatch[2], 10));
          updated = true;
        }
      }
      if (updated && session.progress) {
        const phases = mapPhases(session.progress.phases);
        deps.sidebarPanel.sendProgressUpdate({
          phases,
          elapsed: deps.elapsedTimer?.elapsed ?? "0m",
          cost: ms.cost > 0 ? `$${ms.cost.toFixed(2)}` : undefined,
          todos: ms.todoTotal > 0 ? { done: ms.todoDone, total: ms.todoTotal } : undefined,
          currentPhase: session.progress.currentPhaseIndex,
          phaseListHtml: renderPhaseList(phases, session.status),
        });
      }
    }
  });
}
