import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
  commands: { executeCommand: vi.fn() },
}));

import { WorkspaceSessionManager } from "../../core/workspaceSessionManager";
import { wireAllSessions, handleWorkspaceFolderChange, type ArchiveCallbacks } from "../../workspaceSetup";
import type { SessionWiringContext } from "../../workspaceSetup";

function makeWiringCtx(): SessionWiringContext {
  return {
    statusBar: { update: vi.fn(), dispose: vi.fn() },
    notifications: { onPhasesChanged: vi.fn(), reset: vi.fn() },
    elapsedTimer: { start: vi.fn(), stop: vi.fn(), elapsed: "0m" },
    sidebarPanel: { updateState: vi.fn(), sendProgressUpdate: vi.fn() } as any,
    buildSidebarState: () => ({ view: "empty" as const, archives: [] }),
    sidebarMutableState: {
      detectionStatus: "detected" as const,
      planDetected: false,
      planUserChoice: "none" as const,
      cachedPlanPhases: [],
      cost: 0,
      todoDone: 0,
      todoTotal: 0,
      selfImprovementActive: false,
    },
  };
}

function makeCallbacks() {
  return {
    refreshArchive: vi.fn(),
    onArchiveDone: vi.fn(),
  };
}

describe("wireAllSessions archive guard", () => {
  let activeFolderUri: string | undefined;
  let manager: WorkspaceSessionManager;
  let callbacks: ReturnType<typeof makeCallbacks>;

  beforeEach(() => {
    activeFolderUri = "file:///folderA";
    manager = new WorkspaceSessionManager({
      getActiveFolderUri: () => activeFolderUri,
    });
    callbacks = makeCallbacks();
  });

  it("active session done calls onArchiveDone", () => {
    const wsA = manager.createSession({ folderUri: "file:///folderA", workspaceRoot: "/folderA" });
    manager.createSession({ folderUri: "file:///folderB", workspaceRoot: "/folderB" });
    wireAllSessions(manager, makeWiringCtx(), callbacks);

    wsA.sessionState.onLockChanged({ locked: true, pid: 1 });
    wsA.sessionState.onLockChanged({ locked: false });

    expect(callbacks.onArchiveDone).toHaveBeenCalledTimes(1);
    expect(callbacks.refreshArchive).not.toHaveBeenCalled();
  });

  it("background session done calls only refreshArchive", () => {
    manager.createSession({ folderUri: "file:///folderA", workspaceRoot: "/folderA" });
    const wsB = manager.createSession({ folderUri: "file:///folderB", workspaceRoot: "/folderB" });
    wireAllSessions(manager, makeWiringCtx(), callbacks);

    wsB.sessionState.onLockChanged({ locked: true, pid: 2 });
    wsB.sessionState.onLockChanged({ locked: false });

    expect(callbacks.refreshArchive).toHaveBeenCalledTimes(1);
    expect(callbacks.onArchiveDone).not.toHaveBeenCalled();
  });

  it("background session failed calls only refreshArchive", () => {
    manager.createSession({ folderUri: "file:///folderA", workspaceRoot: "/folderA" });
    const wsB = manager.createSession({ folderUri: "file:///folderB", workspaceRoot: "/folderB" });
    wireAllSessions(manager, makeWiringCtx(), callbacks);

    wsB.sessionState.onLockChanged({ locked: true, pid: 2 });
    wsB.sessionState.onProgressChanged({
      phases: [{ number: 1, title: "Build", status: "failed" }],
      totalPhases: 1,
    });
    wsB.sessionState.onLockChanged({ locked: false });

    expect(callbacks.refreshArchive).toHaveBeenCalledTimes(1);
    expect(callbacks.onArchiveDone).not.toHaveBeenCalled();
  });

  it("active session failed calls onArchiveDone", () => {
    const wsA = manager.createSession({ folderUri: "file:///folderA", workspaceRoot: "/folderA" });
    manager.createSession({ folderUri: "file:///folderB", workspaceRoot: "/folderB" });
    wireAllSessions(manager, makeWiringCtx(), callbacks);

    wsA.sessionState.onLockChanged({ locked: true, pid: 1 });
    wsA.sessionState.onProgressChanged({
      phases: [{ number: 1, title: "Build", status: "failed" }],
      totalPhases: 1,
    });
    wsA.sessionState.onLockChanged({ locked: false });

    expect(callbacks.onArchiveDone).toHaveBeenCalledTimes(1);
    expect(callbacks.refreshArchive).not.toHaveBeenCalled();
  });

  it("non-terminal state changes do not trigger callbacks", () => {
    const wsA = manager.createSession({ folderUri: "file:///folderA", workspaceRoot: "/folderA" });
    wireAllSessions(manager, makeWiringCtx(), callbacks);

    // idle -> running (lock acquired)
    wsA.sessionState.onLockChanged({ locked: true, pid: 1 });

    expect(callbacks.onArchiveDone).not.toHaveBeenCalled();
    expect(callbacks.refreshArchive).not.toHaveBeenCalled();
  });

  it("no active session calls refreshArchive (not onArchiveDone)", () => {
    activeFolderUri = undefined;
    const wsA = manager.createSession({ folderUri: "file:///folderA", workspaceRoot: "/folderA" });
    wireAllSessions(manager, makeWiringCtx(), callbacks);

    wsA.sessionState.onLockChanged({ locked: true, pid: 1 });
    wsA.sessionState.onLockChanged({ locked: false });

    expect(callbacks.refreshArchive).toHaveBeenCalledTimes(1);
    expect(callbacks.onArchiveDone).not.toHaveBeenCalled();
  });

  it("single-root workspace: only session completing calls onArchiveDone", () => {
    const wsA = manager.createSession({ folderUri: "file:///folderA", workspaceRoot: "/folderA" });
    wireAllSessions(manager, makeWiringCtx(), callbacks);

    wsA.sessionState.onLockChanged({ locked: true, pid: 1 });
    wsA.sessionState.onLockChanged({ locked: false });

    expect(callbacks.onArchiveDone).toHaveBeenCalledTimes(1);
    expect(callbacks.refreshArchive).not.toHaveBeenCalled();
  });
});

describe("handleWorkspaceFolderChange archive guard", () => {
  it("dynamically added session completing as background calls only refreshArchive", () => {
    const activeFolderUri = "file:///folderA";
    const manager = new WorkspaceSessionManager({
      getActiveFolderUri: () => activeFolderUri,
    });
    manager.createSession({ folderUri: "file:///folderA", workspaceRoot: "/folderA" });

    const callbacks = makeCallbacks();
    handleWorkspaceFolderChange(
      {
        added: [{ uri: { toString: () => "file:///folderB", fsPath: "/folderB" } }],
        removed: [],
      },
      {
        manager,
        detected: true,
        claudeloopPath: "/mock/claudeloop",
        resolvedPath: "/mock/resolved",
        platform: "darwin",
        wiringCtx: makeWiringCtx(),
        archiveCallbacks: callbacks,
      },
    );

    const wsB = manager.getSession("file:///folderB")!;
    wsB.sessionState.onLockChanged({ locked: true, pid: 2 });
    wsB.sessionState.onLockChanged({ locked: false });

    expect(callbacks.refreshArchive).toHaveBeenCalledTimes(1);
    expect(callbacks.onArchiveDone).not.toHaveBeenCalled();
  });
});
