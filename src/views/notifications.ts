import type { PhaseStatus, ProgressState, DetectionStatus } from "../types";

export interface PhaseTransition {
  phase: number | string;
  title: string;
  from: PhaseStatus;
  to: PhaseStatus;
  attempts?: number;
}

export function detectTransitions(
  oldState: ProgressState,
  newState: ProgressState,
): PhaseTransition[] {
  const transitions: PhaseTransition[] = [];
  for (const newPhase of newState.phases) {
    const oldPhase = oldState.phases.find(
      (p) => p.number === newPhase.number,
    );
    if (oldPhase && oldPhase.status !== newPhase.status) {
      transitions.push({
        phase: newPhase.number,
        title: newPhase.title,
        from: oldPhase.status,
        to: newPhase.status,
        attempts: newPhase.attempts,
      });
    }
  }
  return transitions;
}

export interface NotificationWindow {
  showInformationMessage(
    message: string,
    ...items: string[]
  ): Thenable<string | undefined>;
  showWarningMessage(
    message: string,
    ...items: string[]
  ): Thenable<string | undefined>;
  showErrorMessage(
    message: string,
    ...items: string[]
  ): Thenable<string | undefined>;
}

export interface NotificationDeps {
  window: NotificationWindow;
  onShowOutput?: () => void;
  onViewLog?: (phaseNumber: number | string) => void;
  onInstall?: () => void;
  onSetPath?: () => void;
  onStop?: () => void;
  onForceUnlock?: () => void;
  onOpenFile?: (path: string) => void;
  onFocusLiveRun?: () => void;
  onUpdate?: () => void;
  onReleaseNotes?: (url: string) => void;
}

export class NotificationManager {
  private readonly _deps: NotificationDeps;

  constructor(deps: NotificationDeps) {
    this._deps = deps;
  }

  reset(): void {
    // no-op: retained for call-site compatibility
  }

  onPhasesChanged(
    oldProgress: ProgressState,
    newProgress: ProgressState,
  ): void {
    const transitions = detectTransitions(oldProgress, newProgress);
    for (const t of transitions) {
      if (t.to === "completed") {
        this._deps.window.showInformationMessage(
          `Phase ${t.phase} completed — ${t.title}`,
        );
      }
    }
  }

  onSessionFailed(progress: ProgressState): void {
    const fp =
      progress.phases.find((p) => p.status === "failed") ??
      progress.phases.find((p) => p.status === "in_progress");
    if (!fp) return;
    const attemptSuffix =
      fp.attempts !== undefined && fp.attempts > 1
        ? ` (attempt ${fp.attempts})`
        : "";
    this._deps.window
      .showErrorMessage(
        `Phase ${fp.number} failed — ${fp.title}${attemptSuffix}`,
        "View Log",
        "Show Output",
        "Dismiss",
      )
      .then((action) => {
        if (action === "View Log") {
          this._deps.onViewLog?.(fp.number);
        } else if (action === "Show Output") {
          this._deps.onShowOutput?.();
        }
      });
  }

  onDetection(
    status: DetectionStatus,
    version?: { found: string; required: string },
  ): void {
    if (status === "not-found") {
      this._deps.window
        .showWarningMessage(
          "claudeloop not found — Oxveil requires claudeloop to run. Would you like to install it?",
          "Install",
          "Set Path",
          "Dismiss",
        )
        .then((action) => {
          if (action === "Install") {
            this._deps.onInstall?.();
          } else if (action === "Set Path") {
            this._deps.onSetPath?.();
          }
        });
    } else if (status === "version-incompatible" && version) {
      this._deps.window
        .showWarningMessage(
          `claudeloop version incompatible — found v${version.found}, requires >=${version.required}. Please update claudeloop.`,
          "Update Guide",
          "Dismiss",
        );
    }
  }

  onDoubleSpawn(pid: number): void {
    this._deps.window
      .showErrorMessage(
        `claudeloop is already running — a process is already active (PID ${pid}). Stop it first or use Force Unlock if it crashed.`,
        "Stop",
        "Force Unlock",
      )
      .then((action) => {
        if (action === "Stop") {
          this._deps.onStop?.();
        } else if (action === "Force Unlock") {
          this._deps.onForceUnlock?.();
        }
      });
  }

  onAiParseSuccess(parsedPlanPath: string): void {
    this._deps.window
      .showInformationMessage("Plan parsed successfully", "Open Plan")
      .then((action) => {
        if (action === "Open Plan") {
          this._deps.onOpenFile?.(parsedPlanPath);
        }
      });
  }

  onAiParseNeedsInput(): void {
    this._deps.window
      .showWarningMessage("Claudeloop needs input", "View Options")
      .then((action) => {
        if (action === "View Options") {
          this._deps.onFocusLiveRun?.();
        }
      });
  }

  onUpdateAvailable(current: string, latest: string, releaseUrl: string): void {
    this._deps.window
      .showInformationMessage(
        `claudeloop update available: v${current} → v${latest}`,
        "Update",
        "Release Notes",
        "Dismiss",
      )
      .then((action) => {
        if (action === "Update") {
          this._deps.onUpdate?.();
        } else if (action === "Release Notes") {
          this._deps.onReleaseNotes?.(releaseUrl);
        }
      });
  }
}
