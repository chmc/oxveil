import { describe, it, expect } from "vitest";
import {
  renderPlanPreviewShell,
  renderPhaseCardsHtml,
} from "../../../views/planPreviewHtml";
import type { PhaseCardsOptions } from "../../../views/planPreviewHtml";

const nonce = "abc123";
const cspSource = "https://mock.csp";

describe("renderPlanPreviewShell", () => {
  it("returns valid HTML with CSP meta tag containing nonce", () => {
    const html = renderPlanPreviewShell(nonce, cspSource);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain(`nonce-${nonce}`);
    expect(html).toContain(cspSource);
  });

  it("contains acquireVsCodeApi call", () => {
    const html = renderPlanPreviewShell(nonce, cspSource);
    expect(html).toContain("acquireVsCodeApi()");
  });

  it("contains message handler", () => {
    const html = renderPlanPreviewShell(nonce, cspSource);
    expect(html).toContain("addEventListener");
    expect(html).toContain('"message"');
  });

  it("uses vscode theme CSS variables", () => {
    const html = renderPlanPreviewShell(nonce, cspSource);
    expect(html).toContain("var(--vscode-");
  });

  it("contains phase card CSS classes", () => {
    const html = renderPlanPreviewShell(nonce, cspSource);
    for (const cls of [".phase-card", ".phase-number", ".phase-title", ".phase-desc", ".annotate-btn"]) {
      expect(html).toContain(cls);
    }
  });

  it("contains script tag with nonce attribute", () => {
    const html = renderPlanPreviewShell(nonce, cspSource);
    expect(html).toContain(`nonce="${nonce}"`);
  });
});

describe("renderPhaseCardsHtml", () => {
  const phases = [
    { number: 1, title: "Setup", description: "Install dependencies.", dependencies: [] },
    { number: 2, title: "Build", description: "Compile the code.", dependencies: ["Phase 1"] },
    { number: 3, title: "Deploy", description: "Ship to prod.", dependencies: ["Phase 1", "Phase 2"] },
  ];

  describe("active state", () => {
    const activeOpts: PhaseCardsOptions = {
      state: "active",
      phases,
      sessionActive: true,
      isValid: true,
      title: "My Plan",
    };

    it("renders phase cards with titles and descriptions", () => {
      const html = renderPhaseCardsHtml(activeOpts);
      expect(html).toContain("Setup");
      expect(html).toContain("Install dependencies.");
      expect(html).toContain("Build");
      expect(html).toContain("Compile the code.");
      expect(html).toContain("Deploy");
      expect(html).toContain("Ship to prod.");
    });

    it("renders phase cards with colored left borders", () => {
      const html = renderPhaseCardsHtml(activeOpts);
      expect(html).toContain("phase-card");
    });

    it("renders phase numbers", () => {
      const html = renderPhaseCardsHtml(activeOpts);
      expect(html).toContain("Phase 1");
      expect(html).toContain("Phase 2");
      expect(html).toContain("Phase 3");
    });

    it("renders annotate buttons when session is active", () => {
      const html = renderPhaseCardsHtml(activeOpts);
      expect(html).toContain("annotate-btn");
      expect(html).toContain("Note");
    });

    it("renders Live badge when session is active", () => {
      const html = renderPhaseCardsHtml(activeOpts);
      expect(html).toContain("live-badge");
      expect(html).toContain("Live");
    });

    it("renders Valid badge when plan is valid", () => {
      const html = renderPhaseCardsHtml(activeOpts);
      expect(html).toContain("valid-badge");
      expect(html).toContain("Valid");
    });

    it("renders dependencies", () => {
      const html = renderPhaseCardsHtml(activeOpts);
      expect(html).toContain("Depends on:");
      expect(html).toContain("Phase 1");
    });

    it("renders title in header", () => {
      const html = renderPhaseCardsHtml(activeOpts);
      expect(html).toContain("My Plan");
    });

    it("escapes HTML in titles and descriptions", () => {
      const xssPhases = [
        { number: 1, title: "<script>alert(1)</script>", description: "<img onerror=alert(1)>", dependencies: [] },
      ];
      const html = renderPhaseCardsHtml({ ...activeOpts, phases: xssPhases });
      expect(html).not.toContain("<script>alert");
      expect(html).not.toContain("<img onerror");
    });

    it("omits Valid badge when plan is not valid", () => {
      const html = renderPhaseCardsHtml({ ...activeOpts, isValid: false });
      expect(html).not.toContain("valid-badge");
    });
  });

  describe("session ended state", () => {
    const endedOpts: PhaseCardsOptions = {
      state: "session-ended",
      phases,
      sessionActive: false,
      isValid: true,
      title: "My Plan",
    };

    it("shows session ended warning banner", () => {
      const html = renderPhaseCardsHtml(endedOpts);
      expect(html).toContain("session-ended-banner");
      expect(html).toContain("Terminal closed");
      expect(html).toContain("annotations disabled");
    });

    it("shows ended badge instead of live badge", () => {
      const html = renderPhaseCardsHtml(endedOpts);
      expect(html).toContain("ended-badge");
      expect(html).toContain("Session ended");
      expect(html).not.toContain("live-badge");
    });

    it("does not render annotate buttons", () => {
      const html = renderPhaseCardsHtml(endedOpts);
      expect(html).not.toContain("annotate-btn");
    });

    it("still renders phase cards with content", () => {
      const html = renderPhaseCardsHtml(endedOpts);
      expect(html).toContain("Setup");
      expect(html).toContain("Build");
      expect(html).toContain("Deploy");
    });
  });

  describe("empty state", () => {
    it('shows "No plan yet" placeholder', () => {
      const html = renderPhaseCardsHtml({ state: "empty", sessionActive: true });
      expect(html).toContain("No plan yet");
      expect(html).toContain("empty-state");
    });

    it("shows Live badge in empty state", () => {
      const html = renderPhaseCardsHtml({ state: "empty", sessionActive: true });
      expect(html).toContain("live-badge");
    });

    it("does not render phase cards", () => {
      const html = renderPhaseCardsHtml({ state: "empty", sessionActive: true });
      expect(html).not.toContain("phase-card");
    });
  });

  describe("raw markdown fallback", () => {
    it("renders raw markdown content", () => {
      const html = renderPhaseCardsHtml({
        state: "raw-markdown",
        rawMarkdown: "# My Plan\n\nSome content here.",
        sessionActive: true,
      });
      expect(html).toContain("My Plan");
      expect(html).toContain("Some content here.");
    });

    it("escapes HTML in raw markdown", () => {
      const html = renderPhaseCardsHtml({
        state: "raw-markdown",
        rawMarkdown: "<script>alert(1)</script>",
        sessionActive: true,
      });
      expect(html).not.toContain("<script>alert");
    });

    it("renders in a raw-markdown container", () => {
      const html = renderPhaseCardsHtml({
        state: "raw-markdown",
        rawMarkdown: "content",
        sessionActive: true,
      });
      expect(html).toContain("raw-markdown");
    });
  });
});
