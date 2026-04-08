import * as vscode from "vscode";

interface GranularityItem extends vscode.QuickPickItem {
  value: string;
}

const GRANULARITY_ITEMS: GranularityItem[] = [
  {
    label: "Phases",
    description: "High-level phases. Each phase is a major unit of work.",
    value: "phases",
  },
  {
    label: "Tasks",
    description:
      "Medium granularity. Each task is a self-contained deliverable.",
    value: "tasks",
  },
  {
    label: "Steps",
    description:
      "Fine granularity. Individual steps for detailed tracking.",
    value: "steps",
  },
];

/**
 * Show a quick pick for selecting ai-parse granularity.
 * Returns the selected granularity string, or undefined if cancelled.
 */
export async function pickGranularity(): Promise<string | undefined> {
  const picked = await vscode.window.showQuickPick(GRANULARITY_ITEMS, {
    placeHolder: "Select parse granularity...",
  });
  if (!picked) return undefined;
  return picked.value;
}
