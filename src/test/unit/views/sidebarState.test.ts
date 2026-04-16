import { describe, it, expect } from "vitest";
import { deriveViewState, mapPhases, formatDuration, formatRelativeDate, readErrorSnippet } from "../../../views/sidebarState";
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
const hasInProgress: ProgressState = {
  phases: [
    { number: 1, title: "A", status: "in_progress" },
    { number: 2, title: "B", status: "pending" },
    { number: 3, title: "C", status: "pending" },
  ],
  totalPhases: 3,
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
  it("returns stale when idle with plan but no progress and no user choice", () => {
    expect(deriveViewState("detected", "idle", true, noProgress)).toBe("stale");
  });
  it("returns ready when idle with plan, no progress, and user chose resume", () => {
    expect(deriveViewState("detected", "idle", true, noProgress, "resume")).toBe("ready");
  });
  it("returns empty when idle with plan, no progress, and user chose dismiss", () => {
    expect(deriveViewState("detected", "idle", true, noProgress, "dismiss")).toBe("empty");
  });
  it("returns ready when idle with plan but no progress and explicit none choice", () => {
    expect(deriveViewState("detected", "idle", true, noProgress, "none")).toBe("stale");
  });
  it("returns stopped on idle with orphaned in_progress phase", () => {
    expect(deriveViewState("detected", "idle", false, hasInProgress)).toBe("stopped");
  });
  it("returns completed on idle with all phases completed (orphan recovery)", () => {
    expect(deriveViewState("detected", "idle", true, allDone)).toBe("completed");
  });
  it("returns completed when resume chosen but all phases already completed", () => {
    expect(deriveViewState("detected", "idle", true, allDone, "resume")).toBe("completed");
  });
  it("returns running when lock reacquired despite failed progress", () => {
    expect(deriveViewState("detected", "running", true, hasFailed)).toBe("running");
  });
  it("returns stopped on idle with completed + in_progress phases", () => {
    const completedAndInProgress: ProgressState = {
      phases: [
        { number: 1, title: "A", status: "completed" },
        { number: 2, title: "B", status: "in_progress" },
        { number: 3, title: "C", status: "pending" },
      ],
      totalPhases: 3,
    };
    expect(deriveViewState("detected", "idle", true, completedAndInProgress)).toBe("stopped");
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

describe("formatRelativeDate", () => {
  const now = new Date("2026-04-07T14:30:00Z");

  it("returns 'Just now' for < 1 minute ago", () => {
    expect(formatRelativeDate("2026-04-07T14:29:30Z", now)).toBe("Just now");
  });

  it("returns minutes ago for < 1 hour", () => {
    expect(formatRelativeDate("2026-04-07T14:05:00Z", now)).toBe("25m ago");
  });

  it("returns 'Today' for same calendar day beyond 1 hour", () => {
    expect(formatRelativeDate("2026-04-07T10:00:00Z", now)).toBe("Today");
  });

  it("returns 'Yesterday' for previous calendar day", () => {
    expect(formatRelativeDate("2026-04-06T20:00:00Z", now)).toBe("Yesterday");
  });

  it("returns month and day for older dates", () => {
    expect(formatRelativeDate("2026-03-28T12:00:00Z", now)).toBe("Mar 28");
  });

  it("returns the raw string for invalid dates", () => {
    expect(formatRelativeDate("not-a-date", now)).toBe("not-a-date");
  });
});

describe("readErrorSnippet", () => {
  it("returns last non-empty line from log file", async () => {
    const readFile = async () => "line1\nline2\nerror: something broke\n\n";
    const snippet = await readErrorSnippet("/workspace", 2, readFile);
    expect(snippet).toBe("error: something broke");
  });

  it("returns undefined when file does not exist", async () => {
    const readFile = async () => { throw new Error("ENOENT"); };
    const snippet = await readErrorSnippet("/workspace", 1, readFile);
    expect(snippet).toBeUndefined();
  });

  it("truncates to 200 characters", async () => {
    const longLine = "x".repeat(300);
    const readFile = async () => longLine;
    const snippet = await readErrorSnippet("/workspace", 1, readFile);
    expect(snippet).toHaveLength(200);
  });
});
