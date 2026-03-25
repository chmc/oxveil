import { describe, it, expect } from "vitest";
import { parseLock, type LockState } from "../../../core/lock";

describe("parseLock", () => {
  it("parses valid PID from plain text lock content", () => {
    const result = parseLock("12345");

    expect(result.locked).toBe(true);
    expect(result.pid).toBe(12345);
  });

  it("returns unlocked for empty content", () => {
    const result = parseLock("");

    expect(result.locked).toBe(false);
    expect(result.pid).toBeUndefined();
  });

  it("returns unlocked for non-numeric content", () => {
    const result = parseLock("not-a-pid");

    expect(result.locked).toBe(false);
    expect(result.pid).toBeUndefined();
  });

  it("returns unlocked for missing content (undefined)", () => {
    const result = parseLock(undefined);

    expect(result.locked).toBe(false);
    expect(result.pid).toBeUndefined();
  });

  it("handles leading/trailing whitespace in PID", () => {
    const result = parseLock("  42  \n");

    expect(result.locked).toBe(true);
    expect(result.pid).toBe(42);
  });

  it("returns unlocked for zero PID", () => {
    const result = parseLock("0");

    expect(result.locked).toBe(false);
    expect(result.pid).toBeUndefined();
  });

  it("returns unlocked for negative PID", () => {
    const result = parseLock("-1");

    expect(result.locked).toBe(false);
    expect(result.pid).toBeUndefined();
  });
});
