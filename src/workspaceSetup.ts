import { execFile } from "node:child_process";
import * as path from "node:path";
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

export type SessionWiringContext = Omit<SessionWiringDeps, "session" | "folderUri" | "folderName" | "getOtherRootsSummary" | "isActiveSession">;

function computeOtherRootsSummary(
  manager: WorkspaceSessionManager,
  excludeUri: string,
): string | undefined {
  const others = manager.getAllSessions().filter((s) => s.folderUri !== excludeUri);
  if (others.length === 0) return undefined;

  const counts = new Map<string, number>();
  for (const s of others) {
    const status = s.sessionState.status;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  const parts: string[] = [];
  for (const [status, count] of counts) {
    parts.push(`+${count} ${status}`);
  }
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function sessionWiringDeps(
  ws: WorkspaceSession,
  manager: WorkspaceSessionManager,
  wiringCtx: SessionWiringContext,
): SessionWiringDeps {
  const isMultiRoot = manager.getAllSessions().length > 1;
  return {
    ...wiringCtx,
    session: ws.sessionState,
    folderUri: ws.folderUri,
    folderName: isMultiRoot ? path.basename(ws.workspaceRoot) : undefined,
    getOtherRootsSummary: isMultiRoot
      ? () => computeOtherRootsSummary(manager, ws.folderUri)
      : undefined,
    isActiveSession: () => manager.getActiveSession() === ws,
  };
}

export interface ArchiveCallbacks {
  /** Refresh archive metadata only (no sidebar update). */
  refreshArchive: () => void | Promise<void>;
  /** Refresh archives AND update sidebar with full state. */
  onArchiveDone: () => void | Promise<void>;
}

function attachArchiveListener(
  ws: WorkspaceSession,
  manager: WorkspaceSessionManager,
  callbacks: ArchiveCallbacks,
): void {
  ws.sessionState.on("state-changed", (_from, to) => {
    if (to === "done" || to === "failed") {
      if (manager.getActiveSession() === ws) {
        callbacks.onArchiveDone();
      } else {
        callbacks.refreshArchive();
      }
    }
  });
}

/**
 * Wires session events for all existing sessions and attaches archive-refresh on done/failed.
 */
export function wireAllSessions(
  manager: WorkspaceSessionManager,
  wiringCtx: SessionWiringContext,
  archiveCallbacks: ArchiveCallbacks,
): void {
  for (const ws of manager.getAllSessions()) {
    wireSessionEvents(sessionWiringDeps(ws, manager, wiringCtx));
    attachArchiveListener(ws, manager, archiveCallbacks);
  }
}

export interface FolderChangeOpts {
  manager: WorkspaceSessionManager;
  detected: boolean;
  claudeloopPath: string;
  resolvedPath: string | undefined;
  platform: NodeJS.Platform;
  wiringCtx: SessionWiringContext;
  archiveCallbacks: ArchiveCallbacks;
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
      wireSessionEvents(sessionWiringDeps(ws, opts.manager, opts.wiringCtx));
      attachArchiveListener(ws, opts.manager, opts.archiveCallbacks);
    }
  }
  for (const removed of e.removed) {
    opts.manager.removeSession(removed.uri.toString());
  }
}
