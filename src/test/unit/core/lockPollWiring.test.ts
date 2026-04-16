import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionState } from "../../../core/sessionState";
import { parseLock } from "../../../core/lock";
import { deriveViewState } from "../../../views/sidebarState";
import type { ProgressState } from "../../../types";

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

function partialProgress(): ProgressState {
  return {
    phases: [
      { number: 1, title: "Setup", status: "completed", attempts: 1 },
      { number: 2, title: "Build", status: "in_progress", attempts: 1 },
    ],
    totalPhases: 2,
    currentPhaseIndex: 1,
  };
}

describe("lock poll wiring — full chain", () => {
  let session: SessionState;

  beforeEach(() => {
    session = new SessionState();
  });

  it("lock file removed → SessionState transitions to done", () => {
    // Simulate lock acquired
    session.onLockChanged(parseLock("12345"));
    expect(session.status).toBe("running");

    // Simulate lock removed (as poll would deliver via onLockChange(""))
    session.onLockChanged(parseLock(""));
    expect(session.status).toBe("done");
  });

  it("lock removed + all phases completed → deriveViewState returns completed", () => {
    session.onLockChanged(parseLock("12345"));
    session.onProgressChanged(allCompletedProgress());
    session.onLockChanged(parseLock(""));

    expect(session.status).toBe("done");

    const view = deriveViewState(
      "detected",
      session.status,
      true,
      session.progress,
    );
    expect(view).toBe("completed");
  });

  it("lock removed + partial progress → deriveViewState returns stopped", () => {
    session.onLockChanged(parseLock("12345"));
    session.onProgressChanged(partialProgress());
    session.onLockChanged(parseLock(""));

    expect(session.status).toBe("done");

    const view = deriveViewState(
      "detected",
      session.status,
      true,
      session.progress,
    );
    expect(view).toBe("stopped");
  });

  it("lock removed → state-changed event fires with (running, done)", () => {
    session.onLockChanged(parseLock("12345"));

    const handler = vi.fn();
    session.on("state-changed", handler);

    session.onLockChanged(parseLock(""));

    expect(handler).toHaveBeenCalledWith("running", "done");
  });

  it("elapsed timer stops on transition from running to done", () => {
    session.onLockChanged(parseLock("12345"));

    const stateChanges: Array<[string, string]> = [];
    session.on("state-changed", (from, to) => stateChanges.push([from, to]));

    session.onLockChanged(parseLock(""));

    // The state-changed event is what sessionWiring.ts uses to stop the timer
    expect(stateChanges).toEqual([["running", "done"]]);
    expect(session.status).not.toBe("running");
  });

  it("idempotency: onLockChanged({ locked: false }) twice from running → only one transition", () => {
    session.onLockChanged(parseLock("12345"));
    expect(session.status).toBe("running");

    const handler = vi.fn();
    session.on("state-changed", handler);

    // First unlock
    session.onLockChanged(parseLock(""));
    expect(session.status).toBe("done");

    // Second unlock (poll + watcher race)
    session.onLockChanged(parseLock(""));
    expect(session.status).toBe("done");

    // Only one state-changed event
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("flapping lock: deleted → done, recreated → stays done (not re-triggered to running)", () => {
    session.onLockChanged(parseLock("12345"));
    session.onProgressChanged(allCompletedProgress());
    session.onLockChanged(parseLock(""));
    expect(session.status).toBe("done");

    // Lock reappears (new run started externally)
    session.onLockChanged(parseLock("99999"));

    // Session stays done — only idle → running is valid
    expect(session.status).toBe("done");
  });
});
