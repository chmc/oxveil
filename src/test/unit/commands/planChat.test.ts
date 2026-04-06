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
    const showQuickPick = async () => ({ label: "Edit existing plan", value: "edit" as const });
    const result = await handleExistingPlan(showQuickPick);
    expect(result).toBe("edit");
  });

  it("returns 'create' when user picks create new", async () => {
    const showQuickPick = async () => ({ label: "Create new plan (backup current)", value: "create" as const });
    const result = await handleExistingPlan(showQuickPick);
    expect(result).toBe("create");
  });

  it("returns 'cancel' when user dismisses quick pick", async () => {
    const showQuickPick = async () => undefined;
    const result = await handleExistingPlan(showQuickPick);
    expect(result).toBe("cancel");
  });

  it("passes items with labels to quick pick", async () => {
    let capturedItems: any[] = [];
    const showQuickPick = async (items: any[]) => {
      capturedItems = items;
      return undefined;
    };
    await handleExistingPlan(showQuickPick);
    expect(capturedItems).toHaveLength(2);
    expect(capturedItems[0]).toEqual({ label: "Edit existing plan", value: "edit" });
    expect(capturedItems[1]).toEqual({ label: "Create new plan (backup current)", value: "create" });
  });
});
