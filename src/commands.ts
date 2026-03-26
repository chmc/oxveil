import * as vscode from "vscode";
import type { ProcessManager } from "./core/processManager";
import type { Installer } from "./core/installer";
import type { SessionState } from "./core/sessionState";
import type { StatusBarManager } from "./views/statusBar";

export interface CommandDeps {
  processManager: ProcessManager | undefined;
  installer: Installer;
  session: SessionState;
  statusBar: StatusBarManager;
}

export function registerCommands(deps: CommandDeps): vscode.Disposable[] {
  const { processManager, installer, session, statusBar } = deps;

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
  ];
}
