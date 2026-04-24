import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node:fs/promises for fullReset tests
vi.mock("node:fs/promises", () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  rm: vi.fn().mockResolvedValue(undefined),
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
    workspaceFolders: undefined,
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
import * as fs from "node:fs/promises";
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

function makeSessionManager(overrides: {
  processManager?: any;
  workspaceRoot?: string;
} = {}) {
  const pm = overrides.processManager ?? makeProcessManager();
  const session = {
    processManager: pm,
    sessionState: { status: "idle", on: vi.fn(), onLockChanged: vi.fn(), progress: null },
    workspaceRoot: overrides.workspaceRoot ?? "/workspace",
  };
  return {
    getActiveSession: vi.fn(() => session),
    _session: session,
  };
}

function makeDeps(overrides: Partial<CommandDeps> & {
  processManager?: any;
  workspaceRoot?: string;
} = {}): CommandDeps {
  const { processManager, workspaceRoot, ...rest } = overrides;
  const sm = (processManager || workspaceRoot)
    ? makeSessionManager({ processManager, workspaceRoot })
    : makeSessionManager();
  return {
    sessionManager: sm as any,
    installer: { isSupported: vi.fn(() => true), install: vi.fn() } as any,
    statusBar: { update: vi.fn() } as any,
    readdir: vi.fn(async () => []),
    onArchiveRefresh: vi.fn(),
    ...rest,
  };
}

describe("fullReset command", () => {
  beforeEach(() => {
    registeredCommands.clear();
    vi.clearAllMocks();
  });

  it("shows warning when no workspace is open", async () => {
    const sm = {
      getActiveSession: vi.fn(() => undefined),
    };
    const deps = makeDeps();
    // Override sessionManager to return no active session
    (deps.sessionManager as any) = sm;
    // Clear workspace folders
    (vscode.workspace as any).workspaceFolders = undefined;
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.fullReset");
    await handler!();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      "Oxveil: No workspace open",
    );
  });

  it("shows confirmation dialog and does nothing on cancel", async () => {
    const pm = makeProcessManager({ isRunning: false });
    const onFullReset = vi.fn();
    const deps = makeDeps({ processManager: pm as any, onFullReset });
    registerCommands(deps);

    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined as any);

    const handler = registeredCommands.get("oxveil.fullReset");
    await handler!();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      "This will delete PLAN.md and clear all session state. This cannot be undone.",
      { modal: true },
      "Reset",
    );
    expect(onFullReset).not.toHaveBeenCalled();
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it("stops running process when confirmed", async () => {
    const pm = makeProcessManager({ isRunning: true });
    const onFullReset = vi.fn();
    const deps = makeDeps({ processManager: pm as any, onFullReset });
    registerCommands(deps);

    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Reset" as any);

    const handler = registeredCommands.get("oxveil.fullReset");
    await handler!();

    expect(pm.stop).toHaveBeenCalled();
  });

  it("deletes PLAN.md and ai-parsed-plan.md when confirmed", async () => {
    const pm = makeProcessManager({ isRunning: false });
    const onFullReset = vi.fn();
    const deps = makeDeps({ processManager: pm as any, onFullReset });
    registerCommands(deps);

    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Reset" as any);
    vi.mocked(fs.readdir).mockResolvedValue([]);

    const handler = registeredCommands.get("oxveil.fullReset");
    await handler!();

    expect(fs.unlink).toHaveBeenCalledWith("/workspace/PLAN.md");
    expect(fs.unlink).toHaveBeenCalledWith("/workspace/.claudeloop/ai-parsed-plan.md");
  });

  it("deletes .claudeloop contents except archive directory", async () => {
    const pm = makeProcessManager({ isRunning: false });
    const onFullReset = vi.fn();
    const deps = makeDeps({ processManager: pm as any, onFullReset });
    registerCommands(deps);

    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Reset" as any);

    // Mock readdir to return mixed entries
    const mockEntries = [
      { name: "archive", isDirectory: () => true },
      { name: "logs", isDirectory: () => true },
      { name: "progress.json", isDirectory: () => false },
      { name: "replay.html", isDirectory: () => false },
    ];
    vi.mocked(fs.readdir).mockResolvedValue(mockEntries as any);

    const handler = registeredCommands.get("oxveil.fullReset");
    await handler!();

    // Should NOT delete archive
    expect(fs.rm).not.toHaveBeenCalledWith(
      "/workspace/.claudeloop/archive",
      expect.anything(),
    );

    // Should delete logs directory recursively
    expect(fs.rm).toHaveBeenCalledWith(
      "/workspace/.claudeloop/logs",
      { recursive: true },
    );

    // Should delete individual files
    expect(fs.unlink).toHaveBeenCalledWith("/workspace/.claudeloop/progress.json");
    expect(fs.unlink).toHaveBeenCalledWith("/workspace/.claudeloop/replay.html");
  });

  it("calls onFullReset callback when confirmed", async () => {
    const pm = makeProcessManager({ isRunning: false });
    const onFullReset = vi.fn();
    const deps = makeDeps({ processManager: pm as any, onFullReset });
    registerCommands(deps);

    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Reset" as any);
    vi.mocked(fs.readdir).mockResolvedValue([]);

    const handler = registeredCommands.get("oxveil.fullReset");
    await handler!();

    expect(onFullReset).toHaveBeenCalled();
  });

  it("handles missing files gracefully", async () => {
    const pm = makeProcessManager({ isRunning: false });
    const onFullReset = vi.fn();
    const deps = makeDeps({ processManager: pm as any, onFullReset });
    registerCommands(deps);

    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Reset" as any);
    // Simulate PLAN.md not existing
    vi.mocked(fs.unlink).mockRejectedValueOnce(new Error("ENOENT"));
    // Simulate ai-parsed-plan.md not existing
    vi.mocked(fs.unlink).mockRejectedValueOnce(new Error("ENOENT"));
    // Simulate .claudeloop not existing
    vi.mocked(fs.readdir).mockRejectedValue(new Error("ENOENT"));

    const handler = registeredCommands.get("oxveil.fullReset");
    // Should not throw
    await expect(handler!()).resolves.not.toThrow();

    // Callback should still be called
    expect(onFullReset).toHaveBeenCalled();
  });
});
