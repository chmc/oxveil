import { describe, it, expect } from "vitest";
import { renderLiveRunShell, renderDashboardHtml } from "../../../views/liveRunHtml";
import type { ProgressState } from "../../../types";

const nonce = "abc123";
const cspSource = "https://mock.csp";

describe("renderLiveRunShell", () => {
  it("returns valid HTML with CSP", () => {
    const html = renderLiveRunShell(nonce, cspSource);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain(`nonce="${nonce}"`);
  });

  it("contains dashboard and log containers", () => {
    const html = renderLiveRunShell(nonce, cspSource);
    expect(html).toContain('id="dashboard"');
    expect(html).toContain('id="log-container"');
  });

  it("contains message handler script", () => {
    const html = renderLiveRunShell(nonce, cspSource);
    expect(html).toContain("addEventListener");
    expect(html).toContain('"dashboard"');
    expect(html).toContain('"log-append"');
  });

  it("contains CSS for log classes", () => {
    const html = renderLiveRunShell(nonce, cspSource);
    for (const cls of [".log-ts", ".log-tool", ".log-todo", ".log-warn", ".log-error", ".log-phase-header"]) {
      expect(html).toContain(cls);
    }
  });
});

describe("renderDashboardHtml", () => {
  const progress: ProgressState = {
    phases: [
      { number: 1, title: "Setup", status: "completed", started: "2025-01-01 10:00:00", completed: "2025-01-01 10:00:39" },
      { number: 2, title: "Build", status: "in_progress", started: "2025-01-01 10:00:39" },
      { number: 3, title: "Deploy", status: "pending" },
    ],
    totalPhases: 3,
    currentPhaseIndex: 1,
  };

  it("renders completed phase", () => {
    expect(renderDashboardHtml(progress)).toContain("Setup");
  });

  it("renders active phase highlighted", () => {
    const html = renderDashboardHtml(progress);
    expect(html).toContain("phase-active");
    expect(html).toContain("Build");
  });

  it("renders pending phases dimmed", () => {
    const html = renderDashboardHtml(progress);
    expect(html).toContain("phase-pending");
  });

  it("shows cost as dash when unknown", () => {
    expect(renderDashboardHtml(progress)).toContain("—");
  });

  it("shows cost when provided", () => {
    expect(renderDashboardHtml(progress, { totalCost: 1.24 })).toContain("$1.24");
  });

  it("escapes HTML in phase titles", () => {
    const xss: ProgressState = {
      phases: [{ number: 1, title: "<script>alert(1)</script>", status: "pending" }],
      totalPhases: 1,
    };
    expect(renderDashboardHtml(xss)).not.toContain("<script>alert");
  });

  it("renders empty state when no phases", () => {
    const empty: ProgressState = { phases: [], totalPhases: 0 };
    const html = renderDashboardHtml(empty);
    expect(html).toContain("No active run");
  });
});
