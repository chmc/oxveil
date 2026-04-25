import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerSelfImprovementCommands, type SelfImprovementCommandDeps } from "../../../commands/selfImprovement";
import type { SelfImprovementPanel } from "../../../views/selfImprovementPanel";
import type { SidebarMutableState } from "../../../activateSidebar";
import type { SelfImprovementSession } from "../../../core/selfImprovementSession";
import type { Lesson } from "../../../types";

// Mock VS Code
vi.mock("vscode", () => ({
  commands: {
    registerCommand: vi.fn((id: string, handler: Function) => ({
      id,
      handler,
      dispose: vi.fn(),
    })),
  },
  window: {
    createTerminal: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  },
  TerminalOptions: {},
}));

describe("registerSelfImprovementCommands", () => {
  let deps: SelfImprovementCommandDeps;
  let mockPanel: Partial<SelfImprovementPanel>;
  let mockMutableState: SidebarMutableState;
  let mockSession: Partial<SelfImprovementSession>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPanel = {
      currentLessons: [],
      close: vi.fn(),
    };

    mockMutableState = {
      detectionStatus: "detected",
      planDetected: false,
      planUserChoice: "none",
      cachedPlanPhases: [],
      cost: 0,
      todoDone: 0,
      todoTotal: 0,
      selfImprovementActive: true,
    };

    mockSession = {
      isActive: vi.fn().mockReturnValue(false),
      focusTerminal: vi.fn(),
    };

    deps = {
      claudePath: "/usr/bin/claude",
      extensionMode: 1, // Production
      getSelfImprovementPanel: () => mockPanel as SelfImprovementPanel,
      getMutableState: () => mockMutableState,
      refreshSidebar: vi.fn(),
      getActiveSelfImprovementSession: () => undefined,
      onSelfImprovementSessionCreated: vi.fn(),
    };
  });

  it("registers start, skip, and focus commands", async () => {
    const vscode = await import("vscode");
    const disposables = registerSelfImprovementCommands(deps);

    expect(disposables).toHaveLength(3);
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      "oxveil.selfImprovement.start",
      expect.any(Function),
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      "oxveil.selfImprovement.skip",
      expect.any(Function),
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      "oxveil.selfImprovement.focus",
      expect.any(Function),
    );
  });

  describe("oxveil.selfImprovement.start", () => {
    it("shows error when claude path is not set", async () => {
      const vscode = await import("vscode");
      deps.claudePath = null;
      registerSelfImprovementCommands(deps);

      const startCall = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: [string, Function]) => call[0] === "oxveil.selfImprovement.start"
      );
      startCall[1](); // Execute the handler

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Claude CLI not found"),
      );
    });

    it("shows warning when no lessons are captured", async () => {
      const vscode = await import("vscode");
      mockPanel.currentLessons = [];
      registerSelfImprovementCommands(deps);

      const startCall = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: [string, Function]) => call[0] === "oxveil.selfImprovement.start"
      );
      startCall[1](); // Execute the handler

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining("No lessons captured"),
      );
    });

    it("focuses existing session if already active", async () => {
      const vscode = await import("vscode");
      const activeSession = {
        isActive: vi.fn().mockReturnValue(true),
        focusTerminal: vi.fn(),
      };
      deps.getActiveSelfImprovementSession = () => activeSession as unknown as SelfImprovementSession;
      mockPanel.currentLessons = [
        { phase: 1, title: "Test", retries: 0, duration: 10, exit: "success" as const },
      ];

      registerSelfImprovementCommands(deps);

      const startCall = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: [string, Function]) => call[0] === "oxveil.selfImprovement.start"
      );
      startCall[1](); // Execute the handler

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Self-improvement session already active",
      );
      expect(activeSession.focusTerminal).toHaveBeenCalled();
    });
  });

  describe("oxveil.selfImprovement.skip", () => {
    it("sets selfImprovementActive to false", async () => {
      const vscode = await import("vscode");
      registerSelfImprovementCommands(deps);

      const skipCall = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: [string, Function]) => call[0] === "oxveil.selfImprovement.skip"
      );
      skipCall[1](); // Execute the handler

      expect(mockMutableState.selfImprovementActive).toBe(false);
    });

    it("closes the panel", async () => {
      const vscode = await import("vscode");
      registerSelfImprovementCommands(deps);

      const skipCall = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: [string, Function]) => call[0] === "oxveil.selfImprovement.skip"
      );
      skipCall[1](); // Execute the handler

      expect(mockPanel.close).toHaveBeenCalled();
    });

    it("refreshes the sidebar", async () => {
      const vscode = await import("vscode");
      registerSelfImprovementCommands(deps);

      const skipCall = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: [string, Function]) => call[0] === "oxveil.selfImprovement.skip"
      );
      skipCall[1](); // Execute the handler

      expect(deps.refreshSidebar).toHaveBeenCalled();
    });
  });

  describe("oxveil.selfImprovement.focus", () => {
    it("reveals panel if visible", async () => {
      const vscode = await import("vscode");
      const mockPanelInner = {
        reveal: vi.fn(),
      };
      mockPanel.visible = true;
      mockPanel.panel = mockPanelInner as any;
      registerSelfImprovementCommands(deps);

      const focusCall = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: [string, Function]) => call[0] === "oxveil.selfImprovement.focus"
      );
      focusCall[1](); // Execute the handler

      expect(mockPanelInner.reveal).toHaveBeenCalled();
    });

    it("shows warning when panel not visible", async () => {
      const vscode = await import("vscode");
      mockPanel.visible = false;
      registerSelfImprovementCommands(deps);

      const focusCall = (vscode.commands.registerCommand as any).mock.calls.find(
        (call: [string, Function]) => call[0] === "oxveil.selfImprovement.focus"
      );
      focusCall[1](); // Execute the handler

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining("No self-improvement session active"),
      );
    });
  });
});
