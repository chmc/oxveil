import { describe, it, expect } from "vitest";
import { validatePlan } from "../../../parsers/planValidator";
import { parsePlan } from "../../../parsers/plan";

describe("validatePlan", () => {
  it("passes for an empty plan", () => {
    const result = validatePlan(parsePlan(""));
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("passes for a valid sequential plan", () => {
    const content = `## Phase 1: Setup
Details.

## Phase 2: Build
Details.

## Phase 3: Deploy
Details.
`;
    const result = validatePlan(parsePlan(content));
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("fails for a gap in numbering", () => {
    const content = `## Phase 1: Setup
Details.

## Phase 3: Deploy
Details.
`;
    const result = validatePlan(parsePlan(content));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/gap|sequential|missing|expected/i);
  });

  it("fails for duplicate phase numbers", () => {
    const content = `## Phase 1: Setup
Details.

## Phase 1: Also Setup
Details.
`;
    const result = validatePlan(parsePlan(content));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/duplicate/i);
  });

  it("fails for dependency referencing non-existent phase", () => {
    const content = `## Phase 1: Setup
Details.

## Phase 2: Build
**Depends on:** Phase 5
Details.
`;
    const result = validatePlan(parsePlan(content));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/5/);
  });

  it("passes for valid dependencies", () => {
    const content = `## Phase 1: Setup
Details.

## Phase 2: Build
**Depends on:** Phase 1
Details.

## Phase 3: Deploy
**Depends on:** Phase 1, Phase 2
Details.
`;
    const result = validatePlan(parsePlan(content));
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("allows decimal phase numbers without sequential check", () => {
    const content = `## Phase 1.1: Sub A
Details.

## Phase 1.2: Sub B
Details.
`;
    const result = validatePlan(parsePlan(content));
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("fails for dependency on non-existent decimal phase", () => {
    const content = `## Phase 1: Setup
Details.

## Phase 2: Build
**Depends on:** Phase 1.5
Details.
`;
    const result = validatePlan(parsePlan(content));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/1\.5/);
  });

  it("reports multiple errors", () => {
    const content = `## Phase 1: Setup
Details.

## Phase 1: Duplicate
Details.

## Phase 3: Skipped
**Depends on:** Phase 99
Details.
`;
    const result = validatePlan(parsePlan(content));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
