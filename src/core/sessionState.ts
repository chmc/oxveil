import { EventEmitter } from "node:events";
import type { ProgressState, SessionStatus } from "../types";
import type { LockState } from "./lock";
import { VersionedSnapshot } from "./state/VersionedSnapshot";
export { StaleStateError } from "./state/VersionedSnapshot";

const TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  idle: ["running"],
  running: ["done", "failed", "idle"],
  done: ["idle", "running"],
  failed: ["idle", "running"],
};

export class InvalidTransitionError extends Error {
  constructor(from: SessionStatus, to: SessionStatus) {
    super(`Invalid transition: ${from} → ${to}`);
  }
}

export interface SessionStateEvents {
  "state-changed": [from: SessionStatus, to: SessionStatus];
  "phases-changed": [progress: ProgressState];
  "log-appended": [content: string];
  "lock-changed": [lock: LockState];
}

export class SessionState extends EventEmitter {
  private _status: SessionStatus = "idle";
  private _progress: ProgressState | undefined;
  private _snapshot = new VersionedSnapshot<{ status: SessionStatus; progress: ProgressState | undefined }>({ status: "idle", progress: undefined });

  get status(): SessionStatus {
    return this._status;
  }

  get progress(): ProgressState | undefined {
    return this._progress;
  }

  readSnapshot(): { status: SessionStatus; progress: ProgressState | undefined; seq: number } {
    const { value, seq } = this._snapshot.read();
    return { ...value, seq };
  }

  assertFresh(seq: number): void {
    this._snapshot.assertFresh(seq);
  }

  on<K extends keyof SessionStateEvents>(
    event: K,
    listener: (...args: SessionStateEvents[K]) => void,
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof SessionStateEvents>(
    event: K,
    ...args: SessionStateEvents[K]
  ): boolean {
    return super.emit(event, ...args);
  }

  onLockChanged(lock: LockState): void {
    this.emit("lock-changed", lock);

    if (lock.locked && (this._status === "idle" || this._status === "failed")) {
      this._transition("running");
    } else if (!lock.locked && this._status === "running") {
      // Lock released while running — determine final state from progress
      const hasFailed = this._progress?.phases.some(
        (p) => p.status === "failed",
      );
      const allCompleted =
        this._progress &&
        this._progress.phases.length > 0 &&
        this._progress.phases.every((p) => p.status === "completed");

      if (allCompleted) {
        this._transition("done");
      } else if (hasFailed) {
        this._transition("failed");
      } else {
        // Lock released but no clear terminal state — treat as done
        this._transition("done");
      }
    }
  }

  onProgressChanged(progress: ProgressState): void {
    this._progress = progress;
    this._snapshot.update((v) => ({ ...v, progress }));
    this.emit("phases-changed", progress);
  }

  onLogAppended(content: string): void {
    this.emit("log-appended", content);
  }

  reset(): void {
    this._progress = undefined;
    if (this._status === "done" || this._status === "failed") {
      this._transition("idle");
    }
  }

  checkInitialState(state: {
    lock: LockState;
    progress: ProgressState | undefined;
  }): void {
    if (state.progress) {
      this._progress = state.progress;
      this.emit("phases-changed", state.progress);
    }

    if (state.lock.locked) {
      this._transition("running");
    }
  }

  private _transition(to: SessionStatus): void {
    const from = this._status;
    if (!TRANSITIONS[from].includes(to)) {
      throw new InvalidTransitionError(from, to);
    }
    this._status = to;
    this._snapshot.update((v) => ({ ...v, status: to }));
    this.emit("state-changed", from, to);
  }
}
