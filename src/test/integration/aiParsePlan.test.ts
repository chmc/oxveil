import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node:fs before importing commands
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}));

// Mock vscode before importing commands
vi.mock("vscode", () => ({
  commands: {
    registerCommand: vi.fn((id: string, handler: Function) => {
      registeredCommands.set(id, handler);
      return { dispose: vi.fn() };
    }),
    executeCommand: vi.fn(),
  },
  window: {
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
    showTextDocument: vi.fn(),
    withProgress: vi.fn((_opts: unknown, task: () => Promise<void>) => task()),
  },
  workspace: {
    openTextDocument: vi.fn(),
  },
  env: {
    openExternal: vi.fn(),
  },
  Uri: {
    file: vi.fn((p: string) => ({ fsPath: p, scheme: "file" })),
  },
  ProgressLocation: {
    Notification: 15,
  },
}));

import * as vscode from "vscode";
import * as fs from "node:fs";
import { registerCommands, type CommandDeps } from "../../commands";

// Store registered command handlers for invocation in tests
const registeredCommands = new Map<string, Function>();

function makeProcessManager(overrides: Record<string, unknown> = {}) {
  return {
    spawn: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    forceUnlock: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn().mockResolvedValue(undefined),
    aiParse: vi.fn().mockResolvedValue(undefined),
    isRunning: false,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<CommandDeps> = {}): CommandDeps {
  return {
    processManager: makeProcessManager() as any,
    installer: { isSupported: vi.fn(() => true), install: vi.fn() } as any,
    session: { status: "idle", on: vi.fn(), onLockChanged: vi.fn() } as any,
    statusBar: { update: vi.fn() } as any,
    workspaceRoot: "/workspace",
    readdir: vi.fn(async () => []),
    onArchiveRefresh: vi.fn(),
    ...overrides,
  };
}

describe("aiParsePlan command", () => {
  beforeEach(() => {
    registeredCommands.clear();
    vi.clearAllMocks();
  });

  it("shows error when PLAN.md does not exist", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const deps = makeDeps();
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.aiParsePlan");
    await handler!();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "No plan file found. Create a PLAN.md first.",
    );
  });

  it("shows quick pick with 4 granularity options", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined as any);
    const deps = makeDeps();
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.aiParsePlan");
    await handler!();

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ value: "coarse" }),
        expect.objectContaining({ value: "medium" }),
        expect.objectContaining({ value: "fine" }),
        expect.objectContaining({ value: "custom" }),
      ]),
      expect.objectContaining({ placeHolder: "Select parse granularity..." }),
    );
  });

  it("calls aiParse with selected granularity", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: "Fine — 10-20 phases",
      value: "fine",
    } as any);
    const pm = makeProcessManager();
    const deps = makeDeps({ processManager: pm as any });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.aiParsePlan");
    await handler!();

    expect(pm.aiParse).toHaveBeenCalledWith("fine");
  });

  it("prompts for custom input when Custom is selected", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: "Custom...",
      value: "custom",
    } as any);
    vi.mocked(vscode.window.showInputBox).mockResolvedValue("exactly 7 phases");
    const pm = makeProcessManager();
    const deps = makeDeps({ processManager: pm as any });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.aiParsePlan");
    await handler!();

    expect(vscode.window.showInputBox).toHaveBeenCalledWith({
      prompt: "Enter custom granularity prompt",
    });
    expect(pm.aiParse).toHaveBeenCalledWith("exactly 7 phases");
  });

  it("returns early when custom input is cancelled", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: "Custom...",
      value: "custom",
    } as any);
    vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);
    const pm = makeProcessManager();
    const deps = makeDeps({ processManager: pm as any });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.aiParsePlan");
    await handler!();

    expect(pm.aiParse).not.toHaveBeenCalled();
  });

  it("opens plan in editor on success", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: "Medium — 5-10 phases (default)",
      value: "medium",
    } as any);
    const pm = makeProcessManager();
    const deps = makeDeps({ processManager: pm as any });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.aiParsePlan");
    await handler!();

    expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
    expect(vscode.window.showTextDocument).toHaveBeenCalled();
  });

  it("shows error notification on failure", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: "Coarse — 3-5 phases",
      value: "coarse",
    } as any);
    const pm = makeProcessManager({
      aiParse: vi.fn().mockRejectedValue(new Error("parse failed")),
    });
    const deps = makeDeps({ processManager: pm as any });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.aiParsePlan");
    await handler!();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "Oxveil: Failed to parse plan — parse failed",
      "View Output",
    );
  });

  it("does nothing when quick pick is cancelled", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined as any);
    const pm = makeProcessManager();
    const deps = makeDeps({ processManager: pm as any });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.aiParsePlan");
    await handler!();

    expect(pm.aiParse).not.toHaveBeenCalled();
  });
});
