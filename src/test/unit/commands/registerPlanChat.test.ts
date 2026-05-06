import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockShowErrorMessage,
  mockShowInformationMessage,
  mockCreateTerminal,
  mockRegisterCommand,
  configValues,
} = vi.hoisted(() => {
  const configValues: Record<string, unknown> = {};
  return {
    configValues,
    mockShowErrorMessage: vi.fn(),
    mockShowInformationMessage: vi.fn(),
    mockCreateTerminal: vi.fn(() => ({ show: vi.fn(), sendText: vi.fn(), dispose: vi.fn() })),
    mockRegisterCommand: vi.fn(),
  };
});

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue?: unknown) => {
        return key in configValues ? configValues[key] : defaultValue;
      }),
    })),
  },
  window: {
    showErrorMessage: mockShowErrorMessage,
    showInformationMessage: mockShowInformationMessage,
    createTerminal: mockCreateTerminal,
  },
  commands: {
    registerCommand: vi.fn((_, handler) => {
      mockRegisterCommand.mockImplementation(handler);
      return { dispose: vi.fn() };
    }),
  },
}));

vi.mock("../../../commands/planChat", () => ({
  buildSystemPrompt: vi.fn(() => "system-prompt"),
  resolveClaudeModel: vi.fn(() => undefined),
}));

import { registerPlanChatCommand, type PlanChatCommandDeps } from "../../../commands/registerPlanChat";

function makeDeps(overrides: Partial<PlanChatCommandDeps> = {}): PlanChatCommandDeps {
  return {
    claudePath: "/usr/bin/claude",
    getWorkspaceRoot: vi.fn(() => "/workspace"),
    ...overrides,
  };
}

describe("registerPlanChatCommand", () => {
  beforeEach(() => {
    for (const key of Object.keys(configValues)) delete configValues[key];
    mockShowErrorMessage.mockClear();
    mockShowInformationMessage.mockClear();
    mockCreateTerminal.mockClear();
    mockRegisterCommand.mockClear();
  });

  describe("claude provider (default)", () => {
    it("shows Claude error when claudePath is missing", async () => {
      const deps = makeDeps({ claudePath: null });
      registerPlanChatCommand(deps);
      await mockRegisterCommand();

      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Claude CLI not found"),
      );
    });

    it("shows Claude error when claudePath is undefined", async () => {
      const deps = makeDeps({ claudePath: undefined });
      registerPlanChatCommand(deps);
      await mockRegisterCommand();

      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Claude CLI not found"),
      );
    });

    it("does not show error when claudePath is set", async () => {
      const deps = makeDeps({ claudePath: "/usr/bin/claude" });
      registerPlanChatCommand(deps);
      await mockRegisterCommand();

      expect(mockShowErrorMessage).not.toHaveBeenCalled();
    });
  });

  describe("opencode provider", () => {
    beforeEach(() => {
      configValues["provider"] = "opencode";
    });

    it("shows OpenCode error when opencodePath is empty", async () => {
      configValues["opencodePath"] = "";
      const deps = makeDeps({ claudePath: null });
      registerPlanChatCommand(deps);
      await mockRegisterCommand();

      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("OpenCode path not configured"),
      );
    });

    it("does not show Claude error when opencodePath is missing", async () => {
      configValues["opencodePath"] = "";
      const deps = makeDeps({ claudePath: null });
      registerPlanChatCommand(deps);
      await mockRegisterCommand();

      expect(mockShowErrorMessage).not.toHaveBeenCalledWith(
        expect.stringContaining("Claude CLI not found"),
      );
    });

    it("does not show error when opencodePath is set", async () => {
      configValues["opencodePath"] = "/usr/local/bin/opencode";
      const deps = makeDeps({ claudePath: null });
      registerPlanChatCommand(deps);
      await mockRegisterCommand();

      expect(mockShowErrorMessage).not.toHaveBeenCalled();
    });

    it("uses opencodePath for terminal when set", async () => {
      configValues["opencodePath"] = "/usr/local/bin/opencode";
      const deps = makeDeps({ claudePath: null });
      registerPlanChatCommand(deps);
      await mockRegisterCommand();

      expect(mockCreateTerminal).toHaveBeenCalledWith(
        expect.objectContaining({ shellPath: "/usr/local/bin/opencode" }),
      );
    });
  });
});
