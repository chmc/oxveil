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
