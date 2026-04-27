import { describe, it, expect } from "vitest";
import { renderSelfImprovementHtml } from "../../../views/selfImprovementHtml";
import type { Lesson } from "../../../types";

const nonce = "test-nonce-123";
const cspSource = "https://mock.csp";

describe("renderSelfImprovementHtml", () => {
  const sampleLessons: Lesson[] = [
    { phase: 1, title: "Setup environment", retries: 0, duration: 45, exit: "success" },
    { phase: 2, title: "Build components", retries: 2, duration: 312, exit: "error" },
    { phase: 3, title: "Deploy", retries: 1, duration: 180, exit: "success" },
  ];

  it("returns valid HTML with CSP", () => {
    const html = renderSelfImprovementHtml({ lessons: sampleLessons, cspSource, nonce });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain(`nonce="${nonce}"`);
  });

  it("renders header", () => {
    const html = renderSelfImprovementHtml({ lessons: sampleLessons, cspSource, nonce });
    expect(html).toContain("<h1>Self-Improvement</h1>");
  });

  it("renders lessons table with headers", () => {
    const html = renderSelfImprovementHtml({ lessons: sampleLessons, cspSource, nonce });
    expect(html).toContain("<th>Phase</th>");
    expect(html).toContain("<th>Title</th>");
    expect(html).toContain("<th>Retries</th>");
    expect(html).toContain("<th>Duration</th>");
    expect(html).toContain("<th>Status</th>");
    expect(html).toContain("<th>Summary</th>");
  });

  it("renders lesson rows", () => {
    const html = renderSelfImprovementHtml({ lessons: sampleLessons, cspSource, nonce });
    expect(html).toContain("Setup environment");
    expect(html).toContain("Build components");
    expect(html).toContain("Deploy");
  });

  it("renders retries count", () => {
    const html = renderSelfImprovementHtml({ lessons: sampleLessons, cspSource, nonce });
    expect(html).toContain("<td>0</td>");
    expect(html).toContain("<td>2</td>");
    expect(html).toContain("<td>1</td>");
  });

  it("formats duration in seconds", () => {
    const html = renderSelfImprovementHtml({ lessons: sampleLessons, cspSource, nonce });
    expect(html).toContain("45s");
  });

  it("formats duration in minutes and seconds", () => {
    const html = renderSelfImprovementHtml({ lessons: sampleLessons, cspSource, nonce });
    expect(html).toContain("5m 12s"); // 312s
    expect(html).toContain("3m"); // 180s, exact minutes
  });

  it("renders success status with checkmark", () => {
    const html = renderSelfImprovementHtml({ lessons: sampleLessons, cspSource, nonce });
    expect(html).toContain('class="success">✓</td>');
  });

  it("renders error status with x mark", () => {
    const html = renderSelfImprovementHtml({ lessons: sampleLessons, cspSource, nonce });
    expect(html).toContain('class="error">✗</td>');
  });

  it("renders summary stats", () => {
    const html = renderSelfImprovementHtml({ lessons: sampleLessons, cspSource, nonce });
    expect(html).toContain("3 phases");
    expect(html).toContain("1 failed");
    expect(html).toContain("3 total retries");
  });

  it("renders action buttons", () => {
    const html = renderSelfImprovementHtml({ lessons: sampleLessons, cspSource, nonce });
    expect(html).toContain('id="start-btn"');
    expect(html).toContain("Start Improvement Session");
    expect(html).toContain('id="skip-btn"');
    expect(html).toContain("Skip");
  });

  it("includes message handler script", () => {
    const html = renderSelfImprovementHtml({ lessons: sampleLessons, cspSource, nonce });
    expect(html).toContain("acquireVsCodeApi");
    expect(html).toContain("postMessage");
    expect(html).toContain("{ type: 'start' }");
    expect(html).toContain("{ type: 'skip' }");
  });

  it("escapes HTML in titles", () => {
    const xssLessons: Lesson[] = [
      { phase: 1, title: "<script>alert(1)</script>", retries: 0, duration: 10, exit: "success" },
    ];
    const html = renderSelfImprovementHtml({ lessons: xssLessons, cspSource, nonce });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("handles empty lessons array", () => {
    const html = renderSelfImprovementHtml({ lessons: [], cspSource, nonce });
    expect(html).toContain("0 phases");
    expect(html).toContain("<tbody>");
    expect(html).not.toContain("failed");
  });

  it("handles single lesson", () => {
    const singleLesson: Lesson[] = [
      { phase: 1, title: "Only phase", retries: 0, duration: 30, exit: "success" },
    ];
    const html = renderSelfImprovementHtml({ lessons: singleLesson, cspSource, nonce });
    expect(html).toContain("1 phase");
    expect(html).not.toContain("1 phases");
  });

  it("handles string phase numbers", () => {
    const stringPhase: Lesson[] = [
      { phase: "1.1", title: "Sub-phase", retries: 0, duration: 60, exit: "success" },
    ];
    const html = renderSelfImprovementHtml({ lessons: stringPhase, cspSource, nonce });
    expect(html).toContain("<td>1.1</td>");
  });

  it("omits failed count when all succeeded", () => {
    const allSuccess: Lesson[] = [
      { phase: 1, title: "Phase A", retries: 0, duration: 30, exit: "success" },
      { phase: 2, title: "Phase B", retries: 0, duration: 40, exit: "success" },
    ];
    const html = renderSelfImprovementHtml({ lessons: allSuccess, cspSource, nonce });
    expect(html).not.toContain("failed");
  });

  it("omits retries count when no retries", () => {
    const noRetries: Lesson[] = [
      { phase: 1, title: "Phase A", retries: 0, duration: 30, exit: "success" },
    ];
    const html = renderSelfImprovementHtml({ lessons: noRetries, cspSource, nonce });
    expect(html).not.toContain("total retries");
  });

  it("renders summary cell with em-dash when no summary", () => {
    const html = renderSelfImprovementHtml({ lessons: sampleLessons, cspSource, nonce });
    expect(html).toContain('class="summary-cell empty">—</td>');
  });

  it("renders summary cell with text when summary present", () => {
    const withSummary: Lesson[] = [
      { phase: 1, title: "Test phase", retries: 0, duration: 30, exit: "success", summary: "Learned to use TDD" },
    ];
    const html = renderSelfImprovementHtml({ lessons: withSummary, cspSource, nonce });
    expect(html).toContain('class="summary-cell">Learned to use TDD</td>');
  });

  it("renders failReason as tooltip on retries cell", () => {
    const withFailReason: Lesson[] = [
      { phase: 1, title: "Failed phase", retries: 2, duration: 120, exit: "error", failReason: "timeout" },
    ];
    const html = renderSelfImprovementHtml({ lessons: withFailReason, cspSource, nonce });
    expect(html).toContain('title="timeout">2</td>');
  });

  it("escapes HTML in summary", () => {
    const xssSummary: Lesson[] = [
      { phase: 1, title: "Test", retries: 0, duration: 10, exit: "success", summary: "<script>xss</script>" },
    ];
    const html = renderSelfImprovementHtml({ lessons: xssSummary, cspSource, nonce });
    expect(html).not.toContain("<script>xss");
    expect(html).toContain("&lt;script&gt;xss&lt;/script&gt;");
  });

  it("escapes HTML in failReason tooltip", () => {
    const xssFailReason: Lesson[] = [
      { phase: 1, title: "Test", retries: 1, duration: 10, exit: "error", failReason: '<img onerror="xss">' },
    ];
    const html = renderSelfImprovementHtml({ lessons: xssFailReason, cspSource, nonce });
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('title="&lt;img onerror=&quot;xss&quot;&gt;">1</td>');
  });
});
