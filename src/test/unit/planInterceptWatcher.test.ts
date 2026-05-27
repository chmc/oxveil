import { describe, it, expect, vi, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import * as nodePath from "node:path";
import * as os from "node:os";
import * as fsSyncModule from "node:fs";

let onDidCreateCallback: ((uri: { fsPath: string }) => void) | undefined;

vi.mock("vscode", () => ({
  workspace: {
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn((cb: (uri: { fsPath: string }) => void) => {
        onDidCreateCallback = cb;
        return { dispose: vi.fn() };
      }),
      dispose: vi.fn(),
    })),
  },
  RelativePattern: vi.fn((folder: unknown, pattern: string) => ({ folder, pattern })),
  commands: {
    executeCommand: vi.fn(),
  },
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

import { createPlanInterceptWatcher } from "../../planInterceptWatcher";
import * as vscode from "vscode";
import * as fs from "node:fs/promises";

const executeCommand = vscode.commands.executeCommand as ReturnType<typeof vi.fn>;
const readFileMock = fs.readFile as ReturnType<typeof vi.fn>;
const unlinkMock = fs.unlink as ReturnType<typeof vi.fn>;

const MOCK_FOLDER = { uri: { fsPath: "/workspace" } } as unknown as vscode.WorkspaceFolder;

function makeValidTrigger(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ action: "formPlan", ...overrides });
}

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  onDidCreateCallback = undefined;
  unlinkMock.mockResolvedValue(undefined);
});

describe("createPlanInterceptWatcher", () => {
  it("creates watcher with oxveil-execute pattern", () => {
    createPlanInterceptWatcher("/workspace", MOCK_FOLDER);

    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledOnce();
    const pattern = (vscode.RelativePattern as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(pattern[1]).toBe(".claude/oxveil-execute");
  });

  it("returns the watcher disposable", () => {
    const disposable = createPlanInterceptWatcher("/workspace", MOCK_FOLDER);
    expect(disposable).toBeDefined();
    expect(typeof disposable.dispose).toBe("function");
  });

  it("calls oxveil.formPlan for valid trigger file", async () => {
    readFileMock.mockResolvedValue(makeValidTrigger());
    createPlanInterceptWatcher("/workspace", MOCK_FOLDER);

    onDidCreateCallback!({ fsPath: "/workspace/.claude/oxveil-execute" });
    await flushAsync();

    expect(executeCommand).toHaveBeenCalledWith("oxveil.formPlan");
  });

  it("deletes trigger file after processing", async () => {
    readFileMock.mockResolvedValue(makeValidTrigger());
    createPlanInterceptWatcher("/workspace", MOCK_FOLDER);

    onDidCreateCallback!({ fsPath: "/workspace/.claude/oxveil-execute" });
    await flushAsync();

    expect(unlinkMock).toHaveBeenCalledWith("/workspace/.claude/oxveil-execute");
  });

  it("ignores trigger with wrong action", async () => {
    readFileMock.mockResolvedValue(JSON.stringify({ action: "other" }));
    createPlanInterceptWatcher("/workspace", MOCK_FOLDER);

    onDidCreateCallback!({ fsPath: "/workspace/.claude/oxveil-execute" });
    await flushAsync();

    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("ignores trigger with no action", async () => {
    readFileMock.mockResolvedValue(JSON.stringify({}));
    createPlanInterceptWatcher("/workspace", MOCK_FOLDER);

    onDidCreateCallback!({ fsPath: "/workspace/.claude/oxveil-execute" });
    await flushAsync();

    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("handles malformed JSON gracefully", async () => {
    readFileMock.mockResolvedValue("not valid json {{{");
    createPlanInterceptWatcher("/workspace", MOCK_FOLDER);

    onDidCreateCallback!({ fsPath: "/workspace/.claude/oxveil-execute" });
    await flushAsync();

    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("handles readFile rejection gracefully", async () => {
    readFileMock.mockRejectedValue(new Error("ENOENT"));
    createPlanInterceptWatcher("/workspace", MOCK_FOLDER);

    onDidCreateCallback!({ fsPath: "/workspace/.claude/oxveil-execute" });
    await flushAsync();

    expect(executeCommand).not.toHaveBeenCalled();
  });
});

describe("hook output format (resources/oxveil-plan-intercept.sh)", () => {
  const hookPath = nodePath.resolve(__dirname, "../../../resources/oxveil-plan-intercept.sh");

  it("outputs allow JSON when no marker env var set", () => {
    const tmp = fsSyncModule.mkdtempSync(nodePath.join(os.tmpdir(), "oxveil-hook-test-"));
    try {
      const { OXVEIL_PLAN_MARKER: _drop, ...baseEnv } = process.env as Record<string, string>;
      const output = execSync(`bash "${hookPath}"`, {
        env: { ...baseEnv, CLAUDE_PROJECT_DIR: tmp },
        encoding: "utf8",
      }).trim();
      expect(JSON.parse(output)).toEqual({ permissionDecision: "allow" });
    } finally {
      fsSyncModule.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("outputs allow JSON when marker file does not exist", () => {
    const tmp = fsSyncModule.mkdtempSync(nodePath.join(os.tmpdir(), "oxveil-hook-test-"));
    try {
      const output = execSync(`bash "${hookPath}"`, {
        env: { ...process.env, CLAUDE_PROJECT_DIR: tmp, OXVEIL_PLAN_MARKER: "/nonexistent/marker" },
        encoding: "utf8",
      }).trim();
      expect(JSON.parse(output)).toEqual({ permissionDecision: "allow" });
    } finally {
      fsSyncModule.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("outputs deny with AskUserQuestion instruction when marker exists", () => {
    const tmp = fsSyncModule.mkdtempSync(nodePath.join(os.tmpdir(), "oxveil-hook-test-"));
    try {
      const markerPath = nodePath.join(tmp, "oxveil-plan-active");
      fsSyncModule.writeFileSync(markerPath, JSON.stringify({ sessionId: "s1", denyCount: 0 }));

      const output = execSync(`bash "${hookPath}"`, {
        env: { ...process.env, CLAUDE_PROJECT_DIR: tmp, OXVEIL_PLAN_MARKER: markerPath },
        encoding: "utf8",
      }).trim();

      const parsed = JSON.parse(output) as {
        hookSpecificOutput?: {
          hookEventName?: string;
          permissionDecision?: string;
          additionalContext?: string;
        };
      };

      expect(parsed.hookSpecificOutput?.hookEventName).toBe("PreToolUse");
      expect(parsed.hookSpecificOutput?.permissionDecision).toBe("deny");
      expect(parsed.hookSpecificOutput?.additionalContext).toContain("AskUserQuestion");
    } finally {
      fsSyncModule.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("outputs allow JSON when denyCount >= 5 (loop breaker)", () => {
    const tmp = fsSyncModule.mkdtempSync(nodePath.join(os.tmpdir(), "oxveil-hook-test-"));
    try {
      const markerPath = nodePath.join(tmp, "oxveil-plan-active");
      fsSyncModule.writeFileSync(markerPath, JSON.stringify({ sessionId: "s1", denyCount: 5 }));

      const output = execSync(`bash "${hookPath}"`, {
        env: { ...process.env, CLAUDE_PROJECT_DIR: tmp, OXVEIL_PLAN_MARKER: markerPath },
        encoding: "utf8",
      }).trim();
      expect(JSON.parse(output)).toEqual({ permissionDecision: "allow" });
    } finally {
      fsSyncModule.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
