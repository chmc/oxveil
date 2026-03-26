import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProgress } from "../../../parsers/progress";

const fixturesDir = join(__dirname, "../../../../test/fixtures");

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name, "PROGRESS.md"), "utf-8");
}

describe("parseProgress", () => {
  it("parses well-formed PROGRESS.md with multiple phases", () => {
    const content = readFixture("mock-running");
    const result = parseProgress(content);

    expect(result.phases).toHaveLength(5);
    expect(result.totalPhases).toBe(5);
  });

  it("extracts correct status for each phase", () => {
    const content = readFixture("mock-running");
    const result = parseProgress(content);

    expect(result.phases[0].status).toBe("completed");
    expect(result.phases[1].status).toBe("completed");
    expect(result.phases[2].status).toBe("in_progress");
    expect(result.phases[3].status).toBe("failed");
    expect(result.phases[4].status).toBe("pending");
  });

  it("extracts attempt count per phase", () => {
    const content = readFixture("mock-running");
    const result = parseProgress(content);

    expect(result.phases[0].attempts).toBe(1);
    expect(result.phases[1].attempts).toBe(2);
    expect(result.phases[2].attempts).toBe(1);
    expect(result.phases[3].attempts).toBe(3);
    expect(result.phases[4].attempts).toBeUndefined();
  });

  it("handles decimal phase numbers", () => {
    const content = `# Progress for plan.md
Last updated: 2026-03-25 10:00:00

## Status Summary
- Total phases: 2

## Phase Details

### ⏳ Phase 2.5: Hotfix
Status: pending

### ✅ Phase 3: Done
Status: completed
Started: 2026-03-25 10:00:00
Completed: 2026-03-25 10:10:00
`;
    const result = parseProgress(content);

    expect(result.phases[0].number).toBe("2.5");
    expect(result.phases[0].title).toBe("Hotfix");
    expect(result.phases[1].number).toBe(3);
  });

  it("returns empty state on empty input", () => {
    const result = parseProgress("");
    expect(result.phases).toEqual([]);
    expect(result.totalPhases).toBe(0);
    expect(result.currentPhaseIndex).toBeUndefined();
  });

  it("returns empty state on malformed input", () => {
    const result = parseProgress("not a progress file at all\nrandom text");
    expect(result.phases).toEqual([]);
    expect(result.totalPhases).toBe(0);
  });

  it("returns empty state on truncated input", () => {
    const result = parseProgress("# Progress for plan.md\nLast updated:");
    expect(result.phases).toEqual([]);
    expect(result.totalPhases).toBe(0);
  });

  it("rejects unknown status values", () => {
    const content = `# Progress for plan.md
Last updated: 2026-03-25 10:00:00

## Status Summary
- Total phases: 2

## Phase Details

### ⏳ Phase 1: Valid
Status: pending

### 🤷 Phase 2: Invalid
Status: maybe
`;
    const result = parseProgress(content);

    // Valid phase is kept, invalid phase is skipped
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].title).toBe("Valid");
    expect(result.totalPhases).toBe(1);
  });

  it("monotonicity validation — phase count decrease signals partial read", () => {
    // First parse with 5 phases
    const full = readFixture("mock-running");
    const fullResult = parseProgress(full);
    expect(fullResult.totalPhases).toBe(5);

    // Truncated version with fewer phases
    const truncated = `# Progress for plan.md
Last updated: 2026-03-25 10:00:00

## Status Summary
- Total phases: 5

## Phase Details

### ✅ Phase 1: Setup project
Status: completed
Started: 2026-03-25 10:00:00
Completed: 2026-03-25 10:15:00
`;
    const truncResult = parseProgress(truncated);
    // Parser returns what it found, but totalPhases reflects actual parsed count
    expect(truncResult.phases).toHaveLength(1);
    expect(truncResult.totalPhases).toBe(1);
  });

  it("handles emoji-prefixed headers", () => {
    const content = readFixture("mock-running");
    const result = parseProgress(content);

    // Emoji prefixes should be stripped from titles
    expect(result.phases[0].title).toBe("Setup project");
    expect(result.phases[2].title).toBe("API integration");
    expect(result.phases[3].title).toBe("Database migration");
  });

  it("extracts Started/Completed timestamps", () => {
    const content = readFixture("mock-running");
    const result = parseProgress(content);

    expect(result.phases[0].started).toBe("2026-03-25 10:00:00");
    expect(result.phases[0].completed).toBe("2026-03-25 10:15:00");
    expect(result.phases[2].started).toBe("2026-03-25 10:45:00");
    expect(result.phases[2].completed).toBeUndefined();
    expect(result.phases[4].started).toBeUndefined();
  });

  it("sets currentPhaseIndex to first in_progress phase", () => {
    const content = readFixture("mock-running");
    const result = parseProgress(content);

    expect(result.currentPhaseIndex).toBe(2);
  });

  it("sets currentPhaseIndex undefined when no in_progress phase", () => {
    const content = readFixture("mock-done");
    const result = parseProgress(content);

    expect(result.currentPhaseIndex).toBeUndefined();
  });

  describe("dependency parsing", () => {
    it("parses single dependency with emoji status", () => {
      const content = `# Progress for plan.md
Last updated: 2026-03-25 10:00:00

## Phase Details

### ✅ Phase 2: Core module
Status: completed
Depends on: Phase 1 ✅
`;
      const result = parseProgress(content);
      expect(result.phases[0].dependencies).toEqual([
        { phaseNumber: 1, status: "completed" },
      ]);
    });

    it("parses multiple dependencies", () => {
      const content = `# Progress for plan.md
Last updated: 2026-03-25 10:00:00

## Phase Details

### ⏳ Phase 5: Integration tests
Status: pending
Depends on: Phase 3 🔄 Phase 4 ⏳
`;
      const result = parseProgress(content);
      expect(result.phases[0].dependencies).toEqual([
        { phaseNumber: 3, status: "in_progress" },
        { phaseNumber: 4, status: "pending" },
      ]);
    });

    it("maps all emoji statuses correctly", () => {
      const content = `# Progress for plan.md
Last updated: 2026-03-25 10:00:00

## Phase Details

### ⏳ Phase 5: All deps
Status: pending
Depends on: Phase 1 ✅ Phase 2 ⏳ Phase 3 ❌ Phase 4 🔄
`;
      const result = parseProgress(content);
      const deps = result.phases[0].dependencies!;
      expect(deps[0].status).toBe("completed");
      expect(deps[1].status).toBe("pending");
      expect(deps[2].status).toBe("failed");
      expect(deps[3].status).toBe("in_progress");
    });

    it("sets status to unknown when emoji is missing", () => {
      const content = `# Progress for plan.md
Last updated: 2026-03-25 10:00:00

## Phase Details

### ⏳ Phase 2: Build
Status: pending
Depends on: Phase 1
`;
      const result = parseProgress(content);
      expect(result.phases[0].dependencies).toEqual([
        { phaseNumber: 1, status: "unknown" },
      ]);
    });

    it("leaves dependencies undefined when no Depends on line", () => {
      const content = `# Progress for plan.md
Last updated: 2026-03-25 10:00:00

## Phase Details

### ✅ Phase 1: Setup
Status: completed
`;
      const result = parseProgress(content);
      expect(result.phases[0].dependencies).toBeUndefined();
    });

    it("ignores malformed Depends on line with no phase references", () => {
      const content = `# Progress for plan.md
Last updated: 2026-03-25 10:00:00

## Phase Details

### ⏳ Phase 2: Build
Status: pending
Depends on: nothing useful here
`;
      const result = parseProgress(content);
      expect(result.phases[0].dependencies).toBeUndefined();
    });

    it("handles decimal phase numbers in dependencies", () => {
      const content = `# Progress for plan.md
Last updated: 2026-03-25 10:00:00

## Phase Details

### ⏳ Phase 3: Build
Status: pending
Depends on: Phase 2.5 ✅
`;
      const result = parseProgress(content);
      expect(result.phases[0].dependencies).toEqual([
        { phaseNumber: "2.5", status: "completed" },
      ]);
    });

    it("parses dependencies from mock-deps fixture", () => {
      const content = readFixture("mock-deps");
      const result = parseProgress(content);

      // Phase 1: no deps
      expect(result.phases[0].dependencies).toBeUndefined();
      // Phase 2: depends on Phase 1
      expect(result.phases[1].dependencies).toEqual([
        { phaseNumber: 1, status: "completed" },
      ]);
      // Phase 5: depends on Phase 3 and Phase 4
      expect(result.phases[4].dependencies).toEqual([
        { phaseNumber: 3, status: "in_progress" },
        { phaseNumber: 4, status: "pending" },
      ]);
    });

    it("parses dependencies from mock-running fixture", () => {
      const content = readFixture("mock-running");
      const result = parseProgress(content);

      // Phase 2: depends on Phase 1
      expect(result.phases[1].dependencies).toEqual([
        { phaseNumber: 1, status: "completed" },
      ]);
      // Phase 5: depends on Phase 3 and Phase 4
      expect(result.phases[4].dependencies).toEqual([
        { phaseNumber: 3, status: "pending" },
        { phaseNumber: 4, status: "failed" },
      ]);
    });
  });

  it("parses all-completed fixture correctly", () => {
    const content = readFixture("mock-done");
    const result = parseProgress(content);

    expect(result.phases).toHaveLength(3);
    expect(result.phases.every((p) => p.status === "completed")).toBe(true);
    expect(result.totalPhases).toBe(3);
  });

  it("parses failed fixture correctly", () => {
    const content = readFixture("mock-failed");
    const result = parseProgress(content);

    expect(result.phases).toHaveLength(3);
    expect(result.phases[0].status).toBe("completed");
    expect(result.phases[1].status).toBe("failed");
    expect(result.phases[2].status).toBe("pending");
  });
});
