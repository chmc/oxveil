import { describe, it, expect } from "vitest";
import { parsePlan } from "../../../parsers/plan";

describe("parsePlan", () => {
  it("returns empty phases for empty content", () => {
    expect(parsePlan("")).toEqual({ phases: [] });
    expect(parsePlan("  \n  ")).toEqual({ phases: [] });
  });

  it("returns empty phases when no phase headers exist", () => {
    const content = `# My Plan

Some description text.

## Goals
- Build something
`;
    const result = parsePlan(content);
    expect(result.phases).toHaveLength(0);
  });

  it("parses ## phase headers", () => {
    const content = `# Plan

## Phase 1: Setup
Do setup things.

## Phase 2: Build
Do build things.
`;
    const result = parsePlan(content);
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0]).toMatchObject({
      number: 1,
      title: "Setup",
      headerLine: 2,
    });
    expect(result.phases[1]).toMatchObject({
      number: 2,
      title: "Build",
      headerLine: 5,
    });
  });

  it("parses ### phase headers", () => {
    const content = `# Plan

### Phase 1: Setup
Do setup things.

### Phase 2: Build
Do build things.
`;
    const result = parsePlan(content);
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0].number).toBe(1);
    expect(result.phases[1].number).toBe(2);
  });

  it("parses mixed ## and ### headers", () => {
    const content = `## Phase 1: First
Body.

### Phase 2: Second
Body.

## Phase 3: Third
Body.
`;
    const result = parsePlan(content);
    expect(result.phases).toHaveLength(3);
    expect(result.phases[0].title).toBe("First");
    expect(result.phases[1].title).toBe("Second");
    expect(result.phases[2].title).toBe("Third");
  });

  it("parses decimal phase numbers", () => {
    const content = `## Phase 1.1: Sub-step A
Details.

## Phase 1.2: Sub-step B
Details.

## Phase 2: Main step
Details.
`;
    const result = parsePlan(content);
    expect(result.phases).toHaveLength(3);
    expect(result.phases[0].number).toBe("1.1");
    expect(result.phases[1].number).toBe("1.2");
    expect(result.phases[2].number).toBe(2);
  });

  it("extracts status markers", () => {
    const content = `## Phase 1: Setup
[status: completed]
Done.

## Phase 2: Build
[status: in_progress]
Working.

## Phase 3: Deploy
No status here.
`;
    const result = parsePlan(content);
    expect(result.phases[0].status).toBe("completed");
    expect(result.phases[1].status).toBe("in_progress");
    expect(result.phases[2].status).toBeUndefined();
  });

  it("extracts dependencies", () => {
    const content = `## Phase 1: Setup
No deps.

## Phase 2: Build
**Depends on:** Phase 1

## Phase 3: Deploy
**Depends on:** Phase 1, Phase 2
`;
    const result = parsePlan(content);
    expect(result.phases[0].dependencies).toBeUndefined();
    expect(result.phases[1].dependencies).toEqual(["1"]);
    expect(result.phases[2].dependencies).toEqual(["1", "2"]);
  });

  it("extracts dependencies with decimal phases", () => {
    const content = `## Phase 2: Build
**Depends on:** Phase 1.1, Phase 1.2
`;
    const result = parsePlan(content);
    expect(result.phases[0].dependencies).toEqual(["1.1", "1.2"]);
  });

  it("computes correct body ranges (0-indexed)", () => {
    const content = `## Phase 1: Setup
Line 1 body.
Line 2 body.

## Phase 2: Build
Line 1 body.
`;
    const result = parsePlan(content);
    // Phase 1: header at line 0, body ends at line 3 (line before Phase 2 header)
    expect(result.phases[0].headerLine).toBe(0);
    expect(result.phases[0].bodyEndLine).toBe(3);
    // Phase 2: header at line 4, body ends at last line (trailing newline creates empty line 6)
    expect(result.phases[1].headerLine).toBe(4);
    expect(result.phases[1].bodyEndLine).toBe(6);
  });

  it("ignores malformed headers", () => {
    const content = `## Phase: Missing number
## Phase 1 Missing colon
## Phase 1: Valid header
Body.
## Not a phase header
## PhaseX 2: Wrong format
`;
    const result = parsePlan(content);
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].title).toBe("Valid header");
  });

  it("handles headers with emoji prefixes", () => {
    const content = `## 🚀 Phase 1: Launch
Details.

### ✅ Phase 2: Verify
Details.
`;
    const result = parsePlan(content);
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0].title).toBe("Launch");
    expect(result.phases[1].title).toBe("Verify");
  });
});
