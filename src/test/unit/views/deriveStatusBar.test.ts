import { describe, it, expect } from "vitest";
import { deriveStatusBarFromView } from "../../../views/deriveStatusBar";
import type { ProgressState } from "../../../types";

function makeProgress(phases: Array<{ number: number; title: string; status: string }>): ProgressState {
  return {
    phases: phases.map((p) => ({ ...p, status: p.status as any })),
    totalPhases: phases.length,
  };
}

describe("deriveStatusBarFromView", () => {
  it("maps not-found to not-found", () => {
    const result = deriveStatusBarFromView("not-found", undefined);
    expect(result).toEqual({ kind: "not-found" });
  });

  it("maps empty to idle", () => {
    const result = deriveStatusBarFromView("empty", undefined);
    expect(result).toEqual({ kind: "idle" });
  });

  it("maps ready to ready", () => {
    const result = deriveStatusBarFromView("ready", undefined);
    expect(result).toEqual({ kind: "ready" });
  });

  it("maps stale to idle", () => {
    const result = deriveStatusBarFromView("stale", undefined);
    expect(result).toEqual({ kind: "idle" });
  });

  it("maps stopped to stopped", () => {
    const progress = makeProgress([
      { number: 1, title: "Setup", status: "completed" },
      { number: 2, title: "Build", status: "in_progress" },
    ]);
    const result = deriveStatusBarFromView("stopped", progress);
    expect(result).toEqual({ kind: "stopped" });
  });

  it("maps failed to failed with failedPhase from progress", () => {
    const progress = makeProgress([
      { number: 1, title: "Setup", status: "completed" },
      { number: 2, title: "Build", status: "failed" },
    ]);
    const result = deriveStatusBarFromView("failed", progress);
    expect(result).toEqual({ kind: "failed", failedPhase: 2 });
  });

  it("maps failed with no progress to failedPhase 0", () => {
    const result = deriveStatusBarFromView("failed", undefined);
    expect(result).toEqual({ kind: "failed", failedPhase: 0 });
  });

  it("maps completed to done with placeholder elapsed", () => {
    const progress = makeProgress([
      { number: 1, title: "Setup", status: "completed" },
    ]);
    const result = deriveStatusBarFromView("completed", progress);
    expect(result).toEqual({ kind: "done", elapsed: "—" });
  });

  it("passes folderName through for stopped", () => {
    const progress = makeProgress([
      { number: 1, title: "Setup", status: "in_progress" },
    ]);
    const result = deriveStatusBarFromView("stopped", progress, "my-api");
    expect(result).toEqual({ kind: "stopped", folderName: "my-api" });
  });

  it("passes folderName and otherRootsSummary through for failed", () => {
    const progress = makeProgress([
      { number: 1, title: "Setup", status: "failed" },
    ]);
    const result = deriveStatusBarFromView("failed", progress, "my-api", "+1 idle");
    expect(result).toEqual({ kind: "failed", failedPhase: 1, folderName: "my-api", otherRootsSummary: "+1 idle" });
  });

  it("passes folderName through for done", () => {
    const progress = makeProgress([
      { number: 1, title: "Setup", status: "completed" },
    ]);
    const result = deriveStatusBarFromView("completed", progress, "my-api", "+1 idle");
    expect(result).toEqual({ kind: "done", elapsed: "—", folderName: "my-api", otherRootsSummary: "+1 idle" });
  });

  it("returns idle for running (fallback — not expected in normal use)", () => {
    const result = deriveStatusBarFromView("running", undefined);
    expect(result).toEqual({ kind: "idle" });
  });
});
