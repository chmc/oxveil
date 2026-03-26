import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseLock } from "./core/lock";
import { WatcherManager } from "./core/watchers";
import { SessionState } from "./core/sessionState";
import { parseProgress } from "./parsers/progress";

export interface WorkspaceInitDeps {
  workspaceFolders: readonly vscode.WorkspaceFolder[];
  debounceMs: number;
  session: SessionState;
}

export interface WorkspaceInitResult {
  disposables: vscode.Disposable[];
}

export async function initWorkspaceWatchers(
  deps: WorkspaceInitDeps,
): Promise<WorkspaceInitResult> {
  const { workspaceFolders, debounceMs, session } = deps;
  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  const watcherManager = new WatcherManager({
    workspaceRoot,
    debounceMs,
    onLockChange: (content) => {
      const lock = parseLock(content);
      session.onLockChanged(lock);
    },
    onProgressChange: (content) => {
      const progress = parseProgress(content);
      session.onProgressChanged(progress);
    },
    onLogChange: (content) => {
      session.onLogAppended(content);
    },
    createWatcher: (_glob) => {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceFolders[0], ".claudeloop/**"),
      );
      return watcher;
    },
    readFile: async (filePath) => {
      const bytes = await fs.readFile(filePath, "utf-8");
      return bytes;
    },
  });

  watcherManager.start();

  // Check initial state
  const claudeloopDir = path.join(workspaceRoot, ".claudeloop");
  try {
    await fs.access(claudeloopDir);

    let lockState = { locked: false as const };
    let progress: ReturnType<typeof parseProgress> | undefined;

    try {
      const lockContent = await fs.readFile(
        path.join(claudeloopDir, "lock"),
        "utf-8",
      );
      lockState = parseLock(lockContent) as any;
    } catch {
      // No lock file
    }

    try {
      const progressContent = await fs.readFile(
        path.join(claudeloopDir, "PROGRESS.md"),
        "utf-8",
      );
      progress = parseProgress(progressContent);
    } catch {
      // No PROGRESS.md
    }

    session.checkInitialState({ lock: lockState, progress });
  } catch {
    // No .claudeloop/ directory
  }

  return {
    disposables: [{ dispose: () => watcherManager.stop() }],
  };
}
