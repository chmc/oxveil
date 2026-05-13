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
import { wireSessionEvents } from "../../sessionWiring";
import { makeMutableState, makeSessionDeps } from "./sessionWiring.testHelpers";

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

    wireSessionEvents(makeSessionDeps(session, mutableState, {
      sidebarPanel,
      selfImprovementPanel: selfImprovementPanel as any,
    }));

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
    expect(mutableState.lessonsAvailable).toBe(true);
    expect(sidebarPanel.updateState).toHaveBeenCalledWith(
      expect.objectContaining({ view: "self-improvement" })
    );
  });

  it("refreshes sidebar after setting selfImprovementActive flag", async () => {
    const session = new SessionState();
    const mutableState = makeMutableState();
    const selfImprovementPanel = { reveal: vi.fn() };
    const sidebarPanel = { updateState: vi.fn(), sendProgressUpdate: vi.fn() };

    wireSessionEvents(makeSessionDeps(session, mutableState, {
      sidebarPanel: sidebarPanel as any,
      selfImprovementPanel: selfImprovementPanel as any,
    }));

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

    wireSessionEvents(makeSessionDeps(session, mutableState, {
      selfImprovementPanel: selfImprovementPanel as any,
    }));

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

    wireSessionEvents(makeSessionDeps(session, mutableState, {
      getConfig: () => false,
      selfImprovementPanel: selfImprovementPanel as any,
    }));

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

    wireSessionEvents(makeSessionDeps(session, mutableState, {
      selfImprovementPanel: selfImprovementPanel as any,
    }));

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

  it("logs error when executeCommand rejects", async () => {
    const session = new SessionState();
    const mutableState = makeMutableState();
    const sidebarPanel = { updateState: vi.fn(), sendProgressUpdate: vi.fn() };
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    wireSessionEvents(makeSessionDeps(session, mutableState, {
      sidebarPanel: sidebarPanel as any,
    }));

    vi.mocked(readFile).mockResolvedValueOnce(LESSONS_MD);

    const vscode = await import("vscode");
    const commandError = new Error("command failed");
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (cmd: string) => {
      if (cmd === "oxveil.selfImprovement.start") throw commandError;
    });

    session.onLockChanged({ locked: true, pid: 42 });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "completed" }],
      totalPhases: 1,
    });
    session.onLockChanged({ locked: false });

    try {
      await vi.waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("[oxveil]"),
          commandError,
        );
      });

      expect(mutableState.selfImprovementActive).toBe(false);
      expect(mutableState.lessonsAvailable).toBeUndefined();
    } finally {
      vi.mocked(vscode.commands.executeCommand).mockReset();
      consoleErrorSpy.mockRestore();
    }
  });

  it("resets selfImprovementActive on new run and loads fresh lessons", async () => {
    const session = new SessionState();
    const mutableState = makeMutableState();
    mutableState.selfImprovementActive = true;

    const selfImprovementPanel = { reveal: vi.fn() };
    wireSessionEvents(makeSessionDeps(session, mutableState, {
      selfImprovementPanel: selfImprovementPanel as any,
    }));

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

  it("triggers even when buildSidebarState returns 'stopped' (race condition regression)", async () => {
    const session = new SessionState();
    const mutableState = makeMutableState();
    const selfImprovementPanel = { reveal: vi.fn() };
    const sidebarPanel = { updateState: vi.fn(), sendProgressUpdate: vi.fn() } as any;

    wireSessionEvents(makeSessionDeps(session, mutableState, {
      buildSidebarState: () => ({ view: "stopped", archives: [] }),
      sidebarPanel,
      selfImprovementPanel: selfImprovementPanel as any,
    }));

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
          expect.objectContaining({ phase: 1, title: "Setup" }),
        ]),
      );
    });

    expect(mutableState.selfImprovementActive).toBe(true);
  });

  it("does not mutate selfImprovementActive when session transitions to idle during findLessonsContent", async () => {
    const session = new SessionState();
    const mutableState = makeMutableState();
    const selfImprovementPanel = { reveal: vi.fn() };
    const sidebarPanel = { updateState: vi.fn(), sendProgressUpdate: vi.fn() } as any;

    wireSessionEvents(makeSessionDeps(session, mutableState, {
      sidebarPanel,
      selfImprovementPanel: selfImprovementPanel as any,
    }));

    // Deferred readFile: resolves only after we transition session to idle
    let resolveReadFile!: (value: string) => void;
    const readFilePromise = new Promise<string>((resolve) => {
      resolveReadFile = resolve;
    });
    vi.mocked(readFile).mockReturnValueOnce(readFilePromise as any);

    // Trigger done state
    session.onLockChanged({ locked: true, pid: 42 });
    session.onProgressChanged({
      phases: [{ number: 1, title: "Setup", status: "completed" }],
      totalPhases: 1,
    });
    session.onLockChanged({ locked: false });
    expect(session.status).toBe("done");

    // Transition to idle while findLessonsContent is still awaiting readFile
    session.reset();
    expect(session.status).toBe("idle");

    // Now resolve readFile — guard should abort before mutating state
    resolveReadFile(LESSONS_MD);

    // Allow microtasks to flush
    await new Promise((r) => setTimeout(r, 50));

    expect(mutableState.selfImprovementActive).toBe(false);
  });
});
