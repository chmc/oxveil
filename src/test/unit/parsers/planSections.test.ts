import { describe, it, expect } from "vitest";
import { parseSections } from "../../../parsers/planSections";

describe("parseSections", () => {
  it("returns empty result for empty content", () => {
    expect(parseSections("")).toEqual({ phases: [], format: "none" });
    expect(parseSections("  \n  ")).toEqual({ phases: [], format: "none" });
  });

  it("returns empty result when no recognized sections exist", () => {
    const content = `# My Plan

Some description text.

## Goals
- Build something
`;
    const result = parseSections(content);
    expect(result).toEqual({ phases: [], format: "none" });
  });

  it("parses ### Step N: Title with keyword format", () => {
    const content = `### Step 1: Run tests
Do the tests.

### Step 2: Deploy
Ship it.
`;
    const result = parseSections(content);
    expect(result.format).toBe("keyword");
    expect(result.keyword).toBe("Step");
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0]).toMatchObject({
      number: 1,
      title: "Run tests",
    });
    expect(result.phases[1]).toMatchObject({
      number: 2,
      title: "Deploy",
    });
  });

  it("parses ### Task N: Title with keyword format", () => {
    const content = `### Task 1: Component Name
Build it.

### Task 2: Another Component
Build that.
`;
    const result = parseSections(content);
    expect(result.format).toBe("keyword");
    expect(result.keyword).toBe("Task");
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0].title).toBe("Component Name");
    expect(result.phases[1].title).toBe("Another Component");
  });

  it("parses ### N. Title with numbered format", () => {
    const content = `### 1. Extend jq extraction
Details here.

### 2. Add validation
More details.
`;
    const result = parseSections(content);
    expect(result.format).toBe("numbered");
    expect(result.keyword).toBeUndefined();
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0]).toMatchObject({
      number: 1,
      title: "Extend jq extraction",
    });
    expect(result.phases[1]).toMatchObject({
      number: 2,
      title: "Add validation",
    });
  });

  it("parses ## Fix N: Title with keyword format", () => {
    const content = `## Fix 1: Broken imports
Fix the imports.

## Fix 2: Missing types
Add missing types.
`;
    const result = parseSections(content);
    expect(result.format).toBe("keyword");
    expect(result.keyword).toBe("Fix");
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0].title).toBe("Broken imports");
  });

  it("ignores non-numbered headings like ## Context", () => {
    const content = `## Context
This is background info.

### Step 1: First thing
Do the first thing.

### Step 2: Second thing
Do the second thing.
`;
    const result = parseSections(content);
    expect(result.format).toBe("keyword");
    expect(result.keyword).toBe("Step");
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0]).toMatchObject({
      number: 1,
      title: "First thing",
    });
    expect(result.phases[1]).toMatchObject({
      number: 2,
      title: "Second thing",
    });
  });

  it("extracts description body between headers", () => {
    const content = `### Step 1: Setup
Install dependencies.
Configure the project.

### Step 2: Build
Run the build command.
`;
    const result = parseSections(content);
    expect(result.phases[0].description).toBe(
      "Install dependencies.\nConfigure the project."
    );
    expect(result.phases[1].description).toBe("Run the build command.");
  });

  it("trims leading and trailing blank lines from description", () => {
    const content = `### Step 1: Setup

Install dependencies.

`;
    const result = parseSections(content);
    expect(result.phases[0].description).toBe("Install dependencies.");
  });

  it("skips status and depends lines in description", () => {
    const content = `### Step 1: Setup
[status: completed]
**Depends on:** Step 0
Actual description here.
`;
    const result = parseSections(content);
    expect(result.phases[0].description).toBe("Actual description here.");
  });

  it("handles multiple sections with body text", () => {
    const content = `# Implementation Plan

## Context
Background information here.

### Step 1: Parse input
Read the file.
Validate the schema.

### Step 2: Transform
Apply transformations.

### Step 3: Output
Write results.
Log summary.
`;
    const result = parseSections(content);
    expect(result.phases).toHaveLength(3);
    expect(result.phases[0].description).toBe(
      "Read the file.\nValidate the schema."
    );
    expect(result.phases[1].description).toBe("Apply transformations.");
    expect(result.phases[2].description).toBe("Write results.\nLog summary.");
  });

  it("computes correct headerLine and bodyEndLine", () => {
    const content = `### 1. First
Body line.

### 2. Second
Body line.
`;
    const result = parseSections(content);
    expect(result.phases[0].headerLine).toBe(0);
    expect(result.phases[0].bodyEndLine).toBe(2);
    expect(result.phases[1].headerLine).toBe(3);
  });
});
