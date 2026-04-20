import { describe, it, expect, vi, beforeEach } from "vitest";

let watcherCallbacks: {
  onCreate?: () => void | Promise<void>;
  onDelete?: () => void;
  onChange?: () => void | Promise<void>;
} = {};

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
import type { SidebarActivationDeps } from "../../activateSidebar";
import { readFile } from "node:fs/promises";

const PLAN_CONTENT = `# My Plan

## Phase 1: Setup
Install dependencies and configure the environment.

## Phase 2: Implement
Write the core logic.

## Phase 3: Test
Run the test suite.
`;

function makeDeps(overrides: Partial<SidebarActivationDeps> = {}): SidebarActivationDeps {
  return {
    manager: { getActiveSession: vi.fn(() => undefined) } as any,
    workspaceRoot: "/fake/root",
    archiveTree: { getEntries: vi.fn(() => []) } as any,
    elapsedTimer: { elapsed: "0m" } as any,
    initialDetectionStatus: "detected",
    initialPlanDetected: false,
    ...overrides,
  };
}

describe("activateSidebar integration: plan phases in ready state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    watcherCallbacks = {};
  });

  it("PLAN.md with 3 Phase headers → buildFullState().plan.phases has 3 entries", async () => {
    // ai-parsed-plan.md doesn't exist, falls back to PLAN.md
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));
    vi.mocked(readFile).mockResolvedValueOnce(PLAN_CONTENT as any);

    const result = activateSidebar(makeDeps({ initialPlanDetected: true }));

    await vi.waitFor(() => {
      expect(result.state.cachedPlanPhases.length).toBe(3);
    });

    result.state.planUserChoice = "resume";
    const state = result.buildFullState();

    expect(state.view).toBe("ready");
    expect(state.plan!.phases).toHaveLength(3);
    expect(state.plan!.phases).toEqual([
      { number: 1, title: "Setup", status: "pending" },
      { number: 2, title: "Implement", status: "pending" },
      { number: 3, title: "Test", status: "pending" },
    ]);
  });

  it("cachedPlanPhases populated from parsePlan() on plan detection", async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));
    vi.mocked(readFile).mockResolvedValueOnce(PLAN_CONTENT as any);

    const result = activateSidebar(makeDeps({ initialPlanDetected: true }));

    await vi.waitFor(() => {
      expect(result.state.cachedPlanPhases).toEqual([
        { number: 1, title: "Setup", status: "pending" },
        { number: 2, title: "Implement", status: "pending" },
        { number: 3, title: "Test", status: "pending" },
      ]);
    });
  });

  it("ready state sidebar includes phase titles (not empty array)", async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));
    vi.mocked(readFile).mockResolvedValueOnce(PLAN_CONTENT as any);

    const result = activateSidebar(makeDeps({ initialPlanDetected: true }));

    await vi.waitFor(() => {
      expect(result.state.cachedPlanPhases.length).toBeGreaterThan(0);
    });

    result.state.planUserChoice = "resume";
    const state = result.buildFullState();

    expect(state.plan!.phases.length).toBeGreaterThan(0);
    expect(state.plan!.phases.map((p) => p.title)).toEqual([
      "Setup",
      "Implement",
      "Test",
    ]);
  });
});
