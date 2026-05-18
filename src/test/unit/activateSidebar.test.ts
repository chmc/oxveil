import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture file watcher callbacks so tests can simulate file events
type WatcherCallbacks = {
  onCreate?: () => void | Promise<void>;
  onDelete?: () => void;
  onChange?: () => void | Promise<void>;
};
let allWatcherCallbacks: WatcherCallbacks[] = [];
// Legacy alias: first watcher (.claudeloop/PLAN.md) for backward compat
let watcherCallbacks: WatcherCallbacks = {};

let capturedUpdateState: ReturnType<typeof vi.fn> | undefined;

vi.mock("../../views/sidebarPanel", () => ({
  SidebarPanel: vi.fn().mockImplementation((_deps: any) => {
    const updateState = vi.fn();
    capturedUpdateState = updateState;
    return { updateState };
  }),
}));

vi.mock("vscode", () => ({
  workspace: {
    createFileSystemWatcher: vi.fn(() => {
      const callbacks: WatcherCallbacks = {};
      allWatcherCallbacks.push(callbacks);
      if (allWatcherCallbacks.length === 1) watcherCallbacks = callbacks;
      return {
        onDidCreate: vi.fn((cb: () => void | Promise<void>) => { callbacks.onCreate = cb; }),
        onDidDelete: vi.fn((cb: () => void) => { callbacks.onDelete = cb; }),
        onDidChange: vi.fn((cb: () => void | Promise<void>) => { callbacks.onChange = cb; }),
        dispose: vi.fn(),
      };
    }),
    getConfiguration: vi.fn(() => ({ get: vi.fn(() => false) })),
  },
  commands: { executeCommand: vi.fn() },
  window: {
    registerWebviewViewProvider: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  access: vi.fn(),
  readdir: vi.fn(),
  unlink: vi.fn(),
  stat: vi.fn(),
}));

import { activateSidebar, checkInitialPlanState } from "../../activateSidebar";
import type {
  SidebarActivationDeps,
  SidebarActivationResult,
} from "../../activateSidebar";
import * as vscode from "vscode";
import { readFile, access, readdir, stat } from "node:fs/promises";

function makeDeps(overrides: Partial<SidebarActivationDeps> = {}): SidebarActivationDeps {
  return {
    manager: {
      getActiveSession: vi.fn(() => undefined),
    } as any,
    workspaceRoot: "/fake/root",
    archiveTree: { getEntries: vi.fn(() => []), getArchiveCount: vi.fn(() => 0) } as any,
    elapsedTimer: { elapsed: "0m", isRunning: vi.fn(() => false), start: vi.fn(), stop: vi.fn() } as any,
    initialDetectionStatus: "detected",
    initialPlanDetected: false,
    ...overrides,
  };
}

describe("activateSidebar", () => {
  let result: SidebarActivationResult;
  let deps: SidebarActivationDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    allWatcherCallbacks = [];
    watcherCallbacks = {};
    capturedUpdateState = undefined;
    deps = makeDeps();
    result = activateSidebar(deps);
  });

  describe("buildFullState", () => {
    it("returns view='empty' when detected + idle + no plan + no progress", () => {
      const state = result.buildFullState();
      expect(state.view).toBe("empty");
    });

    it("returns view='ready' when detected + idle + plan detected + planUserChoice='none'", () => {
      result.state.setPlanDetected(true);
      result.state.setPlanUserChoice("none");
      const state = result.buildFullState();
      expect(state.view).toBe("ready");
    });

    it("returns view='running' when session is running", () => {
      (deps.manager.getActiveSession as ReturnType<typeof vi.fn>).mockReturnValue({
        sessionState: { status: "running", progress: undefined },
      });
      const state = result.buildFullState();
      expect(state.view).toBe("running");
    });

    it("ready state includes parsed plan phases", async () => {
      // First read (ai-parsed-plan.md) fails, second read (PLAN.md) succeeds
      vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));
      vi.mocked(readFile).mockResolvedValueOnce(
        "# Plan\n## Phase 1: Alpha\n## Phase 2: Beta\n" as any,
      );
      vi.resetModules();
      vi.doMock("../../parsers/plan", () => ({
        parsePlan: vi.fn(() => ({
          phases: [
            { number: 1, title: "Alpha" },
            { number: 2, title: "Beta" },
          ],
        })),
      }));

      const res = activateSidebar(makeDeps({ initialPlanDetected: true }));
      await vi.waitFor(() => {
        expect(res.state.cachedPlanPhases.length).toBe(2);
      });

      const state = res.buildFullState();
      expect(state.view).toBe("ready");
      expect(state.plan!.phases).toEqual([
        { number: 1, title: "Alpha", status: "pending" },
        { number: 2, title: "Beta", status: "pending" },
      ]);
    });
  });


  describe("onPlanFormed", () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it("sets planUserChoice to 'none' after forming plan", async () => {
      vi.mocked(readFile).mockRejectedValueOnce(new Error("no parsed plan"));
      vi.mocked(readFile).mockResolvedValueOnce("# Plan\n## Phase 1: Setup\nDo stuff" as any);

      vi.doMock("../../parsers/plan", () => ({
        parsePlan: vi.fn(() => ({
          phases: [{ number: 1, title: "Setup" }],
        })),
      }));

      await result.onPlanFormed();
      expect(result.state.planUserChoice).toBe("none");
    });

    it("caches parsed phases from plan file", async () => {
      vi.mocked(readFile).mockResolvedValueOnce("# Plan\n## Phase 1: Init\nStuff" as any);

      vi.doMock("../../parsers/plan", () => ({
        parsePlan: vi.fn(() => ({
          phases: [
            { number: 1, title: "Init" },
            { number: 2, title: "Build" },
          ],
        })),
      }));

      await result.onPlanFormed();
      expect(result.state.cachedPlanPhases).toEqual([
        { number: 1, title: "Init", status: "pending" },
        { number: 2, title: "Build", status: "pending" },
      ]);
    });

    it("sets cachedPlanPhases to [] on read failure", async () => {
      const noRootDeps = makeDeps({ workspaceRoot: undefined });
      const res = activateSidebar(noRootDeps);
      await res.onPlanFormed();
      expect(res.state.cachedPlanPhases).toEqual([]);
      expect(res.state.planUserChoice).toBe("none");
    });

    it("resets session state when session exists and status is not running", async () => {
      const resetSpy = vi.fn();
      const sessionDeps = makeDeps({
        manager: {
          getActiveSession: vi.fn(() => ({
            sessionState: {
              status: "done",
              reset: resetSpy,
            },
          })),
        } as any,
      });
      const res = activateSidebar(sessionDeps);
      await res.onPlanFormed();
      expect(resetSpy).toHaveBeenCalled();
    });

    it("does NOT reset session state when session is running", async () => {
      const resetSpy = vi.fn();
      const sessionDeps = makeDeps({
        manager: {
          getActiveSession: vi.fn(() => ({
            sessionState: {
              status: "running",
              reset: resetSpy,
            },
          })),
        } as any,
      });
      const res = activateSidebar(sessionDeps);
      await res.onPlanFormed();
      expect(resetSpy).not.toHaveBeenCalled();
    });

    it("resets mutable state counters (cost, todoDone, todoTotal)", async () => {
      result.state.setCost(1.5);
      result.state.setTodos(3, 5);
      await result.onPlanFormed();
      expect(result.state.cost).toBe(0);
      expect(result.state.todoDone).toBe(0);
      expect(result.state.todoTotal).toBe(0);
    });
  });

  describe("registerPlanWatcher", () => {
    it("onDidCreate sets planDetected=true and view becomes 'ready'", () => {
      result.registerPlanWatcher();
      expect(result.buildFullState().view).toBe("empty");

      watcherCallbacks.onCreate!();

      expect(result.state.planDetected).toBe(true);
      expect(result.buildFullState().view).toBe("ready");
    });

    it("onDidDelete sets planDetected=false and view becomes 'empty'", () => {
      result.state.setPlanDetected(true);
      result.registerPlanWatcher();
      expect(result.buildFullState().view).toBe("ready");

      watcherCallbacks.onDelete!();

      expect(result.state.planDetected).toBe(false);
      expect(result.buildFullState().view).toBe("empty");
    });

    it("PLAN.md created after activation updates sidebar to ready state", () => {
      result.registerPlanWatcher();

      watcherCallbacks.onCreate!();

      expect(result.state.planUserChoice).toBe("none");
      expect(result.buildFullState().view).toBe("ready");
      expect(result.buildFullState().plan).toBeDefined();
      expect(result.buildFullState().plan!.filename).toBe("PLAN.md");
    });

    it("onDidCreate populates cachedPlanPhases from PLAN.md", async () => {
      // First read (ai-parsed-plan.md) fails, second read (PLAN.md) succeeds
      vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));
      vi.mocked(readFile).mockResolvedValueOnce(
        "# Plan\n## Phase 1: Setup\nDo stuff\n## Phase 2: Build\nMore stuff\n## Phase 3: Deploy\nShip it" as any,
      );
      vi.resetModules();
      vi.doMock("../../parsers/plan", () => ({
        parsePlan: vi.fn(() => ({
          phases: [
            { number: 1, title: "Setup" },
            { number: 2, title: "Build" },
            { number: 3, title: "Deploy" },
          ],
        })),
      }));

      result.registerPlanWatcher();
      const promise = watcherCallbacks.onCreate!();
      await promise;

      expect(result.state.cachedPlanPhases).toEqual([
        { number: 1, title: "Setup", status: "pending" },
        { number: 2, title: "Build", status: "pending" },
        { number: 3, title: "Deploy", status: "pending" },
      ]);
    });

    it("onDidChange re-parses PLAN.md and updates cachedPlanPhases", async () => {
      // Pre-populate with initial phases
      result.state.setCachedPlanPhases([
        { number: 1, title: "Old", status: "pending" },
      ]);
      result.state.setPlanDetected(true);

      // First read (ai-parsed-plan.md) fails, second read (PLAN.md) succeeds
      vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));
      vi.mocked(readFile).mockResolvedValueOnce(
        "# Plan\n## Phase 1: New\n## Phase 2: Added\n" as any,
      );
      vi.resetModules();
      vi.doMock("../../parsers/plan", () => ({
        parsePlan: vi.fn(() => ({
          phases: [
            { number: 1, title: "New" },
            { number: 2, title: "Added" },
          ],
        })),
      }));

      result.registerPlanWatcher();
      await watcherCallbacks.onChange!();

      expect(result.state.cachedPlanPhases).toEqual([
        { number: 1, title: "New", status: "pending" },
        { number: 2, title: "Added", status: "pending" },
      ]);
    });
  });

  describe("initial plan phase loading", () => {
    it("populates cachedPlanPhases when initialPlanDetected is true", async () => {
      // First read (ai-parsed-plan.md) fails, second read (PLAN.md) succeeds
      vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));
      vi.mocked(readFile).mockResolvedValueOnce(
        "# Plan\n## Phase 1: Init\nStuff\n## Phase 2: Run\nGo" as any,
      );
      vi.resetModules();
      vi.doMock("../../parsers/plan", () => ({
        parsePlan: vi.fn(() => ({
          phases: [
            { number: 1, title: "Init" },
            { number: 2, title: "Run" },
          ],
        })),
      }));

      const res = activateSidebar(makeDeps({ initialPlanDetected: true }));

      // Wait for the background parse to complete
      await vi.waitFor(() => {
        expect(res.state.cachedPlanPhases).toEqual([
          { number: 1, title: "Init", status: "pending" },
          { number: 2, title: "Run", status: "pending" },
        ]);
      });
    });
  });

  describe("onPlanReset", () => {
    it("clears cachedPlanPhases to []", () => {
      result.state.setCachedPlanPhases([
        { number: 1, title: "Phase", status: "pending" },
      ]);
      result.onPlanReset();
      expect(result.state.cachedPlanPhases).toEqual([]);
    });

    it("sets planUserChoice to 'none'", () => {
      result.onPlanReset();
      expect(result.state.planUserChoice).toBe("none");
    });

    it("updates sidebar (view becomes empty when no plan)", () => {
      result.state.setPlanDetected(false);
      result.onPlanReset();
      expect(result.buildFullState().view).toBe("empty");
    });
  });

  describe("onPlanChatStarted", () => {
    it("sets planUserChoice to 'planning'", () => {
      result.state.setPlanUserChoice("none");
      result.onPlanChatStarted();
      expect(result.state.planUserChoice).toBe("planning");
    });

    it("transitions view to 'planning' when idle", () => {
      result.state.setPlanUserChoice("none");
      result.onPlanChatStarted();
      expect(result.buildFullState().view).toBe("planning");
    });
  });

  describe("onPlanChatEnded", () => {
    it("resets planUserChoice to 'none'", () => {
      result.state.setPlanUserChoice("planning");
      result.onPlanChatEnded();
      expect(result.state.planUserChoice).toBe("none");
    });

    it("transitions view away from 'planning' when idle", () => {
      result.state.setPlanUserChoice("planning");
      expect(result.buildFullState().view).toBe("planning");
      result.onPlanChatEnded();
      expect(result.buildFullState().view).not.toBe("planning");
    });
  });

  describe("onAiParseStarted", () => {
    it("sets aiParsing to true", () => {
      result.state.setAiParsing(false);
      result.onAiParseStarted();
      expect(result.state.aiParsing).toBe(true);
    });

    it("includes aiParsing in buildFullState", () => {
      result.state.setAiParsing(false);
      result.onAiParseStarted();
      expect(result.buildFullState().aiParsing).toBe(true);
    });
  });

  describe("buildFullState - planPreview", () => {
    it("includes planPreview when planPreviewPanel is provided", () => {
      const mockPlanPreviewState = {
        visible: true,
        sessionActive: false,
        planFormed: false,
        valid: true,
        format: "phase" as const,
        title: "My Plan",
        phases: [{ number: 1, title: "Setup" }],
        activeFilePath: "/fake/root/PLAN.md",
      };
      const depsWithPanel = makeDeps({
        planPreviewPanel: {
          getPlanPreviewState: vi.fn(() => mockPlanPreviewState),
        } as any,
      });
      const res = activateSidebar(depsWithPanel);
      const state = res.buildFullState();
      expect(state.planPreview).toEqual(mockPlanPreviewState);
    });

    it("planPreview is undefined when planPreviewPanel is not provided", () => {
      const state = result.buildFullState();
      expect(state.planPreview).toBeUndefined();
    });
  });

  describe("onAiParseEnded", () => {
    it("sets aiParsing to false", () => {
      result.state.setAiParsing(true);
      result.onAiParseEnded();
      expect(result.state.aiParsing).toBe(false);
    });

    it("includes aiParsing in buildFullState", () => {
      result.state.setAiParsing(true);
      result.onAiParseEnded();
      expect(result.buildFullState().aiParsing).toBe(false);
    });
  });

  describe("registerPlanWatcher - .claude/plans support", () => {
    it("creates a watcher for .claude/plans/*.md", () => {
      result.registerPlanWatcher();
      const mockCreateWatcher = vi.mocked(vscode.workspace.createFileSystemWatcher);
      expect(mockCreateWatcher).toHaveBeenCalledTimes(2);
      const patterns = mockCreateWatcher.mock.calls.map((c) => JSON.stringify(c[0]));
      expect(patterns.some((p) => p.includes(".claude/plans"))).toBe(true);
    });

    it("plan file created in .claude/plans/ sets planDetected=true", async () => {
      result.registerPlanWatcher();
      expect(result.state.planDetected).toBe(false);
      await allWatcherCallbacks[1]?.onCreate?.();
      expect(result.state.planDetected).toBe(true);
    });

    it("plan file deleted from .claude/plans/ sets planDetected=false", () => {
      result.state.setPlanDetected(true);
      result.registerPlanWatcher();
      allWatcherCallbacks[1]?.onDelete?.();
      expect(result.state.planDetected).toBe(false);
    });

    it("plan file changed in .claude/plans/ re-parses phases", async () => {
      vi.mocked(readFile)
        .mockRejectedValueOnce(new Error("ENOENT"))
        .mockResolvedValueOnce("# Plan\n## Phase 1: NewPhase\n" as any);
      vi.doMock("../../parsers/plan", () => ({
        parsePlan: vi.fn(() => ({ phases: [{ number: 1, title: "NewPhase" }] })),
      }));
      result.registerPlanWatcher();
      await allWatcherCallbacks[1]?.onChange?.();
      expect(result.state.cachedPlanPhases).toEqual([
        { number: 1, title: "NewPhase", status: "pending" },
      ]);
    });
  });

  describe("loadPlanPhases - .claude/plans fallback", () => {
    it("reads plan from .claude/plans/ when .claudeloop/PLAN.md missing", async () => {
      (deps.manager.getActiveSession as ReturnType<typeof vi.fn>).mockReturnValue({
        sessionState: { status: "running" },
        planFileOverride: undefined,
      });
      vi.mocked(readFile)
        .mockRejectedValueOnce(new Error("ENOENT")) // ai-parsed-plan.md
        .mockRejectedValueOnce(new Error("ENOENT")) // .claudeloop/PLAN.md
        .mockResolvedValueOnce("# Plan\n## Phase 1: Alpha\n" as any); // .claude/plans/foo.md
      vi.mocked(readdir).mockResolvedValueOnce(["foo.md"] as any);
      vi.mocked(stat).mockResolvedValueOnce({ mtimeMs: 1000 } as any);
      vi.doMock("../../parsers/plan", () => ({
        parsePlan: vi.fn(() => ({ phases: [{ number: 1, title: "Alpha" }] })),
      }));

      await result.onPlanFormed();

      expect(result.state.cachedPlanPhases).toEqual([
        { number: 1, title: "Alpha", status: "pending" },
      ]);
    });

    it("falls back to empty phases when neither location has a plan", async () => {
      (deps.manager.getActiveSession as ReturnType<typeof vi.fn>).mockReturnValue({
        sessionState: { status: "running" },
        planFileOverride: undefined,
      });
      vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(readdir).mockRejectedValue(new Error("ENOENT"));

      await result.onPlanFormed();

      expect(result.state.cachedPlanPhases).toEqual([]);
    });

    it("skips .claude/plans/ fallback when no active session", async () => {
      (deps.manager.getActiveSession as ReturnType<typeof vi.fn>).mockReturnValueOnce(undefined);
      vi.mocked(readFile).mockRejectedValue(new Error("ENOENT")); // both plan paths miss

      await result.onPlanFormed();

      expect(result.state.cachedPlanPhases).toEqual([]);
      expect(readdir).not.toHaveBeenCalled();
    });
  });

  describe("checkInitialPlanState", () => {
    it("returns true when .claudeloop/PLAN.md exists", async () => {
      vi.mocked(access).mockResolvedValueOnce(undefined);

      const result = await checkInitialPlanState("/workspace");

      expect(result).toBe(true);
    });

    it("returns false when .claudeloop/PLAN.md absent even if .claude/plans/ has files", async () => {
      vi.mocked(access).mockRejectedValueOnce(new Error("ENOENT"));

      const result = await checkInitialPlanState("/workspace");

      expect(result).toBe(false);
      expect(readdir).not.toHaveBeenCalled();
    });

    it("returns false when nothing exists", async () => {
      vi.mocked(access).mockRejectedValueOnce(new Error("ENOENT"));

      const result = await checkInitialPlanState("/workspace");

      expect(result).toBe(false);
    });
  });

  describe("refreshSidebar", () => {
    beforeEach(() => {
      // Default: no files exist → consistent state, light refresh path
      vi.mocked(access).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(readdir).mockRejectedValue(new Error("ENOENT"));
    });

    it("calls sidebarPanel.updateState()", async () => {
      await result.refreshSidebar();
      expect(capturedUpdateState).toHaveBeenCalled();
    });

    it("shows 'Oxveil: Refreshed' when state is consistent", async () => {
      await result.refreshSidebar();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("Oxveil: Refreshed");
    });

    it("detectInconsistencies returns false when planDetected matches disk (both false)", async () => {
      result.state.setPlanDetected(false);
      await result.refreshSidebar();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("Oxveil: Refreshed");
    });

    it("detectInconsistencies returns true when planDetected=true but PLAN.md missing", async () => {
      result.state.setPlanDetected(true);
      // access throws for all paths → PLAN.md doesn't exist → inconsistency
      await result.refreshSidebar();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("Oxveil: Full refresh completed");
    });

    it("detectInconsistencies returns true when aiParsing=true but session not running", async () => {
      result.state.setAiParsing(true);
      // session is not running (getActiveSession returns undefined) → inconsistency
      await result.refreshSidebar();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("Oxveil: Full refresh completed");
    });

    it("detectInconsistencies returns false when aiParsing=false and session not running", async () => {
      result.state.setAiParsing(false);
      await result.refreshSidebar();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("Oxveil: Refreshed");
    });

    it("calls showErrorMessage when refresh throws", async () => {
      (deps.manager.getActiveSession as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error("disk failure");
      });
      await result.refreshSidebar();
      expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });

    it("error message format matches 'Oxveil: Failed to refresh — {msg}'", async () => {
      (deps.manager.getActiveSession as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error("disk failure");
      });
      await result.refreshSidebar();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Oxveil: Failed to refresh — disk failure",
      );
    });
  });
});
