import { describe, it, expect } from "vitest";
import {
  PhaseTreeProvider,
  type PhaseTreeDeps,
} from "../../../views/phaseTree";
import type { ProgressState, PhaseStatus } from "../../../types";

function makeDeps(overrides: Partial<PhaseTreeDeps> = {}): PhaseTreeDeps {
  return {
    detected: true,
    progress: null,
    ...overrides,
  };
}

function makeProgress(
  phases: Array<{
    number: number | string;
    title: string;
    status: PhaseStatus;
    attempts?: number;
  }>
): ProgressState {
  const currentPhaseIndex = phases.findIndex(
    (p) => p.status === "in_progress"
  );
  return {
    phases: phases.map((p) => ({
      number: p.number,
      title: p.title,
      status: p.status,
      attempts: p.attempts,
    })),
    totalPhases: phases.length,
    currentPhaseIndex: currentPhaseIndex >= 0 ? currentPhaseIndex : undefined,
  };
}

describe("PhaseTreeProvider", () => {
  it("returns welcome message when detected + no phases", () => {
    const provider = new PhaseTreeProvider(makeDeps({ detected: true, progress: null }));
    const items = provider.getChildren();

    expect(items).toHaveLength(1);
    expect(items[0].label).toContain("No active session");
    expect(items[0].description).toContain("Run");
  });

  it("returns not-found guidance when not detected", () => {
    const provider = new PhaseTreeProvider(makeDeps({ detected: false }));
    const items = provider.getChildren();

    expect(items).toHaveLength(1);
    expect(items[0].label).toContain("claudeloop not found");
  });

  it("returns correct tree items with icons per phase status", () => {
    const progress = makeProgress([
      { number: 1, title: "Setup", status: "completed" },
      { number: 2, title: "Build", status: "in_progress" },
      { number: 3, title: "Test", status: "failed" },
      { number: 4, title: "Deploy", status: "pending" },
    ]);
    const provider = new PhaseTreeProvider(
      makeDeps({ progress })
    );
    const items = provider.getChildren();

    expect(items).toHaveLength(4);

    // Phase 1 — completed
    expect(items[0].label).toBe("Phase 1: Setup");
    expect(items[0].iconId).toBe("check");
    expect(items[0].iconColor).toBe("testing.iconPassed");

    // Phase 2 — in_progress
    expect(items[1].label).toBe("Phase 2: Build");
    expect(items[1].iconId).toBe("sync~spin");
    expect(items[1].iconColor).toBe("debugIcon.startForeground");

    // Phase 3 — failed
    expect(items[2].label).toBe("Phase 3: Test");
    expect(items[2].iconId).toBe("error");
    expect(items[2].iconColor).toBe("testing.iconFailed");

    // Phase 4 — pending
    expect(items[3].label).toBe("Phase 4: Deploy");
    expect(items[3].iconId).toBe("circle-outline");
    expect(items[3].iconColor).toBe("disabledForeground");
  });

  it("shows attempt count in description for phases with attempts > 1", () => {
    const progress = makeProgress([
      { number: 1, title: "Setup", status: "completed", attempts: 1 },
      { number: 2, title: "Build", status: "failed", attempts: 3 },
      { number: 3, title: "Test", status: "pending" },
    ]);
    const provider = new PhaseTreeProvider(
      makeDeps({ progress })
    );
    const items = provider.getChildren();

    expect(items[0].description).toBeUndefined();
    expect(items[1].description).toBe("3 attempts");
    expect(items[2].description).toBeUndefined();
  });

  it("handles decimal phase numbers", () => {
    const progress = makeProgress([
      { number: "2.5", title: "Hotfix", status: "completed" },
    ]);
    const provider = new PhaseTreeProvider(
      makeDeps({ progress })
    );
    const items = provider.getChildren();

    expect(items[0].label).toBe("Phase 2.5: Hotfix");
  });

  it("returns welcome when detected + empty progress (0 phases)", () => {
    const progress: ProgressState = {
      phases: [],
      totalPhases: 0,
    };
    const provider = new PhaseTreeProvider(
      makeDeps({ progress })
    );
    const items = provider.getChildren();

    expect(items).toHaveLength(1);
    expect(items[0].label).toContain("No active session");
  });

  it("detects phase transitions between old and new state", () => {
    const oldState = makeProgress([
      { number: 1, title: "Setup", status: "in_progress" },
      { number: 2, title: "Build", status: "pending" },
    ]);
    const newState = makeProgress([
      { number: 1, title: "Setup", status: "completed" },
      { number: 2, title: "Build", status: "in_progress" },
    ]);

    const transitions = PhaseTreeProvider.detectTransitions(oldState, newState);

    expect(transitions).toHaveLength(2);
    expect(transitions[0]).toEqual({
      phase: 1,
      title: "Setup",
      from: "in_progress",
      to: "completed",
    });
    expect(transitions[1]).toEqual({
      phase: 2,
      title: "Build",
      from: "pending",
      to: "in_progress",
    });
  });

  it("returns empty transitions when states are identical", () => {
    const state = makeProgress([
      { number: 1, title: "Setup", status: "completed" },
    ]);
    const transitions = PhaseTreeProvider.detectTransitions(state, state);
    expect(transitions).toHaveLength(0);
  });
});
