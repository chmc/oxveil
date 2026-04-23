import { describe, it, expect } from "vitest";
import { renderBody } from "../../../views/sidebarRenderers";
import type { SidebarState, PhaseView, ArchiveView } from "../../../views/sidebarState";

/**
 * Tests the data-command and data-phase contract of sidebar renderers.
 *
 * sidebarHtml.test.ts already covers basic content (badge text, button labels).
 * These tests verify the machine-readable attributes that drive webview→extension
 * message dispatch — a dead data-command means a broken button.
 */

function makePhases(...statuses: Array<{ num: number; title: string; status: string }>): PhaseView[] {
  return statuses.map((s) => ({
    number: s.num,
    title: s.title,
    status: s.status as PhaseView["status"],
  }));
}

const archive: ArchiveView = {
  name: "20260415",
  label: "PLAN.md",
  date: "Today",
  phaseCount: 2,
  status: "completed",
};

describe("renderBody data-command contract", () => {
  it("not-found: install button dispatches install command", () => {
    const html = renderBody({
      view: "not-found",
      notFoundReason: "not-installed",
      archives: [],
    });
    expect(html).toContain('data-command="install"');
    expect(html).toContain('data-command="setPath"');
  });

  it("empty: createPlan button and secondary actions", () => {
    const html = renderBody({ view: "empty", archives: [] });
    expect(html).toContain('data-command="createPlan"');
    expect(html).toContain('data-command="writePlan"');
    expect(html).toContain('data-command="aiParse"');
    expect(html).toContain('data-command="formPlan"');
  });

  it("ready: start button and edit/discard links", () => {
    const html = renderBody({
      view: "ready",
      plan: {
        filename: "PLAN.md",
        phases: makePhases({ num: 1, title: "Setup", status: "pending" }),
      },
      archives: [],
    });
    expect(html).toContain('data-command="start"');
    expect(html).toContain('data-command="editPlan"');
    expect(html).toContain('data-command="discardPlan"');
  });

  it("stale: resumePlan and dismissPlan commands", () => {
    const html = renderBody({
      view: "stale",
      plan: { filename: "PLAN.md", phases: [] },
      archives: [],
    });
    expect(html).toContain('data-command="resumePlan"');
    expect(html).toContain('data-command="dismissPlan"');
  });

  it("running: stop button", () => {
    const html = renderBody({
      view: "running",
      plan: {
        filename: "PLAN.md",
        phases: makePhases(
          { num: 1, title: "Setup", status: "completed" },
          { num: 2, title: "Build", status: "in_progress" },
        ),
      },
      session: { elapsed: "1m" },
      archives: [],
    });
    expect(html).toContain('data-command="stop"');
  });

  it("stopped: resume targets first pending phase", () => {
    const html = renderBody({
      view: "stopped",
      plan: {
        filename: "PLAN.md",
        phases: makePhases(
          { num: 1, title: "Setup", status: "completed" },
          { num: 2, title: "Build", status: "completed" },
          { num: 3, title: "Test", status: "pending" },
          { num: 4, title: "Deploy", status: "pending" },
        ),
      },
      archives: [],
    });
    expect(html).toContain('data-command="resume"');
    expect(html).toContain('data-phase="3"');
    expect(html).toContain('data-command="restart"');
  });

  it("failed: retry and skip target failed phase", () => {
    const html = renderBody({
      view: "failed",
      plan: {
        filename: "PLAN.md",
        phases: makePhases(
          { num: 1, title: "Setup", status: "completed" },
          { num: 2, title: "Build", status: "failed" },
          { num: 3, title: "Test", status: "pending" },
        ),
      },
      session: { elapsed: "3m", errorSnippet: "npm ERR!" },
      archives: [],
    });
    // Both retry and skip should target phase 2
    expect(html).toContain('data-command="retry"');
    expect(html).toContain('data-command="skip"');
    const retryMatch = html.match(/data-command="retry"[^>]*data-phase="(\d+)"/);
    const skipMatch = html.match(/data-command="skip"[^>]*data-phase="(\d+)"/);
    expect(retryMatch?.[1]).toBe("2");
    expect(skipMatch?.[1]).toBe("2");
  });

  it("completed: replay button targets latest archive", () => {
    const html = renderBody({
      view: "completed",
      plan: {
        filename: "PLAN.md",
        phases: makePhases(
          { num: 1, title: "Setup", status: "completed" },
        ),
      },
      session: { elapsed: "1m" },
      archives: [archive],
    });
    expect(html).toContain('data-command="openReplay"');
    expect(html).toContain('data-archive="20260415"');
    expect(html).toContain('data-command="createPlan"');
  });

  it("completed without archives omits replay button", () => {
    const html = renderBody({
      view: "completed",
      plan: {
        filename: "PLAN.md",
        phases: makePhases(
          { num: 1, title: "Setup", status: "completed" },
        ),
      },
      session: { elapsed: "1m" },
      archives: [],
    });
    expect(html).not.toContain('data-command="openReplay"');
    expect(html).toContain('data-command="createPlan"');
  });

  it("planning: formPlan button and chat/preview links", () => {
    const html = renderBody({ view: "planning", archives: [] });
    expect(html).toContain('data-command="formPlan"');
    expect(html).toContain('data-command="focusPlanChat"');
    expect(html).toContain('data-command="showPlanPreview"');
  });
});

