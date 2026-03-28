import { describe, it, expect, vi, beforeEach } from "vitest";

// Track setContext calls
const setContextCalls: Array<{ key: string; value: unknown }> = [];

vi.mock("vscode", () => ({
  commands: {
    registerCommand: vi.fn((id: string, handler: Function) => {
      registeredCommands.set(id, handler);
      return { dispose: vi.fn() };
    }),
    executeCommand: vi.fn((command: string, ...args: unknown[]) => {
      if (command === "setContext") {
        setContextCalls.push({ key: args[0] as string, value: args[1] });
      }
      return Promise.resolve();
    }),
  },
  window: {
    showWarningMessage: vi.fn(),
    showTextDocument: vi.fn(),
  },
  workspace: {
    openTextDocument: vi.fn(),
  },
  Uri: {
    file: vi.fn((p: string) => ({ fsPath: p, scheme: "file" })),
  },
}));

vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  writeFile: vi.fn(),
}));

import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import { registerCommands, type CommandDeps } from "../../../commands";
import { SessionState } from "../../../core/sessionState";
import { wireSessionEvents, type SessionWiringDeps } from "../../../sessionWiring";

const registeredCommands = new Map<string, Function>();

function makeDeps(overrides: Partial<CommandDeps> = {}): CommandDeps {
  return {
    processManager: undefined,
    installer: { isSupported: vi.fn(() => true), install: vi.fn() } as any,
    session: { status: "idle", on: vi.fn(), onLockChanged: vi.fn() } as any,
    statusBar: { update: vi.fn() } as any,
    workspaceRoot: "/workspace",
    readdir: vi.fn(async () => []),
    ...overrides,
  };
}

describe("walkthrough step completion", () => {
  beforeEach(() => {
    registeredCommands.clear();
    setContextCalls.length = 0;
    vi.clearAllMocks();
  });

  describe("step 2: configure", () => {
    it("sets oxveil.walkthrough.configured when openConfigWizard is invoked", () => {
      const configWizard = { reveal: vi.fn() } as any;
      registerCommands(makeDeps({ configWizard }));

      const handler = registeredCommands.get("oxveil.openConfigWizard");
      expect(handler).toBeDefined();
      handler!();

      const ctx = setContextCalls.find(
        (c) => c.key === "oxveil.walkthrough.configured",
      );
      expect(ctx).toBeDefined();
      expect(ctx!.value).toBe(true);
    });

    it("does not set context when no workspace is open", () => {
      registerCommands(makeDeps({ workspaceRoot: undefined }));

      const handler = registeredCommands.get("oxveil.openConfigWizard");
      handler!();

      const ctx = setContextCalls.find(
        (c) => c.key === "oxveil.walkthrough.configured",
      );
      expect(ctx).toBeUndefined();
    });
  });

  describe("step 3: create plan", () => {
    it("sets oxveil.walkthrough.hasPlan when createPlan command creates a new file", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({} as any);

      registerCommands(makeDeps());

      const handler = registeredCommands.get("oxveil.createPlan");
      expect(handler).toBeDefined();
      await handler!();

      const ctx = setContextCalls.find(
        (c) => c.key === "oxveil.walkthrough.hasPlan",
      );
      expect(ctx).toBeDefined();
      expect(ctx!.value).toBe(true);
    });
  });

  describe("step 4: run session", () => {
    it("sets oxveil.walkthrough.hasRun when session transitions to done", () => {
      const session = new SessionState();
      const wiringDeps: SessionWiringDeps = {
        session,
        statusBar: { update: vi.fn() } as any,
        phaseTree: { update: vi.fn() } as any,
        onDidChangeTreeData: { fire: vi.fn() } as any,
        outputManager: { onLogAppended: vi.fn() } as any,
        notifications: { onPhasesChanged: vi.fn() } as any,
        elapsedTimer: {
          start: vi.fn(),
          stop: vi.fn(),
          elapsed: 0,
        } as any,
      };

      wireSessionEvents(wiringDeps);

      // Transition: idle → running (lock acquired)
      session.onLockChanged({ locked: true });
      // Provide completed progress so lock release transitions to done
      session.onProgressChanged({
        phases: [{ number: 1, title: "Setup", status: "completed", attempts: 1 }],
        totalPhases: 1,
        currentPhaseIndex: undefined,
      });
      setContextCalls.length = 0; // clear running context changes

      // Transition: running → done (lock released, all phases completed)
      session.onLockChanged({ locked: false });

      const ctx = setContextCalls.find(
        (c) => c.key === "oxveil.walkthrough.hasRun",
      );
      expect(ctx).toBeDefined();
      expect(ctx!.value).toBe(true);
    });

    it("does not set hasRun on failed state", () => {
      const session = new SessionState();
      const wiringDeps: SessionWiringDeps = {
        session,
        statusBar: { update: vi.fn() } as any,
        phaseTree: { update: vi.fn() } as any,
        onDidChangeTreeData: { fire: vi.fn() } as any,
        outputManager: { onLogAppended: vi.fn() } as any,
        notifications: { onPhasesChanged: vi.fn() } as any,
        elapsedTimer: {
          start: vi.fn(),
          stop: vi.fn(),
          elapsed: 0,
        } as any,
      };

      wireSessionEvents(wiringDeps);

      // Transition: idle → running
      session.onLockChanged({ locked: true });
      // Provide failed progress
      session.onProgressChanged({
        phases: [{ number: 1, title: "Setup", status: "failed", attempts: 1 }],
        totalPhases: 1,
        currentPhaseIndex: undefined,
      });
      setContextCalls.length = 0;

      // Transition: running → failed (lock released, phase failed)
      session.onLockChanged({ locked: false });

      const ctx = setContextCalls.find(
        (c) => c.key === "oxveil.walkthrough.hasRun",
      );
      expect(ctx).toBeUndefined();
    });
  });
});
