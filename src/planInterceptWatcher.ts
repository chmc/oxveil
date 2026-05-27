import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const STALE_MS = 60_000;

export function createPlanInterceptWatcher(
  workspaceRoot: string,
  folder: vscode.WorkspaceFolder,
): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, ".claude/oxveil-execute-*.json"),
  );

  watcher.onDidCreate((uri) => {
    void handleTrigger(uri.fsPath);
  });

  return watcher;
}

export async function cleanupStaleTriggers(workspaceRoot: string): Promise<void> {
  const dir = path.join(workspaceRoot, ".claude");
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }

  const now = Date.now();
  for (const entry of entries) {
    if (!entry.startsWith("oxveil-execute-") || !entry.endsWith(".json")) continue;
    const filePath = path.join(dir, entry);
    try {
      const content = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(content) as { timestamp?: number };
      if (parsed.timestamp && now - parsed.timestamp > STALE_MS) {
        await fs.unlink(filePath).catch(() => undefined);
      }
    } catch {
      await fs.unlink(filePath).catch(() => undefined);
    }
  }
}

async function handleTrigger(triggerFile: string): Promise<void> {
  try {
    const content = await fs.readFile(triggerFile, "utf8");
    const parsed = JSON.parse(content) as { uuid?: string; sessionId?: string; timestamp?: number };
    if (!parsed.uuid) return;

    if (parsed.timestamp && Date.now() - parsed.timestamp > STALE_MS) {
      await fs.unlink(triggerFile).catch(() => undefined);
      return;
    }
  } catch {
    return;
  }

  await fs.unlink(triggerFile).catch(() => undefined);
  await vscode.commands.executeCommand("oxveil.formPlan");
}
