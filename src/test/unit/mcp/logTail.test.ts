import { describe, it, expect, beforeEach } from "vitest";
import { getLogTail, _resetForTesting } from "../../../mcp/logTail";

beforeEach(() => {
  _resetForTesting();
});

describe("logTail ring buffer", () => {
  it("captures console.log lines", () => {
    console.log("[Oxveil] formPlan adapter: proceeding workspaceRoot=/tmp");
    const entries = getLogTail({});
    expect(entries.some((e) => e.line.includes("formPlan adapter: proceeding"))).toBe(true);
  });

  it("prefixes console.warn with [WARN]", () => {
    console.warn("something went wrong");
    const entries = getLogTail({});
    expect(entries.some((e) => e.line.startsWith("[WARN]"))).toBe(true);
  });

  it("prefixes console.error with [ERROR]", () => {
    console.error("fatal");
    const entries = getLogTail({});
    expect(entries.some((e) => e.line.startsWith("[ERROR]"))).toBe(true);
  });

  it("evicts oldest entries when MAX_LINES exceeded", () => {
    for (let i = 0; i < 510; i++) console.log(`line-${i}`);
    const entries = getLogTail({});
    expect(entries.length).toBeLessThanOrEqual(500);
    expect(entries.some((e) => e.line.includes("line-0"))).toBe(false);
    expect(entries.some((e) => e.line.includes("line-509"))).toBe(true);
  });

  it("filters by grep (case-insensitive)", () => {
    console.log("[Oxveil] formPlan adapter: proceeding");
    console.log("[Oxveil] something unrelated");
    const entries = getLogTail({ grep: "FORMPLAN" });
    expect(entries).toHaveLength(1);
    expect(entries[0].line).toContain("formPlan");
  });

  it("filters by since timestamp", async () => {
    console.log("before");
    const mid = Date.now();
    await new Promise((r) => setTimeout(r, 2));
    console.log("after");
    const entries = getLogTail({ since: mid + 1 });
    expect(entries.every((e) => e.t > mid)).toBe(true);
    expect(entries.some((e) => e.line === "before")).toBe(false);
    expect(entries.some((e) => e.line === "after")).toBe(true);
  });

  it("returns all entries when no filters applied", () => {
    console.log("a");
    console.log("b");
    const entries = getLogTail({});
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });
});
