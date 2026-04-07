import { describe, it, expect } from "vitest";
import { deriveViewState, mapPhases, formatDuration } from "../../../views/sidebarState";
import type { ProgressState } from "../../../types";

const noProgress: ProgressState | undefined = undefined;
const allPending: ProgressState = {
  phases: [
    { number: 1, title: "A", status: "pending" },
    { number: 2, title: "B", status: "pending" },
  ],
  totalPhases: 2,
};
const partial: ProgressState = {
  phases: [
    { number: 1, title: "A", status: "completed" },
    { number: 2, title: "B", status: "pending" },
  ],
  totalPhases: 2,
};
const allDone: ProgressState = {
  phases: [
    { number: 1, title: "A", status: "completed" },
    { number: 2, title: "B", status: "completed" },
  ],
  totalPhases: 2,
};
const hasFailed: ProgressState = {
  phases: [
    { number: 1, title: "A", status: "completed" },
    { number: 2, title: "B", status: "failed" },
  ],
  totalPhases: 2,
};

describe("deriveViewState", () => {
  it("returns not-found when not detected", () => {
    expect(deriveViewState("not-found", "idle", false, noProgress)).toBe("not-found");
  });
  it("returns not-found for version-incompatible", () => {
    expect(deriveViewState("version-incompatible", "idle", false, noProgress)).toBe("not-found");
  });
  it("returns empty when detected, idle, no plan, no progress", () => {
    expect(deriveViewState("detected", "idle", false, noProgress)).toBe("empty");
  });
  it("returns ready when plan detected and idle", () => {
    expect(deriveViewState("detected", "idle", true, allPending)).toBe("ready");
  });
  it("returns running when status is running", () => {
    expect(deriveViewState("detected", "running", true, partial)).toBe("running");
  });
  it("returns completed when done and all phases complete", () => {
    expect(deriveViewState("detected", "done", true, allDone)).toBe("completed");
  });
  it("returns stopped when done but phases incomplete without failure", () => {
    expect(deriveViewState("detected", "done", true, partial)).toBe("stopped");
  });
  it("returns failed when status is failed", () => {
    expect(deriveViewState("detected", "failed", true, hasFailed)).toBe("failed");
  });
  it("returns stopped on idle with orphaned partial progress", () => {
    expect(deriveViewState("detected", "idle", true, partial)).toBe("stopped");
  });
  it("returns failed on idle with orphaned failed progress", () => {
    expect(deriveViewState("detected", "idle", true, hasFailed)).toBe("failed");
  });
  it("returns ready when idle with plan but no progress", () => {
    expect(deriveViewState("detected", "idle", true, noProgress)).toBe("ready");
  });
});

describe("formatDuration", () => {
  it("formats seconds", () => expect(formatDuration(32000)).toBe("32s"));
  it("formats minutes", () => expect(formatDuration(120000)).toBe("2m"));
  it("formats minutes and seconds", () => expect(formatDuration(128000)).toBe("2m 8s"));
});

describe("mapPhases", () => {
  it("maps PhaseState to PhaseView", () => {
    const result = mapPhases([
      { number: 1, title: "Setup", status: "completed", started: "2026-01-01T00:00:00Z", completed: "2026-01-01T00:00:32Z" },
      { number: 2, title: "Build", status: "pending" },
    ]);
    expect(result).toEqual([
      { number: 1, title: "Setup", status: "completed", duration: "32s", attempts: undefined },
      { number: 2, title: "Build", status: "pending", duration: undefined, attempts: undefined },
    ]);
  });
});
