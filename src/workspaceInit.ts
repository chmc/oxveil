import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseLock } from "./core/lock";
import { WatcherManager } from "./core/watchers";
import { parseProgress } from "./parsers/progress";
import type { WorkspaceSessionManager } from "./core/workspaceSessionManager";

export interface WorkspaceInitDeps {
  workspaceFolders: readonly vscode.WorkspaceFolder[];
  debounceMs: number;
  manager: WorkspaceSessionManager;
}

export interface WorkspaceInitResult {
  disposables: vscode.Disposable[];
}

export async function initWorkspaceWatchers(
  deps: WorkspaceInitDeps,
): Promise<WorkspaceInitResult> {
  const { workspaceFolders, debounceMs, manager } = deps;
  const disposables: vscode.Disposable[] = [];

  for (const folder of workspaceFolders) {
    const folderUri = folder.uri.toString();
    const workspaceRoot = folder.uri.fsPath;
    const session = manager.getSession(folderUri);
    if (!session) continue;

    const watcherManager = new WatcherManager({
      workspaceRoot,
      debounceMs,
      onLockChange: (content) => {
        const lock = parseLock(content);
        session.sessionState.onLockChanged(lock);
      },
      onProgressChange: (content) => {
        const progress = parseProgress(content);
        session.sessionState.onProgressChanged(progress);
      },
      onLogChange: (content) => {
        session.sessionState.onLogAppended(content);
      },
      createWatcher: (_glob) => {
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(folder, ".claudeloop/**"),
        );
        return watcher;
      },
      readFile: async (filePath) => {
        const bytes = await fs.readFile(filePath, "utf-8");
        return bytes;
      },
    });

    watcherManager.start();

    // Check initial state for this folder
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

      session.sessionState.checkInitialState({ lock: lockState, progress });
    } catch {
      // No .claudeloop/ directory for this folder
    }

    disposables.push({ dispose: () => watcherManager.stop() });
  }

  return { disposables };
}
