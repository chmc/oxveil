import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { Detection, type Executor } from "./core/detection";
import { detectClaude, type ClaudeExecutor } from "./core/claudeDetection";
import {
  resolveClaudeloopPath,
  type PathResolverDeps,
  type ResolvedPath,
} from "./core/pathResolver";

const execFileAsync = promisify(execFile);

export const MINIMUM_VERSION = "0.22.0";

export interface DetectionResult {
  detection: Detection;
  result: Awaited<ReturnType<Detection["detect"]>>;
  resolvedClaudePath: string | null;
  pathSource?: ResolvedPath["source"];
}

export async function activateDetection(
  config: vscode.WorkspaceConfiguration,
): Promise<DetectionResult> {
  const configuredPath = config.get<string>("claudeloopPath", "claudeloop");

  // Resolve claudeloop path using shell PATH and fallback locations
  const pathResolverDeps: PathResolverDeps = {
    execFile: async (cmd, args, opts) => {
      const result = await execFileAsync(cmd, args, {
        timeout: opts.timeout,
      });
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

  const resolved = await resolveClaudeloopPath(configuredPath, pathResolverDeps);
  const claudeloopPath = resolved?.path ?? configuredPath;

  // Log resolution for debugging
  if (resolved) {
    console.log(`[Oxveil] claudeloop resolved via ${resolved.source}: ${resolved.path}`);
  } else {
    console.log(`[Oxveil] claudeloop resolution failed, using configured: ${configuredPath}`);
  }

  const executor: Executor = async (command, args) => {
    const result = await execFileAsync(command, args, {
      signal: AbortSignal.timeout(5000),
    });
    return { stdout: result.stdout };
  };

  const detection = new Detection(executor, claudeloopPath, MINIMUM_VERSION);
  const result = await detection.detect();

  // Set claudeloop context key
  await vscode.commands.executeCommand(
    "setContext",
    "oxveil.detected",
    result.status === "detected",
  );
  await vscode.commands.executeCommand(
    "setContext",
    "oxveil.processRunning",
    false,
  );

  // Claude CLI detection
  const claudePath = config.get<string>("claudePath", "claude");
  const claudeExecutor: ClaudeExecutor = async (command, args) => {
    const r = await execFileAsync(command, args);
    return { stdout: r.stdout };
  };
  const resolvedClaudePath = await detectClaude(claudeExecutor, claudePath);
  await vscode.commands.executeCommand(
    "setContext",
    "oxveil.claudeDetected",
    resolvedClaudePath !== null,
  );

  return { detection, result, resolvedClaudePath, pathSource: resolved?.source };
}
