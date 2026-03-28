import { describe, it, expect } from "vitest";
import { PhaseTreeProvider } from "../../../views/phaseTree";
import type {
  ProgressState,
  PhaseStatus,
  PhaseDependency,
} from "../../../types";

function makeProgress(
  phases: Array<{
    number: number | string;
    title: string;
    status: PhaseStatus;
    attempts?: number;
    dependencies?: PhaseDependency[];
  }>,
): ProgressState {
  const currentPhaseIndex = phases.findIndex(
    (p) => p.status === "in_progress",
  );
  return {
    phases: phases.map((p) => ({
      number: p.number,
      title: p.title,
      status: p.status,
      attempts: p.attempts,
      dependencies: p.dependencies,
    })),
    totalPhases: phases.length,
    currentPhaseIndex: currentPhaseIndex >= 0 ? currentPhaseIndex : undefined,
  };
}

const FOLDER_A = "file:///a";
const FOLDER_B = "file:///b";

describe("PhaseTreeProvider", () => {
  describe("single-root", () => {
    it("returns welcome message when detected + no phases", () => {
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", null);
      const items = provider.getChildren();

      expect(items).toHaveLength(1);
      expect(items[0].label).toContain("No active session");
      expect(items[0].description).toContain("Run");
    });

    it("returns not-found guidance when not detected", () => {
      const provider = new PhaseTreeProvider(false);
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
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", progress);
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
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", progress);
      const items = provider.getChildren();

      expect(items[0].description).toBeUndefined();
      expect(items[1].description).toBe("3 attempts");
      expect(items[2].description).toBeUndefined();
    });

    it("handles decimal phase numbers", () => {
      const progress = makeProgress([
        { number: "2.5", title: "Hotfix", status: "completed" },
      ]);
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", progress);
      const items = provider.getChildren();

      expect(items[0].label).toBe("Phase 2.5: Hotfix");
    });

    it("returns welcome when detected + empty progress (0 phases)", () => {
      const progress: ProgressState = {
        phases: [],
        totalPhases: 0,
      };
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", progress);
      const items = provider.getChildren();

      expect(items).toHaveLength(1);
      expect(items[0].label).toContain("No active session");
    });

    it("shows dependency info in description", () => {
      const progress = makeProgress([
        {
          number: 3,
          title: "API",
          status: "pending",
          dependencies: [
            { phaseNumber: 1, status: "completed" },
            { phaseNumber: 2, status: "completed" },
          ],
        },
      ]);
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", progress);
      const items = provider.getChildren();

      expect(items[0].description).toBe("depends on Phase 1, Phase 2");
    });

    it("combines attempts and dependencies in description", () => {
      const progress = makeProgress([
        {
          number: 4,
          title: "DB",
          status: "failed",
          attempts: 3,
          dependencies: [
            { phaseNumber: 1, status: "completed" },
            { phaseNumber: 2, status: "completed" },
          ],
        },
      ]);
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", progress);
      const items = provider.getChildren();

      expect(items[0].description).toBe(
        "3 attempts · depends on Phase 1, Phase 2",
      );
    });

    it("shows no description when no attempts and no dependencies", () => {
      const progress = makeProgress([
        { number: 1, title: "Setup", status: "completed" },
      ]);
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", progress);
      const items = provider.getChildren();

      expect(items[0].description).toBeUndefined();
    });

    it("sets contextValue based on phase status", () => {
      const progress = makeProgress([
        { number: 1, title: "Setup", status: "completed" },
        { number: 2, title: "Build", status: "in_progress" },
        { number: 3, title: "Test", status: "failed" },
        { number: 4, title: "Deploy", status: "pending" },
      ]);
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", progress);
      const items = provider.getChildren();

      expect(items[0].contextValue).toBe("phase-completed");
      expect(items[1].contextValue).toBe("phase-running");
      expect(items[2].contextValue).toBe("phase");
      expect(items[3].contextValue).toBe("phase");
    });

    it("returns flat list with no parent for single-root phases", () => {
      const progress = makeProgress([
        { number: 1, title: "Setup", status: "completed" },
      ]);
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", progress);
      const items = provider.getChildren();

      expect(items[0].collapsible).toBeUndefined();
      expect(provider.getParent(items[0].id)).toBeUndefined();
    });
  });

  describe("multi-root", () => {
    it("returns folder nodes at the root level", () => {
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", null);
      provider.update(FOLDER_B, "project-b", null);
      const roots = provider.getChildren();

      expect(roots).toHaveLength(2);
      expect(roots[0].label).toBe("project-a");
      expect(roots[0].iconId).toBe("folder");
      expect(roots[0].contextValue).toBe("oxveil-folder");
      expect(roots[0].collapsible).toBe(true);
      expect(roots[1].label).toBe("project-b");
    });

    it("returns phase items as children of folder nodes", () => {
      const progress = makeProgress([
        { number: 1, title: "Setup", status: "completed" },
        { number: 2, title: "Build", status: "in_progress" },
      ]);
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", progress);
      provider.update(FOLDER_B, "project-b", null);

      const children = provider.getChildren(`folder:${FOLDER_A}`);
      expect(children).toHaveLength(2);
      expect(children[0].label).toBe("Phase 1: Setup");
      expect(children[1].label).toBe("Phase 2: Build");
    });

    it("returns no-session message for folder with no progress", () => {
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", null);
      provider.update(FOLDER_B, "project-b", null);

      const children = provider.getChildren(`folder:${FOLDER_A}`);
      expect(children).toHaveLength(1);
      expect(children[0].label).toContain("No active session");
    });

    it("folder badge shows idle when no progress", () => {
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", null);
      provider.update(FOLDER_B, "project-b", null);
      const roots = provider.getChildren();

      expect(roots[0].description).toBe("idle");
    });

    it("folder badge shows completed/total count", () => {
      const progress = makeProgress([
        { number: 1, title: "Setup", status: "completed" },
        { number: 2, title: "Build", status: "in_progress" },
        { number: 3, title: "Test", status: "pending" },
      ]);
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", progress);
      provider.update(FOLDER_B, "project-b", null);
      const roots = provider.getChildren();

      expect(roots[0].description).toBe("1/3");
    });

    it("folder badge shows done when all completed", () => {
      const progress = makeProgress([
        { number: 1, title: "Setup", status: "completed" },
        { number: 2, title: "Build", status: "completed" },
      ]);
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", progress);
      provider.update(FOLDER_B, "project-b", null);
      const roots = provider.getChildren();

      expect(roots[0].description).toBe("done");
    });

    it("folder badge shows failed when any phase failed", () => {
      const progress = makeProgress([
        { number: 1, title: "Setup", status: "completed" },
        { number: 2, title: "Build", status: "failed" },
      ]);
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", progress);
      provider.update(FOLDER_B, "project-b", null);
      const roots = provider.getChildren();

      expect(roots[0].description).toBe("failed");
    });

    it("getParent returns folder id for phase items", () => {
      const progress = makeProgress([
        { number: 1, title: "Setup", status: "completed" },
      ]);
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", progress);
      provider.update(FOLDER_B, "project-b", null);

      const children = provider.getChildren(`folder:${FOLDER_A}`);
      expect(provider.getParent(children[0].id)).toBe(`folder:${FOLDER_A}`);
    });

    it("getParent returns undefined for folder nodes", () => {
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", null);
      provider.update(FOLDER_B, "project-b", null);
      const roots = provider.getChildren();

      expect(provider.getParent(roots[0].id)).toBeUndefined();
    });

    it("removeFolder reduces to single-root flat list", () => {
      const progress = makeProgress([
        { number: 1, title: "Setup", status: "completed" },
      ]);
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", progress);
      provider.update(FOLDER_B, "project-b", null);

      provider.removeFolder(FOLDER_B);
      const roots = provider.getChildren();

      // Should be flat (single-root) — phase items directly
      expect(roots).toHaveLength(1);
      expect(roots[0].label).toBe("Phase 1: Setup");
    });
  });

  describe("updateDetected", () => {
    it("switches to not-found message", () => {
      const provider = new PhaseTreeProvider(true);
      provider.update(FOLDER_A, "project-a", null);

      provider.updateDetected(false);
      const items = provider.getChildren();

      expect(items).toHaveLength(1);
      expect(items[0].label).toContain("claudeloop not found");
    });
  });

  describe("detectTransitions", () => {
    it("detects phase transitions between old and new state", () => {
      const oldState = makeProgress([
        { number: 1, title: "Setup", status: "in_progress" },
        { number: 2, title: "Build", status: "pending" },
      ]);
      const newState = makeProgress([
        { number: 1, title: "Setup", status: "completed" },
        { number: 2, title: "Build", status: "in_progress" },
      ]);

      const transitions = PhaseTreeProvider.detectTransitions(
        oldState,
        newState,
      );

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

  describe("no folders registered", () => {
    it("returns no-session when no folders exist", () => {
      const provider = new PhaseTreeProvider(true);
      const items = provider.getChildren();

      expect(items).toHaveLength(1);
      expect(items[0].label).toContain("No active session");
    });
  });
});
