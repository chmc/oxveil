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

const execFileAsync = promisify(execFile);

const MINIMUM_VERSION = "0.22.0";

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

  const onDidChangeTreeData = new vscode.EventEmitter<string | undefined>();

  const treeDataProvider: vscode.TreeDataProvider<string> = {
    onDidChangeTreeData: onDidChangeTreeData.event,
    getTreeItem(element: string): vscode.TreeItem {
      const items = phaseTree.getChildren();
      const idx = parseInt(element, 10);
      const item = items[idx];
      if (!item) return new vscode.TreeItem("");
      const treeItem = new vscode.TreeItem(item.label);
      treeItem.description = item.description;
      if (item.iconId) {
        treeItem.iconPath = new vscode.ThemeIcon(
          item.iconId,
          item.iconColor
            ? new vscode.ThemeColor(item.iconColor)
            : undefined,
        );
      }
      return treeItem;
    },
    getChildren(): string[] {
      return phaseTree.getChildren().map((_, i) => String(i));
    },
  };

  const treeView = vscode.window.createTreeView("oxveil.phases", {
    treeDataProvider,
  });
  disposables.push(treeView);

  // Output channel
  const outputChannel = vscode.window.createOutputChannel("Oxveil");
  disposables.push(outputChannel);
  const outputManager = new OutputChannelManager(outputChannel);

  // Session state
  const session = new SessionState();

  session.on("state-changed", (_from, to) => {
    vscode.commands.executeCommand(
      "setContext",
      "oxveil.processRunning",
      to === "running",
    );

    switch (to) {
      case "running": {
        const p = session.progress;
        const currentPhase = p?.currentPhaseIndex !== undefined
          ? (p.phases[p.currentPhaseIndex]?.number as number) ?? 1
          : 1;
        statusBar.update({
          kind: "running",
          currentPhase,
          totalPhases: p?.totalPhases ?? 0,
          elapsed: "0m",
        });
        break;
      }
      case "done":
        statusBar.update({ kind: "done", elapsed: "0m" });
        break;
      case "failed": {
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
        statusBar.update({ kind: "idle" });
        break;
    }
  });

  session.on("phases-changed", (progress) => {
    phaseTree.update({ progress });
    onDidChangeTreeData.fire(undefined);

    if (session.status === "running" && progress.currentPhaseIndex !== undefined) {
      const phase = progress.phases[progress.currentPhaseIndex];
      statusBar.update({
        kind: "running",
        currentPhase: phase?.number as number ?? 1,
        totalPhases: progress.totalPhases,
        elapsed: "0m",
      });
    }
  });

  session.on("log-appended", (content) => {
    outputManager.onLogAppended(content);
  });

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
    ...registerCommands({ processManager, installer, session, statusBar }),
  );

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
