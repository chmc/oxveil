import { describe, it, expect } from "vitest";
import { VersionedSnapshot, StaleStateError } from "../../../core/state/VersionedSnapshot";
import { createGuardedHandler } from "../../../core/state/GuardedHandler";

describe("VersionedSnapshot", () => {
  it("read returns initial value at seq 0", () => {
    const s = new VersionedSnapshot("init");
    expect(s.read()).toEqual({ value: "init", seq: 0 });
  });

  it("update increments seq and applies fn", () => {
    const s = new VersionedSnapshot(0);
    s.update((v) => v + 1);
    expect(s.read()).toEqual({ value: 1, seq: 1 });
  });

  it("assertFresh passes when seq matches", () => {
    const s = new VersionedSnapshot(0);
    const { seq } = s.read();
    expect(() => s.assertFresh(seq)).not.toThrow();
  });

  it("assertFresh throws StaleStateError when seq mismatches", () => {
    const s = new VersionedSnapshot(0);
    const { seq } = s.read();
    s.update((v) => v + 1);
    expect(() => s.assertFresh(seq)).toThrow(StaleStateError);
  });

  it("StaleStateError message includes expected and actual seq", () => {
    const s = new VersionedSnapshot(0);
    s.update((v) => v + 1);
    expect(() => s.assertFresh(0)).toThrowError(/expected seq 0.*got 1/i);
  });
});

describe("createGuardedHandler", () => {
  it("returns result when seq is still current", async () => {
    let seq = 0;
    const handler = createGuardedHandler(
      () => seq,
      () => ++seq,
      async (s) => `result-${s}`,
    );
    const result = await handler();
    expect(result).toBe("result-1");
  });

  it("returns undefined when seq becomes stale during await", async () => {
    let seq = 0;
    const handler = createGuardedHandler(
      () => seq,
      () => ++seq,
      async (_s) => {
        seq++; // simulate external mutation during await
        return "result";
      },
    );
    const result = await handler();
    expect(result).toBeUndefined();
  });
});
