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
  window: {
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
  realpath: vi.fn(),
}));

import { createPlanInterceptWatcher } from "../../planInterceptWatcher";
import * as vscode from "vscode";
import * as fs from "node:fs/promises";

const executeCommand = vscode.commands.executeCommand as ReturnType<typeof vi.fn>;
const showErrorMessage = vscode.window.showErrorMessage as ReturnType<typeof vi.fn>;
const readFileMock = fs.readFile as ReturnType<typeof vi.fn>;
const unlinkMock = fs.unlink as ReturnType<typeof vi.fn>;
const realpathMock = fs.realpath as ReturnType<typeof vi.fn>;

const WORKSPACE = "/workspace";
const PLANS_DIR = "/workspace/.claude/plans";
const MOCK_FOLDER = { uri: { fsPath: WORKSPACE } } as unknown as vscode.WorkspaceFolder;
const TRIGGER = `${WORKSPACE}/.claude/oxveil-execute`;
const VALID_PLAN = `${PLANS_DIR}/my-plan.md`;

function makeTrigger(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ action: "formPlan", ...overrides });
}

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  onDidCreateCallback = undefined;
  unlinkMock.mockResolvedValue(undefined);
  showErrorMessage.mockResolvedValue(undefined);
});

describe("createPlanInterceptWatcher", () => {
  it("creates watcher with oxveil-execute pattern", () => {
    createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);
    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledOnce();
    const pattern = (vscode.RelativePattern as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(pattern[1]).toBe(".claude/oxveil-execute");
  });

  it("returns the watcher disposable", () => {
    const disposable = createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);
    expect(disposable).toBeDefined();
    expect(typeof disposable.dispose).toBe("function");
  });

  describe("valid planFile in sentinel", () => {
    it("calls oxveil.formPlan with the resolved filePath", async () => {
      readFileMock.mockResolvedValue(makeTrigger({ planFile: VALID_PLAN }));
      realpathMock.mockResolvedValue(VALID_PLAN);
      createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);

      onDidCreateCallback!({ fsPath: TRIGGER });
      await flushAsync();

      expect(executeCommand).toHaveBeenCalledWith("oxveil.formPlan", { filePath: VALID_PLAN });
    });

    it("trims trailing whitespace from planFile before validating", async () => {
      readFileMock.mockResolvedValue(makeTrigger({ planFile: `${VALID_PLAN}  \n` }));
      realpathMock.mockResolvedValue(VALID_PLAN);
      createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);

      onDidCreateCallback!({ fsPath: TRIGGER });
      await flushAsync();

      expect(realpathMock).toHaveBeenCalledWith(VALID_PLAN);
      expect(executeCommand).toHaveBeenCalledWith("oxveil.formPlan", { filePath: VALID_PLAN });
    });

    it("deletes trigger file on success", async () => {
      readFileMock.mockResolvedValue(makeTrigger({ planFile: VALID_PLAN }));
      realpathMock.mockResolvedValue(VALID_PLAN);
      createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);

      onDidCreateCallback!({ fsPath: TRIGGER });
      await flushAsync();

      expect(unlinkMock).toHaveBeenCalledWith(TRIGGER);
    });
  });

  describe("missing or invalid planFile in sentinel", () => {
    it("shows error when planFile is absent", async () => {
      readFileMock.mockResolvedValue(makeTrigger());
      createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);

      onDidCreateCallback!({ fsPath: TRIGGER });
      await flushAsync();

      expect(showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("Plan path missing"));
      expect(executeCommand).not.toHaveBeenCalled();
    });

    it("shows error when planFile is null", async () => {
      readFileMock.mockResolvedValue(makeTrigger({ planFile: null }));
      createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);

      onDidCreateCallback!({ fsPath: TRIGGER });
      await flushAsync();

      expect(showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("Plan path missing"));
      expect(executeCommand).not.toHaveBeenCalled();
    });

    it("shows error when planFile is empty string", async () => {
      readFileMock.mockResolvedValue(makeTrigger({ planFile: "" }));
      realpathMock.mockResolvedValue(VALID_PLAN);
      createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);

      onDidCreateCallback!({ fsPath: TRIGGER });
      await flushAsync();

      expect(showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("planFile is empty"));
      expect(executeCommand).not.toHaveBeenCalled();
    });

    it("shows error when planFile is relative path", async () => {
      readFileMock.mockResolvedValue(makeTrigger({ planFile: ".claude/plans/my-plan.md" }));
      createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);

      onDidCreateCallback!({ fsPath: TRIGGER });
      await flushAsync();

      expect(showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("absolute path"));
      expect(executeCommand).not.toHaveBeenCalled();
    });

    it("shows error when planFile resolves outside .claude/plans/", async () => {
      const outsidePath = "/workspace/.claude/other/evil.md";
      readFileMock.mockResolvedValue(makeTrigger({ planFile: outsidePath }));
      realpathMock.mockResolvedValue(outsidePath);
      createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);

      onDidCreateCallback!({ fsPath: TRIGGER });
      await flushAsync();

      expect(showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("inside .claude/plans/"));
      expect(executeCommand).not.toHaveBeenCalled();
    });

    it("shows error when planFile symlink resolves outside .claude/plans/", async () => {
      // symlink at .claude/plans/evil.md → /etc/passwd
      const symlinkPath = `${PLANS_DIR}/evil.md`;
      readFileMock.mockResolvedValue(makeTrigger({ planFile: symlinkPath }));
      realpathMock.mockResolvedValue("/etc/passwd");
      createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);

      onDidCreateCallback!({ fsPath: TRIGGER });
      await flushAsync();

      expect(showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("inside .claude/plans/"));
      expect(executeCommand).not.toHaveBeenCalled();
    });

    it("retries once on ENOENT and succeeds on second attempt", async () => {
      readFileMock.mockResolvedValue(makeTrigger({ planFile: VALID_PLAN }));
      realpathMock
        .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
        .mockResolvedValueOnce(VALID_PLAN);

      vi.useFakeTimers();
      createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);
      onDidCreateCallback!({ fsPath: TRIGGER });

      await vi.advanceTimersByTimeAsync(200);
      await flushAsync();
      vi.useRealTimers();

      expect(realpathMock).toHaveBeenCalledTimes(2);
      expect(executeCommand).toHaveBeenCalledWith("oxveil.formPlan", { filePath: VALID_PLAN });
    });

    it("shows error when planFile is inaccessible after retry", async () => {
      readFileMock.mockResolvedValue(makeTrigger({ planFile: VALID_PLAN }));
      realpathMock.mockRejectedValue(new Error("ENOENT: no such file"));

      vi.useFakeTimers();
      createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);
      onDidCreateCallback!({ fsPath: TRIGGER });

      await vi.advanceTimersByTimeAsync(200);
      await flushAsync();
      vi.useRealTimers();

      expect(showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("not accessible"));
      expect(executeCommand).not.toHaveBeenCalled();
    });
  });

  describe("sentinel ignored cases", () => {
    it("ignores trigger with wrong action", async () => {
      readFileMock.mockResolvedValue(JSON.stringify({ action: "other" }));
      createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);

      onDidCreateCallback!({ fsPath: TRIGGER });
      await flushAsync();

      expect(executeCommand).not.toHaveBeenCalled();
    });

    it("ignores trigger with no action", async () => {
      readFileMock.mockResolvedValue(JSON.stringify({}));
      createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);

      onDidCreateCallback!({ fsPath: TRIGGER });
      await flushAsync();

      expect(executeCommand).not.toHaveBeenCalled();
    });

    it("handles malformed JSON gracefully", async () => {
      readFileMock.mockResolvedValue("not valid json {{{");
      createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);

      onDidCreateCallback!({ fsPath: TRIGGER });
      await flushAsync();

      expect(executeCommand).not.toHaveBeenCalled();
    });

    it("handles readFile rejection gracefully", async () => {
      readFileMock.mockRejectedValue(new Error("ENOENT"));
      createPlanInterceptWatcher(WORKSPACE, MOCK_FOLDER);

      onDidCreateCallback!({ fsPath: TRIGGER });
      await flushAsync();

      expect(executeCommand).not.toHaveBeenCalled();
    });
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

  it("sentinel instruction includes planFile field in JSON example", () => {
    const tmp = fsSyncModule.mkdtempSync(nodePath.join(os.tmpdir(), "oxveil-hook-test-"));
    try {
      const markerPath = nodePath.join(tmp, "oxveil-plan-active");
      fsSyncModule.writeFileSync(markerPath, JSON.stringify({ sessionId: "s1", denyCount: 0 }));

      const output = execSync(`bash "${hookPath}"`, {
        env: { ...process.env, CLAUDE_PROJECT_DIR: tmp, OXVEIL_PLAN_MARKER: markerPath },
        encoding: "utf8",
      }).trim();

      const parsed = JSON.parse(output) as {
        hookSpecificOutput?: { additionalContext?: string };
      };

      expect(parsed.hookSpecificOutput?.additionalContext).toContain("planFile");
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
