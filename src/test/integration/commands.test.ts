import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock vscode before importing commands
vi.mock("vscode", () => ({
  commands: {
    registerCommand: vi.fn((id: string, handler: Function) => {
      registeredCommands.set(id, handler);
      return { dispose: vi.fn() };
    }),
  },
  window: {
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showQuickPick: vi.fn(),
    showTextDocument: vi.fn(),
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
}));

import * as vscode from "vscode";
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

  it("archiveReplay opens replay.html via openExternal", async () => {
    const deps = makeDeps();
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.archiveReplay");
    await handler!({ archiveName: "20260322-090000" });

    expect(vscode.Uri.file).toHaveBeenCalledWith(
      "/workspace/.claudeloop/archive/20260322-090000/replay.html",
    );
    expect(vscode.env.openExternal).toHaveBeenCalled();
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
    const deps = makeDeps({
      resolveArchiveItem: (el: string) =>
        el === "0" ? { archiveName: "20260322-090000" } : undefined,
    });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.archiveReplay");
    await handler!("0");

    expect(vscode.Uri.file).toHaveBeenCalledWith(
      "/workspace/.claudeloop/archive/20260322-090000/replay.html",
    );
    expect(vscode.env.openExternal).toHaveBeenCalled();
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
