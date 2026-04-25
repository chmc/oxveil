import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SidebarPanel } from "./views/sidebarPanel";
import { deriveViewState, mapPhases, formatRelativeDate } from "./views/sidebarState";
import type { ArchiveView, SidebarState, PlanUserChoice, PhaseView } from "./views/sidebarState";
import type { DetectionStatus } from "./types";
import { computeDuration } from "./parsers/archive";
import type { ArchiveTreeProvider } from "./views/archiveTree";
import type { ElapsedTimer } from "./views/elapsedTimer";
import type { WorkspaceSessionManager } from "./core/workspaceSessionManager";

export interface SidebarActivationDeps {
  manager: WorkspaceSessionManager;
  workspaceRoot: string | undefined;
  archiveTree: ArchiveTreeProvider;
  elapsedTimer: ElapsedTimer;
  initialDetectionStatus: DetectionStatus;
  initialPlanDetected: boolean;
}

export interface SidebarActivationResult {
  sidebarPanel: SidebarPanel;
  buildFullState: () => SidebarState;
  getArchives: () => ArchiveView[];
  /** Mutable detection status — updated by the caller when re-detection occurs */
  state: SidebarMutableState;
  registerPlanWatcher: () => vscode.Disposable[];
  /** Called when a plan is formed — caches phases and updates sidebar */
  onPlanFormed: () => Promise<void>;
  /** Called when a new plan chat starts — clears stale sidebar state */
  onPlanReset: () => void;
  /** Called when plan chat starts — shows planning state in sidebar */
  onPlanChatStarted: () => void;
  /** Called when plan chat ends — clears planning state from sidebar */
  onPlanChatEnded: () => void;
  /** Called when full reset occurs — clears all mutable state and resets session */
  onFullReset: () => void;
}

export interface SidebarMutableState {
  detectionStatus: DetectionStatus;
  planDetected: boolean;
  planUserChoice: PlanUserChoice;
  cachedPlanPhases: PhaseView[];
  /** Accumulated cost from log-appended events (written by sessionWiring) */
  cost: number;
  todoDone: number;
  todoTotal: number;
  /** Whether self-improvement mode is active after session completion */
  selfImprovementActive: boolean;
}

