import { describe, it, expect, vi, beforeEach } from "vitest";
import * as nodePath from "node:path";

vi.mock("vscode", () => ({
  Uri: {
    joinPath: (_uri: unknown, ...parts: string[]) => ({
      fsPath: nodePath.join("/ext", ...parts),
    }),
  },
}));

const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockRename = vi.fn().mockResolvedValue(undefined);
const mockUnlink = vi.fn().mockResolvedValue(undefined);
const mockAccess = vi.fn();

vi.mock("node:fs/promises", () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rename: (...args: unknown[]) => mockRename(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
  access: (...args: unknown[]) => mockAccess(...args),
}));

const MOCK_CACHE = "/mock-cache/oxveil";
const MOCK_HOME = "/mock-home";

vi.mock("env-paths", () => ({
  default: () => ({ cache: MOCK_CACHE }),
}));

vi.mock("node:os", () => ({
  homedir: () => MOCK_HOME,
}));

import { installPlanInterceptHook, uninstallPlanInterceptHook } from "../../planInterceptInstaller";

const HOOK_FILENAME = "oxveil-plan-intercept.sh";
const expectedDest = nodePath.join(MOCK_CACHE, HOOK_FILENAME);
const globalSettingsPath = nodePath.join(MOCK_HOME, ".claude", "settings.json");
const fakeExtUri = { fsPath: "/ext" } as any;
const fakeWorkspace = "/workspace/project";
const projectSettingsPath = nodePath.join(fakeWorkspace, ".claude", "settings.json");

beforeEach(() => {
  vi.clearAllMocks();
  mockReadFile.mockImplementation((p: string) => {
    if (p.includes("resources")) return Promise.resolve("#!/bin/bash\n");
    if (p.endsWith("settings.json")) return Promise.reject(new Error("ENOENT"));
    return Promise.reject(new Error("unexpected"));
  });
  mockUnlink.mockResolvedValue(undefined);
});

describe("installPlanInterceptHook", () => {
  it("installs script to platform cache dir", async () => {
    await installPlanInterceptHook(fakeExtUri, fakeWorkspace);
    expect(mockWriteFile).toHaveBeenCalledWith(
      expectedDest + ".tmp",
      expect.any(String),
      expect.objectContaining({ mode: 0o755 }),
    );
    expect(mockRename).toHaveBeenCalledWith(expectedDest + ".tmp", expectedDest);
  });

  it("writes hook entry to global ~/.claude/settings.json", async () => {
    await installPlanInterceptHook(fakeExtUri, fakeWorkspace);
    const settingsCall = mockWriteFile.mock.calls.find((c) => c[0] === globalSettingsPath);
    expect(settingsCall).toBeDefined();
    const settings = JSON.parse(settingsCall![1] as string) as Record<string, unknown>;
    const hooks = (settings.hooks as any).PreToolUse as unknown[];
    const entry = hooks.find((e: any) => e.matcher === "ExitPlanMode") as any;
    expect(entry.hooks[0].command).toBe(expectedDest);
  });

  it("does not write hook entry to project settings.json", async () => {
    await installPlanInterceptHook(fakeExtUri, fakeWorkspace);
    const projectWrite = mockWriteFile.mock.calls.find((c) => c[0] === projectSettingsPath);
    expect(projectWrite).toBeUndefined();
  });

  it("does not create files in project .claude/hooks/", async () => {
    await installPlanInterceptHook(fakeExtUri, fakeWorkspace);
    const writtenPaths = mockWriteFile.mock.calls.map((c) => c[0] as string);
    expect(writtenPaths.every((p) => !p.includes(".claude/hooks"))).toBe(true);
  });

  it("removes old per-project hook copy", async () => {
    await installPlanInterceptHook(fakeExtUri, fakeWorkspace);
    const oldPath = nodePath.join(fakeWorkspace, ".claude", "hooks", HOOK_FILENAME);
    expect(mockUnlink).toHaveBeenCalledWith(oldPath);
  });

  it("removes stale per-project hook entry from project settings.json", async () => {
    const projectSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "ExitPlanMode",
            hooks: [{ type: "command", command: "/old/.claude/hooks/oxveil-plan-intercept.sh" }],
          },
        ],
      },
    };
    mockReadFile.mockImplementation((p: string) => {
      if (p.includes("resources")) return Promise.resolve("#!/bin/bash\n");
      if (p === projectSettingsPath) return Promise.resolve(JSON.stringify(projectSettings));
      if (p.endsWith("settings.json")) return Promise.reject(new Error("ENOENT"));
      return Promise.reject(new Error("unexpected"));
    });

    await installPlanInterceptHook(fakeExtUri, fakeWorkspace);

    const projectWrite = mockWriteFile.mock.calls.find((c) => c[0] === projectSettingsPath);
    expect(projectWrite).toBeDefined();
    const saved = JSON.parse(projectWrite![1] as string) as Record<string, unknown>;
    const entries = ((saved.hooks as any).PreToolUse as unknown[]).filter(
      (e: any) => e.matcher === "ExitPlanMode",
    );
    expect(entries).toHaveLength(0);
  });

  it("is idempotent — does not duplicate hook entry in global settings", async () => {
    const existingGlobal = {
      hooks: {
        PreToolUse: [
          {
            matcher: "ExitPlanMode",
            hooks: [{ type: "command", command: expectedDest }],
          },
        ],
      },
    };
    mockReadFile.mockImplementation((p: string) => {
      if (p.includes("resources")) return Promise.resolve("#!/bin/bash\n");
      if (p === globalSettingsPath) return Promise.resolve(JSON.stringify(existingGlobal));
      if (p.endsWith("settings.json")) return Promise.reject(new Error("ENOENT"));
      return Promise.reject(new Error("unexpected"));
    });

    await installPlanInterceptHook(fakeExtUri, fakeWorkspace);

    const globalWrite = mockWriteFile.mock.calls.find((c) => c[0] === globalSettingsPath);
    expect(globalWrite).toBeUndefined();
  });
});

describe("uninstallPlanInterceptHook", () => {
  it("removes hook entry from global settings", async () => {
    const existingGlobal = {
      hooks: {
        PreToolUse: [
          {
            matcher: "ExitPlanMode",
            hooks: [{ type: "command", command: expectedDest }],
          },
          { matcher: "Bash", hooks: [{ type: "command", command: "other.sh" }] },
        ],
      },
    };
    mockReadFile.mockImplementation((p: string) => {
      if (p === globalSettingsPath) return Promise.resolve(JSON.stringify(existingGlobal));
      return Promise.reject(new Error("unexpected"));
    });

    await uninstallPlanInterceptHook();

    const writeCall = mockWriteFile.mock.calls.find((c) => c[0] === globalSettingsPath);
    expect(writeCall).toBeDefined();
    const saved = JSON.parse(writeCall![1] as string) as Record<string, unknown>;
    const entries = ((saved.hooks as any).PreToolUse as unknown[]).filter(
      (e: any) => e.matcher === "ExitPlanMode",
    );
    expect(entries).toHaveLength(0);
    // other hooks preserved
    const otherEntries = ((saved.hooks as any).PreToolUse as unknown[]).filter(
      (e: any) => e.matcher === "Bash",
    );
    expect(otherEntries).toHaveLength(1);
  });

  it("is a no-op when global settings absent", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    await expect(uninstallPlanInterceptHook()).resolves.toBeUndefined();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("is a no-op when hook entry absent", async () => {
    const existingGlobal = { hooks: { PreToolUse: [] } };
    mockReadFile.mockResolvedValue(JSON.stringify(existingGlobal));
    await uninstallPlanInterceptHook();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});
