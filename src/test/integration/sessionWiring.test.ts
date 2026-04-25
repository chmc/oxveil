import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
  commands: {
    executeCommand: vi.fn(),
  },
  Uri: {
    parse: (uri: string) => ({ fsPath: uri.replace("file://", "") }),
  },
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

import { readFile } from "node:fs/promises";

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
    selfImprovementActive: false,
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
      mutableState.selfImprovementActive,
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
    folderUri: "file:///test",
    buildSidebarState: buildFullState,
    sidebarMutableState: mutableState,
  };
  wireSessionEvents(deps);

  return { session, mutableState, buildFullState, sidebarPanel, deps };
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

describe("Session wiring happy path (issue #46)", () => {
  it("lock acquired → running → status bar shows running with phase info", () => {
    const { session, deps } = setup();

    session.onLockChanged({ locked: true, pid: 42 });
    session.onProgressChanged({
      phases: [
        { number: 1, title: "Setup", status: "in_progress" },
        { number: 2, title: "Build", status: "pending" },
      ],
      totalPhases: 2,
      currentPhaseIndex: 0,
    });

    expect(session.status).toBe("running");
    expect(deps.elapsedTimer.start).toHaveBeenCalled();
    // The last statusBar.update call comes from the phases-changed handler
    expect(deps.statusBar.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "running",
        currentPhase: 1,
        totalPhases: 2,
        elapsed: "0m",
      }),
    );
  });

  it("progress updated (phase 1 completed) → status bar Phase 2/2 → sidebar receives phases", () => {
    const { session, sidebarPanel, deps } = setup();

    session.onLockChanged({ locked: true, pid: 42 });
    session.onProgressChanged({
      phases: [
        { number: 1, title: "Setup", status: "in_progress" },
        { number: 2, title: "Build", status: "pending" },
      ],
      totalPhases: 2,
      currentPhaseIndex: 0,
    });

    // Phase 1 completes, phase 2 starts
    session.onProgressChanged({
      phases: [
        { number: 1, title: "Setup", status: "completed" },
        { number: 2, title: "Build", status: "in_progress" },
      ],
      totalPhases: 2,
      currentPhaseIndex: 1,
    });

    expect(deps.statusBar.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "running",
        currentPhase: 2,
        totalPhases: 2,
      }),
    );

    const lastProgressCall = sidebarPanel.sendProgressUpdate.mock.lastCall[0];
    expect(lastProgressCall.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: 1, status: "completed" }),
        expect.objectContaining({ number: 2, status: "in_progress" }),
      ]),
    );
  });

  it("lock removed + all completed → done → status bar done → sidebar view completed", () => {
    const { session, sidebarPanel, buildFullState, deps } = setup();

    session.onLockChanged({ locked: true, pid: 42 });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "in_progress" }],
      totalPhases: 1,
      currentPhaseIndex: 0,
    });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "completed" }],
      totalPhases: 1,
    });
    session.onLockChanged({ locked: false });

    expect(session.status).toBe("done");
    expect(deps.statusBar.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "done", elapsed: "0m" }),
    );
    expect(buildFullState().view).toBe("completed");

    // sidebarPanel.updateState was called via buildAndSendSidebarState
    const lastStateCall = sidebarPanel.updateState.mock.lastCall[0];
    expect(lastStateCall.view).toBe("completed");
  });

  it("elapsed timer starts on lock acquired, stops on lock removed", () => {
    const { session, deps } = setup();

    session.onLockChanged({ locked: true, pid: 42 });
    expect(deps.elapsedTimer.start).toHaveBeenCalledTimes(1);
    expect(deps.elapsedTimer.stop).not.toHaveBeenCalled();

    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "completed" }],
      totalPhases: 1,
    });
    session.onLockChanged({ locked: false });

    expect(deps.elapsedTimer.stop).toHaveBeenCalledTimes(1);
  });
});

describe("Rapid progress updates (issue #46)", () => {
  it("10 rapid onProgressChanged → sidebar receives 10 sendProgressUpdate calls (no wiring-level throttle)", () => {
    // Current code does not throttle at the wiring layer.
    // Throttling only exists at WatcherManager (file system debounce).
    // When wiring-level throttle is added, change assertion to <= 3.
    const { session, sidebarPanel } = setup();

    session.onLockChanged({ locked: true, pid: 42 });

    for (let i = 0; i < 10; i++) {
      session.onProgressChanged({
        phases: [{ number: 1, title: "Work", status: "in_progress" }],
        totalPhases: 10,
        currentPhaseIndex: 0,
      });
    }

    expect(sidebarPanel.sendProgressUpdate).toHaveBeenCalledTimes(10);
  });

  it("final state after rapid updates matches last progress update", () => {
    const { session, sidebarPanel } = setup();

    session.onLockChanged({ locked: true, pid: 42 });

    for (let i = 0; i < 10; i++) {
      const phases = Array.from({ length: 10 }, (_, j) => ({
        number: j + 1,
        title: `Phase ${j + 1}`,
        status: j < i ? ("completed" as const) : j === i ? ("in_progress" as const) : ("pending" as const),
      }));
      session.onProgressChanged({
        phases,
        totalPhases: 10,
        currentPhaseIndex: i,
      });
    }

    const lastCall = sidebarPanel.sendProgressUpdate.mock.lastCall[0];
    expect(lastCall.currentPhase).toBe(9);
    expect(lastCall.phases[9].status).toBe("in_progress");
    expect(lastCall.phases[0].status).toBe("completed");
    expect(lastCall.phases[8].status).toBe("completed");
  });
});

