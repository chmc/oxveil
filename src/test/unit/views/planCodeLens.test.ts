import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({
  EventEmitter: vi.fn(() => ({
    event: vi.fn(),
    fire: vi.fn(),
    dispose: vi.fn(),
  })),
  Range: vi.fn(),
  CodeLens: vi.fn(),
}));

import { computePlanLenses } from "../../../views/planCodeLens";

describe("computePlanLenses", () => {
  it("returns empty array for empty content", () => {
    expect(computePlanLenses("")).toEqual([]);
    expect(computePlanLenses("  \n  ")).toEqual([]);
  });

  it("returns empty array when no phase headers exist", () => {
    const content = `# My Plan\n\nSome description.\n\n## Goals\n- Build something`;
    expect(computePlanLenses(content)).toEqual([]);
  });

  it("detects ## phase headers", () => {
    const content = `# Plan\n\n## Phase 1: Setup\nDo things.\n\n## Phase 2: Build\nMore things.`;
    const lenses = computePlanLenses(content);

    expect(lenses).toHaveLength(2);
    expect(lenses[0]).toEqual({ line: 2, phaseNumber: 1, title: "Setup" });
    expect(lenses[1]).toEqual({ line: 5, phaseNumber: 2, title: "Build" });
  });

  it("detects ### phase headers", () => {
    const content = `### Phase 1: First\nBody.\n\n### Phase 2: Second\nBody.`;
    const lenses = computePlanLenses(content);

    expect(lenses).toHaveLength(2);
    expect(lenses[0].phaseNumber).toBe(1);
    expect(lenses[1].phaseNumber).toBe(2);
  });

  it("handles decimal phase numbers as strings", () => {
    const content = `## Phase 1.1: Sub-step A\n## Phase 1.2: Sub-step B\n## Phase 2: Main`;
    const lenses = computePlanLenses(content);

    expect(lenses).toHaveLength(3);
    expect(lenses[0].phaseNumber).toBe("1.1");
    expect(lenses[1].phaseNumber).toBe("1.2");
    expect(lenses[2].phaseNumber).toBe(2);
  });

  it("handles headers with emoji prefixes", () => {
    const content = `## 🚀 Phase 1: Launch\n\n### ✅ Phase 2: Verify`;
    const lenses = computePlanLenses(content);

    expect(lenses).toHaveLength(2);
    expect(lenses[0]).toEqual({ line: 0, phaseNumber: 1, title: "Launch" });
    expect(lenses[1]).toEqual({ line: 2, phaseNumber: 2, title: "Verify" });
  });

  it("ignores malformed headers", () => {
    const content = `## Phase: Missing number\n## Phase 1 Missing colon\n## Phase 1: Valid\n## Not a phase`;
    const lenses = computePlanLenses(content);

    expect(lenses).toHaveLength(1);
    expect(lenses[0].title).toBe("Valid");
  });

  it("returns correct line numbers with preamble content", () => {
    const content = `# My Plan\n\nSome intro text.\nMore text.\n\n## Phase 1: Setup\nBody.\n\n## Phase 2: Build\nBody.`;
    const lenses = computePlanLenses(content);

    expect(lenses[0].line).toBe(5);
    expect(lenses[1].line).toBe(8);
  });
});
