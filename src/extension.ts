import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Detection, type Executor } from "./core/detection";
import { StatusBarManager } from "./views/statusBar";
import { PhaseTreeProvider } from "./views/phaseTree";

const execFileAsync = promisify(execFile);

const MINIMUM_VERSION = "0.22.0";

const disposables: vscode.Disposable[] = [];

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const config = vscode.workspace.getConfiguration("oxveil");
  const claudeloopPath = config.get<string>("claudeloopPath", "claudeloop");

  // Status bar
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
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
    result.status === "detected"
  );
  await vscode.commands.executeCommand(
    "setContext",
    "oxveil.processRunning",
    false
  );

  // Update status bar based on detection
  if (result.status === "detected") {
    statusBar.update({ kind: "ready" });
  } else if (result.status === "not-found") {
    statusBar.update({ kind: "not-found" });
  } else {
    statusBar.update({ kind: "not-found" });
  }

  // Phase tree view
  const phaseTree = new PhaseTreeProvider({
    detected: result.status === "detected",
    progress: null,
  });

  const treeDataProvider: vscode.TreeDataProvider<string> = {
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
            : undefined
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
          r.status === "detected"
        );
        if (r.status === "detected") {
          statusBar.update({ kind: "ready" });
        } else {
          statusBar.update({ kind: "not-found" });
        }
      });
    }
  });
  disposables.push(configWatcher);

  // Register stub commands
  for (const cmd of [
    "oxveil.start",
    "oxveil.stop",
    "oxveil.reset",
    "oxveil.forceUnlock",
    "oxveil.install",
  ]) {
    disposables.push(
      vscode.commands.registerCommand(cmd, () => {
        // Stub — implemented in later phases
      })
    );
  }

  context.subscriptions.push(...disposables);
}

export function deactivate(): void {
  for (const d of disposables) {
    d.dispose();
  }
}
