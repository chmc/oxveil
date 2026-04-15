import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture file watcher callbacks so tests can simulate file events
let watcherCallbacks: { onCreate?: () => void; onDelete?: () => void } = {};

vi.mock("vscode", () => ({
  workspace: {
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn((cb: () => void) => { watcherCallbacks.onCreate = cb; }),
      onDidDelete: vi.fn((cb: () => void) => { watcherCallbacks.onDelete = cb; }),
      dispose: vi.fn(),
    })),
  },
  commands: { executeCommand: vi.fn() },
  window: { registerWebviewViewProvider: vi.fn() },
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

import { activateSidebar } from "../../activateSidebar";
import type {
  SidebarActivationDeps,
  SidebarActivationResult,
} from "../../activateSidebar";
import { readFile } from "node:fs/promises";

function makeDeps(overrides: Partial<SidebarActivationDeps> = {}): SidebarActivationDeps {
  return {
    manager: {
      getActiveSession: vi.fn(() => undefined),
    } as any,
    workspaceRoot: "/fake/root",
    archiveTree: { getEntries: vi.fn(() => []) } as any,
    elapsedTimer: { elapsed: "0m" } as any,
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
    watcherCallbacks = {};
    deps = makeDeps();
    result = activateSidebar(deps);
  });

  describe("buildFullState", () => {
    it("returns view='empty' when detected + idle + no plan + no progress", () => {
      const state = result.buildFullState();
      expect(state.view).toBe("empty");
    });

    it("returns view='stale' when detected + idle + plan detected + planUserChoice='none'", () => {
      result.state.planDetected = true;
      result.state.planUserChoice = "none";
      const state = result.buildFullState();
      expect(state.view).toBe("stale");
    });

    it("returns view='running' when session is running", () => {
      (deps.manager.getActiveSession as ReturnType<typeof vi.fn>).mockReturnValue({
        sessionState: { status: "running", progress: undefined },
      });
      const state = result.buildFullState();
      expect(state.view).toBe("running");
    });
  });

  describe("onPlanChoice via state mutation", () => {
    it("'resume' transitions stale -> ready", () => {
      result.state.planDetected = true;
      result.state.planUserChoice = "none";
      expect(result.buildFullState().view).toBe("stale");

      result.state.planUserChoice = "resume";
      expect(result.buildFullState().view).toBe("ready");
    });

    it("'dismiss' transitions stale -> empty", () => {
      result.state.planDetected = true;
      result.state.planUserChoice = "none";
      expect(result.buildFullState().view).toBe("stale");

      result.state.planUserChoice = "dismiss";
      expect(result.buildFullState().view).toBe("empty");
    });
  });

  describe("onPlanFormed", () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it("sets planUserChoice to 'resume'", async () => {
      vi.mocked(readFile).mockRejectedValueOnce(new Error("no parsed plan"));
      vi.mocked(readFile).mockResolvedValueOnce("# Plan\n## Phase 1: Setup\nDo stuff" as any);

      // Mock the dynamic import of parsePlan
      vi.doMock("../../parsers/plan", () => ({
        parsePlan: vi.fn(() => ({
          phases: [{ number: 1, title: "Setup" }],
        })),
      }));

      await result.onPlanFormed();
      expect(result.state.planUserChoice).toBe("resume");
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
      expect(res.state.planUserChoice).toBe("resume");
    });
  });

  describe("registerPlanWatcher", () => {
    it("onDidCreate sets planDetected=true and view becomes 'stale'", () => {
      result.registerPlanWatcher();
      expect(result.buildFullState().view).toBe("empty");

      watcherCallbacks.onCreate!();

      expect(result.state.planDetected).toBe(true);
      expect(result.buildFullState().view).toBe("stale");
    });

    it("onDidDelete sets planDetected=false and view becomes 'empty'", () => {
      result.state.planDetected = true;
      result.registerPlanWatcher();
      expect(result.buildFullState().view).toBe("stale");

      watcherCallbacks.onDelete!();

      expect(result.state.planDetected).toBe(false);
      expect(result.buildFullState().view).toBe("empty");
    });

    it("PLAN.md created after activation updates sidebar without manual resumePlan", () => {
      result.registerPlanWatcher();

      // Simulate PLAN.md creation — no manual resumePlan or planUserChoice change
      watcherCallbacks.onCreate!();

      // Should transition to stale automatically (planUserChoice stays "none")
      expect(result.state.planUserChoice).toBe("none");
      expect(result.buildFullState().view).toBe("stale");
      expect(result.buildFullState().plan).toBeDefined();
      expect(result.buildFullState().plan!.filename).toBe("PLAN.md");
    });
  });

  describe("onPlanReset", () => {
    it("clears cachedPlanPhases to []", () => {
      result.state.cachedPlanPhases = [
        { number: 1, title: "Phase", status: "pending" },
      ];
      result.onPlanReset();
      expect(result.state.cachedPlanPhases).toEqual([]);
    });

    it("sets planUserChoice to 'dismiss'", () => {
      result.state.planUserChoice = "resume";
      result.onPlanReset();
      expect(result.state.planUserChoice).toBe("dismiss");
    });

    it("updates sidebar (view becomes empty when no plan)", () => {
      result.state.planDetected = false;
      result.onPlanReset();
      expect(result.buildFullState().view).toBe("empty");
    });
  });
});
