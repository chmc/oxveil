export type DetectionStatus = "detected" | "not-found" | "version-incompatible";

export type SessionStatus = "idle" | "running" | "done" | "failed";

export type StatusBarState =
  | { kind: "not-found" }
  | { kind: "installing" }
  | { kind: "ready" }
  | { kind: "idle" }
  | { kind: "running"; currentPhase: number; totalPhases: number; elapsed: string; folderName?: string; otherRootsSummary?: string }
  | { kind: "stopped"; folderName?: string; otherRootsSummary?: string }
  | { kind: "failed"; failedPhase: number; folderName?: string; otherRootsSummary?: string }
  | { kind: "done"; elapsed: string; folderName?: string; otherRootsSummary?: string };

export type PhaseStatus = "pending" | "completed" | "in_progress" | "failed";

export type SubStepName = "implement" | "verify" | "refactor";

export interface SubStepState {
  name: SubStepName;
  status: PhaseStatus;
  attempts?: number;
}

export interface PhaseDependency {
  phaseNumber: number | string;
  status: PhaseStatus | "unknown";
}

export interface PhaseState {
  number: number | string;
  title: string;
  status: PhaseStatus;
  attempts?: number;
  started?: string;
  completed?: string;
  dependencies?: PhaseDependency[];
  subSteps?: SubStepState[];
}

export interface ProgressState {
  phases: PhaseState[];
  currentPhaseIndex?: number;
  totalPhases: number;
}

export type Granularity = "phases" | "tasks" | "steps";

export interface ConfigState {
  PLAN_FILE: string;
  PROGRESS_FILE: string;
  MAX_RETRIES: number;
  SIMPLE_MODE: boolean;
  PHASE_PROMPT_FILE: string;
  BASE_DELAY: number;
  QUOTA_RETRY_INTERVAL: number;
  SKIP_PERMISSIONS: boolean;
  STREAM_TRUNCATE_LEN: number;
  HOOKS_ENABLED: boolean;
  MAX_PHASE_TIME: number;
  IDLE_TIMEOUT: number;
  VERIFY_TIMEOUT: number;
  AI_PARSE: boolean;
  GRANULARITY: Granularity;
  VERIFY_PHASES: boolean;
  REFACTOR_PHASES: boolean;
  REFACTOR_MAX_RETRIES: number;
}

export interface PlanPhase {
  number: number | string;
  title: string;
  headerLine: number;
  status?: string;
  dependencies?: string[];
  bodyEndLine: number;
}

export interface PlanState {
  phases: PlanPhase[];
}

export interface TimelineBar {
  phase: number | string;
  title: string;
  status: PhaseStatus;
  startOffsetMs: number;
  durationMs: number;
  label: string;
}

export interface TimelineData {
  bars: TimelineBar[];
  totalElapsedMs: number;
  nowOffsetMs: number;
  maxTimeMs: number;
}

export interface ParsedConfig {
  config: ConfigState;
  unknownKeys: Array<{ key: string; value: string }>;
  comments: string[];
}
