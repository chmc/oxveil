import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({
  window: {
    showQuickPick: vi.fn(),
    showOpenDialog: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showTextDocument: vi.fn(),
    withProgress: vi.fn(),
  },
  workspace: {
    openTextDocument: vi.fn(),
  },
  commands: {
    registerCommand: vi.fn((_id: string, cb: Function) => ({
      dispose: vi.fn(),
      _cb: cb,
    })),
    executeCommand: vi.fn(),
  },
  ProgressLocation: { Notification: 15 },
  Uri: { file: (p: string) => ({ fsPath: p, scheme: "file" }) },
}));

import { concatenateFiles } from "../../../commands/formPlan";

describe("concatenateFiles", () => {
  it("returns content unchanged for a single file", () => {
    const result = concatenateFiles([
      { path: "/docs/plan.md", category: "Implementation", content: "# My Plan\n\nStep 1" },
    ]);
    expect(result).toBe("# My Plan\n\nStep 1");
  });

  it("concatenates multiple files with source headers", () => {
    const result = concatenateFiles([
      { path: "/docs/specs/design.md", category: "Design", content: "# Design\n\nSpec content" },
      { path: "/docs/plans/impl.md", category: "Implementation", content: "# Impl\n\nTask 1" },
    ]);

    expect(result).toContain("# Source: Design — design.md");
    expect(result).toContain("Spec content");
    expect(result).toContain("# Source: Implementation — impl.md");
    expect(result).toContain("Task 1");
    expect(result).toContain("---");
  });

  it("preserves full file content", () => {
    const content = "# Plan\n\n### Task 1: Setup\n\n- [ ] **Step 1:** Do thing\n\n```bash\nnpm test\n```";
    const result = concatenateFiles([
      { path: "/plan.md", category: "Implementation", content },
    ]);
    expect(result).toBe(content);
  });

  it("handles three files", () => {
    const result = concatenateFiles([
      { path: "/a.md", category: "Design", content: "A" },
      { path: "/b.md", category: "Implementation", content: "B" },
      { path: "/c.md", category: "Plan", content: "C" },
    ]);

    expect(result).toContain("# Source: Design — a.md");
    expect(result).toContain("# Source: Implementation — b.md");
    expect(result).toContain("# Source: Plan — c.md");
  });
});
