import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { ChildProcess } from "node:child_process";
import { spawn as nodeSpawn } from "node:child_process";
import * as vscode from "vscode";
import { ProcessManager } from "./core/processManager";

interface CreateProcessManagerOpts {
  claudeloopPath: string;
  resolvedPath: string | undefined;
  workspaceRoot: string;
  platform: NodeJS.Platform;
}

export function createProcessManager({
  claudeloopPath,
  resolvedPath,
  workspaceRoot,
  platform,
}: CreateProcessManagerOpts): ProcessManager {
  const claudeloopDir = path.join(workspaceRoot, ".claudeloop");

  return new ProcessManager({
    claudeloopPath: resolvedPath ?? claudeloopPath,
    workspaceRoot,
    spawn: (cmd, args, opts) =>
      nodeSpawn(cmd, args, opts as Parameters<typeof nodeSpawn>[2]),
    lockExists: async () => {
      try {
        await fs.access(path.join(claudeloopDir, "lock"));
        return true;
      } catch {
        return false;
      }
    },
    deleteLock: async () => {
      try {
        await fs.unlink(path.join(claudeloopDir, "lock"));
      } catch {
        // Lock file already gone
      }
    },
    getSettings: () => {
      const c = vscode.workspace.getConfiguration("oxveil");
      return {
        verify: c.get<boolean>("verify", true),
        refactor: c.get<boolean>("refactor", true),
        dryRun: c.get<boolean>("dryRun", false),
        aiParse: c.get<boolean>("aiParse", true),
      };
    },
    platform,
  });
}
