import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture file watcher callbacks so tests can simulate file events
let watcherCallbacks: {
  onCreate?: () => void | Promise<void>;
  onDelete?: () => void;
  onChange?: () => void | Promise<void>;
} = {};

// Capture the onPlanChoice callback passed to SidebarPanel
let capturedOnPlanChoice: ((choice: "resume" | "dismiss") => void) | undefined;

vi.mock("../../views/sidebarPanel", () => ({
  SidebarPanel: vi.fn().mockImplementation((deps: any) => {
    capturedOnPlanChoice = deps.onPlanChoice;
    return {
      updateState: vi.fn(),
    };
  }),
}));

vi.mock("vscode", () => ({
  workspace: {
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn((cb: () => void | Promise<void>) => { watcherCallbacks.onCreate = cb; }),
      onDidDelete: vi.fn((cb: () => void) => { watcherCallbacks.onDelete = cb; }),
      onDidChange: vi.fn((cb: () => void | Promise<void>) => { watcherCallbacks.onChange = cb; }),
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
    capturedOnPlanChoice = undefined;
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

      res.state.planUserChoice = "resume";
      const state = res.buildFullState();
      expect(state.view).toBe("ready");
      expect(state.plan!.phases).toEqual([
        { number: 1, title: "Alpha", status: "pending" },
        { number: 2, title: "Beta", status: "pending" },
      ]);
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

    it("resume triggers loadPlanPhases when cachedPlanPhases is empty", async () => {
      // First read (ai-parsed-plan.md) fails, second read (PLAN.md) succeeds
      vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));
      vi.mocked(readFile).mockResolvedValueOnce(
        "# Plan\n## Phase 1: Parsed\n" as any,
      );
      vi.resetModules();
      vi.doMock("../../parsers/plan", () => ({
        parsePlan: vi.fn(() => ({
          phases: [{ number: 1, title: "Parsed" }],
        })),
      }));

      // Simulate: planDetected but phases not yet loaded
      result.state.planDetected = true;
      expect(result.state.cachedPlanPhases).toEqual([]);

      // Trigger resume via captured callback
      capturedOnPlanChoice!("resume");

      await vi.waitFor(() => {
        expect(result.state.cachedPlanPhases).toEqual([
          { number: 1, title: "Parsed", status: "pending" },
        ]);
      });
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
      result.state.cachedPlanPhases = [
        { number: 1, title: "Old", status: "pending" },
      ];
      result.state.planDetected = true;

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

  describe("onPlanChatStarted", () => {
    it("sets planUserChoice to 'planning'", () => {
      result.state.planUserChoice = "none";
      result.onPlanChatStarted();
      expect(result.state.planUserChoice).toBe("planning");
    });

    it("transitions view to 'planning' when idle", () => {
      result.state.planUserChoice = "none";
      result.onPlanChatStarted();
      expect(result.buildFullState().view).toBe("planning");
    });
  });

  describe("onPlanChatEnded", () => {
    it("resets planUserChoice to 'none'", () => {
      result.state.planUserChoice = "planning";
      result.onPlanChatEnded();
      expect(result.state.planUserChoice).toBe("none");
    });

    it("transitions view away from 'planning' when idle", () => {
      result.state.planUserChoice = "planning";
      expect(result.buildFullState().view).toBe("planning");
      result.onPlanChatEnded();
      expect(result.buildFullState().view).not.toBe("planning");
    });
  });
});
