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

    it("renders Form Plan button when showFormButton is true", () => {
      const html = renderPhaseCardsHtml({ ...activeOpts, showFormButton: true });
      expect(html).toContain("form-plan-btn");
      expect(html).toContain("Form Claudeloop Plan");
    });

    it("hides Form Plan button when showFormButton is false", () => {
      const html = renderPhaseCardsHtml({ ...activeOpts, showFormButton: false });
      expect(html).not.toContain("form-plan-btn");
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

    it("shows waiting text when session is active", () => {
      const html = renderPhaseCardsHtml({ state: "empty", sessionActive: true });
      expect(html).toContain("Waiting for Claude to write a plan");
    });

    it("shows start chatting text when session is not active", () => {
      const html = renderPhaseCardsHtml({ state: "empty", sessionActive: false });
      expect(html).toContain("Start chatting with Claude");
    });
  });

  describe("markdown rendering in phase descriptions", () => {
    const mdOpts: PhaseCardsOptions = {
      state: "active",
      sessionActive: true,
      isValid: true,
      title: "Test",
    };

    it("renders bold text as <strong>", () => {
      const html = renderPhaseCardsHtml({ ...mdOpts, phases: [
        { number: 1, title: "T", description: "**Files:** setup", dependencies: [] },
      ]});
      expect(html).toContain("<strong>Files:</strong>");
    });

    it("renders inline code as <code>", () => {
      const html = renderPhaseCardsHtml({ ...mdOpts, phases: [
        { number: 1, title: "T", description: "Edit `foo.ts` now", dependencies: [] },
      ]});
      expect(html).toContain('<code class="md-code">foo.ts</code>');
    });

    it("renders bullet lists as <ul>/<li>", () => {
      const html = renderPhaseCardsHtml({ ...mdOpts, phases: [
        { number: 1, title: "T", description: "- item one\n- item two", dependencies: [] },
      ]});
      expect(html).toContain("<ul");
      expect(html).toContain("<li>item one</li>");
      expect(html).toContain("<li>item two</li>");
    });

    it("renders inline code inside list items", () => {
      const html = renderPhaseCardsHtml({ ...mdOpts, phases: [
        { number: 1, title: "T", description: "- Edit `foo.ts`", dependencies: [] },
      ]});
      expect(html).toContain('<code class="md-code">foo.ts</code>');
      expect(html).toContain("<li>");
    });

    it("renders fenced code blocks as <pre>", () => {
      const html = renderPhaseCardsHtml({ ...mdOpts, phases: [
        { number: 1, title: "T", description: "```\nconst x = 1;\n```", dependencies: [] },
      ]});
      expect(html).toContain("<pre");
      expect(html).toContain("md-codeblock");
      expect(html).toContain("const x = 1;");
    });

    it("renders numbered lists as <ol>/<li>", () => {
      const html = renderPhaseCardsHtml({ ...mdOpts, phases: [
        { number: 1, title: "T", description: "1. first\n2. second", dependencies: [] },
      ]});
      expect(html).toContain("<ol");
      expect(html).toContain("<li>first</li>");
      expect(html).toContain("<li>second</li>");
    });

    it("renders bold inside list items", () => {
      const html = renderPhaseCardsHtml({ ...mdOpts, phases: [
        { number: 1, title: "T", description: "- **bold** text", dependencies: [] },
      ]});
      expect(html).toContain("<strong>bold</strong>");
    });

    it("escapes HTML inside fenced code blocks", () => {
      const html = renderPhaseCardsHtml({ ...mdOpts, phases: [
        { number: 1, title: "T", description: "```\n<script>alert(1)</script>\n```", dependencies: [] },
      ]});
      expect(html).not.toContain("<script>alert");
      expect(html).toContain("&lt;script&gt;");
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

  describe("tab strip", () => {
    it("renders tab strip with 2+ tabs", () => {
      const html = renderPhaseCardsHtml({
        state: "active",
        phases: [{ number: 1, title: "Setup", description: "Do things" }],
        sessionActive: true,
        tabs: [
          { category: "design", label: "Design", active: false },
          { category: "implementation", label: "Implementation", active: true },
        ],
      });
      expect(html).toContain("tab-strip");
      expect(html).toContain('data-category="design"');
      expect(html).toContain('data-category="implementation"');
      expect(html).toContain("Design");
      expect(html).toContain("Implementation");
    });

    it("marks active tab with active class", () => {
      const html = renderPhaseCardsHtml({
        state: "active",
        phases: [{ number: 1, title: "Setup", description: "Do things" }],
        sessionActive: true,
        tabs: [
          { category: "design", label: "Design", active: true },
          { category: "implementation", label: "Implementation", active: false },
        ],
      });
      expect(html).toContain('class="tab-pill active" data-category="design"');
      expect(html).toContain('class="tab-pill" data-category="implementation"');
    });

    it("does not render tab strip when tabs is undefined", () => {
      const html = renderPhaseCardsHtml({
        state: "active",
        phases: [{ number: 1, title: "Setup", description: "Do things" }],
        sessionActive: true,
      });
      expect(html).not.toContain("tab-strip");
    });

    it("does not render tab strip with single tab", () => {
      const html = renderPhaseCardsHtml({
        state: "active",
        phases: [{ number: 1, title: "Setup", description: "Do things" }],
        sessionActive: true,
        tabs: [{ category: "plan", label: "Plan", active: true }],
      });
      expect(html).not.toContain("tab-strip");
    });

    it("escapes HTML in tab labels and categories", () => {
      const html = renderPhaseCardsHtml({
        state: "active",
        phases: [{ number: 1, title: "Setup", description: "Do things" }],
        sessionActive: true,
        tabs: [
          { category: "design", label: "<script>", active: false },
          { category: "implementation", label: "Impl", active: true },
        ],
      });
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });
  });
});
