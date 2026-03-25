export type DetectionStatus = "detected" | "not-found" | "version-incompatible";

export type SessionStatus = "idle" | "running" | "done" | "failed";

export type StatusBarState =
  | { kind: "not-found" }
  | { kind: "installing" }
  | { kind: "ready" }
  | { kind: "idle" }
  | { kind: "running"; currentPhase: number; totalPhases: number; elapsed: string }
  | { kind: "failed"; failedPhase: number }
  | { kind: "done"; elapsed: string };

export type PhaseStatus = "pending" | "completed" | "in_progress" | "failed";

export interface PhaseState {
  number: number | string;
  title: string;
  status: PhaseStatus;
  attempts?: number;
  started?: string;
  completed?: string;
}

export interface ProgressState {
  phases: PhaseState[];
  currentPhaseIndex?: number;
  totalPhases: number;
}
