import * as vscode from "vscode";

interface GranularityItem extends vscode.QuickPickItem {
  value: string;
}

const GRANULARITY_ITEMS: GranularityItem[] = [
  {
    label: "Coarse — 3-5 phases",
    description:
      "High-level phases. Good for small tasks or quick iterations.",
    value: "coarse",
  },
  {
    label: "Medium — 5-10 phases (default)",
    description:
      "Balanced breakdown. Each phase is a meaningful unit of work.",
    value: "medium",
  },
  {
    label: "Fine — 10-20 phases",
    description:
      "Granular phases. Best for complex tasks requiring careful monitoring.",
    value: "fine",
  },
  {
    label: "Custom...",
    description: "Enter a custom prompt to guide phase generation.",
    value: "custom",
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

  let granularity = picked.value;
  if (granularity === "custom") {
    const custom = await vscode.window.showInputBox({
      prompt: "Enter custom granularity prompt",
    });
    if (!custom) return undefined;
    granularity = custom;
  }

  return granularity;
}
