import { SessionState } from "./sessionState";
import type { ProcessManager } from "./processManager";
import type { GitExecDeps } from "./gitIntegration";

export interface WorkspaceSessionInit {
  folderUri: string;
  workspaceRoot: string;
}

export class WorkspaceSession {
  readonly folderUri: string;
  readonly workspaceRoot: string;
  readonly sessionState: SessionState;
  processManager: ProcessManager | undefined;
  gitExec: GitExecDeps | undefined;

  constructor(init: WorkspaceSessionInit) {
    this.folderUri = init.folderUri;
    this.workspaceRoot = init.workspaceRoot;
    this.sessionState = new SessionState();
  }

  dispose(): void {
    this.sessionState.removeAllListeners();
    this.processManager = undefined;
    this.gitExec = undefined;
  }
}
