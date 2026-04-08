import { describe, it, expect } from "vitest";
import { buildSystemPrompt, resolveClaudeModel } from "../../../commands/planChat";

describe("buildSystemPrompt", () => {
  it("returns prompt with phase format instructions", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("## Phase");
    expect(prompt).toContain("clarifying questions");
    expect(prompt).not.toContain("PLAN.md");
  });
});

describe("resolveClaudeModel", () => {
  // VS Code API: Production = 1, Development = 2, Test = 3
  const PRODUCTION = 1;
  const DEVELOPMENT = 2;

  it("returns env var when set", () => {
    expect(resolveClaudeModel("sonnet", DEVELOPMENT)).toBe("sonnet");
  });

  it("returns haiku in development mode when no env var", () => {
    expect(resolveClaudeModel(undefined, DEVELOPMENT)).toBe("haiku");
  });

  it("returns undefined in production mode when no env var", () => {
    expect(resolveClaudeModel(undefined, PRODUCTION)).toBeUndefined();
  });

  it("env var takes precedence over development mode default", () => {
    expect(resolveClaudeModel("opus", DEVELOPMENT)).toBe("opus");
  });

  it("returns undefined when env var is empty string", () => {
    expect(resolveClaudeModel("", PRODUCTION)).toBeUndefined();
  });

  it("returns haiku when env var is empty string in dev mode", () => {
    expect(resolveClaudeModel("", DEVELOPMENT)).toBe("haiku");
  });
});
