import type { StatusBarState } from "../types";

export interface StatusBarItem {
  text: string;
  tooltip: string;
  backgroundColor: { id: string } | undefined;
  command: string | undefined;
  show(): void;
  hide(): void;
  dispose(): void;
}

export class StatusBarManager {
  private readonly _item: StatusBarItem;

  constructor(item: StatusBarItem) {
    this._item = item;
  }

  update(state: StatusBarState): void {
    this._item.command = "oxveil.phases.focus";

    switch (state.kind) {
      case "not-found":
        this._item.text = "$(warning) Oxveil: claudeloop not found";
        this._item.tooltip = "claudeloop not found — click to install";
        this._item.backgroundColor = { id: "statusBarItem.warningBackground" };
        break;

      case "installing":
        this._item.text = "$(sync~spin) Oxveil: installing claudeloop...";
        this._item.tooltip = "Installing claudeloop...";
        this._item.backgroundColor = undefined;
        break;

      case "ready":
        this._item.text = "$(symbol-event) Oxveil: ready";
        this._item.tooltip = "claudeloop detected — ready to run";
        this._item.backgroundColor = undefined;
        break;

      case "idle":
        this._item.text = "$(symbol-event) Oxveil: idle";
        this._item.tooltip = "No active session";
        this._item.backgroundColor = undefined;
        break;

      case "running":
        this._item.text = `$(sync~spin) Oxveil: Phase ${state.currentPhase}/${state.totalPhases} | ${state.elapsed}`;
        this._item.tooltip = `Running — Phase ${state.currentPhase} of ${state.totalPhases} (${state.elapsed} elapsed)`;
        this._item.backgroundColor = undefined;
        break;

      case "failed":
        this._item.text = `$(error) Oxveil: Phase ${state.failedPhase} failed`;
        this._item.tooltip = `Phase ${state.failedPhase} failed — click for details`;
        this._item.backgroundColor = { id: "statusBarItem.errorBackground" };
        break;

      case "done":
        this._item.text = `$(check) Oxveil: done | ${state.elapsed}`;
        this._item.tooltip = `All phases completed (${state.elapsed})`;
        this._item.backgroundColor = undefined;
        break;
    }

    this._item.show();
  }

  dispose(): void {
    this._item.dispose();
  }
}
