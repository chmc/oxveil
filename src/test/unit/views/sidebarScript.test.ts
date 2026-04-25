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
});
