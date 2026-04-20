import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

import { SessionState } from "../../core/sessionState";
import { wireSessionEvents, type SessionWiringDeps } from "../../sessionWiring";
import type { SidebarMutableState } from "../../activateSidebar";
import type { SidebarState } from "../../views/sidebarState";
import { deriveViewState, mapPhases } from "../../views/sidebarState";

function makeMutableState(): SidebarMutableState {
  return {
    detectionStatus: "detected",
    planDetected: false,
    planUserChoice: "none",
    cachedPlanPhases: [],
    cost: 0,
    todoDone: 0,
    todoTotal: 0,
  };
}

function setup() {
  const session = new SessionState();
  const mutableState = makeMutableState();

  function buildFullState(): SidebarState {
    const sessionStatus = session.status;
    const progress = session.progress;
    const view = deriveViewState(
      mutableState.detectionStatus,
      sessionStatus,
      mutableState.planDetected,
      progress,
      mutableState.planUserChoice,
    );
    return {
      view,
      session: sessionStatus === "running" || sessionStatus === "done" || sessionStatus === "failed" ? {
        elapsed: "0m",
        cost: mutableState.cost > 0 ? `$${mutableState.cost.toFixed(2)}` : undefined,
        todos: mutableState.todoTotal > 0 ? { done: mutableState.todoDone, total: mutableState.todoTotal } : undefined,
      } : undefined,
      archives: [],
    };
  }

  const sidebarPanel = { updateState: vi.fn(), sendProgressUpdate: vi.fn() } as any;
  const deps: SessionWiringDeps = {
    session,
    statusBar: { update: vi.fn(), dispose: vi.fn() },
    notifications: { onPhasesChanged: vi.fn(), reset: vi.fn() },
    elapsedTimer: { start: vi.fn(), stop: vi.fn(), elapsed: "0m" },
    sidebarPanel,
    isActiveSession: () => true,
    folderUri: "/test",
    buildSidebarState: buildFullState,
    sidebarMutableState: mutableState,
  };
  wireSessionEvents(deps);

  return { session, mutableState, buildFullState, sidebarPanel };
}

describe("Cost tracking through buildFullState (issue #33)", () => {
  it("log with cost=$0.50 → buildFullState().session.cost === '$0.50'", () => {
    const { session, buildFullState } = setup();

    session.onLockChanged({ locked: true, pid: 1 });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "in_progress" }],
      totalPhases: 1,
      currentPhaseIndex: 0,
    });

    session.onLogAppended("[Session: model=haiku cost=$0.50 duration=2s]\n");

    const state = buildFullState();
    expect(state.session?.cost).toBe("$0.50");
  });

  it("cost accumulates across multiple log lines", () => {
    const { session, buildFullState } = setup();

    session.onLockChanged({ locked: true, pid: 1 });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "in_progress" }],
      totalPhases: 1,
      currentPhaseIndex: 0,
    });

    session.onLogAppended("cost=$0.30\n");
    session.onLogAppended("cost=$0.20\n");

    const state = buildFullState();
    expect(state.session?.cost).toBe("$0.50");
  });

  it("cost present in completed state", () => {
    const { session, buildFullState } = setup();

    session.onLockChanged({ locked: true, pid: 1 });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "in_progress" }],
      totalPhases: 1,
      currentPhaseIndex: 0,
    });
    session.onLogAppended("cost=$0.75\n");

    // Complete the run
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "completed" }],
      totalPhases: 1,
    });
    session.onLockChanged({ locked: false });

    expect(session.status).toBe("done");
    const state = buildFullState();
    expect(state.session?.cost).toBe("$0.75");
  });

  it("cost resets on new run", () => {
    const { session, buildFullState } = setup();

    // First run
    session.onLockChanged({ locked: true, pid: 1 });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "in_progress" }],
      totalPhases: 1,
      currentPhaseIndex: 0,
    });
    session.onLogAppended("cost=$0.50\n");
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "completed" }],
      totalPhases: 1,
    });
    session.onLockChanged({ locked: false });
    session.reset();

    // Second run — cost should be fresh
    session.onLockChanged({ locked: true, pid: 2 });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Build", status: "in_progress" }],
      totalPhases: 1,
      currentPhaseIndex: 0,
    });
    session.onLogAppended("cost=$0.10\n");

    const state = buildFullState();
    expect(state.session?.cost).toBe("$0.10");
  });

  it("todo tracking flows through buildFullState", () => {
    const { session, buildFullState } = setup();

    session.onLockChanged({ locked: true, pid: 1 });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "in_progress" }],
      totalPhases: 1,
      currentPhaseIndex: 0,
    });

    session.onLogAppended("[Todos: 3/5 done]\n");

    const state = buildFullState();
    expect(state.session?.todos).toEqual({ done: 3, total: 5 });
  });
});
