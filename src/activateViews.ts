import * as vscode from "vscode";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import { stat } from "node:fs/promises";
import { DependencyGraphPanel } from "./views/dependencyGraph";
import { ExecutionTimelinePanel } from "./views/executionTimeline";
import { ConfigWizardPanel } from "./views/configWizard";
import { ReplayViewerPanel } from "./views/replayViewer";
import { ArchiveTimelinePanel } from "./views/archiveTimelinePanel";
import { PhaseDiffProvider, DIFF_URI_SCHEME } from "./views/diffProvider";
import { PlanCodeLensProvider } from "./views/planCodeLens";
import { LiveRunPanel } from "./views/liveRunPanel";
import { PlanPreviewPanel } from "./views/planPreviewPanel";
import { ArchiveTreeProvider } from "./views/archiveTree";
import { parseArchive } from "./parsers/archive";
import type { SessionState } from "./core/sessionState";
import type { GitExecDeps } from "./core/gitIntegration";

export interface WebviewPanelsDeps {
  session: SessionState;
  workspaceRoot: string | undefined;
  gitExec: GitExecDeps | undefined;
  onAnnotation?: (phase: string, text: string) => void;
}

export interface WebviewPanelsResult {
  dependencyGraph: DependencyGraphPanel;
  executionTimeline: ExecutionTimelinePanel;
  configWizard: ConfigWizardPanel;
  replayViewer: ReplayViewerPanel;
  archiveTimelinePanel: ArchiveTimelinePanel;
  liveRunPanel: LiveRunPanel;
  planPreviewPanel: PlanPreviewPanel;
  planCodeLens: PlanCodeLensProvider;
  disposables: vscode.Disposable[];
}

export function createWebviewPanels(deps: WebviewPanelsDeps): WebviewPanelsResult {
  const disposables: vscode.Disposable[] = [];

  const dependencyGraph = new DependencyGraphPanel({
    createWebviewPanel: vscode.window.createWebviewPanel,
    executeCommand: vscode.commands.executeCommand,
  });
  disposables.push({ dispose: () => dependencyGraph.dispose() });

  const executionTimeline = new ExecutionTimelinePanel({
    createWebviewPanel: vscode.window.createWebviewPanel,
    executeCommand: vscode.commands.executeCommand,
  });
  disposables.push({ dispose: () => executionTimeline.dispose() });

  const configWizard = new ConfigWizardPanel({
    createWebviewPanel: vscode.window.createWebviewPanel as any,
    readFile: (p: string) => fs.readFile(p, "utf-8"),
    writeFile: (p: string, content: string) => fs.writeFile(p, content, "utf-8"),
    sessionStatus: () => deps.session.status,
  });
  disposables.push({ dispose: () => configWizard.dispose() });

  const replayViewer = new ReplayViewerPanel({
    createWebviewPanel: vscode.window.createWebviewPanel as any,
    readFile: (p: string) => fs.readFile(p, "utf-8"),
    showInformationMessage: (msg: string) => vscode.window.showInformationMessage(msg),
  });
  disposables.push({ dispose: () => replayViewer.dispose() });

  const archiveTimelinePanel = new ArchiveTimelinePanel({
    createWebviewPanel: vscode.window.createWebviewPanel,
  });
  disposables.push({ dispose: () => archiveTimelinePanel.dispose() });

  const liveRunPanel = new LiveRunPanel({
    createWebviewPanel: vscode.window.createWebviewPanel,
    executeCommand: vscode.commands.executeCommand,
    getConfig: (key: string) => vscode.workspace.getConfiguration("oxveil").get(key),
  });
  disposables.push({ dispose: () => liveRunPanel.dispose() });

  const planPreviewPanel = new PlanPreviewPanel({
    createWebviewPanel: vscode.window.createWebviewPanel,
    readFile: async (filePath: string) => {
      try {
        return await fs.readFile(filePath, "utf-8");
      } catch {
        return "";
      }
    },
    findActivePlanFile: async () => {
      const dirs: string[] = [];

      // Primary: native plan mode (home dir)
      dirs.push(path.join(os.homedir(), ".claude", "plans"));

      // Workspace-relative directories
      if (deps.workspaceRoot) {
        dirs.push(path.join(deps.workspaceRoot, "docs", "superpowers", "specs"));
        dirs.push(path.join(deps.workspaceRoot, "docs", "superpowers", "plans"));
      }

      let newest: { path: string; mtime: number } | undefined;
      for (const dir of dirs) {
        try {
          const files = (await fs.readdir(dir)).filter(f => f.endsWith(".md"));
          for (const file of files) {
            const fullPath = path.join(dir, file);
            const s = await stat(fullPath);
            if (!newest || s.mtimeMs > newest.mtime) {
              newest = { path: fullPath, mtime: s.mtimeMs };
            }
          }
        } catch {
          // Directory doesn't exist — skip
        }
      }
      return newest?.path;
    },
    onAnnotation: (phase, text) => {
      deps.onAnnotation?.(phase, text);
    },
    createFileSystemWatcher: (glob: string) => vscode.workspace.createFileSystemWatcher(glob),
    statFile: async (filePath: string) => {
      try {
        const s = await stat(filePath);
        return { birthtimeMs: s.birthtimeMs };
      } catch {
        return undefined;
      }
    },
  });

  // Create watchers for all plan file locations
  const watchers: vscode.FileSystemWatcher[] = [];

  // Home dir watcher (always runs)
  const homePlansDir = path.join(os.homedir(), ".claude", "plans");
  watchers.push(vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(homePlansDir), "*.md"),
  ));

  // Workspace watchers (only with workspace)
  if (deps.workspaceRoot) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder) {
      watchers.push(vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, "docs/superpowers/specs/*.md"),
      ));
      watchers.push(vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, "docs/superpowers/plans/*.md"),
      ));
    }
  }

  planPreviewPanel.startWatching(watchers as any);
  disposables.push({ dispose: () => planPreviewPanel.dispose() });

  const planCodeLens = new PlanCodeLensProvider();
  disposables.push(
    vscode.languages.registerCodeLensProvider(
      { language: "claudeloop-plan" },
      planCodeLens,
    ),
  );
  disposables.push(planCodeLens);

  if (deps.workspaceRoot && deps.gitExec) {
    const diffProvider = new PhaseDiffProvider({ gitExec: deps.gitExec });
    disposables.push(
      vscode.workspace.registerTextDocumentContentProvider(
        DIFF_URI_SCHEME,
        diffProvider,
      ),
    );
  }

  return { dependencyGraph, executionTimeline, configWizard, replayViewer, archiveTimelinePanel, liveRunPanel, planPreviewPanel, planCodeLens, disposables };
}

export interface ArchiveViewDeps {
  workspaceRoot: string | undefined;
}

export interface ArchiveViewResult {
  archiveTree: ArchiveTreeProvider;
  refreshArchive: () => Promise<void>;
}

export function createArchiveView(deps: ArchiveViewDeps): ArchiveViewResult {
  const archiveTree = new ArchiveTreeProvider();

  const refreshArchive = async () => {
    if (!deps.workspaceRoot) return;
    const archiveRoot = path.join(deps.workspaceRoot, ".claudeloop", "archive");
    const entries = await parseArchive(
      {
        readdir: (dir: string) => fs.readdir(dir),
        readFile: (p: string) => fs.readFile(p, "utf-8"),
        isDirectory: async (p: string) => (await stat(p)).isDirectory(),
      },
      archiveRoot,
    );
    archiveTree.update(entries);
  };

  return { archiveTree, refreshArchive };
}
