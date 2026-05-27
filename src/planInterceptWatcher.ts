import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export function createPlanInterceptWatcher(
  workspaceRoot: string,
  folder: vscode.WorkspaceFolder,
): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, ".claude/oxveil-execute"),
  );

  watcher.onDidCreate((uri) => {
    void handleTrigger(uri.fsPath);
  });

  return watcher;
}

async function handleTrigger(triggerFile: string): Promise<void> {
  try {
    const content = await fs.readFile(triggerFile, "utf8");
    const parsed = JSON.parse(content) as { action?: string };
    if (parsed.action !== "formPlan") return;
  } catch {
    return;
  }

  await fs.unlink(triggerFile).catch(() => undefined);
  await vscode.commands.executeCommand("oxveil.formPlan");
}
