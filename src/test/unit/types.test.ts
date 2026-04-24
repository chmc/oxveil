import { describe, it, expect } from "vitest";
import type { SubStepState, PhaseState } from "../../types";

describe("SubStepState", () => {
  it("can be assigned to PhaseState.subSteps", () => {
    const subSteps: SubStepState[] = [
      { name: "implement", status: "completed" },
      { name: "verify", status: "in_progress", attempts: 2 },
      { name: "refactor", status: "pending" },
    ];
    const phase: PhaseState = {
      number: 1,
      title: "Test",
      status: "in_progress",
      subSteps,
    };
    expect(phase.subSteps).toHaveLength(3);
  });
});
