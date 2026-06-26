import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn(),
      onDidDelete: vi.fn(),
      onDidChange: vi.fn(),
      dispose: vi.fn(),
    })),
    getConfiguration: vi.fn(() => ({ get: vi.fn(() => false) })),
  },
  commands: { executeCommand: vi.fn() },
  window: {
    registerWebviewViewProvider: vi.fn(),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
  },
}));

vi.mock("../../../views/sidebarPanel", () => ({
  SidebarPanel: vi.fn().mockImplementation(() => ({ updateState: vi.fn() })),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  unlink: vi.fn(),
  access: vi.fn(),
}));

import { activateSidebar } from "../../../activateSidebar";
import type { SidebarActivationDeps } from "../../../activateSidebar";
import {
  setSessionManager,
  deactivate as deactivateExtension,
  disposables,
} from "../../../extensionLifecycle";
import { unlink } from "node:fs/promises";

function makeDeps(overrides: Partial<SidebarActivationDeps> = {}): SidebarActivationDeps {
  return {
    manager: { getActiveSession: vi.fn(() => undefined) } as any,
    workspaceRoot: "/workspace",
    archiveTree: { getEntries: vi.fn(() => []), getArchiveCount: vi.fn(() => 0) } as any,
    elapsedTimer: { elapsed: "0m", isRunning: vi.fn(() => false), start: vi.fn(), stop: vi.fn() } as any,
    initialDetectionStatus: "detected",
    initialPlanDetected: false,
    ...overrides,
  };
}

// ── clearSessionPlanFiles: tracked paths deleted; foreign plans untouched ────

describe("clearSessionPlanFiles: tracked paths deleted; foreign plans untouched", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes paths tracked by planPreviewPanel", async () => {
    const mockPanel = {
      getTrackedPaths: vi.fn(() => ["/workspace/.claude/plans/plan-a.md"]),
      getPlanPreviewState: vi.fn(() => undefined),
    };
    vi.mocked(unlink).mockResolvedValue(undefined);

    const result = activateSidebar(makeDeps({ planPreviewPanel: mockPanel as any }));
    await result.clearSessionPlanFiles();

    expect(unlink).toHaveBeenCalledWith("/workspace/.claude/plans/plan-a.md");
  });

  it("deletes ai-parsed-plan.md as part of cleanup", async () => {
    vi.mocked(unlink).mockResolvedValue(undefined);

    const result = activateSidebar(makeDeps());
    await result.clearSessionPlanFiles();

    expect(unlink).toHaveBeenCalledWith("/workspace/.claudeloop/ai-parsed-plan.md");
  });

  it("resets planDetected, cachedPlanPhases, and planUserChoice", async () => {
    vi.mocked(unlink).mockResolvedValue(undefined);

    const result = activateSidebar(makeDeps());
    result.state.setPlanDetected(true);
    result.state.setCachedPlanPhases([{ number: 1, title: "P1", status: "pending" }]);
    result.state.setPlanUserChoice("resume");

    await result.clearSessionPlanFiles();

    expect(result.state.planDetected).toBe(false);
    expect(result.state.cachedPlanPhases).toEqual([]);
    expect(result.state.planUserChoice).toBe("none");
  });

  it("tolerates ENOENT errors — files already deleted", async () => {
    const mockPanel = {
      getTrackedPaths: vi.fn(() => ["/workspace/.claude/plans/stale.md"]),
      getPlanPreviewState: vi.fn(() => undefined),
    };
    vi.mocked(unlink).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const result = activateSidebar(makeDeps({ planPreviewPanel: mockPanel as any }));
    await expect(result.clearSessionPlanFiles()).resolves.toBeUndefined();
  });

  it("does not delete foreign .claude/plans files absent from tracked paths", async () => {
    const mockPanel = {
      getTrackedPaths: vi.fn(() => []),
      getPlanPreviewState: vi.fn(() => undefined),
    };
    vi.mocked(unlink).mockResolvedValue(undefined);

    const result = activateSidebar(makeDeps({ planPreviewPanel: mockPanel as any }));
    await result.clearSessionPlanFiles();

    const planFileCalls = vi.mocked(unlink).mock.calls.filter(([p]) =>
      p.includes(".claude/plans"),
    );
    expect(planFileCalls).toHaveLength(0);
  });
});

