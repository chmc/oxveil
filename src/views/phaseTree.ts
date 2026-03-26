import type { PhaseStatus, ProgressState } from "../types";

export interface PhaseTreeDeps {
  detected: boolean;
  progress: ProgressState | null;
}

export interface PhaseTreeItem {
  label: string;
  description?: string;
  iconId?: string;
  iconColor?: string;
  contextValue?: string;
  phaseNumber?: number | string;
}

export interface PhaseTransition {
  phase: number | string;
  title: string;
  from: PhaseStatus;
  to: PhaseStatus;
  attempts?: number;
}

const STATUS_ICONS: Record<PhaseStatus, { id: string; color: string }> = {
  completed: { id: "check", color: "testing.iconPassed" },
  in_progress: { id: "sync~spin", color: "debugIcon.startForeground" },
  failed: { id: "error", color: "testing.iconFailed" },
  pending: { id: "circle-outline", color: "disabledForeground" },
};

export class PhaseTreeProvider {
  private _deps: PhaseTreeDeps;

  constructor(deps: PhaseTreeDeps) {
    this._deps = deps;
  }

  update(deps: Partial<PhaseTreeDeps>): void {
    this._deps = { ...this._deps, ...deps };
  }

  getChildren(): PhaseTreeItem[] {
    if (!this._deps.detected) {
      return [
        {
          label: "$(warning) claudeloop not found",
          description: "Install claudeloop to get started",
        },
      ];
    }

    const progress = this._deps.progress;
    if (!progress || progress.phases.length === 0) {
      return [
        {
          label: "$(info) No active session",
          description: "Run Oxveil: Start to begin",
        },
      ];
    }

    return progress.phases.map((phase) => {
      const icon = STATUS_ICONS[phase.status];
      const item: PhaseTreeItem = {
        label: `Phase ${phase.number}: ${phase.title}`,
        iconId: icon.id,
        iconColor: icon.color,
        contextValue: "phase",
        phaseNumber: phase.number,
      };

      const parts: string[] = [];
      if (phase.attempts !== undefined && phase.attempts > 1) {
        parts.push(`${phase.attempts} attempts`);
      }
      if (phase.dependencies && phase.dependencies.length > 0) {
        const depLabels = phase.dependencies.map(
          (d) => `Phase ${d.phaseNumber}`
        );
        parts.push(`depends on ${depLabels.join(", ")}`);
      }
      if (parts.length > 0) {
        item.description = parts.join(" · ");
      }

      return item;
    });
  }

  static detectTransitions(
    oldState: ProgressState,
    newState: ProgressState
  ): PhaseTransition[] {
    const transitions: PhaseTransition[] = [];

    for (const newPhase of newState.phases) {
      const oldPhase = oldState.phases.find(
        (p) => p.number === newPhase.number
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
}
