import type { DetectionStatus, ProgressState, SessionStatus } from "../types";

export interface IDetectionResult {
  status: DetectionStatus;
  path?: string;
  version?: string;
  minimumVersion: string;
}

export interface IDetection {
  detect(): Promise<IDetectionResult>;
  readonly current: IDetectionResult | undefined;
}

export interface ISessionState {
  readonly status: SessionStatus;
  readonly progress: ProgressState | undefined;
}

export interface IProcessManager {
  spawn(): Promise<void>;
  spawnFromPhase(phase: number | string): Promise<void>;
  markComplete(phase: number | string): Promise<void>;
  aiParse(granularity: string): Promise<void>;
  stop(): Promise<void>;
  reset(): Promise<void>;
  readonly isRunning: boolean;
}

export interface IInstaller {
  install(): Promise<void>;
  isSupported(): boolean;
}

export interface IWatcherManager {
  start(): void;
  stop(): void;
}
