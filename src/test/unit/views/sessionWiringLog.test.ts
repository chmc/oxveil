import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

import { SessionState } from "../../../core/sessionState";
import { wireSessionEvents, type SessionWiringDeps } from "../../../sessionWiring";

describe("wireSessionEvents — uses buildSidebarState for sidebar updates", () => {
  it("calls buildSidebarState on session state change and merges cost/todos", () => {
    const session = new SessionState();
    const sidebarPanel = { updateState: vi.fn(), sendProgressUpdate: vi.fn() } as any;
    const buildSidebarState = vi.fn(() => ({
      view: "running" as const,
      plan: { filename: "PLAN.md", phases: [] },
      session: { elapsed: "1m" },
      archives: [],
    }));
    const deps: SessionWiringDeps = {
      session,
      statusBar: { update: vi.fn(), dispose: vi.fn() },
      notifications: { onPhasesChanged: vi.fn() },
      elapsedTimer: { start: vi.fn(), stop: vi.fn(), elapsed: "0m" },
      sidebarPanel,
      isActiveSession: () => true,
      folderUri: "/test",
      buildSidebarState,
    };
    wireSessionEvents(deps);

    // Trigger running state
    session.onLockChanged({ locked: true, pid: 1 });

    expect(buildSidebarState).toHaveBeenCalled();
    expect(sidebarPanel.updateState).toHaveBeenCalledWith(
      expect.objectContaining({ view: "running", plan: { filename: "PLAN.md", phases: [] } }),
    );
  });
});

describe("wireSessionEvents — log-appended handler", () => {
  let session: SessionState;
  let deps: SessionWiringDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    session = new SessionState();
    deps = {
      session,
      statusBar: { update: vi.fn(), dispose: vi.fn() },
      notifications: { onPhasesChanged: vi.fn() },
      elapsedTimer: { start: vi.fn(), stop: vi.fn(), elapsed: "0m" },
      sidebarPanel: { updateState: vi.fn(), sendProgressUpdate: vi.fn() } as any,
      isActiveSession: () => true,
      folderUri: "/test",
      detectionStatus: "detected" as const,
      planDetected: false,
      getArchives: () => [],
      getPlanUserChoice: () => "none" as const,
    };
    wireSessionEvents(deps);

    // Transition to running
    session.onLockChanged({ locked: true, pid: 1 });
    // Set progress so sendProgressUpdate has phases to include
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "in_progress" }],
      totalPhases: 1,
      currentPhaseIndex: 0,
    });
    vi.clearAllMocks();
  });

  it("parses cost from log line", () => {
    session.onLogAppended("Phase 1: cost=$0.05\n");

    expect(deps.sidebarPanel!.sendProgressUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ cost: "$0.05" }),
    );
  });

  it("accumulates cost across multiple events", () => {
    session.onLogAppended("cost=$0.05\n");
    session.onLogAppended("cost=$0.10\n");

    expect(deps.sidebarPanel!.sendProgressUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ cost: "$0.15" }),
    );
  });

  it("parses todo from log line", () => {
    session.onLogAppended("[Todos: 3/5 done]\n");

    expect(deps.sidebarPanel!.sendProgressUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ todos: { done: 3, total: 5 } }),
    );
  });

  it("does not send update for log without cost or todo", () => {
    session.onLogAppended("just some plain log text\n");

    expect(deps.sidebarPanel!.sendProgressUpdate).not.toHaveBeenCalled();
  });

  it("resets cost on new run", () => {
    session.onLogAppended("cost=$0.05\n");
    vi.clearAllMocks();

    // Simulate new run: unlock, reset to idle, then re-lock
    session.onLockChanged({ locked: false, pid: 0 });
    session.reset();
    session.onLockChanged({ locked: true, pid: 2 });
    // Re-set progress for the new run
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "in_progress" }],
      totalPhases: 1,
      currentPhaseIndex: 0,
    });
    vi.clearAllMocks();

    session.onLogAppended("cost=$0.03\n");

    expect(deps.sidebarPanel!.sendProgressUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ cost: "$0.03" }),
    );
  });

  it("handles multiple cost entries in one chunk", () => {
    session.onLogAppended("cost=$0.03\ncost=$0.02\n");

    expect(deps.sidebarPanel!.sendProgressUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ cost: "$0.05" }),
    );
  });
});
