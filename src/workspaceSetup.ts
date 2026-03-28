import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitExecDeps } from "./core/gitIntegration";
import type { WorkspaceSessionManager } from "./core/workspaceSessionManager";
import type { WorkspaceSession } from "./core/workspaceSession";
import { createProcessManager } from "./processManagerFactory";
import { wireSessionEvents, type SessionWiringDeps } from "./sessionWiring";

const execFileAsync = promisify(execFile);

export function createGitExec(workspaceRoot: string | undefined): GitExecDeps | undefined {
  if (!workspaceRoot) return undefined;
  return {
    exec: async (command: string, args: string[], cwd: string) => {
      const { stdout } = await execFileAsync(command, args, { cwd });
      return stdout;
    },
    cwd: workspaceRoot,
  };
}

export interface InitFolderSessionsOpts {
  manager: WorkspaceSessionManager;
  folders: ReadonlyArray<{ uri: { toString(): string; fsPath: string } }>;
  claudeloopPath: string;
  resolvedPath: string | undefined;
  platform: NodeJS.Platform;
}

/**
 * Creates a WorkspaceSession (with processManager + gitExec) for each folder.
 */
export function initFolderSessions(opts: InitFolderSessionsOpts): void {
  for (const folder of opts.folders) {
    const root = folder.uri.fsPath;
    const ws = opts.manager.createSession({ folderUri: folder.uri.toString(), workspaceRoot: root });
    ws.processManager = createProcessManager({
      claudeloopPath: opts.claudeloopPath,
      resolvedPath: opts.resolvedPath,
      workspaceRoot: root,
      platform: opts.platform,
    });
    ws.gitExec = createGitExec(root);
  }
}

export type SessionWiringContext = Omit<SessionWiringDeps, "session">;

/**
 * Wires session events for all existing sessions and attaches archive-refresh on done/failed.
 */
export function wireAllSessions(
  manager: WorkspaceSessionManager,
  wiringCtx: SessionWiringContext,
  onArchiveDone: () => void,
): void {
  for (const ws of manager.getAllSessions()) {
    wireSessionEvents({ ...wiringCtx, session: ws.sessionState });
    ws.sessionState.on("state-changed", (_from, to) => {
      if (to === "done" || to === "failed") {
        onArchiveDone();
      }
    });
  }
}

export interface FolderChangeOpts {
  manager: WorkspaceSessionManager;
  detected: boolean;
  claudeloopPath: string;
  resolvedPath: string | undefined;
  platform: NodeJS.Platform;
  wiringCtx: SessionWiringContext;
  onArchiveDone: () => void;
}

/**
 * Handles workspace folder add/remove events.
 */
export function handleWorkspaceFolderChange(
  e: { added: ReadonlyArray<{ uri: { toString(): string; fsPath: string } }>; removed: ReadonlyArray<{ uri: { toString(): string } }> },
  opts: FolderChangeOpts,
): void {
  for (const added of e.added) {
    const ws = opts.manager.createSession({
      folderUri: added.uri.toString(),
      workspaceRoot: added.uri.fsPath,
    });
    if (opts.detected) {
      ws.processManager = createProcessManager({
        claudeloopPath: opts.claudeloopPath,
        resolvedPath: opts.resolvedPath,
        workspaceRoot: added.uri.fsPath,
        platform: opts.platform,
      });
      ws.gitExec = createGitExec(added.uri.fsPath);
      wireSessionEvents({ ...opts.wiringCtx, session: ws.sessionState });
      ws.sessionState.on("state-changed", (_from, to) => {
        if (to === "done" || to === "failed") {
          opts.onArchiveDone();
        }
      });
    }
  }
  for (const removed of e.removed) {
    opts.manager.removeSession(removed.uri.toString());
  }
}
