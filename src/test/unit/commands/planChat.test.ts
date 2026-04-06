import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../../commands/planChat";

describe("buildSystemPrompt", () => {
  it("returns prompt with phase format instructions", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("## Phase");
    expect(prompt).toContain("clarifying questions");
    expect(prompt).not.toContain("PLAN.md");
  });
});
