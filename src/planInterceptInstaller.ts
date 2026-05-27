import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const HOOK_FILENAME = "oxveil-plan-intercept.sh";
const HOOK_COMMAND = "$CLAUDE_PROJECT_DIR/.claude/hooks/oxveil-plan-intercept.sh";

export async function installPlanInterceptHook(
  extensionUri: vscode.Uri,
  workspaceRoot: string,
): Promise<void> {
  const claudeDir = path.join(workspaceRoot, ".claude");
  const hooksDir = path.join(claudeDir, "hooks");
  const destScript = path.join(hooksDir, HOOK_FILENAME);

  // Copy bundled script if missing
  const srcScript = vscode.Uri.joinPath(extensionUri, "resources", HOOK_FILENAME).fsPath;
  await fs.mkdir(hooksDir, { recursive: true });
  try {
    await fs.access(destScript);
  } catch {
    const content = await fs.readFile(srcScript, "utf8");
    await fs.writeFile(destScript, content, { mode: 0o755 });
  }

  // Merge hook entry into settings.json if not already present
  const settingsFile = path.join(claudeDir, "settings.json");
  let settings: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(settingsFile, "utf8");
    settings = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // file absent or unparseable — start from empty
  }

  if (!hasInterceptHook(settings)) {
    addInterceptHook(settings);
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2) + "\n", "utf8");
  }
}

function hasInterceptHook(settings: Record<string, unknown>): boolean {
  const preToolUse = (settings.hooks as Record<string, unknown[]> | undefined)?.PreToolUse;
  if (!Array.isArray(preToolUse)) return false;
  return preToolUse.some((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as { matcher?: string; hooks?: unknown[] };
    if (e.matcher !== "ExitPlanMode") return false;
    return (e.hooks ?? []).some((h: unknown) => {
      if (typeof h !== "object" || h === null) return false;
      return ((h as { command?: string }).command ?? "").includes("oxveil-plan-intercept.sh");
    });
  });
}

function addInterceptHook(settings: Record<string, unknown>): void {
  if (!settings.hooks) settings.hooks = {};
  const hooks = settings.hooks as Record<string, unknown[]>;
  if (!hooks.PreToolUse) hooks.PreToolUse = [];
  hooks.PreToolUse.push({
    matcher: "ExitPlanMode",
    hooks: [{ type: "command", command: HOOK_COMMAND }],
  });
}
