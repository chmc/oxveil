import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture terminal close handlers registered via onDidCloseTerminal
let terminalCloseHandlers: Array<(terminal: unknown) => void> = [];
let registeredCommands: Record<string, (...args: unknown[]) => unknown> = {};

vi.mock("vscode", () => ({
  window: {
    onDidCloseTerminal: vi.fn((cb: (t: unknown) => void) => {
      terminalCloseHandlers.push(cb);
      return { dispose: vi.fn() };
    }),
    showWarningMessage: vi.fn(),
  },
  commands: {
    registerCommand: vi.fn((name: string, handler: (...args: unknown[]) => unknown) => {
      registeredCommands[name] = handler;
      return { dispose: vi.fn() };
    }),
    executeCommand: vi.fn(),
  },
}));

vi.mock("../../views/elapsedTimer", () => ({
  ElapsedTimer: vi.fn().mockImplementation((onTick: (elapsed: string) => void) => ({
    _onTick: onTick,
    start: vi.fn(),
    stop: vi.fn(),
    elapsed: "0m",
    isRunning: vi.fn(() => false),
  })),
}));

import {
  createElapsedTimer,
  createTerminalCloseHandler,
  createSelfImprovementTerminalCloseHandler,
  createTestAnnotationCommand,
  activateTerminalHandlers,
  setupSessionChangeHandler,
} from "../../activateSessionHandlers";
import { ElapsedTimer } from "../../views/elapsedTimer";
import * as vscode from "vscode";

function fireAllTerminalClose(terminal: unknown) {
  for (const h of terminalCloseHandlers) h(terminal);
}

beforeEach(() => {
  vi.clearAllMocks();
  terminalCloseHandlers = [];
  registeredCommands = {};
});

// ── createElapsedTimer ────────────────────────────────────────────────────────

describe("createElapsedTimer", () => {
  it("returns an ElapsedTimer instance", () => {
    const timer = createElapsedTimer({
      manager: { getActiveSession: vi.fn(() => undefined) } as any,
      statusBar: { update: vi.fn() } as any,
    });
    expect(timer).toBeDefined();
    expect(ElapsedTimer).toHaveBeenCalledTimes(1);
  });

  it("updates statusBar when session is running", () => {
    const statusBar = { update: vi.fn() };
    const progress = { phases: [{ number: 1 }], totalPhases: 3, currentPhaseIndex: 0 };
    const manager = {
      getActiveSession: vi.fn(() => ({
        sessionState: { status: "running", progress },
      })),
    };

    createElapsedTimer({ manager: manager as any, statusBar: statusBar as any });

    // ElapsedTimer constructor receives onTick — call it directly
    const [onTick] = (ElapsedTimer as ReturnType<typeof vi.fn>).mock.calls[0];
    onTick("2m");

    expect(statusBar.update).toHaveBeenCalledWith({
      kind: "running",
      currentPhase: 1,
      totalPhases: 3,
      elapsed: "2m",
    });
  });

  it("does not update statusBar when session is not running", () => {
    const statusBar = { update: vi.fn() };
    const manager = {
      getActiveSession: vi.fn(() => ({
        sessionState: { status: "idle", progress: undefined },
      })),
    };

    createElapsedTimer({ manager: manager as any, statusBar: statusBar as any });
    const [onTick] = (ElapsedTimer as ReturnType<typeof vi.fn>).mock.calls[0];
    onTick("1m");

    expect(statusBar.update).not.toHaveBeenCalled();
  });

  it("does not update statusBar when no active session", () => {
    const statusBar = { update: vi.fn() };
    const manager = { getActiveSession: vi.fn(() => undefined) };

    createElapsedTimer({ manager: manager as any, statusBar: statusBar as any });
    const [onTick] = (ElapsedTimer as ReturnType<typeof vi.fn>).mock.calls[0];
    onTick("1m");

    expect(statusBar.update).not.toHaveBeenCalled();
  });
});

// ── createTerminalCloseHandler ────────────────────────────────────────────────

