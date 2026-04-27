// src/test/unit/views/sidebarScript.test.ts
import { describe, it, expect } from "vitest";
import { sidebarJs } from "../../../views/sidebarScript";

describe("sidebarJs", () => {
  it("includes start button feedback transformation", () => {
    const script = sidebarJs();

    // Should transform start button to show spinner and Starting... text
    expect(script).toContain('msg.command === "start"');
    expect(script).toContain("Starting...");
    expect(script).toContain("codicon-sync");
    expect(script).toContain("spin");
  });

  it("includes formPlan button feedback transformation with no timeout", () => {
    const script = sidebarJs();

    // Should transform formPlan button to show spinner and Forming... text
    expect(script).toContain('msg.command === "formPlan"');
    expect(script).toContain("Forming...");

    // Verify formPlan branch does NOT include setTimeout (unlike other commands)
    // The script structure: start branch has no timeout, formPlan branch has no timeout,
    // else branch has 2000ms timeout
    const formPlanMatch = script.match(/msg\.command === "formPlan"[\s\S]*?else \{/);
    expect(formPlanMatch).toBeTruthy();
    expect(formPlanMatch![0]).not.toContain("setTimeout");
  });
});
