import * as vscode from "vscode";
import { SessionState } from "./core/sessionState";
import { Installer } from "./core/installer";
import { StatusBarManager } from "./views/statusBar";
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
import type { SelfImprovementSession } from "./core/selfImprovementSession";
import { SidebarPanel } from "./views/sidebarPanel";
import { activateSidebar, checkInitialPlanState } from "./activateSidebar";
import { activateMcpBridge } from "./activateMcpBridge";
import { activateCommands } from "./activateCommands";
import { deriveStatusBarFromView } from "./views/deriveStatusBar";
import { createConfigWatcher } from "./activateConfigWatcher";
import { createNotificationManager, showDetectionNotifications } from "./activateNotifications";
import {
  createElapsedTimer,
  createTerminalCloseHandler,
  createSelfImprovementTerminalCloseHandler,
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

  // Self-improvement session tracking
  let activeSelfImprovementSession: SelfImprovementSession | undefined;

  // Check initial plan state
  const initialPlanDetected = await checkInitialPlanState(workspaceRoot);

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
  const { dependencyGraph, executionTimeline, configWizard, replayViewer, archiveTimelinePanel, liveRunPanel, planPreviewPanel, selfImprovementPanel } = panels;

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
    selfImprovementPanel,
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

  // Terminal close listener — detect when self-improvement terminal is closed
  disposables.push(createSelfImprovementTerminalCloseHandler({
    getActiveSelfImprovementSession: () => activeSelfImprovementSession,
    setActiveSelfImprovementSession: (session) => { activeSelfImprovementSession = session; },
    setSelfImprovementActive: (active) => { sidebarState.selfImprovementActive = active; },
    refreshSidebar: () => sidebarPanel.updateState(buildFullState()),
  }));

  // Test command for visual verification — triggers annotation flow
  disposables.push(createTestAnnotationCommand(() => activePlanChatSession));

  // Register commands
  disposables.push(
    ...activateCommands({
      manager,
      installer,
      statusBar,
      refreshArchive,
      dependencyGraph,
      executionTimeline,
      configWizard,
      replayViewer,
      archiveTimelinePanel,
      liveRunPanel,
      planPreviewPanel,
      selfImprovementPanel,
      claudePath: resolvedClaudePath,
      extensionMode: context.extensionMode,
      notifications,
      sidebarState,
      sidebarPanel,
      buildFullState,
      sidebar: {
        onPlanChatStarted: sidebar.onPlanChatStarted,
        onPlanFormed: sidebar.onPlanFormed,
        onFullReset: sidebar.onFullReset,
        onAiParseStarted: sidebar.onAiParseStarted,
        onAiParseEnded: sidebar.onAiParseEnded,
        isAiParsing: () => sidebar.state.aiParsing,
      },
      getActivePlanChatSession: () => activePlanChatSession,
      setActivePlanChatSession: (session) => { activePlanChatSession = session; },
      getActiveSelfImprovementSession: () => activeSelfImprovementSession,
      setActiveSelfImprovementSession: (session) => { activeSelfImprovementSession = session; },
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