describe("createTerminalCloseHandler", () => {
  it("clears active session when matching terminal closes", () => {
    const terminal = {};
    const session = { matchesTerminal: vi.fn(() => true) };
    const setActivePlanChatSession = vi.fn();
    const planPreviewPanel = { setSessionActive: vi.fn(), endSession: vi.fn() } as any;
    const onPlanChatEnded = vi.fn();

    createTerminalCloseHandler({
      getActivePlanChatSession: () => session as any,
      setActivePlanChatSession,
      planPreviewPanel,
      onPlanChatEnded,
    });

    fireAllTerminalClose(terminal);

    expect(setActivePlanChatSession).toHaveBeenCalledWith(undefined);
    expect(planPreviewPanel.setSessionActive).not.toHaveBeenCalled();
    expect(planPreviewPanel.endSession).toHaveBeenCalled();
    expect(onPlanChatEnded).toHaveBeenCalled();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "setContext",
      "oxveil.planChatActive",
      false,
    );
  });

  it("ignores terminal close when no active session", () => {
    const setActivePlanChatSession = vi.fn();
    const planPreviewPanel = { setSessionActive: vi.fn(), endSession: vi.fn() } as any;
    const onPlanChatEnded = vi.fn();

    createTerminalCloseHandler({
      getActivePlanChatSession: () => undefined,
      setActivePlanChatSession,
      planPreviewPanel,
      onPlanChatEnded,
    });

    fireAllTerminalClose({});

    expect(setActivePlanChatSession).not.toHaveBeenCalled();
    expect(onPlanChatEnded).not.toHaveBeenCalled();
  });

  it("ignores terminal close when terminal does not match", () => {
    const session = { matchesTerminal: vi.fn(() => false) };
    const setActivePlanChatSession = vi.fn();

    createTerminalCloseHandler({
      getActivePlanChatSession: () => session as any,
      setActivePlanChatSession,
      planPreviewPanel: { setSessionActive: vi.fn(), endSession: vi.fn() } as any,
      onPlanChatEnded: vi.fn(),
    });

    fireAllTerminalClose({});

    expect(setActivePlanChatSession).not.toHaveBeenCalled();
  });
});

// ── createSelfImprovementTerminalCloseHandler ─────────────────────────────────

describe("createSelfImprovementTerminalCloseHandler", () => {
  it("resets self-improvement state when matching terminal closes", () => {
    const terminal = {};
    const session = { matchesTerminal: vi.fn(() => true) };
    const setActiveSelfImprovementSession = vi.fn();
    const setSelfImprovementActive = vi.fn();
    const refreshSidebar = vi.fn();

    createSelfImprovementTerminalCloseHandler({
      getActiveSelfImprovementSession: () => session as any,
      setActiveSelfImprovementSession,
      setSelfImprovementActive,
      refreshSidebar,
    });

    fireAllTerminalClose(terminal);

    expect(setActiveSelfImprovementSession).toHaveBeenCalledWith(undefined);
    expect(setSelfImprovementActive).toHaveBeenCalledWith(false);
    expect(refreshSidebar).toHaveBeenCalled();
  });

  it("ignores non-matching terminal", () => {
    const session = { matchesTerminal: vi.fn(() => false) };
    const setSelfImprovementActive = vi.fn();

    createSelfImprovementTerminalCloseHandler({
      getActiveSelfImprovementSession: () => session as any,
      setActiveSelfImprovementSession: vi.fn(),
      setSelfImprovementActive,
      refreshSidebar: vi.fn(),
    });

    fireAllTerminalClose({});

    expect(setSelfImprovementActive).not.toHaveBeenCalled();
  });
});

// ── createTestAnnotationCommand ───────────────────────────────────────────────

describe("createTestAnnotationCommand", () => {
  it("registers oxveil._testAnnotation command", () => {
    createTestAnnotationCommand(() => undefined);
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      "oxveil._testAnnotation",
      expect.any(Function),
    );
  });

  it("shows warning when no active session", () => {
    createTestAnnotationCommand(() => undefined);

    const handler = registeredCommands["oxveil._testAnnotation"] as (args: unknown) => void;
    handler({ phase: "1", text: "hello" });

    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
  });

  it("calls sendAnnotation and focusTerminal on active session", () => {
    const session = {
      sendAnnotation: vi.fn(),
      focusTerminal: vi.fn(),
    };

    createTestAnnotationCommand(() => session as any);

    const handler = registeredCommands["oxveil._testAnnotation"] as (args: unknown) => void;
    handler({ phase: "2", text: "done" });

    expect(session.sendAnnotation).toHaveBeenCalledWith("2", "done");
    expect(session.focusTerminal).toHaveBeenCalled();
  });

  it("no-ops when args are missing", () => {
    const session = { sendAnnotation: vi.fn(), focusTerminal: vi.fn() };
    createTestAnnotationCommand(() => session as any);

    const handler = registeredCommands["oxveil._testAnnotation"] as (args: unknown) => void;
    handler({ phase: "", text: "x" });

    expect(session.sendAnnotation).not.toHaveBeenCalled();
  });
});