describe("renderBody phase list rendering", () => {
  it("stopped view highlights paused phase", () => {
    const html = renderBody({
      view: "stopped",
      plan: {
        filename: "PLAN.md",
        phases: makePhases(
          { num: 1, title: "Setup", status: "completed" },
          { num: 2, title: "Build", status: "pending" },
        ),
      },
      archives: [],
    });
    expect(html).toContain("paused");
  });

  it("running view shows active class for in_progress phase", () => {
    const html = renderBody({
      view: "running",
      plan: {
        filename: "PLAN.md",
        phases: makePhases(
          { num: 1, title: "Setup", status: "completed" },
          { num: 2, title: "Build", status: "in_progress" },
        ),
      },
      session: { elapsed: "1m" },
      archives: [],
    });
    expect(html).toContain("active");
    expect(html).toContain("done");
  });

  it("phase with attempts shows attempt count", () => {
    const html = renderBody({
      view: "failed",
      plan: {
        filename: "PLAN.md",
        phases: [
          { number: 1, title: "Setup", status: "completed" as const },
          { number: 2, title: "Build", status: "failed" as const, attempts: 3 },
        ],
      },
      session: { elapsed: "5m" },
      archives: [],
    });
    expect(html).toContain("attempt 3");
  });

  it("phase with duration shows duration", () => {
    const html = renderBody({
      view: "completed",
      plan: {
        filename: "PLAN.md",
        phases: [
          { number: 1, title: "Setup", status: "completed" as const, duration: "32s" },
        ],
      },
      session: { elapsed: "32s" },
      archives: [],
    });
    expect(html).toContain("32s");
  });
});

describe("renderBody running info bar", () => {
  it("shows cost when present", () => {
    const html = renderBody({
      view: "running",
      plan: {
        filename: "PLAN.md",
        phases: makePhases({ num: 1, title: "Setup", status: "in_progress" }),
      },
      session: { elapsed: "1m", cost: "$0.42" },
      archives: [],
    });
    expect(html).toContain("$0.42");
  });

  it("shows todo progress when present", () => {
    const html = renderBody({
      view: "running",
      plan: {
        filename: "PLAN.md",
        phases: makePhases({ num: 1, title: "Setup", status: "in_progress" }),
      },
      session: { elapsed: "1m", todos: { done: 3, total: 5 } },
      archives: [],
    });
    expect(html).toContain("3/5 todos");
  });

  it("shows attempt info when attemptCount > 1", () => {
    const html = renderBody({
      view: "running",
      plan: {
        filename: "PLAN.md",
        phases: makePhases({ num: 1, title: "Setup", status: "in_progress" }),
      },
      session: { elapsed: "1m", attemptCount: 2, maxRetries: 3 },
      archives: [],
    });
    expect(html).toContain("attempt 2/3");
  });
});

describe("renderBody planning view", () => {
  it("shows 'Shaping Your Plan' title", () => {
    const html = renderBody({ view: "planning", archives: [] });
    expect(html).toContain("Shaping Your Plan");
  });

  it("contains Form Plan button", () => {
    const html = renderBody({ view: "planning", archives: [] });
    expect(html).toContain("Form Plan");
    expect(html).toContain('class="action-btn primary"');
  });

  it("contains Focus Chat and Show Plan Preview links", () => {
    const html = renderBody({ view: "planning", archives: [] });
    expect(html).toContain("Focus Chat");
    expect(html).toContain("Show Plan Preview");
  });

  it("shows archives section when archives exist", () => {
    const html = renderBody({
      view: "planning",
      archives: [archive],
    });
    expect(html).toContain("Recent Runs");
    expect(html).toContain("20260415");
    expect(html).toContain('data-archive="20260415"');
  });

  it("omits archives section when no archives", () => {
    const html = renderBody({ view: "planning", archives: [] });
    expect(html).not.toContain("Recent Runs");
    expect(html).not.toContain("archives-section");
  });
});

describe("renderBody dispatch", () => {
  it("returns empty string for undefined state", () => {
    const html = renderBody(undefined);
    expect(html).toContain("Initializing");
  });
});
