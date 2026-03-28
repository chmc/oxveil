import { EventEmitter } from "node:events";
import { WorkspaceSession } from "./workspaceSession";
import type { WorkspaceSessionInit } from "./workspaceSession";

export interface WorkspaceSessionManagerEvents {
  "active-session-changed": [
    session: WorkspaceSession | undefined,
    previous: WorkspaceSession | undefined,
  ];
}

export interface WorkspaceSessionManagerDeps {
  getActiveFolderUri(): string | undefined;
}

export class WorkspaceSessionManager extends EventEmitter {
  private readonly _sessions = new Map<string, WorkspaceSession>();
  private readonly _deps: WorkspaceSessionManagerDeps;

  constructor(deps: WorkspaceSessionManagerDeps) {
    super();
    this._deps = deps;
  }

  on<K extends keyof WorkspaceSessionManagerEvents>(
    event: K,
    listener: (...args: WorkspaceSessionManagerEvents[K]) => void,
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof WorkspaceSessionManagerEvents>(
    event: K,
    ...args: WorkspaceSessionManagerEvents[K]
  ): boolean {
    return super.emit(event, ...args);
  }

  createSession(init: WorkspaceSessionInit): WorkspaceSession {
    const existing = this._sessions.get(init.folderUri);
    if (existing) {
      return existing;
    }
    const session = new WorkspaceSession(init);
    this._sessions.set(init.folderUri, session);
    return session;
  }

  getSession(folderUri: string): WorkspaceSession | undefined {
    return this._sessions.get(folderUri);
  }

  getActiveSession(): WorkspaceSession | undefined {
    const uri = this._deps.getActiveFolderUri();
    if (!uri) return undefined;
    return this._sessions.get(uri);
  }

  getAllSessions(): WorkspaceSession[] {
    return [...this._sessions.values()];
  }

  removeSession(folderUri: string): boolean {
    const session = this._sessions.get(folderUri);
    if (!session) return false;

    const wasActive = this._deps.getActiveFolderUri() === folderUri;
    session.dispose();
    this._sessions.delete(folderUri);

    if (wasActive) {
      this.emit("active-session-changed", undefined, session);
    }
    return true;
  }

  notifyActiveChanged(): void {
    const current = this.getActiveSession();
    this.emit("active-session-changed", current, undefined);
  }

  dispose(): void {
    for (const session of this._sessions.values()) {
      session.dispose();
    }
    this._sessions.clear();
    this.removeAllListeners();
  }
}
