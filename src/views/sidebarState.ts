import type {
  DetectionStatus,
  SessionStatus,
  PhaseStatus,
  ProgressState,
  PhaseState,
} from "../types";

export type SidebarView =
  | "not-found"
  | "empty"
  | "ready"
  | "running"
  | "stopped"
  | "failed"
  | "completed";

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
}

export interface PhaseView {
  number: number | string;
  title: string;
  status: PhaseStatus;
  duration?: string;
  attempts?: number;
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
}

export function deriveViewState(
  detection: DetectionStatus,
  sessionStatus: SessionStatus,
  planDetected: boolean,
  progress: ProgressState | undefined,
): SidebarView {
  if (detection !== "detected") return "not-found";
  if (sessionStatus === "running") return "running";
  if (sessionStatus === "failed") return "failed";
  if (sessionStatus === "done") {
    const allCompleted =
      progress?.phases.length &&
      progress.phases.every((p) => p.status === "completed");
    return allCompleted ? "completed" : "stopped";
  }
  // idle — check for orphaned progress (extension restart after crash)
  if (progress?.phases.some((p) => p.status === "failed")) return "failed";
  if (
    progress?.phases.some((p) => p.status === "completed") &&
    progress?.phases.some((p) => p.status === "pending")
  )
    return "stopped";
  if (!planDetected && !progress) return "empty";
  return "ready";
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
  }));
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}
