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

vi.mock("../../../commands/aiParseLoop", () => ({
  aiParseLoop: vi.fn().mockResolvedValue({ outcome: "pass" }),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue("## Phase 1: Test\nDo the thing."),
  writeFile: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockRejectedValue(new Error("ENOENT")),
  unlink: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../commands/granularityPicker", () => ({
  pickGranularity: vi.fn().mockResolvedValue("tasks"),
}));

import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import { registerFormPlanCommand } from "../../../commands/formPlan";
import type { FormPlanCommandDeps } from "../../../commands/formPlan";
import { aiParseLoop } from "../../../commands/aiParseLoop";
import { pickGranularity } from "../../../commands/granularityPicker";

function makeLiveRunPanel() {
  return {
    reveal: vi.fn(),
    revealForAiParse: vi.fn(),
    onVerifyFailed: vi.fn(),
    onVerifyPassed: vi.fn(),
    onAiParseAction: vi.fn(),
    onLogAppended: vi.fn(),
    onRunFinished: vi.fn(),
    onProgressChanged: vi.fn(),
    visible: false,
  };
}

function makeDeps(overrides: Partial<FormPlanCommandDeps> = {}): FormPlanCommandDeps {
  return {
    resolveFolder: vi.fn().mockResolvedValue({
      workspaceRoot: "/workspace",
      processManager: {
        aiParse: vi.fn().mockResolvedValue({ exitCode: 0 }),
        aiParseFeedback: vi.fn().mockResolvedValue({ exitCode: 0 }),
      } as any,
      liveRunPanel: makeLiveRunPanel() as any,
    }),
    getActivePreviewFile: vi.fn().mockReturnValue("/workspace/docs/superpowers/plans/test.md"),
    onPlanFormed: vi.fn(),
    ...overrides,
  };
}

describe("registerFormPlanCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiParseLoop).mockResolvedValue({ outcome: "pass" });
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

  it("returns silently when aiParseLoop is aborted", async () => {
    vi.mocked(aiParseLoop).mockResolvedValue({ outcome: "aborted" });
    const deps = makeDeps();
    registerFormPlanCommand(deps);

    const cb = vi.mocked(vscode.commands.registerCommand).mock.calls[0][1];
    await cb();

    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    expect(deps.onPlanFormed).not.toHaveBeenCalled();
  });

  it("handles aiParseLoop rejection without crashing", async () => {
    vi.mocked(aiParseLoop).mockRejectedValue(new Error("FAKE_CLAUDE_DIR not set"));
    // ai-parsed-plan.md doesn't exist — readFile falls back to PLAN.md
    vi.mocked(fs.readFile).mockImplementation(async (p: any) => {
      if (String(p).includes("ai-parsed-plan.md")) throw new Error("ENOENT");
      return "# My Plan\nSome content without phase headers.";
    });
    const deps = makeDeps();
    registerFormPlanCommand(deps);

    const cb = vi.mocked(vscode.commands.registerCommand).mock.calls[0][1];
    await cb();

    // Should attempt to clean up partial ai-parsed-plan.md
    expect(fs.unlink).toHaveBeenCalledWith(
      expect.stringContaining("ai-parsed-plan.md"),
    );
    // 0 phases — warning shown
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("no valid phases"),
      "OK",
    );
    // onPlanFormed still called so sidebar transitions
    expect(deps.onPlanFormed).toHaveBeenCalled();
    // Result file opened in editor
    expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
  });

  it("calls onPlanFormed and writes ai-parsed-plan.md on success with phases", async () => {
    vi.mocked(aiParseLoop).mockResolvedValue({ outcome: "pass" });
    // ai-parsed-plan.md doesn't exist — falls back to PLAN.md with phase headers
    vi.mocked(fs.readFile).mockImplementation(async (p: any) => {
      if (String(p).includes("ai-parsed-plan.md")) throw new Error("ENOENT");
      return "## Phase 1: Setup\nDo setup.\n\n## Phase 2: Build\nBuild things.";
    });
    const deps = makeDeps();
    registerFormPlanCommand(deps);

    const cb = vi.mocked(vscode.commands.registerCommand).mock.calls[0][1];
    await cb();

    // Should write ai-parsed-plan.md as fallback
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("ai-parsed-plan.md"),
      expect.stringContaining("## Phase 1"),
      "utf-8",
    );
    expect(deps.onPlanFormed).toHaveBeenCalled();
  });
});
