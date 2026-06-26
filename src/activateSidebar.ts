import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
export { checkInitialPlanState } from "./core/planFiles";
import { SidebarPanel } from "./views/sidebarPanel";
import { deriveViewState, mapPhases, formatRelativeDate } from "./views/sidebarState";
import type { ArchiveView, SidebarState, SidebarView } from "./views/sidebarState";
import { computeDuration } from "./parsers/archive";
import { findLessonsContent } from "./sessionWiring";
import { getPlanPath } from "./core/paths";
import { refreshSidebar as doRefreshSidebar } from "./sidebarRefresh";
import type { SidebarRefreshContext } from "./sidebarRefresh";

export type { SidebarActivationDeps, SidebarActivationResult, SidebarMutableState } from "./sidebarActivationTypes";
import type { SidebarActivationDeps, SidebarActivationResult } from "./sidebarActivationTypes";
import { SidebarMutableState } from "./core/sidebarMutableState";

export function activateSidebar(deps: SidebarActivationDeps): SidebarActivationResult {
  const { manager, archiveTree, elapsedTimer } = deps;

  const state = new SidebarMutableState({
    detectionStatus: deps.initialDetectionStatus,
    planDetected: deps.initialPlanDetected,
  });

  function getArchives(): ArchiveView[] {
    return archiveTree.getEntries().map((entry) => ({
      name: entry.name,
      label: entry.label,
      date: entry.metadata?.started
        ? formatRelativeDate(entry.metadata.started)
        : entry.timestamp,
      phaseCount: entry.metadata?.phasesTotal ?? 0,
      duration: entry.metadata
        ? computeDuration(entry.metadata.started, entry.metadata.finished) || undefined
        : undefined,
      status: (entry.metadata
        ? (entry.metadata.status === "completed" ? "completed" :
           entry.metadata.status === "failed" ? "failed" : "unknown")
        : "unknown") as "completed" | "failed" | "unknown",
    }));
  }

  function buildFullState(): SidebarState {
    const active = manager.getActiveSession();
    const sessionState = active?.sessionState;
    const sessionStatus = sessionState?.status ?? "idle";
    const progress = sessionState?.progress;
    // Debug override for visual verification (set oxveil.debugView in settings)
    // Use || instead of ?? because config default is "" which is falsy but not nullish
    const debugView = vscode.workspace.getConfiguration?.("oxveil")?.get<string>("debugView") as SidebarView | undefined;
    const viewState = debugView || deriveViewState(
      state.detectionStatus,
      sessionStatus,
      state.planDetected,
      progress,
      state.planUserChoice,
      state.selfImprovementActive,
    );
    const selfImprovementEnabled = vscode.workspace.getConfiguration?.("oxveil")?.get<boolean>("selfImprovement") ?? false;
    return {
      view: viewState,
      plan: (state.planDetected || progress) ? {
        filename: deps.workspaceRoot
        ? path.basename(getPlanPath(deps.workspaceRoot, manager.getActiveSession()?.planFileOverride))
        : "PLAN.md",
        phases: progress?.phases.length ? mapPhases(progress.phases) : state.cachedPlanPhases,
      } : undefined,
      session: sessionStatus === "running" || sessionStatus === "done" || sessionStatus === "failed" ? {
        elapsed: elapsedTimer.elapsed,
        cost: state.cost > 0 ? `$${state.cost.toFixed(2)}` : undefined,
        todos: state.todoTotal > 0 ? { done: state.todoDone, total: state.todoTotal } : undefined,
      } : undefined,
      archives: getArchives(),
      lastUpdatedAt: Date.now(),
      selfImprovement: {
        enabled: selfImprovementEnabled,
        lessonsAvailable: selfImprovementEnabled ? state.lessonsAvailable : undefined,
      },
      aiParsing: state.aiParsing,
      provider: vscode.workspace.getConfiguration?.("oxveil")?.get<"claude" | "opencode">("provider") ?? "claude",
      planPreview: deps.planPreviewPanel?.getPlanPreviewState(),
      processManager: { exists: manager.getActiveSession()?.processManager != null },
    };
  }

  const getCodiconsUri = deps.extensionUri
    ? (webview: any) => {
        if (!webview.asWebviewUri) return undefined;
        const codiconsPath = vscode.Uri.joinPath(deps.extensionUri!, "node_modules", "@vscode/codicons", "dist", "codicon.css");
        return webview.asWebviewUri(codiconsPath).toString();
      }
    : undefined;

  const sidebarPanel = new SidebarPanel({
    executeCommand: (cmd: string, ...args: unknown[]): void => { void vscode.commands.executeCommand(cmd, ...args); },
    getCodiconsUri,
    buildState: () => buildFullState(),
    showError: (msg) => { vscode.window.showErrorMessage(`Oxveil: ${msg}`); },
  });

  // Eagerly parse plan phases if PLAN.md was detected at startup
  if (deps.initialPlanDetected) {
    void loadPlanPhases().then(() => {
      sidebarPanel.updateState(buildFullState());
    }).catch((err) => console.error("[oxveil] loadPlanPhases failed:", err));
  }

  // Check for lessons at startup if self-improvement is enabled
  const selfImprovementEnabled = vscode.workspace.getConfiguration?.("oxveil")?.get<boolean>("selfImprovement") ?? false;
  if (selfImprovementEnabled) {
    void refreshLessonsAvailable().then(() => {
      sidebarPanel.updateState(buildFullState());
    }).catch((err) => console.error("[oxveil] refreshLessonsAvailable failed:", err));
  }

  async function clearStaleParsedPlan(): Promise<void> {
    if (!deps.workspaceRoot) return;
    try {
      await fs.unlink(path.join(deps.workspaceRoot, ".claudeloop", "ai-parsed-plan.md"));
    } catch {
      // File doesn't exist — nothing to clear
    }
  }

  async function clearSessionPlanFiles(): Promise<void> {
    const trackedPaths = deps.planPreviewPanel?.getTrackedPaths() ?? [];
    await Promise.all([
      ...trackedPaths.map(p => fs.unlink(p).catch(() => {})),
      clearStaleParsedPlan(),
    ]);
    vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", false);
    state.setPlanDetected(false);
    state.setCachedPlanPhases([]);
    state.setPlanUserChoice("none");
    sidebarPanel.updateState(buildFullState());
  }

  function registerPlanWatcher(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    if (state.planDetected) {
      vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", true);
    }

    async function onPlanCreated(): Promise<void> {
      vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", true);
      state.setPlanDetected(true);
      if (state.planUserChoice !== "planning") {
        state.setPlanUserChoice("none");
      }
      sidebarPanel.updateState(buildFullState());
      await loadPlanPhases();
      sidebarPanel.updateState(buildFullState());
    }

    function onPlanDeleted(): void {
      vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", false);
      state.setPlanDetected(false);
      state.setPlanUserChoice("none");
      state.setCachedPlanPhases([]);
      sidebarPanel.updateState(buildFullState());
    }

    async function onPlanChanged(): Promise<void> {
      await loadPlanPhases();
      sidebarPanel.updateState(buildFullState());
    }

    const folder = vscode.workspace.workspaceFolders?.[0];

    const planMdWatcher = folder
      ? vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, ".claudeloop/PLAN.md"))
      : vscode.workspace.createFileSystemWatcher("**/PLAN.md");
    planMdWatcher.onDidCreate(onPlanCreated);
    planMdWatcher.onDidDelete(onPlanDeleted);
    planMdWatcher.onDidChange(onPlanChanged);
    disposables.push(planMdWatcher);

    return disposables;
  }

  async function loadPlanPhases(): Promise<void> {
    if (!deps.workspaceRoot) {
      state.setCachedPlanPhases([]);
      return;
    }
    try {
      const session = manager.getActiveSession();
      const parsedPlanPath = path.join(deps.workspaceRoot, ".claudeloop", "ai-parsed-plan.md");
      const planMdPath = getPlanPath(deps.workspaceRoot, session?.planFileOverride);
      let content: string;
      try {
        content = await fs.readFile(parsedPlanPath, "utf-8");
      } catch {
        content = await fs.readFile(planMdPath, "utf-8");
      }
      const { parsePlan } = await import("./parsers/plan");
      const parsed = parsePlan(content);
      state.setCachedPlanPhases(parsed.phases.map((p) => ({
        number: p.number,
        title: p.title,
        status: "pending" as const,
      })));
    } catch {
      state.setCachedPlanPhases([]);
    }
  }

  async function refreshLessonsAvailable(): Promise<void> {
    if (!deps.workspaceRoot) {
      state.setLessonsAvailable(false);
      return;
    }
    const lessonsContent = await findLessonsContent(deps.workspaceRoot);
    state.setLessonsAvailable(lessonsContent !== null);
  }

  const refreshCtx: SidebarRefreshContext = {
    state,
    deps,
    manager,
    archiveTree,
    elapsedTimer,
    sidebarPanel,
    loadPlanPhases,
    refreshLessonsAvailable,
    buildFullState,
  };

  async function onPlanFormed(): Promise<void> {
    // Clear stale progress from previous execution so new plan phases take precedence
    const activeSession = manager.getActiveSession();
    if (activeSession && activeSession.sessionState.status !== "running") {
      activeSession.sessionState.reset();
    }
    // Reset mutable state counters for clean slate
    state.resetForNewRun();
    state.setPlanUserChoice("none");
    await loadPlanPhases();
    sidebarPanel.updateState(buildFullState());
  }

  function onPlanReset(): void {
    state.setCachedPlanPhases([]);
    state.setPlanUserChoice("none");
    sidebarPanel.updateState(buildFullState());
  }

  function onPlanChatStarted(): void {
    state.setPlanUserChoice("planning");
    sidebarPanel.updateState(buildFullState());
  }

  function onPlanChatEnded(): void {
    state.setPlanUserChoice("none");
    sidebarPanel.updateState(buildFullState());
  }

  function onFullReset(): void {
    state.resetAll();

    // Reset active session state
    const activeSession = manager.getActiveSession();
    if (activeSession) {
      activeSession.sessionState.reset();
    }

    // Refresh sidebar
    sidebarPanel.updateState(buildFullState());
  }

  function onAiParseStarted(): void {
    state.setAiParsing(true);
    sidebarPanel.updateState(buildFullState());
  }

  function onAiParseEnded(skipRefresh = false): void {
    state.setAiParsing(false);
    if (!skipRefresh) {
      sidebarPanel.updateState(buildFullState());
    }
  }

  return { sidebarPanel, buildFullState, getArchives, state, registerPlanWatcher, onPlanFormed, onPlanReset, onPlanChatStarted, onPlanChatEnded, onFullReset, refreshLessonsAvailable, onAiParseStarted, onAiParseEnded, refreshSidebar: () => doRefreshSidebar(refreshCtx), clearSessionPlanFiles };
}

