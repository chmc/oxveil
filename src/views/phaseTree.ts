import type { PhaseStatus, ProgressState } from "../types";

export interface PhaseTreeItem {
  id: string;
  label: string;
  description?: string;
  iconId?: string;
  iconColor?: string;
  contextValue?: string;
  phaseNumber?: number | string;
  collapsible?: boolean;
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
  private _detected: boolean;
  private _folders = new Map<
    string,
    { folderName: string; progress: ProgressState | null }
  >();

  constructor(detected = true) {
    this._detected = detected;
  }

  update(
    folderUri: string,
    folderName: string,
    progress: ProgressState | null,
  ): void {
    this._folders.set(folderUri, { folderName, progress });
  }

  updateDetected(detected: boolean): void {
    this._detected = detected;
  }

  removeFolder(folderUri: string): void {
    this._folders.delete(folderUri);
  }

  private get _isMultiRoot(): boolean {
    return this._folders.size > 1;
  }

  getChildren(element?: string): PhaseTreeItem[] {
    if (!this._detected) {
      return [
        {
          id: "not-found",
          label: "$(warning) claudeloop not found",
          description: "Install claudeloop to get started",
        },
      ];
    }

    if (!element) {
      if (this._isMultiRoot) {
        return [...this._folders.entries()].map(
          ([uri, { folderName, progress }]) => ({
            id: `folder:${uri}`,
            label: folderName,
            description: this._folderBadge(progress),
            iconId: "folder",
            contextValue: "oxveil-folder",
            collapsible: true,
          }),
        );
      }
      // Single root: flat list
      const entry = [...this._folders.values()][0];
      if (!entry) {
        return [
          {
            id: "no-session",
            label: "$(info) No active session",
            description: "Run Oxveil: Start to begin",
          },
        ];
      }
      return this._phaseItems(entry.progress, "");
    }

    // Element is a folder node id
    if (element.startsWith("folder:")) {
      const uri = element.slice("folder:".length);
      const entry = this._folders.get(uri);
      if (!entry) return [];
      return this._phaseItems(entry.progress, uri);
    }

    return [];
  }

  getParent(element: string): string | undefined {
    if (!this._isMultiRoot) return undefined;
    const match = element.match(/^phase:(.+):\d+$/);
    if (match) return `folder:${match[1]}`;
    return undefined;
  }

  private _folderBadge(progress: ProgressState | null): string {
    if (!progress || progress.phases.length === 0) return "idle";
    const completed = progress.phases.filter(
      (p) => p.status === "completed",
    ).length;
    if (progress.phases.some((p) => p.status === "failed")) return "failed";
    if (completed === progress.phases.length) return "done";
    return `${completed}/${progress.phases.length}`;
  }

  private _phaseItems(
    progress: ProgressState | null,
    folderUri: string,
  ): PhaseTreeItem[] {
    if (!progress || progress.phases.length === 0) {
      return [
        {
          id: folderUri ? `info:${folderUri}` : "no-session",
          label: "$(info) No active session",
          description: "Run Oxveil: Start to begin",
        },
      ];
    }

    const prefix = folderUri ? `phase:${folderUri}:` : "";
    return progress.phases.map((phase, i) => {
      const icon = STATUS_ICONS[phase.status];
      const contextValue =
        phase.status === "completed"
          ? "phase-completed"
          : phase.status === "in_progress"
            ? "phase-running"
            : "phase";

      const item: PhaseTreeItem = {
        id: `${prefix}${i}`,
        label: `Phase ${phase.number}: ${phase.title}`,
        iconId: icon.id,
        iconColor: icon.color,
        contextValue,
        phaseNumber: phase.number,
      };

      const parts: string[] = [];
      if (phase.attempts !== undefined && phase.attempts > 1) {
        parts.push(`${phase.attempts} attempts`);
      }
      if (phase.dependencies && phase.dependencies.length > 0) {
        const depLabels = phase.dependencies.map(
          (d) => `Phase ${d.phaseNumber}`,
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
}
