import { describe, it, expect } from "vitest";
import { layoutDag } from "../../../views/dagLayout";
import type { ProgressState, PhaseStatus, PhaseDependency } from "../../../types";

function makeProgress(
  phases: Array<{
    number: number | string;
    title: string;
    status: PhaseStatus;
    dependencies?: PhaseDependency[];
  }>
): ProgressState {
  return {
    phases: phases.map((p) => ({
      number: p.number,
      title: p.title,
      status: p.status,
      dependencies: p.dependencies,
    })),
    totalPhases: phases.length,
  };
}

describe("layoutDag", () => {
  it("returns empty layout for no phases", () => {
    const layout = layoutDag({ phases: [], totalPhases: 0 });
    expect(layout.nodes).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
    expect(layout.width).toBe(0);
    expect(layout.height).toBe(0);
  });

  it("handles single node", () => {
    const progress = makeProgress([
      { number: 1, title: "Setup", status: "completed" },
    ]);
    const layout = layoutDag(progress);

    expect(layout.nodes).toHaveLength(1);
    expect(layout.edges).toHaveLength(0);
    expect(layout.nodes[0].id).toBe("phase-1");
    expect(layout.nodes[0].layer).toBe(0);
    expect(layout.width).toBe(160);
    expect(layout.height).toBe(80);
  });

  it("creates linear chain when no dependencies present", () => {
    const progress = makeProgress([
      { number: 1, title: "A", status: "completed" },
      { number: 2, title: "B", status: "in_progress" },
      { number: 3, title: "C", status: "pending" },
    ]);
    const layout = layoutDag(progress);

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(2);

    // Each on its own layer
    expect(layout.nodes[0].layer).toBe(0);
    expect(layout.nodes[1].layer).toBe(1);
    expect(layout.nodes[2].layer).toBe(2);

    // Edges form chain
    expect(layout.edges[0].from).toBe("phase-1");
    expect(layout.edges[0].to).toBe("phase-2");
    expect(layout.edges[1].from).toBe("phase-2");
    expect(layout.edges[1].to).toBe("phase-3");
  });

  it("handles linear chain with dependencies (A→B→C)", () => {
    const progress = makeProgress([
      { number: 1, title: "A", status: "completed" },
      {
        number: 2,
        title: "B",
        status: "completed",
        dependencies: [{ phaseNumber: 1, status: "completed" }],
      },
      {
        number: 3,
        title: "C",
        status: "pending",
        dependencies: [{ phaseNumber: 2, status: "completed" }],
      },
    ]);
    const layout = layoutDag(progress);

    expect(layout.nodes[0].layer).toBe(0);
    expect(layout.nodes[1].layer).toBe(1);
    expect(layout.nodes[2].layer).toBe(2);
    expect(layout.edges).toHaveLength(2);
  });

  it("handles fan-out (A→B, A→C)", () => {
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

    expect(layout.nodes[0].layer).toBe(0); // A
    expect(layout.nodes[1].layer).toBe(1); // B
    expect(layout.nodes[2].layer).toBe(1); // C — same layer as B

    // B and C should be side by side
    expect(layout.nodes[1].x).not.toBe(layout.nodes[2].x);
    expect(layout.nodes[1].y).toBe(layout.nodes[2].y);

    expect(layout.edges).toHaveLength(2);
  });

  it("handles fan-in (B→D, C→D)", () => {
    const progress = makeProgress([
      { number: 1, title: "A", status: "completed" },
      {
        number: 2,
        title: "B",
        status: "completed",
        dependencies: [{ phaseNumber: 1, status: "completed" }],
      },
      {
        number: 3,
        title: "C",
        status: "completed",
        dependencies: [{ phaseNumber: 1, status: "completed" }],
      },
      {
        number: 4,
        title: "D",
        status: "pending",
        dependencies: [
          { phaseNumber: 2, status: "completed" },
          { phaseNumber: 3, status: "completed" },
        ],
      },
    ]);
    const layout = layoutDag(progress);

    expect(layout.nodes[0].layer).toBe(0); // A
    expect(layout.nodes[1].layer).toBe(1); // B
    expect(layout.nodes[2].layer).toBe(1); // C
    expect(layout.nodes[3].layer).toBe(2); // D

    // D has edges from both B and C
    const dEdges = layout.edges.filter((e) => e.to === "phase-4");
    expect(dEdges).toHaveLength(2);
  });

  it("handles diamond shape (A→B, A→C, B→D, C→D)", () => {
    const progress = makeProgress([
      { number: 1, title: "A", status: "completed" },
      {
        number: 2,
        title: "B",
        status: "completed",
        dependencies: [{ phaseNumber: 1, status: "completed" }],
      },
      {
        number: 3,
        title: "C",
        status: "completed",
        dependencies: [{ phaseNumber: 1, status: "completed" }],
      },
      {
        number: 4,
        title: "D",
        status: "pending",
        dependencies: [
          { phaseNumber: 2, status: "completed" },
          { phaseNumber: 3, status: "completed" },
        ],
      },
    ]);
    const layout = layoutDag(progress);

    expect(layout.nodes[0].layer).toBe(0); // A
    expect(layout.nodes[1].layer).toBe(1); // B
    expect(layout.nodes[2].layer).toBe(1); // C
    expect(layout.nodes[3].layer).toBe(2); // D
    expect(layout.edges).toHaveLength(4);
  });

  it("handles disconnected nodes (placed at layer 0)", () => {
    const progress = makeProgress([
      { number: 1, title: "A", status: "completed" },
      {
        number: 2,
        title: "B",
        status: "pending",
        dependencies: [{ phaseNumber: 1, status: "completed" }],
      },
      { number: 3, title: "C", status: "pending" }, // disconnected but deps exist on others
    ]);
    const layout = layoutDag(progress);

    // C has no deps but deps exist in graph → layer 0 (same as A)
    const nodeC = layout.nodes.find((n) => n.id === "phase-3")!;
    expect(nodeC.layer).toBe(0);

    // A and C share layer 0, B is at layer 1
    const nodeA = layout.nodes.find((n) => n.id === "phase-1")!;
    const nodeB = layout.nodes.find((n) => n.id === "phase-2")!;
    expect(nodeA.layer).toBe(0);
    expect(nodeB.layer).toBe(1);
  });

  it("caps at 20 phases", () => {
    const phases = Array.from({ length: 25 }, (_, i) => ({
      number: i + 1,
      title: `Phase ${i + 1}`,
      status: "pending" as PhaseStatus,
    }));
    const progress = makeProgress(phases);
    const layout = layoutDag(progress);

    expect(layout.nodes).toHaveLength(20);
  });

  it("edge coordinates connect bottom of source to top of target", () => {
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
    const edge = layout.edges[0];
    const fromNode = layout.nodes[0];
    const toNode = layout.nodes[1];

    expect(edge.y1).toBe(fromNode.y + fromNode.height); // bottom
    expect(edge.y2).toBe(toNode.y); // top
    expect(edge.x1).toBe(fromNode.x + fromNode.width / 2); // center
    expect(edge.x2).toBe(toNode.x + toNode.width / 2); // center
  });
});
