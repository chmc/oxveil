import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node:fs before importing commands
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}));

// Mock aiParseLoop before importing commands
vi.mock("../../commands/aiParseLoop", () => ({
  aiParseLoop: vi.fn().mockResolvedValue({ outcome: "pass" }),
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
import { aiParseLoop } from "../../commands/aiParseLoop";
import { registerCommands, type CommandDeps } from "../../commands";

// Store registered command handlers for invocation in tests
const registeredCommands = new Map<string, Function>();

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
    currentFolderUri: undefined,
  };
}

function makeProcessManager(overrides: Record<string, unknown> = {}) {
  return {
    spawn: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    forceUnlock: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn().mockResolvedValue(undefined),
    aiParse: vi.fn().mockResolvedValue({ exitCode: 0 }),
    aiParseFeedback: vi.fn().mockResolvedValue({ exitCode: 0 }),
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
    gitExec: undefined,
  };
  return {
    getActiveSession: vi.fn(() => session),
    _session: session,
  };
}

function makeDeps(overrides: Partial<CommandDeps> & {
  processManager?: any;
} = {}): CommandDeps {
  const { processManager, ...rest } = overrides;
  const sm = processManager
    ? makeSessionManager({ processManager })
    : makeSessionManager();
  return {
    sessionManager: sm as any,
    installer: { isSupported: vi.fn(() => true), install: vi.fn() } as any,
    statusBar: { update: vi.fn() } as any,
    readdir: vi.fn(async () => []),
    onArchiveRefresh: vi.fn(),
    liveRunPanel: makeLiveRunPanel() as any,
    ...rest,
  };
}

describe("aiParsePlan command", () => {
  beforeEach(() => {
    registeredCommands.clear();
    vi.clearAllMocks();
    vi.mocked(aiParseLoop).mockResolvedValue({ outcome: "pass" });
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

  it("shows quick pick with 3 granularity options", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined as any);
    const deps = makeDeps();
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.aiParsePlan");
    await handler!();

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ value: "phases" }),
        expect.objectContaining({ value: "tasks" }),
        expect.objectContaining({ value: "steps" }),
      ]),
      expect.objectContaining({ placeHolder: "Select parse granularity..." }),
    );
  });

  it("calls aiParseLoop with selected granularity", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: "Steps",
      value: "steps",
    } as any);
    const pm = makeProcessManager();
    const deps = makeDeps({ processManager: pm as any });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.aiParsePlan");
    await handler!();

    expect(aiParseLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        processManager: pm,
        granularity: "steps",
      }),
    );
  });

  it("calls aiParseLoop with steps granularity", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: "Steps",
      value: "steps",
    } as any);
    const pm = makeProcessManager();
    const deps = makeDeps({ processManager: pm as any });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.aiParsePlan");
    await handler!();

    expect(aiParseLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        granularity: "steps",
      }),
    );
  });

  it("opens plan in editor on success", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: "Tasks",
      value: "tasks",
    } as any);
    vi.mocked(aiParseLoop).mockResolvedValue({ outcome: "pass" });
    const pm = makeProcessManager();
    const deps = makeDeps({ processManager: pm as any });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.aiParsePlan");
    await handler!();

    expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
    expect(vscode.window.showTextDocument).toHaveBeenCalled();
  });

  it("does not open plan when aborted", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: "Phases",
      value: "phases",
    } as any);
    vi.mocked(aiParseLoop).mockResolvedValue({ outcome: "aborted" });
    const deps = makeDeps();
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.aiParsePlan");
    await handler!();

    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
  });

  it("does nothing when quick pick is cancelled", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined as any);
    const pm = makeProcessManager();
    const deps = makeDeps({ processManager: pm as any });
    registerCommands(deps);

    const handler = registeredCommands.get("oxveil.aiParsePlan");
    await handler!();

    expect(aiParseLoop).not.toHaveBeenCalled();
  });
});
