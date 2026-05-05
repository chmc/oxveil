import * as vscode from "vscode";
import type { SidebarPanel } from "./views/sidebarPanel";
import type { SidebarState, PlanUserChoice, PhaseView } from "./views/sidebarState";
import type { DetectionStatus } from "./types";
import type { ArchiveTreeProvider } from "./views/archiveTree";
import type { ElapsedTimer } from "./views/elapsedTimer";
import type { PlanPreviewPanel } from "./views/planPreviewPanel";
import type { WorkspaceSessionManager } from "./core/workspaceSessionManager";

export interface SidebarActivationDeps {
  manager: WorkspaceSessionManager;
  workspaceRoot: string | undefined;
  archiveTree: ArchiveTreeProvider;
  elapsedTimer: ElapsedTimer;
  initialDetectionStatus: DetectionStatus;
  initialPlanDetected: boolean;
  planPreviewPanel?: PlanPreviewPanel;
}

export interface SidebarActivationResult {
  sidebarPanel: SidebarPanel;
  buildFullState: () => SidebarState;
  getArchives: () => import("./views/sidebarState").ArchiveView[];
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
  /** Refreshes lessonsAvailable state from disk */
  refreshLessonsAvailable: () => Promise<void>;
  /** Called when AI parsing of plan starts */
  onAiParseStarted: () => void;
  /** Called when AI parsing of plan ends */
  onAiParseEnded: () => void;
  /** Manual refresh — quick re-read, full re-init if inconsistent */
  refreshSidebar: () => Promise<void>;
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
  /** Whether lessons.md exists (checked asynchronously) */
  lessonsAvailable: boolean;
  /** Whether AI is currently parsing the plan */
  aiParsing: boolean;
}