describe("Self-improvement trigger on session completion", () => {
  const LESSONS_MD = `## Phase 1: Setup
- retries: 0
- duration: 45s
- exit: success

## Phase 2: Build
- retries: 2
- duration: 312s
- exit: error
`;

  beforeEach(() => {
    vi.mocked(readFile).mockReset();
  });

  it("triggers self-improvement panel when config enabled and lessons exist", async () => {
    const session = new SessionState();
    const mutableState = makeMutableState();
    const selfImprovementPanel = { reveal: vi.fn() };

    function buildFullState(): SidebarState {
      const view = deriveViewState(
        mutableState.detectionStatus,
        session.status,
        mutableState.planDetected,
        session.progress,
        mutableState.planUserChoice,
        mutableState.selfImprovementActive,
      );
      return { view, archives: [] };
    }

    const deps: SessionWiringDeps = {
      session,
      statusBar: { update: vi.fn(), dispose: vi.fn() },
      notifications: { onPhasesChanged: vi.fn(), reset: vi.fn() },
      elapsedTimer: { start: vi.fn(), stop: vi.fn(), elapsed: "0m" },
      isActiveSession: () => true,
      folderUri: "file:///test",
      buildSidebarState: buildFullState,
      sidebarMutableState: mutableState,
      getConfig: (key: string) => key === "selfImprovement" ? true : undefined,
      selfImprovementPanel: selfImprovementPanel as any,
    };
    wireSessionEvents(deps);

    vi.mocked(readFile).mockResolvedValueOnce(LESSONS_MD);

    // Complete a session
    session.onLockChanged({ locked: true, pid: 42 });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "completed" }],
      totalPhases: 1,
    });
    session.onLockChanged({ locked: false });

    // Wait for async handler
    await vi.waitFor(() => {
      expect(selfImprovementPanel.reveal).toHaveBeenCalled();
    });

    expect(selfImprovementPanel.reveal).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ phase: 1, title: "Setup", exit: "success" }),
        expect.objectContaining({ phase: 2, title: "Build", exit: "error" }),
      ]),
    );
    expect(mutableState.selfImprovementActive).toBe(true);
  });

  it("does not trigger when lessons.md is empty", async () => {
    const session = new SessionState();
    const mutableState = makeMutableState();
    const selfImprovementPanel = { reveal: vi.fn() };

    function buildFullState(): SidebarState {
      const view = deriveViewState(
        mutableState.detectionStatus,
        session.status,
        mutableState.planDetected,
        session.progress,
        mutableState.planUserChoice,
        mutableState.selfImprovementActive,
      );
      return { view, archives: [] };
    }

    const deps: SessionWiringDeps = {
      session,
      statusBar: { update: vi.fn(), dispose: vi.fn() },
      notifications: { onPhasesChanged: vi.fn(), reset: vi.fn() },
      elapsedTimer: { start: vi.fn(), stop: vi.fn(), elapsed: "0m" },
      isActiveSession: () => true,
      folderUri: "file:///test",
      buildSidebarState: buildFullState,
      sidebarMutableState: mutableState,
      getConfig: (key: string) => key === "selfImprovement" ? true : undefined,
      selfImprovementPanel: selfImprovementPanel as any,
    };
    wireSessionEvents(deps);

    vi.mocked(readFile).mockResolvedValueOnce("");

    session.onLockChanged({ locked: true, pid: 42 });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "completed" }],
      totalPhases: 1,
    });
    session.onLockChanged({ locked: false });

    // Wait a tick for async handler to complete
    await new Promise((r) => setTimeout(r, 10));

    expect(selfImprovementPanel.reveal).not.toHaveBeenCalled();
    expect(mutableState.selfImprovementActive).toBe(false);
  });

  it("does not trigger when config is disabled", async () => {
    const session = new SessionState();
    const mutableState = makeMutableState();
    const selfImprovementPanel = { reveal: vi.fn() };

    function buildFullState(): SidebarState {
      const view = deriveViewState(
        mutableState.detectionStatus,
        session.status,
        mutableState.planDetected,
        session.progress,
        mutableState.planUserChoice,
        mutableState.selfImprovementActive,
      );
      return { view, archives: [] };
    }

    const deps: SessionWiringDeps = {
      session,
      statusBar: { update: vi.fn(), dispose: vi.fn() },
      notifications: { onPhasesChanged: vi.fn(), reset: vi.fn() },
      elapsedTimer: { start: vi.fn(), stop: vi.fn(), elapsed: "0m" },
      isActiveSession: () => true,
      folderUri: "file:///test",
      buildSidebarState: buildFullState,
      sidebarMutableState: mutableState,
      getConfig: () => false,
      selfImprovementPanel: selfImprovementPanel as any,
    };
    wireSessionEvents(deps);

    session.onLockChanged({ locked: true, pid: 42 });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "completed" }],
      totalPhases: 1,
    });
    session.onLockChanged({ locked: false });

    await new Promise((r) => setTimeout(r, 10));

    expect(readFile).not.toHaveBeenCalled();
    expect(selfImprovementPanel.reveal).not.toHaveBeenCalled();
    expect(mutableState.selfImprovementActive).toBe(false);
  });

  it("does not trigger when lessons.md is missing (ENOENT)", async () => {
    const session = new SessionState();
    const mutableState = makeMutableState();
    const selfImprovementPanel = { reveal: vi.fn() };

    function buildFullState(): SidebarState {
      const view = deriveViewState(
        mutableState.detectionStatus,
        session.status,
        mutableState.planDetected,
        session.progress,
        mutableState.planUserChoice,
        mutableState.selfImprovementActive,
      );
      return { view, archives: [] };
    }

    const deps: SessionWiringDeps = {
      session,
      statusBar: { update: vi.fn(), dispose: vi.fn() },
      notifications: { onPhasesChanged: vi.fn(), reset: vi.fn() },
      elapsedTimer: { start: vi.fn(), stop: vi.fn(), elapsed: "0m" },
      isActiveSession: () => true,
      folderUri: "file:///test",
      buildSidebarState: buildFullState,
      sidebarMutableState: mutableState,
      getConfig: (key: string) => key === "selfImprovement" ? true : undefined,
      selfImprovementPanel: selfImprovementPanel as any,
    };
    wireSessionEvents(deps);

    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT: no such file"));

    session.onLockChanged({ locked: true, pid: 42 });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "completed" }],
      totalPhases: 1,
    });
    session.onLockChanged({ locked: false });

    await new Promise((r) => setTimeout(r, 10));

    expect(selfImprovementPanel.reveal).not.toHaveBeenCalled();
    expect(mutableState.selfImprovementActive).toBe(false);
  });

  it("resets selfImprovementActive on new run and loads fresh lessons", async () => {
    const session = new SessionState();
    const mutableState = makeMutableState();
    // Simulate stale state from previous self-improvement session
    mutableState.selfImprovementActive = true;

    const selfImprovementPanel = { reveal: vi.fn() };
    function buildFullState(): SidebarState {
      const view = deriveViewState(
        mutableState.detectionStatus,
        session.status,
        mutableState.planDetected,
        session.progress,
        mutableState.planUserChoice,
        mutableState.selfImprovementActive,
      );
      return { view, archives: [] };
    }

    const deps: SessionWiringDeps = {
      session,
      statusBar: { update: vi.fn(), dispose: vi.fn() },
      notifications: { onPhasesChanged: vi.fn(), reset: vi.fn() },
      elapsedTimer: { start: vi.fn(), stop: vi.fn(), elapsed: "0m" },
      isActiveSession: () => true,
      folderUri: "file:///test",
      buildSidebarState: buildFullState,
      sidebarMutableState: mutableState,
      getConfig: (key: string) => key === "selfImprovement" ? true : undefined,
      selfImprovementPanel: selfImprovementPanel as any,
    };
    wireSessionEvents(deps);

    // First: new run starts - should reset selfImprovementActive
    session.onLockChanged({ locked: true, pid: 42 });
    expect(mutableState.selfImprovementActive).toBe(false);

    // Second: run completes with new lessons
    vi.mocked(readFile).mockResolvedValueOnce(`## Phase 1: Fresh
- retries: 0
- duration: 30s
- exit: success`);

    session.onProgressChanged({
      phases: [{ number: 1, title: "Fresh", status: "completed" }],
      totalPhases: 1,
    });
    session.onLockChanged({ locked: false });

    await new Promise((r) => setTimeout(r, 10));

    expect(selfImprovementPanel.reveal).toHaveBeenCalledWith([
      expect.objectContaining({ phase: 1, title: "Fresh" }),
    ]);
    expect(mutableState.selfImprovementActive).toBe(true);
  });
});
