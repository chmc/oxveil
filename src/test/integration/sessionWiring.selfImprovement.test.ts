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
import type { SidebarState } from "../../views/sidebarState";
import { deriveViewState } from "../../views/sidebarState";
import { makeMutableState } from "./sessionWiring.testHelpers";

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
    const sidebarPanel = { updateState: vi.fn(), sendProgressUpdate: vi.fn() } as any;

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
      sidebarPanel,
      getConfig: (key: string) => key === "selfImprovement" ? true : undefined,
      selfImprovementPanel: selfImprovementPanel as any,
    };
    wireSessionEvents(deps);

    vi.mocked(readFile).mockResolvedValueOnce(LESSONS_MD);

    session.onLockChanged({ locked: true, pid: 42 });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "completed" }],
      totalPhases: 1,
    });
    session.onLockChanged({ locked: false });

    const vscode = await import("vscode");
    await vi.waitFor(() => {
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "oxveil.selfImprovement.start",
        expect.arrayContaining([
          expect.objectContaining({ phase: 1, title: "Setup", exit: "success" }),
          expect.objectContaining({ phase: 2, title: "Build", exit: "error" }),
        ]),
      );
    });

    expect(mutableState.selfImprovementActive).toBe(true);
    expect(sidebarPanel.updateState).toHaveBeenCalledWith(
      expect.objectContaining({ view: "self-improvement" })
    );
  });

  it("refreshes sidebar after setting selfImprovementActive flag", async () => {
    const session = new SessionState();
    const mutableState = makeMutableState();
    const selfImprovementPanel = { reveal: vi.fn() };
    const sidebarPanel = { updateState: vi.fn(), sendProgressUpdate: vi.fn() };

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
      sidebarPanel: sidebarPanel as any,
      getConfig: (key: string) => key === "selfImprovement" ? true : undefined,
      selfImprovementPanel: selfImprovementPanel as any,
    };
    wireSessionEvents(deps);

    vi.mocked(readFile).mockResolvedValueOnce(LESSONS_MD);

    session.onLockChanged({ locked: true, pid: 42 });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "completed" }],
      totalPhases: 1,
    });
    session.onLockChanged({ locked: false });

    await vi.waitFor(() => {
      expect(mutableState.selfImprovementActive).toBe(true);
    });

    const lastCall = sidebarPanel.updateState.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    expect(lastCall![0].view).toBe("self-improvement");
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

    session.onLockChanged({ locked: true, pid: 42 });
    expect(mutableState.selfImprovementActive).toBe(false);

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

    const vscode = await import("vscode");
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "oxveil.selfImprovement.start",
      [expect.objectContaining({ phase: 1, title: "Fresh" })],
    );
    expect(mutableState.selfImprovementActive).toBe(true);
  });
});
