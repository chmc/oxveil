import { describe, it, expect } from "vitest";
import { parseLessons } from "../../../parsers/lessons";

describe("parseLessons", () => {
  it("parses well-formed lessons.md with multiple phases", () => {
    const content = `## Phase 1: Setup project
- retries: 0
- duration: 45s
- exit: success

## Phase 2: API integration
- retries: 2
- duration: 312s
- exit: error
`;
    const result = parseLessons(content);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      phase: 1,
      title: "Setup project",
      retries: 0,
      duration: 45,
      exit: "success",
    });
    expect(result[1]).toEqual({
      phase: 2,
      title: "API integration",
      retries: 2,
      duration: 312,
      exit: "error",
    });
  });

  it("handles duration with expected time annotation", () => {
    const content = `## Phase 1: Slow task
- retries: 1
- duration: 312s (expected: 180s)
- exit: success
`;
    const result = parseLessons(content);

    expect(result).toHaveLength(1);
    expect(result[0].duration).toBe(312);
  });

  it("handles decimal phase numbers", () => {
    const content = `## Phase 2.5: Hotfix
- retries: 0
- duration: 30s
- exit: success
`;
    const result = parseLessons(content);

    expect(result).toHaveLength(1);
    expect(result[0].phase).toBe("2.5");
    expect(result[0].title).toBe("Hotfix");
  });

  it("returns empty array on empty input", () => {
    const result = parseLessons("");
    expect(result).toEqual([]);
  });

  it("returns empty array on malformed input", () => {
    const result = parseLessons("not a lessons file at all\nrandom text");
    expect(result).toEqual([]);
  });

  it("skips phases with missing required fields", () => {
    const content = `## Phase 1: Valid
- retries: 0
- duration: 45s
- exit: success

## Phase 2: Missing exit
- retries: 1
- duration: 60s

## Phase 3: Also valid
- retries: 0
- duration: 30s
- exit: success
`;
    const result = parseLessons(content);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Valid");
    expect(result[1].title).toBe("Also valid");
  });

  it("rejects invalid exit values", () => {
    const content = `## Phase 1: Invalid exit
- retries: 0
- duration: 45s
- exit: maybe
`;
    const result = parseLessons(content);

    expect(result).toEqual([]);
  });

  it("handles whitespace variations", () => {
    const content = `## Phase 1: With spaces
-  retries:  0
-  duration:  45s
-  exit:  success
`;
    const result = parseLessons(content);

    expect(result).toHaveLength(1);
    expect(result[0].retries).toBe(0);
    expect(result[0].duration).toBe(45);
    expect(result[0].exit).toBe("success");
  });

  it("handles missing duration unit (assumes seconds)", () => {
    const content = `## Phase 1: No unit
- retries: 0
- duration: 45
- exit: success
`;
    const result = parseLessons(content);

    expect(result).toHaveLength(1);
    expect(result[0].duration).toBe(45);
  });

  it("parses fail_reason when present", () => {
    const content = `## Phase 1: Retry phase
- retries: 2
- duration: 312s
- exit: success
- fail_reason: verification_failed
`;
    const result = parseLessons(content);

    expect(result).toHaveLength(1);
    expect(result[0].failReason).toBe("verification_failed");
  });

  it("parses summary when present", () => {
    const content = `## Phase 1: Learning phase
- retries: 0
- duration: 45s
- exit: success
- summary: Learned that caching improves performance by 50%
`;
    const result = parseLessons(content);

    expect(result).toHaveLength(1);
    expect(result[0].summary).toBe("Learned that caching improves performance by 50%");
  });

  it("parses both fail_reason and summary when present", () => {
    const content = `## Phase 1: Complex phase
- retries: 1
- duration: 180s
- exit: success
- fail_reason: trapped_tool_calls
- summary: Had to retry due to tool permission issue. Fixed by adding allowlist.
`;
    const result = parseLessons(content);

    expect(result).toHaveLength(1);
    expect(result[0].failReason).toBe("trapped_tool_calls");
    expect(result[0].summary).toBe("Had to retry due to tool permission issue. Fixed by adding allowlist.");
  });

  it("omits fail_reason and summary when not present (backwards compatibility)", () => {
    const content = `## Phase 1: Legacy phase
- retries: 0
- duration: 45s
- exit: success
`;
    const result = parseLessons(content);

    expect(result).toHaveLength(1);
    expect(result[0].failReason).toBeUndefined();
    expect(result[0].summary).toBeUndefined();
  });
});
