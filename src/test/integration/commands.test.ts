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

describe("archive commands integration", () => {
  beforeEach(() => {
    registeredCommands.clear();
    vi.clearAllMocks();
  });

  it("archiveRestore blocks when session is running", async () => {
    const pm = makeProcessManager({ isRunning: true });
    const deps = makeDeps({ processManager: pm as any });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.archiveRestore");
    expect(handler).toBeDefined();

    await handler!({ archiveName: "20260322-090000" });

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "Oxveil: Stop the current session first",
    );
    expect(pm.restore).not.toHaveBeenCalled();
  });

  it("archiveRestore shows confirmation dialog and restores on confirm", async () => {
    const pm = makeProcessManager({ isRunning: false });
    const deps = makeDeps({ processManager: pm as any });
    registerCommands(deps);

    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
      "Restore" as any,
    );

    const handler = registeredCommands.get("oxveil.archiveRestore");
    await handler!({ archiveName: "20260322-090000" });

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      "Restore will overwrite current session state. Continue?",
      { modal: true },
      "Restore",
    );
    expect(pm.restore).toHaveBeenCalledWith("20260322-090000");
  });

  it("archiveRestore does nothing when user cancels confirmation", async () => {
    const pm = makeProcessManager({ isRunning: false });
    const deps = makeDeps({ processManager: pm as any });
    registerCommands(deps);

    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
      undefined as any,
    );

    const handler = registeredCommands.get("oxveil.archiveRestore");
    await handler!({ archiveName: "20260322-090000" });

    expect(pm.restore).not.toHaveBeenCalled();
  });

  it("archiveRestore invokes claudeloop CLI via processManager.restore", async () => {
    const pm = makeProcessManager({ isRunning: false });
    const deps = makeDeps({ processManager: pm as any });
    registerCommands(deps);

    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
      "Restore" as any,
    );

    const handler = registeredCommands.get("oxveil.archiveRestore");
    await handler!({ archiveName: "my-archive" });

    expect(pm.restore).toHaveBeenCalledWith("my-archive");
  });

  it("archiveReplay opens replay.html in webview via replayViewer", async () => {
    const replayViewer = { reveal: vi.fn().mockResolvedValue(undefined), dispose: vi.fn() };
    const deps = makeDeps({ replayViewer: replayViewer as any });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.archiveReplay");
    await handler!({ archiveName: "20260322-090000" });

    expect(replayViewer.reveal).toHaveBeenCalledWith(
      "/workspace/.claudeloop/archive/20260322-090000/replay.html",
      "/workspace/.claudeloop",
    );
  });

  it("archiveRefresh calls onArchiveRefresh callback", () => {
    const onRefresh = vi.fn();
    const deps = makeDeps({ onArchiveRefresh: onRefresh });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.archiveRefresh");
    handler!();

    expect(onRefresh).toHaveBeenCalled();
  });
});

describe("context menu string element resolution", () => {
  beforeEach(() => {
    registeredCommands.clear();
    vi.clearAllMocks();
  });

  it("viewLog resolves string element to phaseNumber via resolver", async () => {
    const readdir = vi.fn(async () => ["phase-2.log"]);
    const deps = makeDeps({
      readdir,
      resolvePhaseItem: (el: string) =>
        el === "1" ? { phaseNumber: 2 } : undefined,
    });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.viewLog");
    await handler!("1"); // VS Code passes string element from context menu

    // Should resolve "1" → { phaseNumber: 2 } and look up logs for phase 2
    expect(readdir).toHaveBeenCalledWith(
      expect.stringContaining(".claudeloop/logs"),
    );
  });

  it("viewLog shows warning when string element has no resolver", async () => {
    const deps = makeDeps({ resolvePhaseItem: undefined });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.viewLog");
    await handler!("0");

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      "Oxveil: No phase selected",
    );
  });

  it("archiveReplay resolves string element to archiveName", async () => {
    const replayViewer = { reveal: vi.fn().mockResolvedValue(undefined), dispose: vi.fn() };
    const deps = makeDeps({
      replayViewer: replayViewer as any,
      resolveArchiveItem: (el: string) =>
        el === "0" ? { archiveName: "20260322-090000" } : undefined,
    });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.archiveReplay");
    await handler!("0");

    expect(replayViewer.reveal).toHaveBeenCalledWith(
      "/workspace/.claudeloop/archive/20260322-090000/replay.html",
      "/workspace/.claudeloop",
    );
  });

  it("archiveRestore resolves string element to archiveName", async () => {
    const pm = makeProcessManager({ isRunning: false });
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
      "Restore" as any,
    );
    const deps = makeDeps({
      processManager: pm as any,
      resolveArchiveItem: (el: string) =>
        el === "2" ? { archiveName: "my-archive" } : undefined,
    });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.archiveRestore");
    await handler!("2");

    expect(pm.restore).toHaveBeenCalledWith("my-archive");
  });

  it("viewDiff resolves string element to phaseNumber", async () => {
    const gitExec = {
      exec: vi.fn(async () => ""),
      cwd: "/workspace",
    };
    const deps = makeDeps({
      gitExec,
      resolvePhaseItem: (el: string) =>
        el === "0" ? { phaseNumber: 1 } : undefined,
    });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.viewDiff");
    await handler!("0");

    // Should resolve "0" → { phaseNumber: 1 } and try to find commits
    expect(gitExec.exec).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["--grep=^Phase 1:"]),
      "/workspace",
    );
  });
});

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
