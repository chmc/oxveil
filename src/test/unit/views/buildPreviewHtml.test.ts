import { describe, it, expect } from "vitest";

import { buildPreviewHtml } from "../../../views/configWizard";

describe("buildPreviewHtml", () => {
  it("colors comments green", () => {
    const result = buildPreviewHtml("# a comment");
    expect(result).toContain('class="comment"');
    expect(result).toContain("# a comment");
  });

  it("colors boolean values", () => {
    const result = buildPreviewHtml("SIMPLE_MODE=true");
    expect(result).toContain('class="val-bool"');
  });

  it("colors number values", () => {
    const result = buildPreviewHtml("MAX_RETRIES=3");
    expect(result).toContain('class="val-num"');
  });

  it("colors string values", () => {
    const result = buildPreviewHtml("PLAN_FILE=PLAN.md");
    expect(result).toContain('class="val-str"');
  });

  it("colors keys", () => {
    const result = buildPreviewHtml("MAX_RETRIES=3");
    expect(result).toContain('class="key"');
    expect(result).toContain("MAX_RETRIES");
  });

  it("handles empty lines", () => {
    const result = buildPreviewHtml("");
    expect(result).toContain("<div>");
  });
});
