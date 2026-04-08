import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SessionState } from "./core/sessionState";
import { Installer } from "./core/installer";
import { StatusBarManager } from "./views/statusBar";
import { registerCommands } from "./commands";
import { initWorkspaceWatchers } from "./workspaceInit";
import { NotificationManager } from "./views/notifications";
import { ElapsedTimer } from "./views/elapsedTimer";
import { createWebviewPanels, createArchiveView } from "./activateViews";
import { WorkspaceSessionManager } from "./core/workspaceSessionManager";
import { activateDetection, MINIMUM_VERSION } from "./activateDetection";
import {
  createGitExec,
  initFolderSessions,
  wireAllSessions,
  handleWorkspaceFolderChange,
} from "./workspaceSetup";
import type { PlanChatSession } from "./core/planChatSession";
import { SidebarPanel } from "./views/sidebarPanel";
import { deriveViewState, mapPhases, formatRelativeDate } from "./views/sidebarState";
import type { ArchiveView, SidebarState } from "./views/sidebarState";
import type { DetectionStatus } from "./types";
import { computeDuration } from "./parsers/archive";

const disposables: vscode.Disposable[] = [];

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const config = vscode.workspace.getConfiguration("oxveil");

  const claudeloopPath = config.get<string>("claudeloopPath", "claudeloop");

  // Status bar
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  disposables.push(statusBarItem);

  const statusBar = new StatusBarManager(statusBarItem as any);

  // Detection
  const { detection, result, resolvedClaudePath } = await activateDetection(config);

  // Update status bar based on detection
  if (result.status === "detected") {
    statusBar.update({ kind: "ready" });
  } else {
    statusBar.update({ kind: "not-found" });
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  const workspaceRoot = workspaceFolders?.[0]?.uri.fsPath;

  const archive = createArchiveView({ workspaceRoot });
  const { refreshArchive } = archive;

  // Workspace session manager (per-folder sessions)
  const manager = new WorkspaceSessionManager({
    getActiveFolderUri: () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return workspaceFolders?.[0]?.uri.toString();
      return vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.toString();
    },
  });

  // Create one session per workspace folder
  if (workspaceFolders && result.status === "detected") {
    initFolderSessions({
      manager,
      folders: workspaceFolders,
      claudeloopPath,
      resolvedPath: result.path,
      platform: process.platform,
    });
  }

  // Elapsed timer
  const elapsedTimer = new ElapsedTimer((elapsed) => {
    const active = manager.getActiveSession();
    if (active?.sessionState.status === "running") {
      const p = active.sessionState.progress;
      const currentPhase = p?.currentPhaseIndex !== undefined
        ? (p.phases[p.currentPhaseIndex]?.number as number) ?? 1
        : 1;
      statusBar.update({
        kind: "running",
        currentPhase,
        totalPhases: p?.totalPhases ?? 0,
        elapsed,
      });
    }
  });

  // Notifications
  const notifications = new NotificationManager({
    window: vscode.window,
    onShowOutput: () => {
      const active = manager.getActiveSession();
      const progress = active?.sessionState.progress ?? { phases: [], totalPhases: 0 };
      liveRunPanel.reveal(progress, active?.folderUri);
    },
    onViewLog: (phaseNumber) =>
      vscode.commands.executeCommand("oxveil.viewLog", { phaseNumber }),
    onInstall: () => vscode.commands.executeCommand("oxveil.install"),
    onSetPath: () =>
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "oxveil.claudeloopPath",
      ),
    onStop: () => vscode.commands.executeCommand("oxveil.stop"),
    onForceUnlock: () => vscode.commands.executeCommand("oxveil.forceUnlock"),
  });

  // Plan chat session tracking
  let activePlanChatSession: PlanChatSession | undefined;

  // Webview panels, CodeLens, and diff provider
  const activeSession = manager.getActiveSession();
  const activeState = activeSession?.sessionState ?? new SessionState();
  const gitExec = activeSession?.gitExec ?? createGitExec(workspaceRoot);
  const panels = createWebviewPanels({
    session: activeState,
    workspaceRoot,
    gitExec,
    onAnnotation: (phase, text) => {
      activePlanChatSession?.sendAnnotation(phase, text);
    },
  });
  disposables.push(...panels.disposables);
  const { dependencyGraph, executionTimeline, configWizard, replayViewer, archiveTimelinePanel, liveRunPanel, planPreviewPanel } = panels;

  // Register sidebar webview provider
  let planUserChoice: import("./views/sidebarState").PlanUserChoice = "none";
  const sidebarPanel = new SidebarPanel({
    executeCommand: vscode.commands.executeCommand,
    onPlanChoice: (choice) => {
      planUserChoice = choice;
      sidebarPanel.updateState(buildFullState());
    },
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarPanel.viewType,
      sidebarPanel,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // Sidebar state tracking
  let currentDetectionStatus: DetectionStatus = result.status;
  let currentPlanDetected = false;

  // Check initial plan state
  if (workspaceRoot) {
    try {
      await fs.access(path.join(workspaceRoot, "PLAN.md"));
      currentPlanDetected = true;
    } catch {
      // PLAN.md doesn't exist yet
    }
  }

  function getArchives(): ArchiveView[] {
    return archive.archiveTree.getEntries().map((entry) => ({
      name: entry.name,
      label: entry.label,
      date: entry.metadata?.started
        ? formatRelativeDate(entry.metadata.started)
        : entry.timestamp,
      phaseCount: entry.metadata?.phasesTotal ?? 0,
      duration: entry.metadata
        ? computeDuration(entry.metadata.started, entry.metadata.finished) || undefined
        : undefined,
      status: (entry.metadata
        ? (entry.metadata.status === "completed" ? "completed" :
           entry.metadata.status === "failed" ? "failed" : "unknown")
        : "unknown") as "completed" | "failed" | "unknown",
    }));
  }

  function buildFullState(): SidebarState {
    const active = manager.getActiveSession();
    const sessionState = active?.sessionState;
    const sessionStatus = sessionState?.status ?? "idle";
    const progress = sessionState?.progress;
    const viewState = deriveViewState(
      currentDetectionStatus,
      sessionStatus,
      currentPlanDetected,
      progress,
      planUserChoice,
    );
    return {
      view: viewState,
      plan: (currentPlanDetected || progress) ? {
        filename: "PLAN.md",
        phases: progress ? mapPhases(progress.phases) : [],
      } : undefined,
      session: sessionStatus === "running" || sessionStatus === "done" || sessionStatus === "failed" ? {
        elapsed: elapsedTimer.elapsed,
      } : undefined,
      archives: getArchives(),
    };
  }

  // Wire each session's events
  const wiringCtx = {
    statusBar,
    liveRunPanel,
    notifications,
    elapsedTimer,
    dependencyGraph,
    executionTimeline,
    getConfig: (key: string) => vscode.workspace.getConfiguration("oxveil").get(key),
    sidebarPanel,
    detectionStatus: currentDetectionStatus,
    planDetected: currentPlanDetected,
    planFilename: "PLAN.md",
    getArchives,
    getPlanUserChoice: () => planUserChoice,
  };

  const onArchiveDone = async () => {
    await refreshArchive();
    sidebarPanel.updateState(buildFullState());
  };

  wireAllSessions(manager, wiringCtx, onArchiveDone);

  // Detection notifications
  if (result.status === "not-found") {
    notifications.onDetection("not-found");
  } else if (result.status === "version-incompatible") {
    notifications.onDetection("version-incompatible", {
      found: result.version ?? "unknown",
      required: MINIMUM_VERSION,
    });
  }

  // Per-folder file watchers
  if (workspaceFolders && workspaceFolders.length > 0) {
    const debounceMs = config.get<number>("watchDebounceMs", 100);
    const watcherResult = await initWorkspaceWatchers({
      workspaceFolders,
      debounceMs,
      manager,
    });
    disposables.push(...watcherResult.disposables);
  }

  // Walkthrough: PLAN.md watcher + activation check
  if (currentPlanDetected) {
    await vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", true);
  }
  const planWatcher = vscode.workspace.createFileSystemWatcher("**/PLAN.md");
  planWatcher.onDidCreate(() => {
    vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", true);
    currentPlanDetected = true;
    planUserChoice = "none";
    wiringCtx.planDetected = true;
    sidebarPanel.updateState(buildFullState());
  });
  planWatcher.onDidDelete(() => {
    vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", false);
    currentPlanDetected = false;
    planUserChoice = "none";
    wiringCtx.planDetected = false;
    sidebarPanel.updateState(buildFullState());
  });
  disposables.push(planWatcher);

  // Shared re-detection handler
  const refreshDetection = () =>
    detection.detect().then((r) => {
      vscode.commands.executeCommand(
        "setContext",
        "oxveil.detected",
        r.status === "detected",
      );
      currentDetectionStatus = r.status;
      wiringCtx.detectionStatus = r.status;
      if (r.status === "detected") {
        statusBar.update({ kind: "ready" });
      } else {
        statusBar.update({ kind: "not-found" });
      }
      sidebarPanel.updateState(buildFullState());
    });

  // Re-detect on setting change
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("oxveil.claudeloopPath")) {
      const newPath = vscode.workspace
        .getConfiguration("oxveil")
        .get<string>("claudeloopPath", "claudeloop");
      detection.updatePath(newPath);
      refreshDetection();
    }
  });
  disposables.push(configWatcher);

  _sessionManager = manager;

  // Installer
  const installer = new Installer({
    createTerminal: (opts) => vscode.window.createTerminal(opts),
    onDidCloseTerminal: (cb) => vscode.window.onDidCloseTerminal(cb),
    onDetectionChanged: () => {
      refreshDetection();
    },
    platform: process.platform,
  });

  // Terminal close listener — detect when plan chat terminal is closed
  disposables.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      if (activePlanChatSession?.matchesTerminal(terminal)) {
        activePlanChatSession = undefined;
        planPreviewPanel.setSessionActive(false);
        planPreviewPanel.endSession();
        vscode.commands.executeCommand("setContext", "oxveil.planChatActive", false);
      }
    }),
  );

  // Register commands — handlers resolve active session at runtime
  disposables.push(
    ...registerCommands({
      sessionManager: manager,
      installer,
      statusBar,
      readdir: (dir: string) => fs.readdir(dir),
      onArchiveRefresh: refreshArchive,
      dependencyGraph,
      executionTimeline,
      configWizard,
      replayViewer,
      archiveTimelinePanel,
      liveRunPanel,
      planPreviewPanel,
      claudePath: resolvedClaudePath,
      getActivePlanChatSession: () => activePlanChatSession,
      onPlanChatSessionCreated: (session) => {
        activePlanChatSession = session;
        planPreviewPanel.setSessionActive(true);
        vscode.commands.executeCommand("setContext", "oxveil.planChatActive", true);
      },
    }),
  );

  // Initial archive load + sidebar state
  refreshArchive().then(() => {
    sidebarPanel.updateState(buildFullState());
  });

  // Active folder tracking
  disposables.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      manager.notifyActiveChanged();
    }),
  );

  // Update visible webview panels when active session changes
  manager.on("active-session-changed", (session) => {
    if (!session) return;
    const folderUri = session.folderUri;
    if (dependencyGraph?.visible && dependencyGraph.currentFolderUri !== folderUri) {
      dependencyGraph.reveal(session.sessionState.progress, folderUri);
    }
    if (executionTimeline?.visible && executionTimeline.currentFolderUri !== folderUri) {
      executionTimeline.reveal(session.sessionState.progress, folderUri);
    }
    if (liveRunPanel?.visible && liveRunPanel.currentFolderUri !== folderUri) {
      liveRunPanel.reveal(session.sessionState.progress ?? { phases: [], totalPhases: 0 }, folderUri);
    }
  });

  // Handle workspace folder add/remove
  const folderChangeOpts = {
    manager,
    detected: result.status === "detected",
    claudeloopPath,
    resolvedPath: result.path,
    platform: process.platform,
    wiringCtx,
    onArchiveDone,
  };
  disposables.push(
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      handleWorkspaceFolderChange(e, folderChangeOpts);
    }),
  );

  context.subscriptions.push(...disposables);
}

// Expose for deactivate access
let _sessionManager: WorkspaceSessionManager | undefined;

export async function deactivate(): Promise<void> {
  if (_sessionManager) {
    for (const ws of _sessionManager.getAllSessions()) {
      if (ws.processManager?.isRunning) {
        await ws.processManager.deactivate();
      }
    }
    _sessionManager.dispose();
  }

  for (const d of disposables) {
    d.dispose();
  }
}
