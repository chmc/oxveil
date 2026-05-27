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

vi.mock("env-paths", () => ({
  default: () => ({ cache: MOCK_CACHE }),
}));

import { installPlanInterceptHook } from "../../planInterceptInstaller";

const HOOK_FILENAME = "oxveil-plan-intercept.sh";
const expectedDest = nodePath.join(MOCK_CACHE, HOOK_FILENAME);
const fakeExtUri = { fsPath: "/ext" } as any;
const fakeWorkspace = "/workspace/project";

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

  it("hook command uses absolute cache path", async () => {
    await installPlanInterceptHook(fakeExtUri, fakeWorkspace);
    const settingsCall = mockWriteFile.mock.calls.find((c) =>
      (c[0] as string).endsWith("settings.json"),
    );
    expect(settingsCall).toBeDefined();
    const settings = JSON.parse(settingsCall![1] as string) as Record<string, unknown>;
    const hooks = (settings.hooks as any).PreToolUse as unknown[];
    const entry = hooks.find((e: any) => e.matcher === "ExitPlanMode") as any;
    expect(entry.hooks[0].command).toBe(expectedDest);
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

  it("migrates stale per-project command in existing settings.json", async () => {
    const staleSettings = {
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
      if (p.endsWith("settings.json")) return Promise.resolve(JSON.stringify(staleSettings));
      return Promise.reject(new Error("unexpected"));
    });

    await installPlanInterceptHook(fakeExtUri, fakeWorkspace);

    const settingsCall = mockWriteFile.mock.calls.find((c) =>
      (c[0] as string).endsWith("settings.json"),
    );
    expect(settingsCall).toBeDefined();
    const settings = JSON.parse(settingsCall![1] as string) as Record<string, unknown>;
    const hooks = (settings.hooks as any).PreToolUse as unknown[];
    const entries = hooks.filter((e: any) => e.matcher === "ExitPlanMode");
    expect(entries).toHaveLength(1);
    expect((entries[0] as any).hooks[0].command).toBe(expectedDest);
  });

  it("is idempotent — does not duplicate hook entry", async () => {
    const existingSettings = {
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
      if (p.endsWith("settings.json")) return Promise.resolve(JSON.stringify(existingSettings));
      return Promise.reject(new Error("unexpected"));
    });

    await installPlanInterceptHook(fakeExtUri, fakeWorkspace);

    const settingsCall = mockWriteFile.mock.calls.find((c) =>
      (c[0] as string).endsWith("settings.json"),
    );
    expect(settingsCall).toBeUndefined();
  });
});
