import * as vscode from "vscode";
import * as path from "node:path";
import type { ProcessManager } from "./core/processManager";
import type { Installer } from "./core/installer";
import type { SessionState } from "./core/sessionState";
import type { StatusBarManager } from "./views/statusBar";
import { findPhaseLogs } from "./views/logViewer";
import type { PhaseTreeItem } from "./views/phaseTree";

export interface CommandDeps {
  processManager: ProcessManager | undefined;
  installer: Installer;
  session: SessionState;
  statusBar: StatusBarManager;
  workspaceRoot: string | undefined;
  readdir: (dir: string) => Promise<string[]>;
}

export function registerCommands(deps: CommandDeps): vscode.Disposable[] {
  const { processManager, installer, session, statusBar, workspaceRoot, readdir } = deps;

  return [
    vscode.commands.registerCommand("oxveil.start", async () => {
      if (!processManager) return;
      try {
        await processManager.spawn();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Oxveil: Failed to start — ${msg}`);
      }
    }),
    vscode.commands.registerCommand("oxveil.stop", async () => {
      if (!processManager) return;
      await processManager.stop();
    }),
    vscode.commands.registerCommand("oxveil.reset", async () => {
      if (!processManager) return;
      try {
        await processManager.reset();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Oxveil: Failed to reset — ${msg}`);
      }
    }),
    vscode.commands.registerCommand("oxveil.forceUnlock", async () => {
      if (!processManager) return;
      await processManager.forceUnlock();
      session.onLockChanged({ locked: false });
    }),
    vscode.commands.registerCommand("oxveil.install", async () => {
      if (!installer.isSupported()) {
        vscode.window.showErrorMessage(
          "Oxveil: claudeloop installation is not supported on this platform",
        );
        return;
      }
      statusBar.update({ kind: "installing" });
      await installer.install();
    }),
    vscode.commands.registerCommand(
      "oxveil.viewLog",
      async (treeItem?: { phaseNumber?: number | string }) => {
        if (!workspaceRoot) {
          vscode.window.showWarningMessage("Oxveil: No workspace open");
          return;
        }

        const phaseNumber = treeItem?.phaseNumber;
        if (phaseNumber === undefined) {
          vscode.window.showWarningMessage(
            "Oxveil: No phase selected",
          );
          return;
        }

        const logs = await findPhaseLogs(
          { workspaceRoot, readdir },
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
  ];
}
