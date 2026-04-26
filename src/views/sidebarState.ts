import type {
  DetectionStatus,
  SessionStatus,
  PhaseStatus,
  ProgressState,
  PhaseState,
  SubStepState,
} from "../types";

export type SidebarView =
  | "not-found"
  | "empty"
  | "ready"
  | "stale"
  | "running"
  | "stopped"
  | "failed"
  | "completed"
  | "planning"
  | "self-improvement";

export type PlanUserChoice = "none" | "resume" | "dismiss" | "planning";

export interface SidebarState {
  view: SidebarView;
  notFoundReason?: "not-installed" | "version-incompatible";
  plan?: {
    filename: string;
    phases: PhaseView[];
  };
  session?: {
    elapsed: string;
    cost?: string;
    todos?: { done: number; total: number };
    currentPhase?: number;
    attemptCount?: number;
    maxRetries?: number;
    errorSnippet?: string;
  };
  archives: ArchiveView[];
  folders?: FolderView[];
  activeFolder?: string;
  /** Timestamp (Date.now()) when state was last built. For stale state detection. */
  lastUpdatedAt?: number;
  selfImprovement?: {
    enabled: boolean;           // mirrors config setting
    lessonsAvailable?: boolean; // only relevant when enabled
  };
}

export interface SubStepView {
  name: string;  // Capitalized: "Implement", "Verify", "Refactor"
  status: PhaseStatus;
  attempts?: number;  // Only present when > 1
}

export interface PhaseView {
  number: number | string;
  title: string;
  status: PhaseStatus;
  duration?: string;
  attempts?: number;
  subSteps?: SubStepView[];
}

export interface ArchiveView {
  name: string;
  label: string;
  date: string;
  phaseCount: number;
  duration?: string;
  status: "completed" | "failed" | "unknown";
}

export interface FolderView {
  uri: string;
  name: string;
  sessionStatus: SessionStatus;
}

export interface ProgressUpdate {
  phases: PhaseView[];
  elapsed: string;
  cost?: string;
  todos?: { done: number; total: number };
  currentPhase?: number;
  attemptCount?: number;
  maxRetries?: number;
  phaseListHtml?: string;
}

export function deriveViewState(
  detection: DetectionStatus,
  sessionStatus: SessionStatus,
  planDetected: boolean,
  progress: ProgressState | undefined,
  planUserChoice?: PlanUserChoice,
  selfImprovementActive?: boolean,
): SidebarView {
  if (detection !== "detected") return "not-found";
  if (planUserChoice === "planning" && sessionStatus === "idle") return "planning";
  if (sessionStatus === "running") return "running";
  if (sessionStatus === "failed") return "failed";
  if (sessionStatus === "done") {
    const allCompleted =
      progress?.phases.length &&
      progress.phases.every((p) => p.status === "completed");
    if (allCompleted) {
      if (selfImprovementActive) return "self-improvement";
      return "completed";
    }
    return "stopped";
  }
  // idle — check for orphaned progress (extension restart after crash)
  if (progress?.phases.some((p) => p.status === "failed")) return "failed";
  if (progress?.phases.some((p) => p.status === "in_progress")) return "stopped";
  if (
    progress?.phases.some((p) => p.status === "completed") &&
    progress?.phases.some((p) => p.status === "pending")
  )
    return "stopped";
  if (progress?.phases.length && progress.phases.every((p) => p.status === "completed")) return "completed";
  if (!planDetected && !progress) return "empty";

  // All-pending progress = fresh parsed plan → ready (not stale)
  const allPending =
    progress && progress.phases.every((p) => p.status === "pending");
  if (allPending) return "ready";

  // Plan detected, no progress — check user intent
  if (planUserChoice === "dismiss") return "empty";
  if (planUserChoice === "resume") return "ready";
  return planDetected ? "stale" : "ready";
}

export function mapPhases(phases: PhaseState[]): PhaseView[] {
  return phases.map((p) => ({
    number: p.number,
    title: p.title,
    status: p.status,
    duration: p.started && p.completed
      ? formatDuration(
          new Date(p.completed).getTime() - new Date(p.started).getTime(),
        )
      : undefined,
    attempts: p.attempts,
    subSteps: p.subSteps?.map((s) => ({
      name: s.name.charAt(0).toUpperCase() + s.name.slice(1),
      status: s.status,
      attempts: s.attempts && s.attempts > 1 ? s.attempts : undefined,
    })),
  }));
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

export async function readErrorSnippet(
  workspaceRoot: string,
  phaseNumber: number | string,
  readFile: (path: string) => Promise<string>,
): Promise<string | undefined> {
  try {
    const logPath = `${workspaceRoot}/.claudeloop/phase-${phaseNumber}.log`;
    const content = await readFile(logPath);
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    return lines.length > 0 ? lines[lines.length - 1].slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

export function formatRelativeDate(iso: string, now?: Date): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  const ref = now ?? new Date();
  const diffMs = ref.getTime() - date.getTime();

  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;

  const refDate = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const entryDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.floor((refDate.getTime() - entryDate.getTime()) / 86_400_000);

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}
