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
  gitExec?: any;
} = {}) {
  const pm = overrides.processManager ?? makeProcessManager();
  const session = {
    processManager: pm,
    sessionState: { status: "idle", on: vi.fn(), onLockChanged: vi.fn(), progress: null },
    workspaceRoot: overrides.workspaceRoot ?? "/workspace",
    gitExec: overrides.gitExec,
  };
  return {
    getActiveSession: vi.fn(() => session),
    _session: session,
  };
}

function makeDeps(overrides: Partial<CommandDeps> & {
  processManager?: any;
  gitExec?: any;
  workspaceRoot?: string;
} = {}): CommandDeps {
  const { processManager, gitExec, workspaceRoot, ...rest } = overrides;
  const sm = (processManager || gitExec || workspaceRoot)
    ? makeSessionManager({ processManager, gitExec, workspaceRoot })
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

describe("sidebar-driven command arguments", () => {
  beforeEach(() => {
    registeredCommands.clear();
    vi.clearAllMocks();
  });

  it("viewLog receives phaseNumber directly from sidebar", async () => {
    const readdir = vi.fn(async () => ["phase-2.log"]);
    const deps = makeDeps({ readdir });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.viewLog");
    await handler!({ phaseNumber: 2 });

    expect(readdir).toHaveBeenCalledWith(
      expect.stringContaining(".claudeloop/logs"),
    );
  });

  it("viewLog shows warning when no phaseNumber provided", async () => {
    const deps = makeDeps();
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.viewLog");
    await handler!();

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

  it("viewDiff receives phaseNumber directly from sidebar", async () => {
    const gitExec = {
      exec: vi.fn(async () => ""),
      cwd: "/workspace",
    };
    const deps = makeDeps({ gitExec });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.viewDiff");
    await handler!({ phaseNumber: 1 });

    expect(gitExec.exec).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["--grep=^Phase 1:"]),
      "/workspace",
    );
  });
});

