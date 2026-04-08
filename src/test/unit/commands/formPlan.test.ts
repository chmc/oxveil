import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
  window: {
    showQuickPick: vi.fn(),
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

import * as vscode from "vscode";
import { registerFormPlanCommand } from "../../../commands/formPlan";
import type { FormPlanCommandDeps } from "../../../commands/formPlan";

function makeDeps(overrides: Partial<FormPlanCommandDeps> = {}): FormPlanCommandDeps {
  return {
    resolveFolder: vi.fn().mockResolvedValue({
      workspaceRoot: "/workspace",
      processManager: { aiParse: vi.fn().mockResolvedValue(undefined) } as any,
    }),
    getActivePreviewFile: vi.fn().mockReturnValue("/workspace/docs/superpowers/plans/test.md"),
    ...overrides,
  };
}

describe("registerFormPlanCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers oxveil.formPlan command", () => {
    const deps = makeDeps();
    registerFormPlanCommand(deps);
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      "oxveil.formPlan",
      expect.any(Function),
    );
  });

  it("uses filePath argument when provided", async () => {
    const deps = makeDeps();
    registerFormPlanCommand(deps);

    const cb = vi.mocked(vscode.commands.registerCommand).mock.calls[0][1];
    // Provide filePath arg — should NOT call getActivePreviewFile
    await cb({ filePath: "/custom/plan.md" });

    expect(deps.getActivePreviewFile).not.toHaveBeenCalled();
  });

  it("falls back to active preview file when no arg", async () => {
    const deps = makeDeps();
    registerFormPlanCommand(deps);

    const cb = vi.mocked(vscode.commands.registerCommand).mock.calls[0][1];
    await cb();

    expect(deps.getActivePreviewFile).toHaveBeenCalled();
  });

  it("shows error when no file available", async () => {
    const deps = makeDeps({
      getActivePreviewFile: vi.fn().mockReturnValue(undefined),
    });
    registerFormPlanCommand(deps);

    const cb = vi.mocked(vscode.commands.registerCommand).mock.calls[0][1];
    await cb();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("No plan file available"),
    );
  });

  it("shows warning when no workspace", async () => {
    const deps = makeDeps({
      resolveFolder: vi.fn().mockResolvedValue(undefined),
    });
    registerFormPlanCommand(deps);

    const cb = vi.mocked(vscode.commands.registerCommand).mock.calls[0][1];
    await cb();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("No workspace"),
    );
  });
});
