import { describe, it, expect, vi, beforeEach } from "vitest";

const registeredCommands: Record<string, (...args: unknown[]) => unknown> = {};

vi.mock("vscode", () => ({
  commands: {
    registerCommand: vi.fn((name: string, handler: (...args: unknown[]) => unknown) => {
      registeredCommands[name] = handler;
      return { dispose: vi.fn() };
    }),
    executeCommand: vi.fn(),
  },
  window: {
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showQuickPick: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, def: unknown) => def),
      update: vi.fn(),
    })),
    openTextDocument: vi.fn(),
  },
  ConfigurationTarget: { Workspace: 2 },
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));

vi.mock("../../../commands/createPlan", () => ({
  registerCreatePlanCommand: vi.fn(() => ({ dispose: vi.fn() })),
}));
vi.mock("../../../commands/archive", () => ({
  registerArchiveCommands: vi.fn(() => []),
}));
vi.mock("../../../commands/phaseOps", () => ({
  registerPhaseCommands: vi.fn(() => []),
}));
vi.mock("../../../commands/registerPlanChat", () => ({
  registerPlanChatCommand: vi.fn(() => ({ dispose: vi.fn() })),
}));
vi.mock("../../../commands/formPlan", () => ({
  registerFormPlanCommand: vi.fn(() => ({ dispose: vi.fn() })),
}));
vi.mock("../../../commands/planLifecycle", () => ({
  registerPlanLifecycleCommands: vi.fn(() => []),
}));
vi.mock("../../../views/folderPicker", () => ({
  pickWorkspaceFolder: vi.fn(),
}));

import { registerCommands, type CommandDeps } from "../../../commands";

function makeDeps(overrides: Partial<CommandDeps> = {}): CommandDeps {
  return {
    sessionManager: {
      getActiveSession: vi.fn(() => undefined),
      getAllSessions: vi.fn(() => []),
    } as any,
    installer: { isSupported: vi.fn(() => true), install: vi.fn() } as any,
    statusBar: { update: vi.fn() } as any,
    readdir: vi.fn().mockResolvedValue([]),
    liveRunPanel: { triggerAiParseAction: vi.fn() } as any,
    ...overrides,
  };
}

describe("oxveil.confirmPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(registeredCommands).forEach((k) => delete registeredCommands[k]);
  });

  it("registers oxveil.confirmPlan command", () => {
    registerCommands(makeDeps());
    expect(registeredCommands["oxveil.confirmPlan"]).toBeDefined();
  });

  it("calls triggerAiParseAction('ai-parse-continue') when invoked", () => {
    const liveRunPanel = { triggerAiParseAction: vi.fn() };
    registerCommands(makeDeps({ liveRunPanel: liveRunPanel as any }));
    registeredCommands["oxveil.confirmPlan"]();
    expect(liveRunPanel.triggerAiParseAction).toHaveBeenCalledWith("ai-parse-continue");
  });

  it("is a no-op when liveRunPanel is undefined", () => {
    registerCommands(makeDeps({ liveRunPanel: undefined }));
    expect(() => registeredCommands["oxveil.confirmPlan"]()).not.toThrow();
  });
});
