import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface PathResolverDeps {
  execFile: (
    command: string,
    args: string[],
    options: { timeout?: number }
  ) => Promise<{ stdout: string }>;
  fileExists: (path: string) => Promise<boolean>;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  homeDir: string;
}

export interface ResolvedPath {
  path: string;
  source: "configured" | "fallback" | "shell";
}

/**
 * Resolves the claudeloop executable path by:
 * 1. Using configured absolute/relative path directly (if contains /)
 * 2. Trying hardcoded fallback paths (fast, no shell spawn)
 * 3. Resolving via user's login shell (slower, but respects PATH)
 *
 * Note: Fallback paths are tried before shell resolution for speed (shell startup
 * can take 5+ seconds with heavy .zshrc). If you need a custom binary earlier in
 * PATH to take precedence, set an explicit path in oxveil.claudeloopPath.
 */
export async function resolveClaudeloopPath(
  configuredPath: string,
  deps: PathResolverDeps
): Promise<ResolvedPath | null> {
  // If path contains /, treat as configured absolute/relative path
  if (configuredPath.includes("/")) {
    const exists = await deps.fileExists(configuredPath);
    if (exists) {
      return { path: configuredPath, source: "configured" };
    }
    return null;
  }

  // Bare command - try fallback paths first (fast)
  const fallbackPaths = getFallbackPaths(deps.homeDir, deps.platform);
  for (const fallbackPath of fallbackPaths) {
    const exists = await deps.fileExists(fallbackPath);
    if (exists) {
      return { path: fallbackPath, source: "fallback" };
    }
  }

  // Skip shell resolution on Windows (PATH works correctly there)
  if (deps.platform === "win32") {
    return null;
  }

  // Try shell resolution
  const resolved = await resolveViaShell(configuredPath, deps);
  if (resolved) {
    return { path: resolved, source: "shell" };
  }

  return null;
}

function getFallbackPaths(homeDir: string, platform: NodeJS.Platform): string[] {
  const paths = [
    path.join(homeDir, ".local", "bin", "claudeloop"),
    "/usr/local/bin/claudeloop",
    path.join(homeDir, "bin", "claudeloop"),
  ];

  // Add Homebrew ARM path on macOS
  if (platform === "darwin") {
    paths.push("/opt/homebrew/bin/claudeloop");
  }

  return paths;
}

function getClaudeFallbackPaths(homeDir: string, platform: NodeJS.Platform): string[] {
  const paths: string[] = [];

  // Homebrew Cask paths first (most common for Claude Code)
  if (platform === "darwin") {
    paths.push("/opt/homebrew/bin/claude"); // ARM macOS
  }
  paths.push("/usr/local/bin/claude"); // Intel macOS or manual
  paths.push(path.join(homeDir, ".local", "bin", "claude")); // npm global with custom prefix
  paths.push(path.join(homeDir, "bin", "claude")); // manual install

  return paths;
}

/**
 * Resolves the Claude CLI executable path by:
 * 1. Using configured absolute/relative path directly (if contains /)
 * 2. Trying hardcoded fallback paths (fast, no shell spawn)
 * 3. Resolving via user's login shell (slower, but respects PATH)
 */
export async function resolveClaudePath(
  configuredPath: string,
  deps: PathResolverDeps
): Promise<ResolvedPath | null> {
  // If path contains /, treat as configured absolute/relative path
  if (configuredPath.includes("/")) {
    const exists = await deps.fileExists(configuredPath);
    if (exists) {
      return { path: configuredPath, source: "configured" };
    }
    return null;
  }

  // Bare command - try fallback paths first (fast)
  const fallbackPaths = getClaudeFallbackPaths(deps.homeDir, deps.platform);
  for (const fallbackPath of fallbackPaths) {
    const exists = await deps.fileExists(fallbackPath);
    if (exists) {
      return { path: fallbackPath, source: "fallback" };
    }
  }

  // Skip shell resolution on Windows (PATH works correctly there)
  if (deps.platform === "win32") {
    return null;
  }

  // Try shell resolution
  const resolved = await resolveViaShell(configuredPath, deps);
  if (resolved) {
    return { path: resolved, source: "shell" };
  }

  return null;
}

const SHELL_TIMEOUT_MS = 5000;

// Safe command pattern: alphanumeric, dash, underscore, dot (no shell metacharacters)
const SAFE_COMMAND_PATTERN = /^[a-zA-Z0-9_.-]+$/;

async function resolveViaShell(
  command: string,
  deps: PathResolverDeps
): Promise<string | null> {
  // Validate command to prevent shell injection
  if (!SAFE_COMMAND_PATTERN.test(command)) {
    return null;
  }

  const shell = deps.env.SHELL || "/bin/sh";

  let timerId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => reject(new Error("timeout")), SHELL_TIMEOUT_MS);
    });

    const { stdout } = await Promise.race([
      deps.execFile(shell, ["-lc", `command -v ${command}`], { timeout: SHELL_TIMEOUT_MS }),
      timeout,
    ]);

    const resolved = stdout.trim();
    if (resolved) {
      return resolved;
    }
  } catch {
    // Shell resolution failed - command not found or timeout
  } finally {
    clearTimeout(timerId);
  }

  return null;
}

/**
 * Creates PathResolverDeps using Node.js built-ins.
 * Used by extension activation for config change handling.
 */
export function createPathResolverDeps(): PathResolverDeps {
  const execFileAsync = promisify(execFile);
  return {
    execFile: async (cmd, args, opts) => {
      const result = await execFileAsync(cmd, args, { timeout: opts.timeout });
      return { stdout: result.stdout };
    },
    fileExists: async (p) => {
      try {
        await fs.access(p, fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    },
    env: process.env,
    platform: process.platform,
    homeDir: os.homedir(),
  };
}
