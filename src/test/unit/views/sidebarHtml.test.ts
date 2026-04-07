// src/test/unit/views/sidebarHtml.test.ts
import { describe, it, expect } from "vitest";
import { renderSidebar } from "../../../views/sidebarHtml";
import type { SidebarState } from "../../../views/sidebarState";

const nonce = "test-nonce";
const csp = "https://mock.csp";

describe("renderSidebar", () => {
  it("renders loading state when no state provided", () => {
    const html = renderSidebar(nonce, csp);
    expect(html).toContain("Initializing");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain(`nonce-${nonce}`);
  });

  it("renders not-found state", () => {
    const state: SidebarState = {
      view: "not-found",
      notFoundReason: "not-installed",
      archives: [],
    };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("claudeloop not found");
    expect(html).toContain("Install");
  });

  it("renders empty state", () => {
    const state: SidebarState = { view: "empty", archives: [] };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("Create a Plan");
    expect(html).toContain("How it works");
  });

  it("renders ready state with phases and actions", () => {
    const state: SidebarState = {
      view: "ready",
      plan: {
        filename: "PLAN.md",
        phases: [
          { number: 1, title: "Setup", status: "pending" },
          { number: 2, title: "Build", status: "pending" },
        ],
      },
      archives: [],
    };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("PLAN.md");
    expect(html).toContain("Ready");
    expect(html).toContain("Start");
    expect(html).toContain("AI Parse");
    expect(html).toContain("Setup");
    expect(html).toContain("Build");
  });

  it("renders running state with progress", () => {
    const state: SidebarState = {
      view: "running",
      plan: {
        filename: "PLAN.md",
        phases: [
          { number: 1, title: "Setup", status: "completed", duration: "32s" },
          { number: 2, title: "Build", status: "in_progress" },
          { number: 3, title: "Test", status: "pending" },
        ],
      },
      session: { elapsed: "2m 40s", cost: "$0.42", currentPhase: 2, attemptCount: 1 },
      archives: [],
    };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("Running");
    expect(html).toContain("Stop");
    expect(html).toContain("$0.42");
  });

  it("renders stopped state with resume action", () => {
    const state: SidebarState = {
      view: "stopped",
      plan: {
        filename: "PLAN.md",
        phases: [
          { number: 1, title: "Setup", status: "completed", duration: "32s" },
          { number: 2, title: "Build", status: "pending" },
        ],
      },
      archives: [],
    };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("Stopped");
    expect(html).toContain("Resume");
  });

  it("renders failed state with retry and error snippet", () => {
    const state: SidebarState = {
      view: "failed",
      plan: {
        filename: "PLAN.md",
        phases: [
          { number: 1, title: "Setup", status: "completed" },
          { number: 2, title: "Build", status: "failed", attempts: 3 },
        ],
      },
      session: { elapsed: "5m", errorSnippet: "Error: test failed" },
      archives: [],
    };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("Failed");
    expect(html).toContain("Retry");
    expect(html).toContain("Skip");
    expect(html).toContain("Error: test failed");
  });

  it("renders completed state with summary", () => {
    const state: SidebarState = {
      view: "completed",
      plan: {
        filename: "PLAN.md",
        phases: [
          { number: 1, title: "Setup", status: "completed", duration: "32s" },
          { number: 2, title: "Build", status: "completed", duration: "2m" },
        ],
      },
      session: { elapsed: "2m 32s", cost: "$1.23" },
      archives: [
        { name: "20260406", label: "PLAN.md", date: "Just now", phaseCount: 2, duration: "2m 32s", status: "completed" },
      ],
    };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("Completed");
    expect(html).toContain("All 2 phases completed");
    expect(html).toContain("Replay");
  });

  it("renders archives section", () => {
    const state: SidebarState = {
      view: "ready",
      plan: { filename: "PLAN.md", phases: [] },
      archives: [
        { name: "a1", label: "Test Plan", date: "Mar 28", phaseCount: 3, duration: "30s", status: "completed" },
        { name: "a2", label: "Other", date: "Mar 29", phaseCount: 4, status: "failed" },
      ],
    };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("Recent Runs");
    expect(html).toContain("Test Plan");
    expect(html).toContain("Mar 28");
  });

  it("includes CSP meta tag", () => {
    const html = renderSidebar(nonce, csp);
    expect(html).toContain(`nonce-${nonce}`);
    expect(html).toContain(csp);
  });
});
