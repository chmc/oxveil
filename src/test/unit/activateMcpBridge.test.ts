import { describe, it, expect, vi, beforeEach } from "vitest";

let configChangeHandlers: Array<(e: { affectsConfiguration: (k: string) => boolean }) => void> = [];
const registeredCommands: Record<string, (...args: unknown[]) => unknown> = {};

vi.mock("vscode", () => ({
  workspace: {
    onDidChangeConfiguration: vi.fn(
      (cb: (e: { affectsConfiguration: (k: string) => boolean }) => void) => {
        configChangeHandlers.push(cb);
        return { dispose: vi.fn() };
      },
    ),
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string) => {
        if (key === "mcpBridge") return false;
        return undefined;
      }),
    })),
  },
  commands: {
    registerCommand: vi.fn((name: string, handler: (...args: unknown[]) => unknown) => {
      registeredCommands[name] = handler;
      return { dispose: vi.fn() };
    }),
    executeCommand: vi.fn(),
  },
}));

// Controllable bridge mock
let startBridgeMock = vi.fn();
vi.mock("../../mcp/bridge", () => ({
  get startBridge() { return startBridgeMock; },
}));

import { activateMcpBridge } from "../../activateMcpBridge";
import * as vscode from "vscode";

function fireConfigChange(key: string) {
  for (const h of configChangeHandlers) {
    h({ affectsConfiguration: (k) => k === key });
  }
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    config: vscode.workspace.getConfiguration("oxveil"),
    workspaceRoot: "/workspace",
    buildFullState: vi.fn(() => ({ view: "empty" } as any)),
    sidebarPanel: {
      triggerClick: vi.fn().mockResolvedValue(undefined),
      simulateClick: vi.fn(),
    } as any,
    sidebarState: {} as any,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  configChangeHandlers = [];
  for (const key of Object.keys(registeredCommands)) delete registeredCommands[key];
  startBridgeMock = vi.fn().mockResolvedValue({ port: 7779, dispose: vi.fn() });
});

describe("activateMcpBridge", () => {
  it("returns empty array when workspaceRoot is undefined", async () => {
    const result = await activateMcpBridge(makeDeps({ workspaceRoot: undefined }) as any);
    expect(result).toEqual([]);
  });

  it("returns disposables array when workspaceRoot is set", async () => {
    const result = await activateMcpBridge(makeDeps() as any);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("does not start bridge when mcpBridge config is false", async () => {
    await activateMcpBridge(makeDeps() as any);
    expect(startBridgeMock).not.toHaveBeenCalled();
  });

  it("starts bridge when mcpBridge config is true", async () => {
    const configMock = {
      get: vi.fn((key: string) => key === "mcpBridge" ? true : undefined),
    };
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(configMock as any);

    await activateMcpBridge(makeDeps({ config: configMock }) as any);

    expect(startBridgeMock).toHaveBeenCalledTimes(1);
    expect(startBridgeMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceRoot: "/workspace" }),
    );
  });

  it("registers oxveil._simulateClick command", async () => {
    await activateMcpBridge(makeDeps() as any);
    expect(registeredCommands["oxveil._simulateClick"]).toBeDefined();
  });

  it("simulateClick calls sidebarPanel.simulateClick for valid command", async () => {
    const sidebarPanel = { triggerClick: vi.fn(), simulateClick: vi.fn() } as any;
    await activateMcpBridge(makeDeps({ sidebarPanel }) as any);

    const handler = registeredCommands["oxveil._simulateClick"] as (args: unknown) => void;
    handler({ command: "run" });

    expect(sidebarPanel.simulateClick).toHaveBeenCalledWith("run");
  });

  it("simulateClick ignores commands with non-alpha characters", async () => {
    const sidebarPanel = { triggerClick: vi.fn(), simulateClick: vi.fn() } as any;
    await activateMcpBridge(makeDeps({ sidebarPanel }) as any);

    const handler = registeredCommands["oxveil._simulateClick"] as (args: unknown) => void;
    handler({ command: "rm -rf /" });

    expect(sidebarPanel.simulateClick).not.toHaveBeenCalled();
  });

  it("watches for mcpBridge config changes", async () => {
    await activateMcpBridge(makeDeps() as any);
    expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
  });

  it("starts bridge on config change when mcpBridge becomes true", async () => {
    await activateMcpBridge(makeDeps() as any);

    // Now flip config to enabled
    const configMock = {
      get: vi.fn((key: string) => key === "mcpBridge" ? true : undefined),
    };
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(configMock as any);

    fireConfigChange("oxveil.mcpBridge");
    await Promise.resolve();

    expect(startBridgeMock).toHaveBeenCalledTimes(1);
  });

  it("does not start bridge twice on repeated config change when already running", async () => {
    const configMock = {
      get: vi.fn((key: string) => key === "mcpBridge" ? true : undefined),
    };
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(configMock as any);

    await activateMcpBridge(makeDeps({ config: configMock }) as any);
    expect(startBridgeMock).toHaveBeenCalledTimes(1);

    // Fire config change again — bridge already running, should not restart
    fireConfigChange("oxveil.mcpBridge");
    await Promise.resolve();

    expect(startBridgeMock).toHaveBeenCalledTimes(1);
  });

  it("disposes bridge handle on cleanup dispose", async () => {
    const bridgeDispose = vi.fn();
    startBridgeMock = vi.fn().mockResolvedValue({ port: 7779, dispose: bridgeDispose });
    const configMock = {
      get: vi.fn((key: string) => key === "mcpBridge" ? true : undefined),
    };
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(configMock as any);

    const disposables = await activateMcpBridge(makeDeps({ config: configMock }) as any);
    await Promise.resolve();

    // Find the cleanup disposable (last one) and call it
    const cleanupDisposable = disposables[disposables.length - 1];
    cleanupDisposable?.dispose();

    expect(bridgeDispose).toHaveBeenCalled();
  });

  it("catches and logs bridge startup errors without throwing", async () => {
    startBridgeMock = vi.fn().mockRejectedValue(new Error("port in use"));
    const configMock = {
      get: vi.fn((key: string) => key === "mcpBridge" ? true : undefined),
    };
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(configMock as any);

    await expect(
      activateMcpBridge(makeDeps({ config: configMock }) as any),
    ).resolves.toBeDefined();
  });
});
