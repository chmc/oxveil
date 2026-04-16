import * as vscode from "vscode";
import * as path from "node:path";
import { findPhaseLogs } from "../views/logViewer";
import { findPhaseCommits } from "../core/gitIntegration";
import { encodeDiffUri } from "../views/diffProvider";
import type { SessionState } from "../core/sessionState";
import type { ProcessManager } from "../core/processManager";
import type { GitExecDeps } from "../core/gitIntegration";

interface ActiveSession {
  processManager: ProcessManager | undefined;
  session: SessionState;
  workspaceRoot: string;
  gitExec: GitExecDeps | undefined;
  folderUri: string;
}

export interface PhaseOpsDeps {
  getActive: () => ActiveSession | undefined;
  readdir: (dir: string) => Promise<string[]>;
}

export function registerPhaseCommands(deps: PhaseOpsDeps): vscode.Disposable[] {
  const { getActive, readdir } = deps;

  return [
    vscode.commands.registerCommand(
      "oxveil.viewLog",
      async (arg?: { phaseNumber?: number | string }) => {
        const active = getActive();
        if (!active?.workspaceRoot) {
          vscode.window.showWarningMessage("Oxveil: No workspace open");
          return;
        }

        const phaseNumber = arg?.phaseNumber;
        if (phaseNumber === undefined) {
          vscode.window.showWarningMessage(
            "Oxveil: No phase selected",
          );
          return;
        }

        const logs = await findPhaseLogs(
          { workspaceRoot: active.workspaceRoot, readdir },
          phaseNumber,
        );

        if (logs.length === 0) {
          vscode.window.showInformationMessage(
            `Oxveil: No logs available for phase ${phaseNumber}`,
          );
          return;
        }

        let selected: string;
        if (logs.length === 1) {
          selected = logs[0];
        } else {
          const items = logs.map((l) => ({
            label: path.basename(l),
            logPath: l,
          }));
          const pick = await vscode.window.showQuickPick(items, {
            placeHolder: `Select log for phase ${phaseNumber}`,
          });
          if (!pick) return;
          selected = pick.logPath;
        }

        const doc = await vscode.workspace.openTextDocument(
          vscode.Uri.file(selected),
        );
        await vscode.window.showTextDocument(doc);
      },
    ),
    vscode.commands.registerCommand(
      "oxveil.viewDiff",
      async (arg?: { phaseNumber?: number | string }) => {
        const active = getActive();
        const phaseNumber = arg?.phaseNumber;
        if (phaseNumber === undefined || !active?.gitExec) {
          vscode.window.showWarningMessage("Oxveil: No phase selected");
          return;
        }

        const range = await findPhaseCommits(active.gitExec, phaseNumber);
        if (!range) {
          vscode.window.showInformationMessage(
            `No commits found for Phase ${phaseNumber}`,
          );
          return;
        }

        const uri = vscode.Uri.parse(encodeDiffUri(phaseNumber));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: true });
      },
    ),
    vscode.commands.registerCommand(
      "oxveil.runFromPhase",
      async (arg?: { phaseNumber?: number | string }) => {
        const active = getActive();
        if (!active?.processManager) return;
        const phaseNumber = arg?.phaseNumber;
        if (phaseNumber === undefined) {
          vscode.window.showWarningMessage("Oxveil: No phase specified");
          return;
        }

        if (active.processManager.isRunning) {
          vscode.window.showErrorMessage(
            "Oxveil: Stop the current session first",
          );
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          `This will mark all phases before ${phaseNumber} as complete. Continue?`,
          { modal: true },
          "Run",
        );
        if (confirm !== "Run") return;

        try {
          await active.processManager.spawnFromPhase(phaseNumber);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          vscode.window.showErrorMessage(
            `Oxveil: Failed to run from phase — ${msg}`,
          );
        }
      },
    ),
    vscode.commands.registerCommand(
      "oxveil.markPhaseComplete",
      async (arg?: { phaseNumber?: number | string }) => {
        const active = getActive();
        if (!active?.processManager) return;
        if (active.processManager.isRunning) return;
        const phaseNumber = arg?.phaseNumber;
        if (phaseNumber === undefined) {
          vscode.window.showWarningMessage("Oxveil: No phase specified");
          return;
        }

        try {
          await active.processManager.markComplete(phaseNumber);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          vscode.window.showErrorMessage(
            `Oxveil: Failed to mark phase complete — ${msg}`,
          );
        }
      },
    ),
  ];
}
