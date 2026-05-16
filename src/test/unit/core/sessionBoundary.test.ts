import { describe, it, expect, vi } from "vitest";
import { SessionState } from "../../../core/sessionState";
import { SidebarMutableState } from "../../../core/sidebarMutableState";
import { WorkspaceSession } from "../../../core/workspaceSession";
import type { ProgressState } from "../../../types";

function completedProgress(): ProgressState {
  return {
    phases: [
      { number: 1, title: "Phase 1", status: "completed", attempts: 1 },
      { number: 2, title: "Phase 2", status: "completed", attempts: 1 },
    ],
    totalPhases: 2,
    currentPhaseIndex: undefined,
  };
}

function failedProgress(): ProgressState {
  return {
    phases: [{ number: 1, title: "Phase 1", status: "failed", attempts: 2 }],
    totalPhases: 1,
    currentPhaseIndex: undefined,
  };
}

describe("Session boundary: SessionState.reset()", () => {
  it("clears progress on reset from done", () => {
    const state = new SessionState();
    state.onLockChanged({ locked: true, pid: 1 });
    state.onProgressChanged(completedProgress());
    state.onLockChanged({ locked: false });
    expect(state.progress).toBeDefined();

    state.reset();

    expect(state.progress).toBeUndefined();
  });

  it("returns to idle from done", () => {
    const state = new SessionState();
    state.onLockChanged({ locked: true, pid: 1 });
    state.onProgressChanged(completedProgress());
    state.onLockChanged({ locked: false });
    expect(state.status).toBe("done");

    state.reset();

    expect(state.status).toBe("idle");
  });

  it("returns to idle from failed", () => {
    const state = new SessionState();
    state.onLockChanged({ locked: true, pid: 1 });
    state.onProgressChanged(failedProgress());
    state.onLockChanged({ locked: false });
    expect(state.status).toBe("failed");

    state.reset();

    expect(state.status).toBe("idle");
    expect(state.progress).toBeUndefined();
  });

  it("emits state-changed idle on reset", () => {
    const state = new SessionState();
    state.onLockChanged({ locked: true, pid: 1 });
    state.onProgressChanged(completedProgress());
    state.onLockChanged({ locked: false });

    const handler = vi.fn();
    state.on("state-changed", handler);

    state.reset();

    expect(handler).toHaveBeenCalledWith("done", "idle");
  });

  it("reset from idle is a no-op (stays idle, no error)", () => {
    const state = new SessionState();
    const handler = vi.fn();
    state.on("state-changed", handler);

    state.reset();

    expect(state.status).toBe("idle");
    expect(state.progress).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it("reset from running is a no-op (stays running)", () => {
    const state = new SessionState();
    state.onLockChanged({ locked: true, pid: 1 });
    const handler = vi.fn();
    state.on("state-changed", handler);

    state.reset();

    expect(state.status).toBe("running");
    expect(handler).not.toHaveBeenCalled();
  });

  it("accepts a new session after reset from done", () => {
    const state = new SessionState();
    state.onLockChanged({ locked: true, pid: 1 });
    state.onProgressChanged(completedProgress());
    state.onLockChanged({ locked: false });
    state.reset();

    // Should accept a new run
    state.onLockChanged({ locked: true, pid: 2 });

    expect(state.status).toBe("running");
  });

  it("accepts a new session after reset from failed", () => {
    const state = new SessionState();
    state.onLockChanged({ locked: true, pid: 1 });
    state.onProgressChanged(failedProgress());
    state.onLockChanged({ locked: false });
    state.reset();

    state.onLockChanged({ locked: true, pid: 2 });

    expect(state.status).toBe("running");
  });
});

describe("Session boundary: SidebarMutableState.resetForNewRun()", () => {
  it("clears cost", () => {
    const s = new SidebarMutableState({ cost: 1.23 });
    s.resetForNewRun();
    expect(s.cost).toBe(0);
  });

  it("clears todoDone and todoTotal", () => {
    const s = new SidebarMutableState({ todoDone: 3, todoTotal: 5 });
    s.resetForNewRun();
    expect(s.todoDone).toBe(0);
    expect(s.todoTotal).toBe(0);
  });

  it("clears aiParsing", () => {
    const s = new SidebarMutableState({ aiParsing: true });
    s.resetForNewRun();
    expect(s.aiParsing).toBe(false);
  });

  it("clears selfImprovementActive", () => {
    const s = new SidebarMutableState({ selfImprovementActive: true });
    s.resetForNewRun();
    expect(s.selfImprovementActive).toBe(false);
  });

  it("preserves detectionStatus across run reset", () => {
    const s = new SidebarMutableState({ detectionStatus: "found" });
    s.resetForNewRun();
    expect(s.detectionStatus).toBe("found");
  });

  it("preserves planDetected across run reset", () => {
    const s = new SidebarMutableState({ planDetected: true });
    s.resetForNewRun();
    expect(s.planDetected).toBe(true);
  });

  it("preserves lessonsAvailable across run reset", () => {
    const s = new SidebarMutableState({ lessonsAvailable: true });
    s.resetForNewRun();
    expect(s.lessonsAvailable).toBe(true);
  });
});

describe("Session boundary: SidebarMutableState.resetAll()", () => {
  it("resets every field to default", () => {
    const s = new SidebarMutableState({
      detectionStatus: "found",
      planDetected: true,
      planUserChoice: "approved",
      cachedPlanPhases: [{ number: 1, title: "x", status: "completed", attempts: 1 }],
      cost: 9.99,
      todoDone: 4,
      todoTotal: 8,
      selfImprovementActive: true,
      lessonsAvailable: true,
      aiParsing: true,
    });

    s.resetAll();

    expect(s.detectionStatus).toBe("not-found");
    expect(s.planDetected).toBe(false);
    expect(s.planUserChoice).toBe("none");
    expect(s.cachedPlanPhases).toEqual([]);
    expect(s.cost).toBe(0);
    expect(s.todoDone).toBe(0);
    expect(s.todoTotal).toBe(0);
    expect(s.selfImprovementActive).toBe(false);
    expect(s.lessonsAvailable).toBe(false);
    expect(s.aiParsing).toBe(false);
  });
});

describe("Session boundary: new WorkspaceSession", () => {
  const init = { folderUri: "file:///proj", workspaceRoot: "/proj" };

  it("starts with idle SessionState", () => {
    const ws = new WorkspaceSession(init);
    expect(ws.sessionState.status).toBe("idle");
  });

  it("starts with no progress", () => {
    const ws = new WorkspaceSession(init);
    expect(ws.sessionState.progress).toBeUndefined();
  });

  it("each WorkspaceSession gets an independent SessionState", () => {
    const ws1 = new WorkspaceSession(init);
    const ws2 = new WorkspaceSession(init);

    ws1.sessionState.onLockChanged({ locked: true, pid: 1 });

    expect(ws1.sessionState.status).toBe("running");
    expect(ws2.sessionState.status).toBe("idle");
  });
});
