import { describe, it, expect } from "vitest";
import { renderTimelineHtml } from "../../../views/timelineHtml";
import type { TimelineData } from "../../../types";

function makeData(overrides?: Partial<TimelineData>): TimelineData {
  return {
    bars: [
      {
        phase: 1,
        title: "Parse requirements",
        status: "completed",
        startOffsetMs: 0,
        durationMs: 45_000,
        label: "0:45",
      },
      {
        phase: 2,
        title: "Generate plan",
        status: "in_progress",
        startOffsetMs: 45_000,
        durationMs: 120_000,
        label: "running...",
      },
      {
        phase: 3,
        title: "Implement auth",
        status: "failed",
        startOffsetMs: 30_000,
        durationMs: 90_000,
        label: "1:30",
      },
      {
        phase: 4,
        title: "Write tests",
        status: "pending",
        startOffsetMs: 165_000,
        durationMs: 0,
        label: "pending",
      },
    ],
    totalElapsedMs: 165_000,
    nowOffsetMs: 165_000,
    maxTimeMs: 165_000,
    ...overrides,
  };
}

describe("renderTimelineHtml", () => {
  const nonce = "test-nonce-123";
  const cspSource = "https://test.vscode-resource.test";

  it("returns valid HTML with CSP meta tag", () => {
    const html = renderTimelineHtml(makeData(), nonce, cspSource);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain(`nonce-${nonce}`);
    expect(html).toContain(cspSource);
  });

  it("contains status CSS classes for all bar types", () => {
    const html = renderTimelineHtml(makeData(), nonce, cspSource);
    expect(html).toContain('class="bar complete"');
    expect(html).toContain('class="bar running"');
    expect(html).toContain('class="bar failed"');
    expect(html).toContain('class="bar pending"');
  });

  it("renders phase labels", () => {
    const html = renderTimelineHtml(makeData(), nonce, cspSource);
    expect(html).toContain("1. Parse requirements");
    expect(html).toContain("2. Generate plan");
    expect(html).toContain("3. Implement auth");
    expect(html).toContain("4. Write tests");
  });

  it("renders time axis ticks", () => {
    const html = renderTimelineHtml(makeData(), nonce, cspSource);
    expect(html).toContain('class="tick"');
    expect(html).toContain('class="tick-label"');
    expect(html).toContain("0m");
  });

  it("renders grid lines", () => {
    const html = renderTimelineHtml(makeData(), nonce, cspSource);
    expect(html).toContain('class="grid-line"');
  });

  it("renders NOW line with label", () => {
    const html = renderTimelineHtml(makeData(), nonce, cspSource);
    expect(html).toContain('class="now-line"');
    expect(html).toContain('class="now-label"');
    expect(html).toContain("NOW");
  });

  it("includes pulse keyframes animation", () => {
    const html = renderTimelineHtml(makeData(), nonce, cspSource);
    expect(html).toContain("@keyframes pulse");
    expect(html).toContain("opacity: 0.5");
  });

  it("renders header with icon and title", () => {
    const html = renderTimelineHtml(makeData(), nonce, cspSource);
    expect(html).toContain("Execution Timeline");
    expect(html).toContain("codicon-graph-line");
  });

  it("renders total elapsed time in header", () => {
    const html = renderTimelineHtml(makeData(), nonce, cspSource);
    expect(html).toContain('class="elapsed"');
    expect(html).toContain("Total: 2m 45s");
  });

  it("renders bar labels", () => {
    const html = renderTimelineHtml(makeData(), nonce, cspSource);
    expect(html).toContain("0:45");
    expect(html).toContain("running...");
    expect(html).toContain("1:30");
  });

  it("includes script with nonce for NOW line animation", () => {
    const html = renderTimelineHtml(makeData(), nonce, cspSource);
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).toContain("setInterval");
  });

  it("handles empty timeline data", () => {
    const empty: TimelineData = {
      bars: [],
      totalElapsedMs: 0,
      nowOffsetMs: 0,
      maxTimeMs: 0,
    };
    const html = renderTimelineHtml(empty, nonce, cspSource);
    expect(html).toContain("Execution Timeline");
    expect(html).toContain("Total: 0m 00s");
  });

  it("applies correct CSS colors", () => {
    const html = renderTimelineHtml(makeData(), nonce, cspSource);
    expect(html).toContain("#2e7d32"); // complete
    expect(html).toContain("#0e639c"); // running
    expect(html).toContain("#c72e2e"); // failed
    expect(html).toContain("#007acc"); // now line
    expect(html).toContain("#4ec9b0"); // elapsed color
  });

  it("renders pending bars with dashed border", () => {
    const html = renderTimelineHtml(makeData(), nonce, cspSource);
    expect(html).toContain("dashed");
  });

  it("computes tick positions dynamically based on maxTimeMs", () => {
    const longData = makeData({
      maxTimeMs: 1_800_000, // 30 minutes
      nowOffsetMs: 1_080_000,
    });
    const html = renderTimelineHtml(longData, nonce, cspSource);
    // Should have multiple tick marks with minute labels
    expect(html).toContain("0m");
    expect(html).toContain("5m");
  });
});
