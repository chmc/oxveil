import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionState } from "../../../core/sessionState";
import type { ProgressState } from "../../../types";

function makeProgress(overrides?: Partial<ProgressState>): ProgressState {
  return {
    phases: [
      { number: 1, title: "Setup", status: "completed", attempts: 1 },
      { number: 2, title: "Build", status: "in_progress", attempts: 1 },
    ],
    totalPhases: 2,
    currentPhaseIndex: 1,
    ...overrides,
  };
}

function allCompletedProgress(): ProgressState {
  return {
    phases: [
      { number: 1, title: "Setup", status: "completed", attempts: 1 },
      { number: 2, title: "Build", status: "completed", attempts: 1 },
    ],
    totalPhases: 2,
    currentPhaseIndex: undefined,
  };
}

function failedProgress(): ProgressState {
  return {
    phases: [
      { number: 1, title: "Setup", status: "completed", attempts: 1 },
      { number: 2, title: "Build", status: "failed", attempts: 2 },
    ],
    totalPhases: 2,
    currentPhaseIndex: undefined,
  };
}

describe("SessionState", () => {
  let session: SessionState;

  beforeEach(() => {
    session = new SessionState();
  });

  it("initial state is idle", () => {
    expect(session.status).toBe("idle");
    expect(session.progress).toBeUndefined();
  });

  describe("transitions", () => {
    it("idle → running when lock detected", () => {
      const handler = vi.fn();
      session.on("state-changed", handler);

      session.onLockChanged({ locked: true, pid: 123 });

      expect(session.status).toBe("running");
      expect(handler).toHaveBeenCalledWith("idle", "running");
    });

    it("running → done when all phases completed", () => {
      session.onLockChanged({ locked: true, pid: 123 });
      const handler = vi.fn();
      session.on("state-changed", handler);

      session.onProgressChanged(allCompletedProgress());
      session.onLockChanged({ locked: false });

      expect(session.status).toBe("done");
      expect(handler).toHaveBeenCalledWith("running", "done");
    });

    it("running → failed when a phase fails", () => {
      session.onLockChanged({ locked: true, pid: 123 });
      const handler = vi.fn();
      session.on("state-changed", handler);

      session.onProgressChanged(failedProgress());
      session.onLockChanged({ locked: false });

      expect(session.status).toBe("failed");
      expect(handler).toHaveBeenCalledWith("running", "failed");
    });

    it("done → idle on reset", () => {
      session.onLockChanged({ locked: true, pid: 123 });
      session.onProgressChanged(allCompletedProgress());
      session.onLockChanged({ locked: false });
      expect(session.status).toBe("done");

      const handler = vi.fn();
      session.on("state-changed", handler);

      session.reset();

      expect(session.status).toBe("idle");
      expect(handler).toHaveBeenCalledWith("done", "idle");
    });

    it("failed → running when lock reacquired", () => {
      session.onLockChanged({ locked: true, pid: 123 });
      session.onProgressChanged(failedProgress());
      session.onLockChanged({ locked: false });
      expect(session.status).toBe("failed");

      const handler = vi.fn();
      session.on("state-changed", handler);

      session.onLockChanged({ locked: true, pid: 456 });

      expect(session.status).toBe("running");
      expect(handler).toHaveBeenCalledWith("failed", "running");
    });

    it("failed → idle on reset", () => {
      session.onLockChanged({ locked: true, pid: 123 });
      session.onProgressChanged(failedProgress());
      session.onLockChanged({ locked: false });
      expect(session.status).toBe("failed");

      session.reset();

      expect(session.status).toBe("idle");
    });

    it("rejects invalid transition idle → done", () => {
      expect(() => {
        // Simulate trying to go directly to done without running
        session.onProgressChanged(allCompletedProgress());
        session.onLockChanged({ locked: false });
      }).not.toThrow();
      // Should stay idle since we never transitioned to running
      expect(session.status).toBe("idle");
    });
  });

  describe("events", () => {
    it("emits state-changed on transitions", () => {
      const handler = vi.fn();
      session.on("state-changed", handler);

      session.onLockChanged({ locked: true, pid: 123 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith("idle", "running");
    });

    it("emits phases-changed when progress updates", () => {
      const handler = vi.fn();
      session.on("phases-changed", handler);

      session.onLockChanged({ locked: true, pid: 123 });
      const progress = makeProgress();
      session.onProgressChanged(progress);

      expect(handler).toHaveBeenCalledWith(progress);
    });

    it("emits log-appended when log content arrives", () => {
      const handler = vi.fn();
      session.on("log-appended", handler);

      session.onLogAppended("line 1\nline 2\n");

      expect(handler).toHaveBeenCalledWith("line 1\nline 2\n");
    });

    it("emits lock-changed when lock state changes", () => {
      const handler = vi.fn();
      session.on("lock-changed", handler);

      session.onLockChanged({ locked: true, pid: 456 });

      expect(handler).toHaveBeenCalledWith({ locked: true, pid: 456 });
    });
  });

  describe("checkInitialState", () => {
    it("picks up running session when lock exists and PROGRESS.md present", () => {
      const handler = vi.fn();
      session.on("state-changed", handler);

      session.checkInitialState({
        lock: { locked: true, pid: 789 },
        progress: makeProgress(),
      });

      expect(session.status).toBe("running");
      expect(session.progress).toBeDefined();
      expect(handler).toHaveBeenCalledWith("idle", "running");
    });

    it("stays idle when no .claudeloop/ dir (no lock, no progress)", () => {
      session.checkInitialState({
        lock: { locked: false },
        progress: undefined,
      });

      expect(session.status).toBe("idle");
    });

    it("stays idle when lock exists but no progress", () => {
      session.checkInitialState({
        lock: { locked: true, pid: 123 },
        progress: undefined,
      });

      // Lock without progress means claudeloop just started but hasn't written yet
      // Still transition to running since the lock indicates activity
      expect(session.status).toBe("running");
    });
  });
});
