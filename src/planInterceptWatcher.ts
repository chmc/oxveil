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
    void handleTrigger(uri.fsPath, workspaceRoot);
  });

  return watcher;
}

async function validatePlanFile(
  raw: string,
  workspaceRoot: string,
): Promise<{ ok: true; filePath: string } | { ok: false; reason: string }> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "planFile is empty" };
  if (!path.isAbsolute(trimmed)) {
    return { ok: false, reason: `planFile must be an absolute path, got: ${trimmed}` };
  }

  // path.resolve is sufficient — .claude/plans/ is never a symlink itself
  const resolvedDir = path.resolve(workspaceRoot, ".claude", "plans");

  let resolvedFile: string;
  try {
    resolvedFile = await fs.realpath(trimmed);
  } catch {
    // Retry once — sentinel may arrive before the plan file is fully fsynced
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    try {
      resolvedFile = await fs.realpath(trimmed);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, reason: `planFile not accessible: ${msg}` };
    }
  }

  if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
    return {
      ok: false,
      reason: `planFile must be inside .claude/plans/, got: ${trimmed}`,
    };
  }

  return { ok: true, filePath: resolvedFile };
}

async function showRejection(reason: string): Promise<void> {
  await vscode.window.showErrorMessage(`Oxveil: ${reason}`);
}

async function handleTrigger(
  triggerFile: string,
  workspaceRoot: string,
): Promise<void> {
  let parsed: { action?: string; planFile?: unknown };
  try {
    const content = await fs.readFile(triggerFile, "utf8");
    parsed = JSON.parse(content) as { action?: string; planFile?: unknown };
    if (parsed.action !== "formPlan") return;
  } catch {
    return;
  }

  await fs.unlink(triggerFile).catch(() => undefined);

  if (typeof parsed.planFile !== "string") {
    await showRejection(
      "Plan path missing from sentinel — update Oxveil, reload VS Code, and restart the plan chat. Or click Pick Plan to choose manually.",
    );
    return;
  }

  const result = await validatePlanFile(parsed.planFile, workspaceRoot);
  if (!result.ok) {
    await showRejection(`Invalid plan path — ${result.reason}`);
    return;
  }

  await vscode.commands.executeCommand("oxveil.formPlan", { filePath: result.filePath });
}
