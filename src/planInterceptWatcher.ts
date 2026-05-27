import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { showPlanExitPicker } from "./commands/planExitPicker";

export function createPlanInterceptWatcher(
  workspaceRoot: string,
  folder: vscode.WorkspaceFolder,
): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, ".claude/plan-intercept-request-*.json"),
  );

  watcher.onDidCreate((uri) => {
    void handleRequest(uri.fsPath, workspaceRoot);
  });

  return watcher;
}

async function handleRequest(requestFile: string, workspaceRoot: string): Promise<void> {
  let uuid: string;
  try {
    const content = await fs.readFile(requestFile, "utf8");
    const parsed = JSON.parse(content) as { uuid?: string };
    if (!parsed.uuid) return;
    uuid = parsed.uuid;
  } catch {
    return;
  }

  try {
    await showPlanExitPicker(workspaceRoot, uuid);
  } finally {
    await fs.unlink(requestFile).catch(() => undefined);
  }
}
