import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Detection, type Executor } from "./core/detection";
import { SessionState } from "./core/sessionState";
import { ProcessManager } from "./core/processManager";
import { Installer } from "./core/installer";
import { createProcessManager } from "./processManagerFactory";
import { StatusBarManager } from "./views/statusBar";
import { PhaseTreeProvider } from "./views/phaseTree";
import { OutputChannelManager } from "./views/outputChannel";
import { registerCommands } from "./commands";
import { initWorkspaceWatchers } from "./workspaceInit";
import { NotificationManager } from "./views/notifications";
import { ElapsedTimer } from "./views/elapsedTimer";
import { wireSessionEvents } from "./sessionWiring";
import { createTreeAdapter } from "./views/treeAdapter";
import { createWebviewPanels, createArchiveView } from "./activateViews";
import type { GitExecDeps } from "./core/gitIntegration";

const execFileAsync = promisify(execFile);

const MINIMUM_VERSION = "0.22.0";

function createGitExec(workspaceRoot: string | undefined): GitExecDeps | undefined {
  if (!workspaceRoot) return undefined;
  return {
    exec: async (command: string, args: string[], cwd: string) => {
      const { stdout } = await execFileAsync(command, args, { cwd });
      return stdout;
    },
    cwd: workspaceRoot,
  };
}

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
  const executor: Executor = async (command, args) => {
    const result = await execFileAsync(command, args);
    return { stdout: result.stdout };
  };

  const detection = new Detection(executor, claudeloopPath, MINIMUM_VERSION);
  const result = await detection.detect();

  // Set context keys
  await vscode.commands.executeCommand(
    "setContext",
    "oxveil.detected",
    result.status === "detected",
  );
  await vscode.commands.executeCommand(
    "setContext",
    "oxveil.processRunning",
    false,
  );

  // Update status bar based on detection
  if (result.status === "detected") {
    statusBar.update({ kind: "ready" });
  } else {
    statusBar.update({ kind: "not-found" });
  }

  // Phase tree view
  const phaseTree = new PhaseTreeProvider({
    detected: result.status === "detected",
    progress: null,
  });

  const {
    dataProvider: phaseDataProvider,
    emitter: onDidChangeTreeData,
    resolveItem: resolvePhaseItem,
  } = createTreeAdapter(phaseTree, (item, treeItem) => {
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
  const archive = createArchiveView({ workspaceRoot });
  disposables.push(archive.archiveView);
  const { resolveArchiveItem, refreshArchive } = archive;

  // Output channel
  const outputChannel = vscode.window.createOutputChannel("Oxveil");
  disposables.push(outputChannel);
  const outputManager = new OutputChannelManager(outputChannel);

  // Session state
  const session = new SessionState();

  // Elapsed timer
  const elapsedTimer = new ElapsedTimer((elapsed) => {
    if (session.status === "running") {
      const p = session.progress;
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
    onShowOutput: () => outputChannel.show(true),
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
  const gitExec = createGitExec(workspaceRoot);
  const panels = createWebviewPanels({ session, workspaceRoot, gitExec });
  disposables.push(...panels.disposables);
  const { dependencyGraph, executionTimeline, configWizard, replayViewer } = panels;

  wireSessionEvents({
    session,
    statusBar,
    phaseTree,
    onDidChangeTreeData,
    outputManager,
    notifications,
    elapsedTimer,
    dependencyGraph,
    executionTimeline,
  });

  // Refresh archive when session ends
  session.on("state-changed", (_from, to) => {
    if (to === "done" || to === "failed") {
      refreshArchive();
    }
  });

  // Detection notifications
  if (result.status === "not-found") {
    notifications.onDetection("not-found");
  } else if (result.status === "version-incompatible") {
    notifications.onDetection("version-incompatible", {
      found: result.version ?? "unknown",
      required: MINIMUM_VERSION,
    });
  }

  // Watchers
  if (workspaceFolders && workspaceFolders.length > 0) {
    const debounceMs = config.get<number>("watchDebounceMs", 100);
    const watcherResult = await initWorkspaceWatchers({
      workspaceFolders,
      debounceMs,
      session,
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
      phaseTree.update({ detected: r.status === "detected" });
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

  // Process manager
  let processManager: ProcessManager | undefined;

  if (workspaceRoot && result.status === "detected") {
    processManager = createProcessManager({
      claudeloopPath,
      resolvedPath: result.path,
      workspaceRoot,
      platform: process.platform,
    });
  }

  _processManager = processManager;

  // Installer
  const installer = new Installer({
    createTerminal: (opts) => vscode.window.createTerminal(opts),
    onDidCloseTerminal: (cb) => vscode.window.onDidCloseTerminal(cb),
    onDetectionChanged: () => {
      refreshDetection();
    },
    platform: process.platform,
  });

  // Register commands
  disposables.push(
    ...registerCommands({
      processManager,
      installer,
      session,
      statusBar,
      workspaceRoot,
      readdir: (dir: string) => fs.readdir(dir),
      onArchiveRefresh: refreshArchive,
      dependencyGraph,
      executionTimeline,
      configWizard,
      replayViewer,
      gitExec,
      resolvePhaseItem: resolvePhaseItem,
      resolveArchiveItem: resolveArchiveItem,
    }),
  );

  // Initial archive load
  refreshArchive();

  context.subscriptions.push(...disposables);
}

export async function deactivate(): Promise<void> {
  const pm = _processManager;
  if (pm?.isRunning) {
    await pm.deactivate();
  }

  for (const d of disposables) {
    d.dispose();
  }
}

// Expose for deactivate access
let _processManager: ProcessManager | undefined;