export function activateSidebar(deps: SidebarActivationDeps): SidebarActivationResult {
  const { manager, archiveTree, elapsedTimer } = deps;

  const state: SidebarMutableState = {
    detectionStatus: deps.initialDetectionStatus,
    planDetected: deps.initialPlanDetected,
    planUserChoice: "none",
    cachedPlanPhases: [],
    cost: 0,
    todoDone: 0,
    todoTotal: 0,
    selfImprovementActive: false,
  };

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
    const viewState = deriveViewState(
      state.detectionStatus,
      sessionStatus,
      state.planDetected,
      progress,
      state.planUserChoice,
    );
    return {
      view: viewState,
      plan: (state.planDetected || progress) ? {
        filename: "PLAN.md",
        phases: progress?.phases.length ? mapPhases(progress.phases) : state.cachedPlanPhases,
      } : undefined,
      session: sessionStatus === "running" || sessionStatus === "done" || sessionStatus === "failed" ? {
        elapsed: elapsedTimer.elapsed,
        cost: state.cost > 0 ? `$${state.cost.toFixed(2)}` : undefined,
        todos: state.todoTotal > 0 ? { done: state.todoDone, total: state.todoTotal } : undefined,
      } : undefined,
      archives: getArchives(),
      lastUpdatedAt: Date.now(),
    };
  }

  const sidebarPanel = new SidebarPanel({
    executeCommand: vscode.commands.executeCommand,
    onPlanChoice: (choice) => {
      state.planUserChoice = choice;
      // Always update immediately after choice
      sidebarPanel.updateState(buildFullState());
      // If phases need loading, update again when ready
      if (choice === "resume" && state.cachedPlanPhases.length === 0) {
        loadPlanPhases().then(() => {
          sidebarPanel.updateState(buildFullState());
        });
      }
    },
    buildState: () => buildFullState(),
    showError: (msg) => { vscode.window.showErrorMessage(`Oxveil: ${msg}`); },
  });

  // Eagerly parse plan phases if PLAN.md was detected at startup
  if (deps.initialPlanDetected) {
    loadPlanPhases().then(() => {
      sidebarPanel.updateState(buildFullState());
    });
  }

  async function clearStaleParsedPlan(): Promise<void> {
    if (!deps.workspaceRoot) return;
    try {
      await fs.unlink(path.join(deps.workspaceRoot, ".claudeloop", "ai-parsed-plan.md"));
    } catch {
      // File doesn't exist — nothing to clear
    }
  }

  function registerPlanWatcher(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    if (state.planDetected) {
      vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", true);
    }
    const planWatcher = vscode.workspace.createFileSystemWatcher("**/PLAN.md");
    planWatcher.onDidCreate(async () => {
      vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", true);
      state.planDetected = true;
      if (state.planUserChoice !== "resume" && state.planUserChoice !== "dismiss" && state.planUserChoice !== "planning") {
        state.planUserChoice = "none";
      }
      sidebarPanel.updateState(buildFullState());
      // Clear stale AI-parsed plan before loading — PLAN.md is authoritative
      await clearStaleParsedPlan();
      await loadPlanPhases();
      sidebarPanel.updateState(buildFullState());
    });
    planWatcher.onDidDelete(() => {
      vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", false);
      state.planDetected = false;
      state.planUserChoice = "none";
      state.cachedPlanPhases = [];
      sidebarPanel.updateState(buildFullState());
    });
    planWatcher.onDidChange(async () => {
      // Clear stale AI-parsed plan before loading — PLAN.md is authoritative
      await clearStaleParsedPlan();
      await loadPlanPhases();
      sidebarPanel.updateState(buildFullState());
    });
    disposables.push(planWatcher);

    return disposables;
  }

  async function loadPlanPhases(): Promise<void> {
    if (!deps.workspaceRoot) {
      state.cachedPlanPhases = [];
      return;
    }
    try {
      const parsedPlanPath = path.join(deps.workspaceRoot, ".claudeloop", "ai-parsed-plan.md");
      const planMdPath = path.join(deps.workspaceRoot, "PLAN.md");
      let content: string;
      try {
        content = await fs.readFile(parsedPlanPath, "utf-8");
      } catch {
        content = await fs.readFile(planMdPath, "utf-8");
      }
      const { parsePlan } = await import("./parsers/plan");
      const parsed = parsePlan(content);
      state.cachedPlanPhases = parsed.phases.map((p) => ({
        number: p.number,
        title: p.title,
        status: "pending" as const,
      }));
    } catch {
      state.cachedPlanPhases = [];
    }
  }

  async function onPlanFormed(): Promise<void> {
    // Clear stale progress from previous execution so new plan phases take precedence
    const activeSession = manager.getActiveSession();
    if (activeSession && activeSession.sessionState.status !== "running") {
      activeSession.sessionState.reset();
    }
    // Reset mutable state counters for clean slate
    state.cost = 0;
    state.todoDone = 0;
    state.todoTotal = 0;
    state.planUserChoice = "resume";
    await loadPlanPhases();
    sidebarPanel.updateState(buildFullState());
  }

  function onPlanReset(): void {
    state.cachedPlanPhases = [];
    state.planUserChoice = "dismiss";
    sidebarPanel.updateState(buildFullState());
  }

  function onPlanChatStarted(): void {
    state.planUserChoice = "planning";
    sidebarPanel.updateState(buildFullState());
  }

  function onPlanChatEnded(): void {
    state.planUserChoice = "none";
    sidebarPanel.updateState(buildFullState());
  }

  function onFullReset(): void {
    // Reset all SidebarMutableState fields
    state.cost = 0;
    state.todoDone = 0;
    state.todoTotal = 0;
    state.cachedPlanPhases = [];
    state.planUserChoice = "none";
    state.planDetected = false;
    state.selfImprovementActive = false;

    // Reset active session state
    const activeSession = manager.getActiveSession();
    if (activeSession) {
      activeSession.sessionState.reset();
    }

    // Refresh sidebar
    sidebarPanel.updateState(buildFullState());
  }

  return { sidebarPanel, buildFullState, getArchives, state, registerPlanWatcher, onPlanFormed, onPlanReset, onPlanChatStarted, onPlanChatEnded, onFullReset };
}
