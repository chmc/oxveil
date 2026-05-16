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
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, def: unknown) => def),
    })),
  },
}));

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../commands", () => ({
  registerCommands: vi.fn(() => [{ dispose: vi.fn() }]),
}));

vi.mock("../../commands/selfImprovement", () => ({
  registerSelfImprovementCommands: vi.fn(() => [{ dispose: vi.fn() }]),
}));

import { activateCommands, type ActivateCommandsDeps } from "../../activateCommands";
import { registerCommands } from "../../commands";
import { registerSelfImprovementCommands } from "../../commands/selfImprovement";

function makeDeps(overrides: Partial<ActivateCommandsDeps> = {}): ActivateCommandsDeps {
  return {
    manager: { getActiveSession: vi.fn(() => undefined) } as any,
    installer: {} as any,
    statusBar: { update: vi.fn() } as any,
    refreshArchive: vi.fn().mockResolvedValue(undefined),
    dependencyGraph: {} as any,
    executionTimeline: {} as any,
    configWizard: {} as any,
    replayViewer: {} as any,
    archiveTimelinePanel: {} as any,
    liveRunPanel: {} as any,
    planPreviewPanel: {
      setSessionActive: vi.fn(),
      setPlanFormed: vi.fn(),
    } as any,
    selfImprovementPanel: {} as any,
    claudePath: "/usr/bin/claude",
    extensionMode: 1,
    notifications: {} as any,
    sidebarState: {} as any,
    sidebarPanel: { updateState: vi.fn() } as any,
    buildFullState: vi.fn(() => ({ view: "empty" } as any)),
    sidebar: {
      onPlanChatStarted: vi.fn(),
      onPlanFormed: vi.fn(),
      onFullReset: vi.fn(),
      onAiParseStarted: vi.fn(),
      onAiParseEnded: vi.fn(),
      isAiParsing: vi.fn(() => false),
    },
    getActivePlanChatSession: vi.fn(() => undefined),
    setActivePlanChatSession: vi.fn(),
    getActiveSelfImprovementSession: vi.fn(() => undefined),
    setActiveSelfImprovementSession: vi.fn(),
    refreshSidebar: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(registeredCommands)) {
    delete registeredCommands[key];
  }
});

describe("activateCommands", () => {
  it("returns an array of disposables", () => {
    const disposables = activateCommands(makeDeps());
    expect(Array.isArray(disposables)).toBe(true);
    expect(disposables.length).toBeGreaterThan(0);
  });

  it("calls registerCommands and registerSelfImprovementCommands", () => {
    activateCommands(makeDeps());
    expect(registerCommands).toHaveBeenCalledTimes(1);
    expect(registerSelfImprovementCommands).toHaveBeenCalledTimes(1);
  });

  it("registers oxveil.refreshSidebar command", () => {
    activateCommands(makeDeps());
    expect(registeredCommands["oxveil.refreshSidebar"]).toBeDefined();
  });

  it("refreshSidebar calls deps.refreshSidebar", async () => {
    const refreshSidebar = vi.fn().mockResolvedValue(undefined);
    activateCommands(makeDeps({ refreshSidebar }));

    await registeredCommands["oxveil.refreshSidebar"]?.();

    expect(refreshSidebar).toHaveBeenCalledTimes(1);
  });

  it("refreshSidebar inflight guard prevents concurrent calls", async () => {
    let resolveFirst!: () => void;
    const firstCall = new Promise<void>((res) => { resolveFirst = res; });
    const refreshSidebar = vi.fn()
      .mockReturnValueOnce(firstCall)
      .mockResolvedValue(undefined);

    activateCommands(makeDeps({ refreshSidebar }));

    const cmd = registeredCommands["oxveil.refreshSidebar"]!;
    // Fire two concurrent calls
    void cmd();
    void cmd();

    // Second call was blocked — only one invocation so far
    expect(refreshSidebar).toHaveBeenCalledTimes(1);

    resolveFirst();
    await firstCall;
  });

  it("refreshSidebar allows second call after first resolves", async () => {
    const refreshSidebar = vi.fn().mockResolvedValue(undefined);
    activateCommands(makeDeps({ refreshSidebar }));

    const cmd = registeredCommands["oxveil.refreshSidebar"]!;
    await cmd();
    await cmd();

    expect(refreshSidebar).toHaveBeenCalledTimes(2);
  });
});
