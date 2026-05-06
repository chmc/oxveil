import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseProgress } from "./parsers/progress";
import type { SidebarMutableState, SidebarActivationDeps } from "./sidebarActivationTypes";
import type { SidebarPanel } from "./views/sidebarPanel";
import type { SidebarState } from "./views/sidebarState";
import type { ArchiveTreeProvider } from "./views/archiveTree";
import type { ElapsedTimer } from "./views/elapsedTimer";
import type { WorkspaceSessionManager } from "./core/workspaceSessionManager";

export interface SidebarRefreshContext {
  state: SidebarMutableState;
  deps: SidebarActivationDeps;
  manager: WorkspaceSessionManager;
  archiveTree: ArchiveTreeProvider;
  elapsedTimer: ElapsedTimer;
  sidebarPanel: SidebarPanel;
  loadPlanPhases: () => Promise<void>;
  refreshLessonsAvailable: () => Promise<void>;
  buildFullState: () => SidebarState;
}

async function detectInconsistencies(ctx: SidebarRefreshContext): Promise<boolean> {
  const { state, deps, manager, archiveTree, elapsedTimer } = ctx;
  const session = manager.getActiveSession();
  const workspaceRoot = deps.workspaceRoot!;
  const claudeloopDir = path.join(workspaceRoot, ".claudeloop");
  const sessionState = session?.sessionState;

  // 1. Lock file vs session status (SessionState.status)
  const lockPath = path.join(claudeloopDir, "lock");
  let lockExists = false;
  try {
    await fs.access(lockPath);
    lockExists = true;
  } catch { /* no lock */ }

  const isRunning = sessionState?.status === "running";
  if (isRunning !== lockExists) return true;

  // 2. planDetected vs PLAN.md existence
  const planMdPath = path.join(workspaceRoot, "PLAN.md");
  let planMdExists = false;
  try {
    await fs.access(planMdPath);
    planMdExists = true;
  } catch { /* no PLAN.md */ }
  if (state.planDetected !== planMdExists) return true;

  // 3. cachedPlanPhases count vs ai-parsed-plan.md
  const parsedPlanPath = path.join(claudeloopDir, "ai-parsed-plan.md");
  try {
    const content = await fs.readFile(parsedPlanPath, "utf-8");
    const { parsePlan } = await import("./parsers/plan");
    const parsed = parsePlan(content);
    if (state.cachedPlanPhases.length !== parsed.phases.length) return true;
  } catch { /* no parsed plan */ }

  // 4. progress phases vs PROGRESS.md on disk
  const progressPath = path.join(claudeloopDir, "PROGRESS.md");
  try {
    const content = await fs.readFile(progressPath, "utf-8");
    const diskProgress = parseProgress(content);
    const memProgress = sessionState?.progress;
    if (diskProgress.phases.length !== (memProgress?.phases.length ?? 0)) return true;
    for (let i = 0; i < diskProgress.phases.length; i++) {
      if (diskProgress.phases[i].status !== memProgress?.phases[i]?.status) return true;
    }
  } catch { /* no progress file */ }

  // 5. aiParsing stuck (flag true but no parse running)
  if (state.aiParsing && !isRunning) return true;

  // 8. Archive count mismatch
  const archiveDir = path.join(claudeloopDir, "archive");
  try {
    const entries = await fs.readdir(archiveDir);
    const archiveDirs = entries.filter(e => e.startsWith("run-"));
    if (archiveDirs.length !== archiveTree.getArchiveCount()) return true;
  } catch { /* no archive dir */ }

  // 9. Elapsed timer running but session not running (or vice versa)
  if (elapsedTimer.isRunning() !== isRunning) return true;

  return false;
}

async function fullReInit(ctx: SidebarRefreshContext): Promise<void> {
  const { state, deps, manager, elapsedTimer, sidebarPanel, loadPlanPhases, refreshLessonsAvailable, buildFullState } = ctx;
  const session = manager.getActiveSession();
  const workspaceRoot = deps.workspaceRoot!;

  // 1. Reset session state if not running
  if (session && session.sessionState.status !== "running") {
    session.sessionState.reset();
  }

  // 2. Reset mutable state
  state.cost = 0;
  state.todoDone = 0;
  state.todoTotal = 0;
  state.aiParsing = false;
  state.selfImprovementActive = false;
  state.planUserChoice = "none";

  // 3. Re-detect plan
  const planMdPath = path.join(workspaceRoot, "PLAN.md");
  try {
    await fs.access(planMdPath);
    state.planDetected = true;
  } catch {
    state.planDetected = false;
  }

  // 4. Reload cached state from disk
  await loadPlanPhases();
  await refreshLessonsAvailable();

  // 5. Sync elapsed timer with session state
  const isRunning = session?.sessionState.status === "running";
  if (isRunning && !elapsedTimer.isRunning()) {
    elapsedTimer.start();
  } else if (!isRunning && elapsedTimer.isRunning()) {
    elapsedTimer.stop();
  }

  // 7. Update context keys
  await vscode.commands.executeCommand("setContext", "oxveil.processRunning", isRunning);
  await vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", state.planDetected);

  // 8. Refresh Plan Preview Panel if open
  deps.planPreviewPanel?.refresh();

  // 9. Update sidebar and status bar
  sidebarPanel.updateState(buildFullState());
}

export async function refreshSidebar(ctx: SidebarRefreshContext): Promise<void> {
  const { deps, sidebarPanel, loadPlanPhases, refreshLessonsAvailable, buildFullState } = ctx;
  if (!deps.workspaceRoot) {
    vscode.window.showWarningMessage("Oxveil: No workspace folder");
    return;
  }

  try {
    const inconsistent = await detectInconsistencies(ctx);

    if (inconsistent) {
      await fullReInit(ctx);
      vscode.window.showInformationMessage("Oxveil: Full refresh completed");
    } else {
      await loadPlanPhases();
      await refreshLessonsAvailable();
      sidebarPanel.updateState(buildFullState());
      vscode.window.showInformationMessage("Oxveil: Refreshed");
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    vscode.window.showErrorMessage(`Oxveil: Failed to refresh — ${msg}`);
  }
}
