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
  readdir: vi.fn().mockResolvedValue([]),
}));

import { createPlanInterceptWatcher, cleanupStaleTriggers } from "../../planInterceptWatcher";
import * as vscode from "vscode";
import * as fs from "node:fs/promises";

const executeCommand = vscode.commands.executeCommand as ReturnType<typeof vi.fn>;
const readFileMock = fs.readFile as ReturnType<typeof vi.fn>;
const unlinkMock = fs.unlink as ReturnType<typeof vi.fn>;
const readdirMock = fs.readdir as ReturnType<typeof vi.fn>;

const MOCK_FOLDER = { uri: { fsPath: "/workspace" } } as unknown as vscode.WorkspaceFolder;
const STALE_MS = 60_000;

function makeValidTrigger(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ uuid: "test-uuid-123", timestamp: Date.now(), ...overrides });
}

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  onDidCreateCallback = undefined;
  unlinkMock.mockResolvedValue(undefined);
  readdirMock.mockResolvedValue([]);
});

describe("createPlanInterceptWatcher", () => {
  it("creates watcher with oxveil-execute glob pattern", () => {
    createPlanInterceptWatcher("/workspace", MOCK_FOLDER);

    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledOnce();
    const pattern = (vscode.RelativePattern as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(pattern[1]).toBe(".claude/oxveil-execute-*.json");
  });

  it("returns the watcher disposable", () => {
    const disposable = createPlanInterceptWatcher("/workspace", MOCK_FOLDER);
    expect(disposable).toBeDefined();
    expect(typeof disposable.dispose).toBe("function");
  });

  it("calls oxveil.formPlan for valid trigger file", async () => {
    readFileMock.mockResolvedValue(makeValidTrigger());
    createPlanInterceptWatcher("/workspace", MOCK_FOLDER);

    onDidCreateCallback!({ fsPath: "/workspace/.claude/oxveil-execute-abc.json" });
    await flushAsync();

    expect(executeCommand).toHaveBeenCalledWith("oxveil.formPlan");
  });

  it("deletes trigger file after processing", async () => {
    readFileMock.mockResolvedValue(makeValidTrigger());
    createPlanInterceptWatcher("/workspace", MOCK_FOLDER);

    onDidCreateCallback!({ fsPath: "/workspace/.claude/oxveil-execute-abc.json" });
    await flushAsync();

    expect(unlinkMock).toHaveBeenCalledWith("/workspace/.claude/oxveil-execute-abc.json");
  });

  it("ignores trigger with no uuid", async () => {
    readFileMock.mockResolvedValue(JSON.stringify({ timestamp: Date.now() }));
    createPlanInterceptWatcher("/workspace", MOCK_FOLDER);

    onDidCreateCallback!({ fsPath: "/workspace/.claude/oxveil-execute-abc.json" });
    await flushAsync();

    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("ignores stale trigger (timestamp > 60s ago)", async () => {
    readFileMock.mockResolvedValue(
      makeValidTrigger({ timestamp: Date.now() - STALE_MS - 1 }),
    );
    createPlanInterceptWatcher("/workspace", MOCK_FOLDER);

    onDidCreateCallback!({ fsPath: "/workspace/.claude/oxveil-execute-abc.json" });
    await flushAsync();

    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("deletes stale trigger without calling formPlan", async () => {
    readFileMock.mockResolvedValue(
      makeValidTrigger({ timestamp: Date.now() - STALE_MS - 1 }),
    );
    createPlanInterceptWatcher("/workspace", MOCK_FOLDER);

    onDidCreateCallback!({ fsPath: "/workspace/.claude/oxveil-execute-abc.json" });
    await flushAsync();

    expect(unlinkMock).toHaveBeenCalledWith("/workspace/.claude/oxveil-execute-abc.json");
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("handles malformed JSON gracefully", async () => {
    readFileMock.mockResolvedValue("not valid json {{{");
    createPlanInterceptWatcher("/workspace", MOCK_FOLDER);

    onDidCreateCallback!({ fsPath: "/workspace/.claude/oxveil-execute-abc.json" });
    await flushAsync();

    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("handles readFile rejection gracefully", async () => {
    readFileMock.mockRejectedValue(new Error("ENOENT"));
    createPlanInterceptWatcher("/workspace", MOCK_FOLDER);

    onDidCreateCallback!({ fsPath: "/workspace/.claude/oxveil-execute-abc.json" });
    await flushAsync();

    expect(executeCommand).not.toHaveBeenCalled();
  });
});

describe("cleanupStaleTriggers", () => {
  it("removes stale trigger files", async () => {
    readdirMock.mockResolvedValue(["oxveil-execute-stale.json"]);
    readFileMock.mockResolvedValue(
      JSON.stringify({ timestamp: Date.now() - STALE_MS - 1 }),
    );

    await cleanupStaleTriggers("/workspace");

    expect(unlinkMock).toHaveBeenCalledWith(
      nodePath.join("/workspace", ".claude", "oxveil-execute-stale.json"),
    );
  });

  it("keeps fresh trigger files", async () => {
    readdirMock.mockResolvedValue(["oxveil-execute-fresh.json"]);
    readFileMock.mockResolvedValue(JSON.stringify({ timestamp: Date.now() }));

    await cleanupStaleTriggers("/workspace");

    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it("skips non-matching filenames", async () => {
    readdirMock.mockResolvedValue([
      "plan-intercept-request-abc.json",
      "other-file.json",
      "oxveil-execute-abc.txt",
    ]);

    await cleanupStaleTriggers("/workspace");

    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it("handles missing .claude directory gracefully", async () => {
    readdirMock.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );

    await expect(cleanupStaleTriggers("/workspace")).resolves.toBeUndefined();
    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it("removes unparseable trigger files", async () => {
    readdirMock.mockResolvedValue(["oxveil-execute-broken.json"]);
    readFileMock.mockResolvedValue("not json");

    await cleanupStaleTriggers("/workspace");

    expect(unlinkMock).toHaveBeenCalledWith(
      nodePath.join("/workspace", ".claude", "oxveil-execute-broken.json"),
    );
  });
});

describe("hook output format (resources/oxveil-plan-intercept.sh)", () => {
  const hookPath = nodePath.resolve(__dirname, "../../../resources/oxveil-plan-intercept.sh");

  function runHook(claudeProjectDir: string): string {
    return execSync(`bash "${hookPath}"`, {
      env: { ...process.env, CLAUDE_PROJECT_DIR: claudeProjectDir },
      encoding: "utf8",
    }).trim();
  }

  it("outputs allow JSON when no marker file exists", () => {
    const tmp = fsSyncModule.mkdtempSync(nodePath.join(os.tmpdir(), "oxveil-hook-test-"));
    try {
      const parsed = JSON.parse(runHook(tmp)) as Record<string, unknown>;
      expect(parsed).toEqual({ permissionDecision: "allow" });
    } finally {
      fsSyncModule.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("outputs deny hookSpecificOutput JSON when marker exists and extension responds deny", () => {
    const tmp = fsSyncModule.mkdtempSync(nodePath.join(os.tmpdir(), "oxveil-hook-test-"));
    try {
      const claudeDir = nodePath.join(tmp, ".claude");
      fsSyncModule.mkdirSync(claudeDir);
      const markerPath = nodePath.join(tmp, "oxveil-plan-active");
      fsSyncModule.writeFileSync(
        markerPath,
        JSON.stringify({ sessionId: "s1", denyCount: 0 }),
      );

      // Simulate extension: watch for request file, write deny response
      const responderScript = nodePath.join(tmp, "responder.sh");
      fsSyncModule.writeFileSync(
        responderScript,
        [
          "#!/usr/bin/env bash",
          `CLAUDEDIR="${claudeDir}"`,
          "DEADLINE=$((SECONDS + 10))",
          "while [[ $SECONDS -lt $DEADLINE ]]; do",
          '  REQ=$(ls "$CLAUDEDIR"/plan-intercept-request-*.json 2>/dev/null | head -1)',
          '  if [[ -n "$REQ" ]]; then',
          '    UUID=$(basename "$REQ" | sed "s/plan-intercept-request-//;s/\\.json//")',
          '    printf \'{"decision":"deny","reason":"critic"}\' > "$CLAUDEDIR/plan-intercept-response-$UUID.json"',
          "    exit 0",
          "  fi",
          "  sleep 0.05",
          "done",
        ].join("\n"),
        { mode: 0o755 },
      );

      const result = execSync(
        `bash -c '"${responderScript}" & bash "${hookPath}"; wait'`,
        { env: { ...process.env, CLAUDE_PROJECT_DIR: tmp, OXVEIL_PLAN_MARKER: markerPath }, encoding: "utf8" },
      ).trim();

      const parsed = JSON.parse(result) as {
        hookSpecificOutput?: {
          hookEventName?: string;
          permissionDecision?: string;
          additionalContext?: string;
        };
      };

      expect(parsed.hookSpecificOutput).toBeDefined();
      expect(parsed.hookSpecificOutput!.hookEventName).toBe("PreToolUse");
      expect(parsed.hookSpecificOutput!.permissionDecision).toBe("deny");
      expect(typeof parsed.hookSpecificOutput!.additionalContext).toBe("string");
      expect(parsed.hookSpecificOutput!.additionalContext!.length).toBeGreaterThan(0);
    } finally {
      fsSyncModule.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("outputs allow JSON when denyCount >= 5 (loop breaker)", () => {
    const tmp = fsSyncModule.mkdtempSync(nodePath.join(os.tmpdir(), "oxveil-hook-test-"));
    try {
      const markerPath = nodePath.join(tmp, "oxveil-plan-active");
      fsSyncModule.writeFileSync(
        markerPath,
        JSON.stringify({ sessionId: "s1", denyCount: 5 }),
      );

      const output = execSync(`bash "${hookPath}"`, {
        env: { ...process.env, CLAUDE_PROJECT_DIR: tmp, OXVEIL_PLAN_MARKER: markerPath },
        encoding: "utf8",
      }).trim();
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toEqual({ permissionDecision: "allow" });
    } finally {
      fsSyncModule.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
