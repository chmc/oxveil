import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SessionState } from "./core/sessionState";
import { Installer } from "./core/installer";
import { StatusBarManager } from "./views/statusBar";
import { registerCommands } from "./commands";
import { initWorkspaceWatchers } from "./workspaceInit";
import { createWebviewPanels, createArchiveView } from "./activateViews";
import { WorkspaceSessionManager } from "./core/workspaceSessionManager";
import {
  activateDetection,
  createFallbackDetection,
  createRefreshDetection,
  MINIMUM_VERSION,
} from "./activateDetection";
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
import { deriveStatusBarFromView } from "./views/deriveStatusBar";
import { createConfigWatcher } from "./activateConfigWatcher";
import { createNotificationManager, showDetectionNotifications } from "./activateNotifications";
import {
  createElapsedTimer,
  createTerminalCloseHandler,
  createTestAnnotationCommand,
  setupSessionChangeHandler,
} from "./activateSessionHandlers";

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
  let detectionResult;
  try {
    detectionResult = await activateDetection(config);
  } catch (err) {
    console.warn("[Oxveil] Detection failed:", err);
    detectionResult = createFallbackDetection(claudeloopPath);
  }
  const { detection, result, resolvedClaudePath } = detectionResult;

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
  const elapsedTimer = createElapsedTimer({ manager, statusBar });

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
      if (!activePlanChatSession) {
        vscode.window.showWarningMessage("No active Plan Chat session. Start Plan Chat first.");
        return;
      }
      activePlanChatSession.sendAnnotation(phase, text);
      activePlanChatSession.focusTerminal();
    },
    context,
  });
  disposables.push(...panels.disposables);
  const { dependencyGraph, executionTimeline, configWizard, replayViewer, archiveTimelinePanel, liveRunPanel, planPreviewPanel } = panels;

  // Notifications
  const notifications = createNotificationManager({ manager, liveRunPanel });

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

  disposables.push(...sidebar.registerPlanWatcher()); // Plan watcher

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
    sidebarMutableState: sidebarState,
  };

  const onArchiveDone = async () => {
    await refreshArchive();
    sidebarPanel.updateState(buildFullState());
  };

  wireAllSessions(manager, wiringCtx, { refreshArchive, onArchiveDone });

  // Detection notifications
  showDetectionNotifications(notifications, result.status, result.version, MINIMUM_VERSION);

  // Per-folder file watchers
  if (workspaceFolders && workspaceFolders.length > 0) {
    const debounceMs = config.get<number>("watchDebounceMs", 100);
    const watcherResult = await initWorkspaceWatchers({
      workspaceFolders,
      debounceMs,
      manager,
    });
    disposables.push(...watcherResult.disposables);

    // Correct status bar for orphan progress states loaded during init
    const postInitState = buildFullState();
    statusBar.update(deriveStatusBarFromView(
      postInitState.view,
      manager.getActiveSession()?.sessionState.progress,
    ));
  }

  // Shared re-detection handler
  const refreshDetection = createRefreshDetection({
    detection,
    sidebarState,
    buildFullState,
    sidebarPanel,
    statusBar,
    manager,
  });

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
  disposables.push(createTerminalCloseHandler({
    getActivePlanChatSession: () => activePlanChatSession,
    setActivePlanChatSession: (session) => { activePlanChatSession = session; },
    planPreviewPanel,
    onPlanChatEnded: sidebar.onPlanChatEnded,
  }));

  // Test command for visual verification — triggers annotation flow
  disposables.push(createTestAnnotationCommand(() => activePlanChatSession));

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
        sidebar.onPlanChatStarted();
        const activeSession = manager.getActiveSession();
        if (activeSession) {
          activeSession.sessionState.reset();
        }

        activePlanChatSession = session;
        planPreviewPanel.setSessionActive(true);
        vscode.commands.executeCommand("setContext", "oxveil.planChatActive", true);
      },
      onPlanFormed: sidebar.onPlanFormed,
      notificationManager: notifications,
      onFullReset: sidebar.onFullReset,
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

  // Active folder tracking + session change handler
  disposables.push(vscode.window.onDidChangeActiveTextEditor(() => manager.notifyActiveChanged()));
  setupSessionChangeHandler(manager, {
    sidebarPanel,
    buildFullState,
    dependencyGraph,
    executionTimeline,
    liveRunPanel,
  });

  // Handle workspace folder add/remove
  const folderChangeOpts = {
    manager,
    detected: result.status === "detected",
    claudeloopPath,
    resolvedPath: result.path,
    platform: process.platform,
    wiringCtx,
    archiveCallbacks: { refreshArchive, onArchiveDone },
  };
  disposables.push(
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      handleWorkspaceFolderChange(e, folderChangeOpts);
    }),
  );

  // Re-detect on setting change
  disposables.push(createConfigWatcher({
    detection,
    folderChangeOpts,
    sidebarState,
    buildFullState,
    sidebarPanel,
    statusBar,
    manager,
  }));

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