// ── process killed on deactivate ──────────────────────────────────────────────

describe("deactivate: process killed on deactivate", () => {
  afterEach(() => {
    disposables.length = 0;
    setSessionManager(undefined as any);
  });

  it("calls processManager.deactivate() for running sessions", async () => {
    const mockDeactivate = vi.fn().mockResolvedValue(undefined);
    setSessionManager({
      getAllSessions: vi.fn(() => [
        { processManager: { isRunning: true, deactivate: mockDeactivate } },
      ]),
      dispose: vi.fn(),
    } as any);

    await deactivateExtension();

    expect(mockDeactivate).toHaveBeenCalledOnce();
  });

  it("skips deactivate when process is not running", async () => {
    const mockDeactivate = vi.fn().mockResolvedValue(undefined);
    setSessionManager({
      getAllSessions: vi.fn(() => [
        { processManager: { isRunning: false, deactivate: mockDeactivate } },
      ]),
      dispose: vi.fn(),
    } as any);

    await deactivateExtension();

    expect(mockDeactivate).not.toHaveBeenCalled();
  });

  it("deactivates all running sessions across multiple workspaces", async () => {
    const killA = vi.fn().mockResolvedValue(undefined);
    const killB = vi.fn().mockResolvedValue(undefined);
    const killC = vi.fn().mockResolvedValue(undefined);
    setSessionManager({
      getAllSessions: vi.fn(() => [
        { processManager: { isRunning: true, deactivate: killA } },
        { processManager: { isRunning: false, deactivate: killB } },
        { processManager: { isRunning: true, deactivate: killC } },
      ]),
      dispose: vi.fn(),
    } as any);

    await deactivateExtension();

    expect(killA).toHaveBeenCalledOnce();
    expect(killB).not.toHaveBeenCalled();
    expect(killC).toHaveBeenCalledOnce();
  });

  it("skips session loop when no session manager registered", async () => {
    await expect(deactivateExtension()).resolves.toBeUndefined();
  });
});

// ── watchers disposed ─────────────────────────────────────────────────────────

describe("deactivate: watchers disposed", () => {
  afterEach(() => {
    disposables.length = 0;
    setSessionManager(undefined as any);
  });

  it("calls dispose() on all registered disposables", async () => {
    const d1 = { dispose: vi.fn() };
    const d2 = { dispose: vi.fn() };
    disposables.push(d1, d2);
    setSessionManager({ getAllSessions: vi.fn(() => []), dispose: vi.fn() } as any);

    await deactivateExtension();

    expect(d1.dispose).toHaveBeenCalledOnce();
    expect(d2.dispose).toHaveBeenCalledOnce();
  });

  it("calls sessionManager.dispose()", async () => {
    const mockDispose = vi.fn();
    setSessionManager({ getAllSessions: vi.fn(() => []), dispose: mockDispose } as any);

    await deactivateExtension();

    expect(mockDispose).toHaveBeenCalledOnce();
  });

  it("disposes watchers even when a running process is killed first", async () => {
    const killProcess = vi.fn().mockResolvedValue(undefined);
    const watcher = { dispose: vi.fn() };
    disposables.push(watcher);
    setSessionManager({
      getAllSessions: vi.fn(() => [
        { processManager: { isRunning: true, deactivate: killProcess } },
      ]),
      dispose: vi.fn(),
    } as any);

    await deactivateExtension();

    expect(killProcess).toHaveBeenCalledOnce();
    expect(watcher.dispose).toHaveBeenCalledOnce();
  });

  it("handles no disposables registered gracefully", async () => {
    setSessionManager({ getAllSessions: vi.fn(() => []), dispose: vi.fn() } as any);

    await expect(deactivateExtension()).resolves.toBeUndefined();
  });
});