// ── activateTerminalHandlers ──────────────────────────────────────────────────

describe("activateTerminalHandlers", () => {
  it("returns three disposables", () => {
    const disposables = activateTerminalHandlers({
      getActivePlanChatSession: () => undefined,
      setActivePlanChatSession: vi.fn(),
      planPreviewPanel: { setSessionActive: vi.fn(), endSession: vi.fn() } as any,
      onPlanChatEnded: vi.fn(),
      getActiveSelfImprovementSession: () => undefined,
      setActiveSelfImprovementSession: vi.fn(),
      setSelfImprovementActive: vi.fn(),
      refreshSidebar: vi.fn(),
    });

    expect(disposables).toHaveLength(3);
  });
});

// ── setupSessionChangeHandler ─────────────────────────────────────────────────

describe("setupSessionChangeHandler", () => {
  it("calls sidebarPanel.updateState when session changes", () => {
    const listeners: Array<(session: unknown) => void> = [];
    const manager = {
      on: vi.fn((event: string, cb: (s: unknown) => void) => { listeners.push(cb); }),
    };
    const sidebarPanel = { updateState: vi.fn() };
    const buildFullState = vi.fn(() => ({ view: "empty" } as any));

    setupSessionChangeHandler(manager as any, {
      sidebarPanel: sidebarPanel as any,
      buildFullState,
      dependencyGraph: undefined as any,
      executionTimeline: undefined as any,
      liveRunPanel: undefined as any,
    });

    listeners[0]?.(null);

    expect(sidebarPanel.updateState).toHaveBeenCalledWith({ view: "empty" });
  });

  it("reveals dependencyGraph when visible and folder changed", () => {
    const listeners: Array<(session: unknown) => void> = [];
    const manager = {
      on: vi.fn((_: string, cb: (s: unknown) => void) => { listeners.push(cb); }),
    };
    const sidebarPanel = { updateState: vi.fn() };
    const dependencyGraph = {
      visible: true,
      currentFolderUri: "file:///old",
      reveal: vi.fn(),
    };

    setupSessionChangeHandler(manager as any, {
      sidebarPanel: sidebarPanel as any,
      buildFullState: vi.fn(() => ({ view: "empty" } as any)),
      dependencyGraph: dependencyGraph as any,
      executionTimeline: undefined as any,
      liveRunPanel: undefined as any,
    });

    listeners[0]?.({
      folderUri: "file:///new",
      sessionState: { progress: { phases: [], totalPhases: 1 } },
    });

    expect(dependencyGraph.reveal).toHaveBeenCalledWith(
      { phases: [], totalPhases: 1 },
      "file:///new",
    );
  });

  it("does not reveal dependencyGraph when folder URI matches", () => {
    const listeners: Array<(session: unknown) => void> = [];
    const manager = {
      on: vi.fn((_: string, cb: (s: unknown) => void) => { listeners.push(cb); }),
    };
    const dependencyGraph = {
      visible: true,
      currentFolderUri: "file:///same",
      reveal: vi.fn(),
    };

    setupSessionChangeHandler(manager as any, {
      sidebarPanel: { updateState: vi.fn() } as any,
      buildFullState: vi.fn(() => ({ view: "empty" } as any)),
      dependencyGraph: dependencyGraph as any,
      executionTimeline: undefined as any,
      liveRunPanel: undefined as any,
    });

    listeners[0]?.({
      folderUri: "file:///same",
      sessionState: { progress: undefined },
    });

    expect(dependencyGraph.reveal).not.toHaveBeenCalled();
  });
});
