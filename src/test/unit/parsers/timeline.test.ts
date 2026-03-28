import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProgress } from "../../../parsers/progress";
import { computeTimeline } from "../../../parsers/timeline";
import type { ProgressState } from "../../../types";

const fixturesDir = join(__dirname, "../../../../test/fixtures");

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name, "PROGRESS.md"), "utf-8");
}

// Fixed "now" for deterministic tests: 2026-03-25 15:51:30 local time
const NOW = new Date(2026, 2, 25, 15, 51, 30);

describe("computeTimeline", () => {
  describe("with mock-running fixture", () => {
    const progress = parseProgress(readFixture("mock-running"));
    const timeline = computeTimeline(progress, NOW);

    it("produces a bar for each phase", () => {
      expect(timeline.bars).toHaveLength(5);
    });

    it("assigns correct statuses", () => {
      expect(timeline.bars[0].status).toBe("completed");
      expect(timeline.bars[1].status).toBe("completed");
      expect(timeline.bars[2].status).toBe("in_progress");
      expect(timeline.bars[3].status).toBe("failed");
      expect(timeline.bars[4].status).toBe("pending");
    });

    it("computes bar positions relative to earliest start", () => {
      // Phase 1 started at 10:00:00 — earliest, so offset = 0
      expect(timeline.bars[0].startOffsetMs).toBe(0);
      // Phase 2 started at 10:15:00 — 15 min offset
      expect(timeline.bars[1].startOffsetMs).toBe(15 * 60 * 1000);
      // Phase 3 started at 10:45:00 — 45 min offset
      expect(timeline.bars[2].startOffsetMs).toBe(45 * 60 * 1000);
      // Phase 4 started at 11:00:00 — 60 min offset
      expect(timeline.bars[3].startOffsetMs).toBe(60 * 60 * 1000);
    });

    it("computes correct durations for completed phases", () => {
      // Phase 1: 10:00 → 10:15 = 15 min
      expect(timeline.bars[0].durationMs).toBe(15 * 60 * 1000);
      // Phase 2: 10:15 → 10:45 = 30 min
      expect(timeline.bars[1].durationMs).toBe(30 * 60 * 1000);
    });

    it("computes running phase duration as now - started", () => {
      // Phase 3: 10:45 → 15:51:30 = 5h 6m 30s
      const expected =
        (5 * 3600 + 6 * 60 + 30) * 1000;
      expect(timeline.bars[2].durationMs).toBe(expected);
    });

    it("computes failed phase duration using completed timestamp", () => {
      // Phase 4: 11:00 → 11:10 = 10 min
      expect(timeline.bars[3].durationMs).toBe(10 * 60 * 1000);
    });

    it("pending phase has zero duration and sits at maxTimeMs", () => {
      expect(timeline.bars[4].durationMs).toBe(0);
      expect(timeline.bars[4].startOffsetMs).toBe(timeline.maxTimeMs);
    });

    it("formats labels correctly", () => {
      expect(timeline.bars[0].label).toBe("15:00"); // 15 min
      expect(timeline.bars[1].label).toBe("30:00"); // 30 min
      expect(timeline.bars[2].label).toBe("running...");
      expect(timeline.bars[3].label).toBe("10:00"); // 10 min
      expect(timeline.bars[4].label).toBe("pending");
    });

    it("computes nowOffsetMs relative to earliest start", () => {
      // 10:00:00 → 15:51:30 = 5h 51m 30s
      const expected = (5 * 3600 + 51 * 60 + 30) * 1000;
      expect(timeline.nowOffsetMs).toBe(expected);
    });

    it("totalElapsedMs equals nowOffsetMs", () => {
      expect(timeline.totalElapsedMs).toBe(timeline.nowOffsetMs);
    });

    it("maxTimeMs is the rightmost bar edge", () => {
      // The running phase extends furthest: offset 45min + duration ~5h6m30s
      const phase3End =
        45 * 60 * 1000 + (5 * 3600 + 6 * 60 + 30) * 1000;
      expect(timeline.maxTimeMs).toBe(phase3End);
    });
  });

  describe("empty progress state", () => {
    const empty: ProgressState = { phases: [], totalPhases: 0 };
    const timeline = computeTimeline(empty, NOW);

    it("returns empty bars", () => {
      expect(timeline.bars).toHaveLength(0);
    });

    it("returns zero for all timing fields", () => {
      expect(timeline.totalElapsedMs).toBe(0);
      expect(timeline.nowOffsetMs).toBe(0);
      expect(timeline.maxTimeMs).toBe(0);
    });
  });

  describe("all-pending phases", () => {
    const allPending: ProgressState = {
      phases: [
        { number: 1, title: "A", status: "pending" },
        { number: 2, title: "B", status: "pending" },
      ],
      totalPhases: 2,
    };
    const timeline = computeTimeline(allPending, NOW);

    it("produces bars for each phase", () => {
      expect(timeline.bars).toHaveLength(2);
    });

    it("all bars have zero duration", () => {
      for (const bar of timeline.bars) {
        expect(bar.durationMs).toBe(0);
        expect(bar.label).toBe("pending");
      }
    });

    it("maxTimeMs is 0 when nothing has started", () => {
      expect(timeline.maxTimeMs).toBe(0);
    });
  });

  describe("single completed phase", () => {
    const single: ProgressState = {
      phases: [
        {
          number: 1,
          title: "Only",
          status: "completed",
          started: "2026-03-25 10:00:00",
          completed: "2026-03-25 10:05:00",
        },
      ],
      totalPhases: 1,
    };
    const timeline = computeTimeline(single, NOW);

    it("has one bar at offset 0", () => {
      expect(timeline.bars).toHaveLength(1);
      expect(timeline.bars[0].startOffsetMs).toBe(0);
    });

    it("duration is 5 minutes", () => {
      expect(timeline.bars[0].durationMs).toBe(5 * 60 * 1000);
    });

    it("label is formatted as M:SS", () => {
      expect(timeline.bars[0].label).toBe("5:00");
    });
  });

  describe("missing timestamps", () => {
    const noTimestamps: ProgressState = {
      phases: [
        { number: 1, title: "No times", status: "completed" },
      ],
      totalPhases: 1,
    };
    const timeline = computeTimeline(noTimestamps, NOW);

    it("handles missing started/completed gracefully", () => {
      expect(timeline.bars).toHaveLength(1);
      expect(timeline.bars[0].startOffsetMs).toBe(0);
    });
  });
});
