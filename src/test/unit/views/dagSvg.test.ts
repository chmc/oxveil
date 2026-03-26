import { describe, it, expect } from "vitest";
import { renderDagSvg } from "../../../views/dagSvg";
import { layoutDag } from "../../../views/dagLayout";
import type { ProgressState, PhaseStatus, PhaseDependency } from "../../../types";

function makeProgress(
  phases: Array<{
    number: number | string;
    title: string;
    status: PhaseStatus;
    started?: string;
    completed?: string;
    dependencies?: PhaseDependency[];
  }>
): ProgressState {
  return {
    phases: phases.map((p) => ({
      number: p.number,
      title: p.title,
      status: p.status,
      started: p.started,
      completed: p.completed,
      dependencies: p.dependencies,
    })),
    totalPhases: phases.length,
  };
}

describe("renderDagSvg", () => {
  it("returns empty SVG for empty layout", () => {
    const layout = layoutDag({ phases: [], totalPhases: 0 });
    const svg = renderDagSvg(layout);

    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("contains correct number of nodes", () => {
    const progress = makeProgress([
      { number: 1, title: "A", status: "completed" },
      { number: 2, title: "B", status: "in_progress" },
      { number: 3, title: "C", status: "pending" },
    ]);
    const layout = layoutDag(progress);
    const svg = renderDagSvg(layout);

    const nodeCount = (svg.match(/class="dag-node/g) || []).length;
    expect(nodeCount).toBe(3);
  });

  it("contains correct number of edges", () => {
    const progress = makeProgress([
      { number: 1, title: "A", status: "completed" },
      {
        number: 2,
        title: "B",
        status: "pending",
        dependencies: [{ phaseNumber: 1, status: "completed" }],
      },
      {
        number: 3,
        title: "C",
        status: "pending",
        dependencies: [{ phaseNumber: 1, status: "completed" }],
      },
    ]);
    const layout = layoutDag(progress);
    const svg = renderDagSvg(layout);

    const edgeCount = (svg.match(/class="dag-edge"/g) || []).length;
    expect(edgeCount).toBe(2);
  });

  it("applies status-specific CSS classes", () => {
    const progress = makeProgress([
      { number: 1, title: "Done", status: "completed" },
      { number: 2, title: "Running", status: "in_progress" },
      { number: 3, title: "Broken", status: "failed" },
      { number: 4, title: "Waiting", status: "pending" },
    ]);
    const layout = layoutDag(progress);
    const svg = renderDagSvg(layout);

    expect(svg).toContain("dag-status-completed");
    expect(svg).toContain("dag-status-in_progress");
    expect(svg).toContain("dag-status-failed");
    expect(svg).toContain("dag-status-pending");
  });

  it("includes legend", () => {
    const progress = makeProgress([
      { number: 1, title: "A", status: "completed" },
    ]);
    const layout = layoutDag(progress);
    const svg = renderDagSvg(layout);

    expect(svg).toContain("dag-legend");
    expect(svg).toContain("Completed");
    expect(svg).toContain("Running");
    expect(svg).toContain("Failed");
    expect(svg).toContain("Pending");
  });

  it("viewBox dimensions match layout", () => {
    const progress = makeProgress([
      { number: 1, title: "A", status: "completed" },
      {
        number: 2,
        title: "B",
        status: "pending",
        dependencies: [{ phaseNumber: 1, status: "completed" }],
      },
    ]);
    const layout = layoutDag(progress);
    const svg = renderDagSvg(layout);

    // viewBox should incorporate layout dimensions plus padding and legend
    const match = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    expect(match).toBeTruthy();
    const [, w, h] = match!;
    expect(Number(w)).toBeGreaterThanOrEqual(layout.width);
    expect(Number(h)).toBeGreaterThanOrEqual(layout.height);
  });

  it("applies glow filter to running nodes", () => {
    const progress = makeProgress([
      { number: 1, title: "Building", status: "in_progress" },
    ]);
    const layout = layoutDag(progress);
    const svg = renderDagSvg(layout);

    expect(svg).toContain('filter="url(#glow)"');
    expect(svg).toContain('<filter id="glow"');
  });

  it("does not apply glow filter to non-running nodes", () => {
    const progress = makeProgress([
      { number: 1, title: "Done", status: "completed" },
    ]);
    const layout = layoutDag(progress);
    const svg = renderDagSvg(layout);

    expect(svg).not.toContain('filter="url(#glow)"');
  });

  it("shows duration for completed phases with timestamps", () => {
    const progress = makeProgress([
      {
        number: 1,
        title: "Setup",
        status: "completed",
        started: "2025-01-01T00:00:00Z",
        completed: "2025-01-01T00:00:45Z",
      },
    ]);
    const layout = layoutDag(progress);
    const svg = renderDagSvg(layout);

    expect(svg).toContain("45s");
  });

  it("is deterministic — same input produces same output", () => {
    const progress = makeProgress([
      { number: 1, title: "A", status: "completed" },
      {
        number: 2,
        title: "B",
        status: "pending",
        dependencies: [{ phaseNumber: 1, status: "completed" }],
      },
    ]);
    const layout = layoutDag(progress);
    const svg1 = renderDagSvg(layout);
    const svg2 = renderDagSvg(layout);

    expect(svg1).toBe(svg2);
  });

  it("escapes special characters in titles", () => {
    const progress = makeProgress([
      { number: 1, title: "A <b>&</b>", status: "completed" },
    ]);
    const layout = layoutDag(progress);
    const svg = renderDagSvg(layout);

    expect(svg).toContain("&lt;b&gt;&amp;&lt;/b&gt;");
    expect(svg).not.toContain("<b>&</b>");
  });

  it("is well-formed XML", () => {
    const progress = makeProgress([
      { number: 1, title: "A", status: "completed" },
      {
        number: 2,
        title: "B",
        status: "in_progress",
        dependencies: [{ phaseNumber: 1, status: "completed" }],
      },
      {
        number: 3,
        title: "C",
        status: "pending",
        dependencies: [{ phaseNumber: 2, status: "in_progress" }],
      },
    ]);
    const layout = layoutDag(progress);
    const svg = renderDagSvg(layout);

    expect(svg).toMatch(/^<svg\s/);
    expect(svg).toMatch(/<\/svg>$/);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("adds data-phase attributes to nodes", () => {
    const progress = makeProgress([
      { number: 1, title: "A", status: "completed" },
      { number: 2, title: "B", status: "pending" },
    ]);
    const layout = layoutDag(progress);
    const svg = renderDagSvg(layout);

    expect(svg).toContain('data-phase="1"');
    expect(svg).toContain('data-phase="2"');
  });

  it("adds cursor pointer style to completed and failed nodes", () => {
    const progress = makeProgress([
      { number: 1, title: "A", status: "completed" },
      { number: 2, title: "B", status: "failed" },
      { number: 3, title: "C", status: "in_progress" },
      { number: 4, title: "D", status: "pending" },
    ]);
    const layout = layoutDag(progress);
    const svg = renderDagSvg(layout);

    // Completed and failed nodes should have cursor pointer
    expect(svg).toContain('data-phase="1" style="cursor: pointer"');
    expect(svg).toContain('data-phase="2" style="cursor: pointer"');

    // In-progress and pending nodes should NOT have cursor pointer
    expect(svg).not.toMatch(/data-phase="3"[^>]*cursor: pointer/);
    expect(svg).not.toMatch(/data-phase="4"[^>]*cursor: pointer/);
  });
});
