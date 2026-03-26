import type { ProgressState, DetectionStatus } from "../types";
import { PhaseTreeProvider } from "./phaseTree";

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
  onInstall?: () => void;
  onSetPath?: () => void;
  onStop?: () => void;
  onForceUnlock?: () => void;
}

export class NotificationManager {
  private readonly _deps: NotificationDeps;

  constructor(deps: NotificationDeps) {
    this._deps = deps;
  }

  onPhasesChanged(
    oldProgress: ProgressState,
    newProgress: ProgressState,
  ): void {
    const transitions = PhaseTreeProvider.detectTransitions(
      oldProgress,
      newProgress,
    );

    for (const t of transitions) {
      if (t.to === "completed") {
        this._deps.window.showInformationMessage(
          `Phase ${t.phase} completed — ${t.title}`,
        );
      } else if (t.to === "failed") {
        this._deps.window
          .showErrorMessage(
            `Phase ${t.phase} failed — ${t.title}`,
            "Show Output",
            "Dismiss",
          )
          .then((action) => {
            if (action === "Show Output") {
              this._deps.onShowOutput?.();
            }
          });
      }
    }
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
}
