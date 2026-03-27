import * as vscode from "vscode";

// Reuse the same regex from src/parsers/plan.ts
const PHASE_HEADER_RE =
  /^#{2,3}\s+.*?Phase\s+(\d+(?:\.\d+)?)\s*:\s*(.+)$/;

export interface PlanLens {
  line: number;
  phaseNumber: number | string;
  title: string;
}

/** Pure function — testable without VS Code. */
export function computePlanLenses(content: string): PlanLens[] {
  const lenses: PlanLens[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(PHASE_HEADER_RE);
    if (match) {
      const rawNum = match[1];
      lenses.push({
        line: i,
        phaseNumber: rawNum.includes(".") ? rawNum : Number(rawNum),
        title: match[2].trim(),
      });
    }
  }

  return lenses;
}

export class PlanCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses = computePlanLenses(document.getText());
    const result: vscode.CodeLens[] = [];

    for (const lens of lenses) {
      const range = new vscode.Range(lens.line, 0, lens.line, 0);

      result.push(
        new vscode.CodeLens(range, {
          title: "\u25b6 Run from here",
          command: "oxveil.runFromPhase",
          arguments: [{ phaseNumber: lens.phaseNumber }],
        }),
        new vscode.CodeLens(range, {
          title: "\u2713 Mark complete",
          command: "oxveil.markPhaseComplete",
          arguments: [{ phaseNumber: lens.phaseNumber }],
        }),
        new vscode.CodeLens(range, {
          title: "\ud83d\udcc4 View log",
          command: "oxveil.viewLog",
          arguments: [{ phaseNumber: lens.phaseNumber }],
        }),
      );
    }

    return result;
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}
