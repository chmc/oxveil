import { SessionState } from "./sessionState";
import type { ProcessManager } from "./processManager";
import type { GitExecDeps } from "./gitIntegration";

export interface WorkspaceSessionInit {
  folderUri: string;
  workspaceRoot: string;
  planFileOverride?: string;
}

export class WorkspaceSession {
  readonly folderUri: string;
  readonly workspaceRoot: string;
  readonly planFileOverride: string | undefined;
  readonly sessionState: SessionState;
  processManager: ProcessManager | undefined;
  gitExec: GitExecDeps | undefined;
  private _disposed = false;

  constructor(init: WorkspaceSessionInit) {
    this.folderUri = init.folderUri;
    this.workspaceRoot = init.workspaceRoot;
    this.planFileOverride = init.planFileOverride;
    this.sessionState = new SessionState();
  }

  get isDisposed(): boolean { return this._disposed; }

  dispose(): void {
    this._disposed = true;
    this.processManager?.deactivate().catch(() => {});
    this.sessionState.removeAllListeners();
    this.processManager = undefined;
    this.gitExec = undefined;
  }
}
