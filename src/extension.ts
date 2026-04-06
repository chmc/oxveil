import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SessionState } from "./core/sessionState";
import { Installer } from "./core/installer";
import { StatusBarManager } from "./views/statusBar";
import { PhaseTreeProvider } from "./views/phaseTree";
import { registerCommands } from "./commands";
import { initWorkspaceWatchers } from "./workspaceInit";
import { NotificationManager } from "./views/notifications";
import { ElapsedTimer } from "./views/elapsedTimer";
import { createTreeAdapter, createHierarchicalTreeAdapter } from "./views/treeAdapter";
import { createWebviewPanels, createArchiveView } from "./activateViews";
import { WorkspaceSessionManager } from "./core/workspaceSessionManager";
import { activateDetection } from "./activateDetection";
import {
  createGitExec,
  initFolderSessions,
  wireAllSessions,
  handleWorkspaceFolderChange,
} from "./workspaceSetup";

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

  // Phase tree view
  const phaseTree = new PhaseTreeProvider(result.status === "detected");

  const {
    dataProvider: phaseDataProvider,
    emitter: onDidChangeTreeData,
    resolveItem: resolvePhaseItem,
  } = createHierarchicalTreeAdapter(phaseTree, (item, treeItem) => {
    if (item.phaseNumber !== undefined) {
      (treeItem as any).phaseNumber = item.phaseNumber;
    }
  });

  const treeView = vscode.window.createTreeView("oxveil.phases", {
    treeDataProvider: phaseDataProvider,
  });
  disposables.push(treeView);

  // Archive tree view
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const workspaceRoot = workspaceFolders?.[0]?.uri.fsPath;

  // Seed initial folder entries so single/multi-root tree works immediately
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      phaseTree.update(folder.uri.toString(), folder.name, null);
    }
  }

  const archive = createArchiveView({ workspaceRoot });
  disposables.push(archive.archiveView);
  const { resolveArchiveItem, refreshArchive } = archive;

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

  // Webview panels, CodeLens, and diff provider
  const activeSession = manager.getActiveSession();
  const activeState = activeSession?.sessionState ?? new SessionState();
  const gitExec = activeSession?.gitExec ?? createGitExec(workspaceRoot);
  const panels = createWebviewPanels({ session: activeState, workspaceRoot, gitExec });
  disposables.push(...panels.disposables);
  const { dependencyGraph, executionTimeline, configWizard, replayViewer, archiveTimelinePanel, liveRunPanel, planPreviewPanel } = panels;

  // Wire each session's events
  const wiringCtx = {
    statusBar,
    phaseTree,
    onDidChangeTreeData,
    liveRunPanel,
    notifications,
    elapsedTimer,
    dependencyGraph,
    executionTimeline,
    getConfig: (key: string) => vscode.workspace.getConfiguration("oxveil").get(key),
  };
  wireAllSessions(manager, wiringCtx, refreshArchive);

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
  if (workspaceRoot) {
    const planPath = path.join(workspaceRoot, "PLAN.md");
    try {
      await fs.access(planPath);
      await vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", true);
    } catch {
      // PLAN.md doesn't exist yet
    }
  }
  const planWatcher = vscode.workspace.createFileSystemWatcher("**/PLAN.md");
  planWatcher.onDidCreate(() => {
    vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", true);
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
      phaseTree.updateDetected(r.status === "detected");
      onDidChangeTreeData.fire(undefined);
      if (r.status === "detected") {
        statusBar.update({ kind: "ready" });
      } else {
        statusBar.update({ kind: "not-found" });
      }
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
      resolvePhaseItem: resolvePhaseItem,
      resolveArchiveItem: resolveArchiveItem,
      claudePath: resolvedClaudePath,
    }),
  );

  // Initial archive load
  refreshArchive();

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
    onArchiveDone: refreshArchive,
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
