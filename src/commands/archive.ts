import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { ArchiveTimelinePanel } from "../views/archiveTimelinePanel";
import type { ReplayViewerPanel } from "../views/replayViewer";
import { parseProgress } from "../parsers/progress";
import { type ArchiveMetadata, parseMetadata } from "../parsers/archive";

export interface ArchiveCommandDeps {
  getActive: () =>
    | {
        workspaceRoot: string;
        processManager?: { isRunning: boolean; restore(name: string): Promise<void> };
      }
    | undefined;
  resolveArchiveItem?: (element: string) => { archiveName?: string } | undefined;
  onArchiveRefresh?: () => void;
  replayViewer?: ReplayViewerPanel;
  archiveTimelinePanel?: ArchiveTimelinePanel;
}

export function registerArchiveCommands(deps: ArchiveCommandDeps): vscode.Disposable[] {
  const { getActive, resolveArchiveItem, onArchiveRefresh, replayViewer, archiveTimelinePanel } =
    deps;

  return [
    vscode.commands.registerCommand(
      "oxveil.archiveReplay",
      async (arg?: string | { archiveName?: string }) => {
        const active = getActive();
        const resolved = typeof arg === "string" ? resolveArchiveItem?.(arg) : arg;
        if (!active?.workspaceRoot || !resolved?.archiveName) return;
        const replayPath = path.join(
          active.workspaceRoot,
          ".claudeloop",
          "archive",
          resolved.archiveName,
          "replay.html",
        );
        const claudeloopRoot = path.join(active.workspaceRoot, ".claudeloop");
        await replayViewer?.reveal(replayPath, claudeloopRoot);
      },
    ),
    vscode.commands.registerCommand(
      "oxveil.archiveRestore",
      async (arg?: string | { archiveName?: string }) => {
        const active = getActive();
        const resolved = typeof arg === "string" ? resolveArchiveItem?.(arg) : arg;
        if (!active?.processManager || !active.workspaceRoot || !resolved?.archiveName) return;

        if (active.processManager.isRunning) {
          vscode.window.showErrorMessage("Oxveil: Stop the current session first");
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          "Restore will overwrite current session state. Continue?",
          { modal: true },
          "Restore",
        );
        if (confirm !== "Restore") return;

        try {
          await active.processManager.restore(resolved.archiveName);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          vscode.window.showErrorMessage(`Oxveil: Failed to restore — ${msg}`);
        }
      },
    ),
    vscode.commands.registerCommand(
      "oxveil.archiveTimeline",
      async (arg?: string | { archiveName?: string }) => {
        const active = getActive();
        const resolved = typeof arg === "string" ? resolveArchiveItem?.(arg) : arg;
        if (!active?.workspaceRoot || !resolved?.archiveName) return;

        const archiveDir = path.join(
          active.workspaceRoot,
          ".claudeloop",
          "archive",
          resolved.archiveName,
        );

        let progressContent: string;
        try {
          progressContent = await fs.readFile(path.join(archiveDir, "PROGRESS.md"), "utf-8");
        } catch {
          vscode.window.showInformationMessage("Oxveil: No timeline data for this run");
          return;
        }

        const progress = parseProgress(progressContent);
        if (progress.phases.length === 0) {
          vscode.window.showInformationMessage("Oxveil: No timeline data for this run");
          return;
        }

        let metadata: ArchiveMetadata | null = null;
        try {
          const metaContent = await fs.readFile(
            path.join(archiveDir, "metadata.txt"),
            "utf-8",
          );
          metadata = parseMetadata(metaContent);
        } catch {
          // metadata is optional — proceed with null
        }

        archiveTimelinePanel?.reveal(resolved.archiveName, progress, metadata);
      },
    ),
    vscode.commands.registerCommand("oxveil.archiveRefresh", () => {
      onArchiveRefresh?.();
    }),
  ];
}
