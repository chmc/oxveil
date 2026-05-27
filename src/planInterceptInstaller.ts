import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import envPaths from "env-paths";

const HOOK_FILENAME = "oxveil-plan-intercept.sh";

function getCacheDir(): string {
  return envPaths("oxveil", { suffix: "" }).cache;
}

function getGlobalSettingsPath(): string {
  return path.join(os.homedir(), ".claude", "settings.json");
}

export async function installPlanInterceptHook(
  extensionUri: vscode.Uri,
  workspaceRoot: string,
): Promise<void> {
  const cacheDir = getCacheDir();
  const destScript = path.join(cacheDir, HOOK_FILENAME);
  const hookCommand = destScript;

  // Always overwrite — cache is ephemeral, ensures version sync
  const srcScript = vscode.Uri.joinPath(extensionUri, "resources", HOOK_FILENAME).fsPath;
  await fs.mkdir(cacheDir, { recursive: true });
  const content = await fs.readFile(srcScript, "utf8");
  const tmp = destScript + ".tmp";
  await fs.writeFile(tmp, content, { mode: 0o755 });
  await fs.rename(tmp, destScript);

  const claudeDir = path.join(workspaceRoot, ".claude");

  // Cleanup old per-project hook script
  const oldScript = path.join(claudeDir, "hooks", HOOK_FILENAME);
  try {
    await fs.unlink(oldScript);
  } catch {
    // not present — ignore
  }

  // Migration: remove per-project hook entry
  await removeInterceptFromSettings(path.join(claudeDir, "settings.json"));

  // Install to global settings
  const globalSettingsFile = getGlobalSettingsPath();
  let settings: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(globalSettingsFile, "utf8");
    settings = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // absent or unparseable — start fresh
  }

  if (!hasInterceptHook(settings, hookCommand)) {
    addInterceptHook(settings, hookCommand);
    await fs.mkdir(path.dirname(globalSettingsFile), { recursive: true });
    await fs.writeFile(globalSettingsFile, JSON.stringify(settings, null, 2) + "\n", "utf8");
  }
}

export async function uninstallPlanInterceptHook(): Promise<void> {
  await removeInterceptFromSettings(getGlobalSettingsPath());
}

async function removeInterceptFromSettings(settingsFile: string): Promise<void> {
  let settings: Record<string, unknown>;
  try {
    const raw = await fs.readFile(settingsFile, "utf8");
    settings = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }

  const preToolUse = (settings.hooks as Record<string, unknown[]> | undefined)?.PreToolUse;
  if (!Array.isArray(preToolUse)) return;

  const filtered = preToolUse.filter((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return true;
    const e = entry as { matcher?: string; hooks?: unknown[] };
    if (e.matcher !== "ExitPlanMode") return true;
    return !(e.hooks ?? []).some((h: unknown) => {
      if (typeof h !== "object" || h === null) return false;
      return ((h as { command?: string }).command ?? "").includes(HOOK_FILENAME);
    });
  });

  if (filtered.length === preToolUse.length) return;

  (settings.hooks as Record<string, unknown[]>).PreToolUse = filtered;
  await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

function hasInterceptHook(settings: Record<string, unknown>, command: string): boolean {
  const preToolUse = (settings.hooks as Record<string, unknown[]> | undefined)?.PreToolUse;
  if (!Array.isArray(preToolUse)) return false;
  return preToolUse.some((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as { matcher?: string; hooks?: unknown[] };
    if (e.matcher !== "ExitPlanMode") return false;
    return (e.hooks ?? []).some((h: unknown) => {
      if (typeof h !== "object" || h === null) return false;
      return ((h as { command?: string }).command ?? "") === command;
    });
  });
}

function addInterceptHook(settings: Record<string, unknown>, command: string): void {
  if (!settings.hooks) settings.hooks = {};
  const hooks = settings.hooks as Record<string, unknown[]>;
  if (!hooks.PreToolUse) hooks.PreToolUse = [];

  const preToolUse = hooks.PreToolUse;
  const idx = preToolUse.findIndex((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as { matcher?: string; hooks?: unknown[] };
    if (e.matcher !== "ExitPlanMode") return false;
    return (e.hooks ?? []).some((h: unknown) => {
      if (typeof h !== "object" || h === null) return false;
      return ((h as { command?: string }).command ?? "").includes(HOOK_FILENAME);
    });
  });

  const entry = { matcher: "ExitPlanMode", hooks: [{ type: "command", command }] };
  if (idx >= 0) {
    preToolUse[idx] = entry;
  } else {
    preToolUse.push(entry);
  }
}
