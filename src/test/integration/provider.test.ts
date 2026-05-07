import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConfigData: Record<string, unknown> = { provider: "claude" };
const mockConfigObj = {
  get: vi.fn((key: string, def?: unknown) => mockConfigData[key] ?? def),
  update: vi.fn(async (key: string, value: unknown) => { mockConfigData[key] = value; }),
};

vi.mock("vscode", () => ({
  commands: {
    registerCommand: vi.fn((id: string, handler: Function) => {
      registeredCommands.set(id, handler);
      return { dispose: vi.fn() };
    }),
    getCommands: vi.fn(async () => Array.from(registeredCommands.keys())),
  },
  window: {
    showQuickPick: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => mockConfigObj),
  },
  ConfigurationTarget: { Workspace: 1 },
}));

import * as vscode from "vscode";
import { registerCommands, type CommandDeps } from "../../commands";

const registeredCommands = new Map<string, Function>();

function makeMinimalDeps(): CommandDeps {
  const session = {
    sessionState: { status: "idle", progress: undefined, on: vi.fn() },
    processManager: null,
  };
  const manager = {
    getActiveSession: vi.fn(() => session),
    getSessions: vi.fn(() => []),
  };
  return {
    sessionManager: manager as any,
    statusBar: { update: vi.fn(), dispose: vi.fn() } as any,
    liveRunPanel: null as any,
    planPreviewPanel: null,
    configWizard: null,
    dependencyGraph: null,
    executionTimeline: null,
    notificationManager: { reset: vi.fn() } as any,
    installer: null as any,
    onPlanFormed: vi.fn(),
    onFullReset: vi.fn(),
    onAiParseStarted: vi.fn(),
    onAiParseEnded: vi.fn(),
    isAiParsing: vi.fn(() => false),
  };
}

describe("provider command registration", () => {
  beforeEach(() => {
    registeredCommands.clear();
    vi.clearAllMocks();
  });

  it("registers oxveil.switchProvider command", () => {
    registerCommands(makeMinimalDeps());
    expect(registeredCommands.has("oxveil.switchProvider")).toBe(true);
  });

  it("switchProvider shows quick pick with Claude and OpenCode options", async () => {
    registerCommands(makeMinimalDeps());
    const handler = registeredCommands.get("oxveil.switchProvider")!;
    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);

    await handler();

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ label: "Claude" }),
        expect.objectContaining({ label: "OpenCode" }),
      ]),
      expect.objectContaining({ placeHolder: "Select AI provider" }),
    );
  });

  it("switchProvider updates config when user picks different provider", async () => {
    registerCommands(makeMinimalDeps());
    const handler = registeredCommands.get("oxveil.switchProvider")!;
    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({ label: "OpenCode", value: "opencode", description: "" } as any);

    await handler();

    const cfg = vscode.workspace.getConfiguration("oxveil");
    expect(cfg.update).toHaveBeenCalledWith("provider", "opencode", 1);
  });

  it("switchProvider does nothing when user cancels", async () => {
    registerCommands(makeMinimalDeps());
    const handler = registeredCommands.get("oxveil.switchProvider")!;
    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);

    await handler();

    const cfg = vscode.workspace.getConfiguration("oxveil");
    expect(cfg.update).not.toHaveBeenCalled();
  });
});
