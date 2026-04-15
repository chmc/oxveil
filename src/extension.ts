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
import { activateSidebar } from "./activateSidebar";
import { activateMcpBridge } from "./activateMcpBridge";

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
      if (editor) {
        const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (folder) return folder.uri.toString();
      }
      return workspaceFolders?.[0]?.uri.toString();
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

  // Check initial plan state
  let initialPlanDetected = false;
  if (workspaceRoot) {
    try {
      await fs.access(path.join(workspaceRoot, "PLAN.md"));
      initialPlanDetected = true;
    } catch {
      // PLAN.md doesn't exist yet
    }
  }

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
    context,
  });
  disposables.push(...panels.disposables);
  const { dependencyGraph, executionTimeline, configWizard, replayViewer, archiveTimelinePanel, liveRunPanel, planPreviewPanel } = panels;

  // Sidebar
  const sidebar = activateSidebar({
    manager,
    workspaceRoot,
    archiveTree: archive.archiveTree,
    elapsedTimer,
    initialDetectionStatus: result.status,
    initialPlanDetected,
  });
  const { sidebarPanel, buildFullState, getArchives, state: sidebarState } = sidebar;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarPanel.viewType,
      sidebarPanel,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // Plan watcher
  disposables.push(...sidebar.registerPlanWatcher());

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
    buildSidebarState: buildFullState,
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

  // Shared re-detection handler
  const refreshDetection = () =>
    detection.detect().then((r) => {
      vscode.commands.executeCommand(
        "setContext",
        "oxveil.detected",
        r.status === "detected",
      );
      sidebarState.detectionStatus = r.status;
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
      extensionMode: context.extensionMode,
      getActivePlanChatSession: () => activePlanChatSession,
      onPlanChatSessionCreated: (session) => {
        // Clear stale sidebar state first (before reset() fires synchronous events)
        sidebar.onPlanReset();
        const activeSession = manager.getActiveSession();
        if (activeSession) {
          activeSession.sessionState.reset();
        }

        activePlanChatSession = session;
        planPreviewPanel.setSessionActive(true);
        vscode.commands.executeCommand("setContext", "oxveil.planChatActive", true);
      },
      onPlanFormed: sidebar.onPlanFormed,
    }),
  );

  // Send initial sidebar state immediately (without archives)
  sidebarPanel.updateState(buildFullState());

  // Then load archives and refresh sidebar with archive data
  refreshArchive()
    .catch((err) => console.warn("[Oxveil] Archive load failed:", err))
    .then(() => {
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

  // MCP bridge (opt-in)
  const mcpDisposables = await activateMcpBridge({
    config, workspaceRoot, buildFullState, sidebarPanel, sidebarState,
  });
  disposables.push(...mcpDisposables);

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
