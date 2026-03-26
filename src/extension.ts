import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { execFile, spawn as nodeSpawn } from "node:child_process";
import { promisify } from "node:util";
import { Detection, type Executor } from "./core/detection";
import { SessionState } from "./core/sessionState";
import { ProcessManager } from "./core/processManager";
import { Installer } from "./core/installer";
import { StatusBarManager } from "./views/statusBar";
import { PhaseTreeProvider } from "./views/phaseTree";
import { OutputChannelManager } from "./views/outputChannel";
import { registerCommands } from "./commands";
import { initWorkspaceWatchers } from "./workspaceInit";
import { NotificationManager } from "./views/notifications";
import { ElapsedTimer } from "./views/elapsedTimer";
import { shouldActivate } from "./core/featureFlag";
import { wireSessionEvents } from "./sessionWiring";
import { ArchiveTreeProvider } from "./views/archiveTree";
import { parseArchive } from "./parsers/archive";
import { stat } from "node:fs/promises";
import { createTreeAdapter } from "./views/treeAdapter";
import { DependencyGraphPanel } from "./views/dependencyGraph";

const execFileAsync = promisify(execFile);

const MINIMUM_VERSION = "0.22.0";

const disposables: vscode.Disposable[] = [];

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const config = vscode.workspace.getConfiguration("oxveil");

  // Feature flag gate — skip all UI when experimental is disabled
  if (!shouldActivate((key) => config.get(key))) {
    return;
  }

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

  const { dataProvider: phaseDataProvider, emitter: onDidChangeTreeData } =
    createTreeAdapter(phaseTree, (item, treeItem) => {
      if (item.phaseNumber !== undefined) {
        (treeItem as any).phaseNumber = item.phaseNumber;
      }
    });

  const treeView = vscode.window.createTreeView("oxveil.phases", {
    treeDataProvider: phaseDataProvider,
  });
  disposables.push(treeView);

  // Archive tree view
  const archiveTree = new ArchiveTreeProvider();
  const { dataProvider: archiveDataProvider, emitter: archiveDidChange } =
    createTreeAdapter(archiveTree, (item, treeItem) => {
      if (item.archiveName) {
        (treeItem as any).archiveName = item.archiveName;
      }
    });

  const archiveView = vscode.window.createTreeView("oxveil.archive", {
    treeDataProvider: archiveDataProvider,
  });
  disposables.push(archiveView);

  const refreshArchive = async () => {
    if (!workspaceRoot) return;
    const archiveRoot = path.join(workspaceRoot, ".claudeloop", "archive");
    const entries = await parseArchive(
      {
        readdir: (dir: string) => fs.readdir(dir),
        readFile: (p: string) => fs.readFile(p, "utf-8"),
        isDirectory: async (p: string) => (await stat(p)).isDirectory(),
      },
      archiveRoot,
    );
    archiveTree.update(entries);
    archiveDidChange.fire(undefined);
  };

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
    onInstall: () => vscode.commands.executeCommand("oxveil.install"),
    onSetPath: () =>
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "oxveil.claudeloopPath",
      ),
    onStop: () => vscode.commands.executeCommand("oxveil.stop"),
    onForceUnlock: () => vscode.commands.executeCommand("oxveil.forceUnlock"),
  });

  // Dependency graph webview
  const dependencyGraph = new DependencyGraphPanel({
    createWebviewPanel: vscode.window.createWebviewPanel,
    executeCommand: vscode.commands.executeCommand,
  });
  disposables.push({ dispose: () => dependencyGraph.dispose() });

  wireSessionEvents({
    session,
    statusBar,
    phaseTree,
    onDidChangeTreeData,
    outputManager,
    notifications,
    elapsedTimer,
    dependencyGraph,
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
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const debounceMs = config.get<number>("watchDebounceMs", 100);
    const watcherResult = await initWorkspaceWatchers({
      workspaceFolders,
      debounceMs,
      session,
    });
    disposables.push(...watcherResult.disposables);
  }

  // Re-detect on setting change
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("oxveil.claudeloopPath")) {
      const newPath = vscode.workspace
        .getConfiguration("oxveil")
        .get<string>("claudeloopPath", "claudeloop");
      detection.updatePath(newPath);
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
    }
  });
  disposables.push(configWatcher);

  // Process manager
  let processManager: ProcessManager | undefined;
  const workspaceRoot = workspaceFolders?.[0]?.uri.fsPath;

  if (workspaceRoot && result.status === "detected") {
    const claudeloopDir = path.join(workspaceRoot, ".claudeloop");
    processManager = new ProcessManager({
      claudeloopPath: result.path ?? claudeloopPath,
      workspaceRoot,
      spawn: (cmd, args, opts) =>
        nodeSpawn(cmd, args, opts as Parameters<typeof nodeSpawn>[2]),
      lockExists: async () => {
        try {
          await fs.access(path.join(claudeloopDir, "lock"));
          return true;
        } catch {
          return false;
        }
      },
      deleteLock: async () => {
        try {
          await fs.unlink(path.join(claudeloopDir, "lock"));
        } catch {
          // Lock file already gone
        }
      },
      getSettings: () => {
        const c = vscode.workspace.getConfiguration("oxveil");
        return {
          verify: c.get<boolean>("verify", true),
          refactor: c.get<boolean>("refactor", true),
          dryRun: c.get<boolean>("dryRun", false),
          aiParse: c.get<boolean>("aiParse", true),
        };
      },
      platform: process.platform,
    });
  }

  _processManager = processManager;

  // Installer
  const installer = new Installer({
    createTerminal: (opts) => vscode.window.createTerminal(opts),
    onDidCloseTerminal: (cb) => vscode.window.onDidCloseTerminal(cb),
    onDetectionChanged: () => {
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
