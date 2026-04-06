import { describe, it, expect } from "vitest";
import { buildSystemPrompt, handleExistingPlan } from "../../../commands/planChat";

describe("buildSystemPrompt", () => {
  it("returns prompt with plan format instructions", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("PLAN.md");
    expect(prompt).toContain("## Phase");
    expect(prompt.length).toBeGreaterThan(50);
  });
});

describe("handleExistingPlan", () => {
  it("returns 'edit' when user picks edit", async () => {
    const showQuickPick = async () => ({ value: "edit" as const });
    const result = await handleExistingPlan(showQuickPick);
    expect(result).toBe("edit");
  });

  it("returns 'create' when user picks create new", async () => {
    const showQuickPick = async () => ({ value: "create" as const });
    const result = await handleExistingPlan(showQuickPick);
    expect(result).toBe("create");
  });

  it("returns 'cancel' when user dismisses quick pick", async () => {
    const showQuickPick = async () => undefined;
    const result = await handleExistingPlan(showQuickPick);
    expect(result).toBe("cancel");
  });
});
