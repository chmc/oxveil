import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Detection, type Executor } from "./core/detection";
import { detectClaude, type ClaudeExecutor } from "./core/claudeDetection";

const execFileAsync = promisify(execFile);

export const MINIMUM_VERSION = "0.22.0";

export interface DetectionResult {
  detection: Detection;
  result: Awaited<ReturnType<Detection["detect"]>>;
  resolvedClaudePath: string | null;
}

export async function activateDetection(
  config: vscode.WorkspaceConfiguration,
): Promise<DetectionResult> {
  const claudeloopPath = config.get<string>("claudeloopPath", "claudeloop");

  const executor: Executor = async (command, args) => {
    const result = await execFileAsync(command, args);
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

  return { detection, result, resolvedClaudePath };
}
