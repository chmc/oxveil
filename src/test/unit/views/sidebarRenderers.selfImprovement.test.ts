import { describe, it, expect } from "vitest";
import { renderBody } from "../../../views/sidebarRenderers";
import type { PhaseView } from "../../../views/sidebarState";

function makePhases(...statuses: Array<{ num: number; title: string; status: string }>): PhaseView[] {
  return statuses.map((s) => ({
    number: s.num,
    title: s.title,
    status: s.status as PhaseView["status"],
  }));
}

describe("renderBody self-improvement status", () => {
  it("ready view: shows 'Self-improvement: Off' with Enable link when disabled", () => {
    const html = renderBody({
      view: "ready",
      plan: {
        filename: "PLAN.md",
        phases: makePhases({ num: 1, title: "Setup", status: "pending" }),
      },
      archives: [],
      selfImprovement: { enabled: false },
    });
    expect(html).toContain("Self-improvement:");
    expect(html).toContain('<span class="badge off">Off</span>');
    expect(html).toContain("Enable");
    expect(html).toContain("oxveil.selfImprovement");
  });

  it("ready view: shows 'Self-improvement: On' when enabled", () => {
    const html = renderBody({
      view: "ready",
      plan: {
        filename: "PLAN.md",
        phases: makePhases({ num: 1, title: "Setup", status: "pending" }),
      },
      archives: [],
      selfImprovement: { enabled: true, lessonsAvailable: false },
    });
    expect(html).toContain("Self-improvement:");
    expect(html).toContain('<span class="badge on">On</span>');
    expect(html).not.toContain("Enable");
  });

  it("ready view: shows 'Lessons captured' when enabled + lessons exist", () => {
    const html = renderBody({
      view: "ready",
      plan: {
        filename: "PLAN.md",
        phases: makePhases({ num: 1, title: "Setup", status: "pending" }),
      },
      archives: [],
      selfImprovement: { enabled: true, lessonsAvailable: true },
    });
    expect(html).toContain("Lessons captured");
    expect(html).toContain('<span class="badge on">On</span>');
  });

  it("ready view: shows 'No lessons available' when enabled + no lessons", () => {
    const html = renderBody({
      view: "ready",
      plan: {
        filename: "PLAN.md",
        phases: makePhases({ num: 1, title: "Setup", status: "pending" }),
      },
      archives: [],
      selfImprovement: { enabled: true, lessonsAvailable: false },
    });
    expect(html).toContain("No lessons available");
    expect(html).toContain('<span class="badge on">On</span>');
  });

  it("completed view: shows 'Self-improvement: Off' with Enable link when disabled", () => {
    const html = renderBody({
      view: "completed",
      plan: {
        filename: "PLAN.md",
        phases: makePhases({ num: 1, title: "Setup", status: "completed" }),
      },
      session: { elapsed: "1m" },
      archives: [],
      selfImprovement: { enabled: false },
    });
    expect(html).toContain("Self-improvement:");
    expect(html).toContain('<span class="badge off">Off</span>');
    expect(html).toContain("Enable");
  });

  it("completed view: shows 'Lessons captured' when enabled + lessons exist", () => {
    const html = renderBody({
      view: "completed",
      plan: {
        filename: "PLAN.md",
        phases: makePhases({ num: 1, title: "Setup", status: "completed" }),
      },
      session: { elapsed: "1m" },
      archives: [],
      selfImprovement: { enabled: true, lessonsAvailable: true },
    });
    expect(html).toContain("Lessons captured");
    expect(html).toContain('<span class="badge on">On</span>');
  });

  it("completed view: shows 'No lessons available' when enabled + no lessons", () => {
    const html = renderBody({
      view: "completed",
      plan: {
        filename: "PLAN.md",
        phases: makePhases({ num: 1, title: "Setup", status: "completed" }),
      },
      session: { elapsed: "1m" },
      archives: [],
      selfImprovement: { enabled: true, lessonsAvailable: false },
    });
    expect(html).toContain("No lessons available");
  });
});
