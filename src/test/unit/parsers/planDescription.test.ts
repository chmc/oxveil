import { describe, it, expect } from "vitest";
import { parsePlanWithDescriptions } from "../../../parsers/planDescription";

describe("parsePlanWithDescriptions", () => {
  it("returns empty phases for empty content", () => {
    expect(parsePlanWithDescriptions("")).toEqual({ phases: [] });
    expect(parsePlanWithDescriptions("  \n  ")).toEqual({ phases: [] });
  });

  it("extracts description between phase headers", () => {
    const content = `## Phase 1: Setup
Install dependencies and configure the project.

## Phase 2: Build
Compile the source code and run the bundler.
`;
    const result = parsePlanWithDescriptions(content);
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0].description).toBe(
      "Install dependencies and configure the project."
    );
    expect(result.phases[1].description).toBe(
      "Compile the source code and run the bundler."
    );
  });

  it("excludes depends-on line from description", () => {
    const content = `## Phase 1: Setup
Install things.

## Phase 2: Build
**Depends on:** Phase 1
Compile the code.
`;
    const result = parsePlanWithDescriptions(content);
    expect(result.phases[1].description).toBe("Compile the code.");
    expect(result.phases[1].dependencies).toEqual(["1"]);
  });

  it("excludes status annotation from description", () => {
    const content = `## Phase 1: Setup
[status: completed]
Install things and configure.
`;
    const result = parsePlanWithDescriptions(content);
    expect(result.phases[0].description).toBe(
      "Install things and configure."
    );
    expect(result.phases[0].status).toBe("completed");
  });

  it("excludes both status and depends-on from description", () => {
    const content = `## Phase 2: Build
[status: in_progress]
**Depends on:** Phase 1
Compile everything.
`;
    const result = parsePlanWithDescriptions(content);
    expect(result.phases[0].description).toBe("Compile everything.");
    expect(result.phases[0].status).toBe("in_progress");
    expect(result.phases[0].dependencies).toEqual(["1"]);
  });

  it("returns empty description for header-only phase", () => {
    const content = `## Phase 1: Setup

## Phase 2: Build
`;
    const result = parsePlanWithDescriptions(content);
    expect(result.phases[0].description).toBe("");
    expect(result.phases[1].description).toBe("");
  });

  it("preserves multi-line descriptions", () => {
    const content = `## Phase 1: Setup
First line of description.
Second line of description.
Third line of description.
`;
    const result = parsePlanWithDescriptions(content);
    expect(result.phases[0].description).toBe(
      "First line of description.\nSecond line of description.\nThird line of description."
    );
  });

  it("trims leading and trailing blank lines from description", () => {
    const content = `## Phase 1: Setup

Install things.

## Phase 2: Build
`;
    const result = parsePlanWithDescriptions(content);
    expect(result.phases[0].description).toBe("Install things.");
  });

  it("preserves base PlanPhase fields", () => {
    const content = `## Phase 1: Setup
[status: completed]
**Depends on:** Phase 0
Some description.

## Phase 2: Build
Details.
`;
    const result = parsePlanWithDescriptions(content);
    expect(result.phases[0]).toMatchObject({
      number: 1,
      title: "Setup",
      headerLine: 0,
      status: "completed",
      dependencies: ["0"],
    });
    expect(result.phases[0].description).toBe("Some description.");
  });

  it("handles decimal phase numbers", () => {
    const content = `## Phase 1.1: Sub-step A
Details for A.

## Phase 1.2: Sub-step B
Details for B.
`;
    const result = parsePlanWithDescriptions(content);
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0].number).toBe("1.1");
    expect(result.phases[0].description).toBe("Details for A.");
    expect(result.phases[1].number).toBe("1.2");
    expect(result.phases[1].description).toBe("Details for B.");
  });
});
