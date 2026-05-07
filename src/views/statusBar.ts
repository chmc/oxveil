import type { StatusBarState, Provider } from "../types";

function providerIcon(provider: Provider | undefined): string {
  if (provider === "opencode") return "$(terminal)";
  if (provider === "claude") return "$(cloud)";
  return "";
}

function providerTooltipSuffix(provider: Provider | undefined): string {
  if (provider === "opencode") return "\nProvider: OpenCode\nCmd+Shift+P > \"Oxveil: Switch Provider\" to change";
  if (provider === "claude") return "\nProvider: Claude\nCmd+Shift+P > \"Oxveil: Switch Provider\" to change";
  return "";
}

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

      case "ready": {
        const icon = providerIcon(state.provider) || "$(symbol-event)";
        this._item.text = `${icon} Oxveil: ready`;
        this._item.tooltip = state.provider
          ? `claudeloop detected — ready to run${providerTooltipSuffix(state.provider)}`
          : "claudeloop detected — ready to run";
        this._item.backgroundColor = undefined;
        break;
      }

      case "idle": {
        const icon = providerIcon(state.provider) || "$(symbol-event)";
        this._item.text = `${icon} Oxveil: idle`;
        this._item.tooltip = `No active session${providerTooltipSuffix(state.provider)}`;
        this._item.backgroundColor = undefined;
        break;
      }

      case "stopped": {
        const icon = providerIcon(state.provider) || "$(debug-pause)";
        const prefix = state.folderName ? `${state.folderName} — ` : "";
        const suffix = state.otherRootsSummary ? ` (${state.otherRootsSummary})` : "";
        this._item.text = `${icon} Oxveil: ${prefix}stopped${suffix}`;
        this._item.tooltip = `Execution stopped — click to resume${providerTooltipSuffix(state.provider)}`;
        this._item.backgroundColor = undefined;
        break;
      }

      case "running": {
        const icon = providerIcon(state.provider) || "$(sync~spin)";
        const prefix = state.folderName ? `${state.folderName} — ` : "";
        const suffix = state.otherRootsSummary ? ` (${state.otherRootsSummary})` : "";
        this._item.text = `${icon} Oxveil: ${prefix}Phase ${state.currentPhase}/${state.totalPhases} | ${state.elapsed}${suffix}`;
        this._item.tooltip = `Running — Phase ${state.currentPhase} of ${state.totalPhases} (${state.elapsed} elapsed)${providerTooltipSuffix(state.provider)}`;
        this._item.backgroundColor = undefined;
        break;
      }

      case "failed": {
        const pIcon = providerIcon(state.provider);
        const icon = pIcon ? `${pIcon} $(error)` : "$(error)";
        const prefix = state.folderName ? `${state.folderName} — ` : "";
        const suffix = state.otherRootsSummary ? ` (${state.otherRootsSummary})` : "";
        this._item.text = `${icon} Oxveil: ${prefix}Phase ${state.failedPhase} failed${suffix}`;
        this._item.tooltip = `Phase ${state.failedPhase} failed — click for details${providerTooltipSuffix(state.provider)}`;
        this._item.backgroundColor = { id: "statusBarItem.errorBackground" };
        break;
      }

      case "done": {
        const icon = providerIcon(state.provider) || "$(check)";
        const prefix = state.folderName ? `${state.folderName} — ` : "";
        const suffix = state.otherRootsSummary ? ` (${state.otherRootsSummary})` : "";
        this._item.text = `${icon} Oxveil: ${prefix}done | ${state.elapsed}${suffix}`;
        this._item.tooltip = `All phases completed (${state.elapsed})${providerTooltipSuffix(state.provider)}`;
        this._item.backgroundColor = undefined;
        break;
      }
    }

    this._item.show();
  }

  dispose(): void {
    this._item.dispose();
  }
}
