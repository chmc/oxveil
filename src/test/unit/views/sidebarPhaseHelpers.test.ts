import { describe, it, expect } from "vitest";
import { renderSubSteps, renderPhaseList } from "../../../views/sidebarPhaseHelpers";
import type { SubStepView, PhaseView } from "../../../views/sidebarState";

describe("renderSubSteps", () => {
  it("renders completed sub-steps with checkmark", () => {
    const subSteps: SubStepView[] = [
      { name: "Implement", status: "completed" },
    ];
    const html = renderSubSteps(subSteps);
    expect(html).toContain("substep-done");
    expect(html).toContain("✓");
    expect(html).toContain("Implement");
  });

  it("renders in_progress sub-step with active class", () => {
    const subSteps: SubStepView[] = [
      { name: "Implement", status: "completed" },
      { name: "Verify", status: "in_progress" },
    ];
    const html = renderSubSteps(subSteps);
    expect(html).toContain("substep-active");
    expect(html).toContain("Verifying");  // -ing suffix for in_progress
  });

  it("renders failed sub-step with X mark", () => {
    const subSteps: SubStepView[] = [
      { name: "Verify", status: "failed" },
    ];
    const html = renderSubSteps(subSteps);
    expect(html).toContain("substep-failed");
    expect(html).toContain("✗");
  });

  it("renders pending sub-step with pending class", () => {
    const subSteps: SubStepView[] = [
      { name: "Implement", status: "completed" },
      { name: "Verify", status: "in_progress" },
      { name: "Refactor", status: "pending" },
    ];
    const html = renderSubSteps(subSteps);
    expect(html).toContain("substep-pending");
    expect(html).toContain("Refactor");
  });

  it("shows attempts count when > 1", () => {
    const subSteps: SubStepView[] = [
      { name: "Verify", status: "in_progress", attempts: 2 },
    ];
    const html = renderSubSteps(subSteps);
    expect(html).toContain("(2)");
  });

  it("omits attempts when 1 or undefined", () => {
    const subSteps: SubStepView[] = [
      { name: "Verify", status: "completed", attempts: 1 },
    ];
    const html = renderSubSteps(subSteps);
    expect(html).not.toContain("(1)");
  });

  it("joins sub-steps with arrow separator", () => {
    const subSteps: SubStepView[] = [
      { name: "Implement", status: "completed" },
      { name: "Verify", status: "completed" },
    ];
    const html = renderSubSteps(subSteps);
    expect(html).toContain("substep-arrow");
    expect(html).toContain("→");
  });

  it("returns empty string for empty array", () => {
    expect(renderSubSteps([])).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(renderSubSteps(undefined)).toBe("");
  });
});

describe("renderPhaseList with subSteps", () => {
  it("renders phase-substeps div when subSteps present", () => {
    const phases: PhaseView[] = [{
      number: 1,
      title: "Test",
      status: "in_progress",
      subSteps: [
        { name: "Implement", status: "completed" },
        { name: "Verify", status: "in_progress" },
      ],
    }];
    const html = renderPhaseList(phases);
    expect(html).toContain("phase-substeps");
    expect(html).toContain("Implement");
    expect(html).toContain("Verifying");
  });

  it("omits phase-substeps div when no subSteps", () => {
    const phases: PhaseView[] = [{
      number: 1,
      title: "Test",
      status: "pending",
    }];
    const html = renderPhaseList(phases);
    expect(html).not.toContain("phase-substeps");
  });
});
