import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Validates that the documented state enumerations in docs/workflow/states.md
 * match the TypeScript type definitions in the source code.
 *
 * This test catches additions or removals of states that aren't reflected
 * in the workflow spec.
 */

const SPEC_PATH = path.resolve(__dirname, "../../../../docs/workflow/states.md");

function getAppendixSection(spec: string): string {
  const idx = spec.indexOf("## Appendix: Type Definitions");
  return idx >= 0 ? spec.slice(idx) : spec;
}

function extractDocumentedStates(
  spec: string,
  typeName: string,
): string[] {
  const appendix = getAppendixSection(spec);
  // Match the type definition block in the Appendix section
  const pattern = new RegExp(
    `type ${typeName}[\\s\\S]*?;`,
    "m",
  );
  const match = appendix.match(pattern);
  if (!match) return [];

  // Extract quoted string values
  const values: string[] = [];
  const valuePattern = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = valuePattern.exec(match[0])) !== null) {
    values.push(m[1]);
  }
  return values.sort();
}

function extractDocumentedStatusBarKinds(spec: string): string[] {
  const appendix = getAppendixSection(spec);
  // StatusBarState uses { kind: "..." } discriminated union — match until code block end
  const pattern = /type StatusBarState[\s\S]*?```/m;
  const match = appendix.match(pattern);
  if (!match) return [];

  const kinds: string[] = [];
  const kindPattern = /kind:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = kindPattern.exec(match[0])) !== null) {
    kinds.push(m[1]);
  }
  return kinds.sort();
}

// Source-of-truth values extracted from TypeScript types
// These arrays must match src/types.ts and src/views/sidebarState.ts exactly
const SOURCE_SESSION_STATUS = ["idle", "running", "done", "failed"].sort();
const SOURCE_DETECTION_STATUS = [
  "detected",
  "not-found",
  "version-incompatible",
].sort();
const SOURCE_PHASE_STATUS = [
  "pending",
  "completed",
  "in_progress",
  "failed",
].sort();
const SOURCE_SIDEBAR_VIEW = [
  "not-found",
  "empty",
  "planning",
  "ready",
  "stale",
  "running",
  "stopped",
  "failed",
  "completed",
  "self-improvement",
].sort();
const SOURCE_STATUSBAR_KINDS = [
  "not-found",
  "installing",
  "ready",
  "idle",
  "stopped",
  "running",
  "failed",
  "done",
].sort();
const SOURCE_PLAN_USER_CHOICE = ["none", "resume", "dismiss", "planning"].sort();
// Plan preview states are inline strings in planPreviewPanel.ts _sendUpdate(),
// not a named TypeScript export. Must match the Appendix comment block.
const SOURCE_PLAN_PREVIEW_STATES = [
  "active",
  "empty",
  "session-ended",
  "raw-markdown",
].sort();

describe("docs/workflow/states.md sync", () => {
  const spec = fs.readFileSync(SPEC_PATH, "utf-8");

  it("documents all SessionStatus values", () => {
    const documented = extractDocumentedStates(spec, "SessionStatus");
    expect(documented).toEqual(SOURCE_SESSION_STATUS);
  });

  it("documents all DetectionStatus values", () => {
    const documented = extractDocumentedStates(spec, "DetectionStatus");
    expect(documented).toEqual(SOURCE_DETECTION_STATUS);
  });

  it("documents all PhaseStatus values", () => {
    const documented = extractDocumentedStates(spec, "PhaseStatus");
    expect(documented).toEqual(SOURCE_PHASE_STATUS);
  });

  it("documents all SidebarView values", () => {
    const documented = extractDocumentedStates(spec, "SidebarView");
    expect(documented).toEqual(SOURCE_SIDEBAR_VIEW);
  });

  it("documents all StatusBarState kinds", () => {
    const documented = extractDocumentedStatusBarKinds(spec);
    expect(documented).toEqual(SOURCE_STATUSBAR_KINDS);
  });

  it("documents all PlanUserChoice values", () => {
    const documented = extractDocumentedStates(spec, "PlanUserChoice");
    expect(documented).toEqual(SOURCE_PLAN_USER_CHOICE);
  });

  it("documents all PlanPreviewState values", () => {
    const documented = extractDocumentedStates(spec, "PlanPreviewState");
    expect(documented).toEqual(SOURCE_PLAN_PREVIEW_STATES);
  });
});
