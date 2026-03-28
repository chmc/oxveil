import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { stat } from "node:fs/promises";
import { DependencyGraphPanel } from "./views/dependencyGraph";
import { ConfigWizardPanel } from "./views/configWizard";
import { ReplayViewerPanel } from "./views/replayViewer";
import { PhaseDiffProvider, DIFF_URI_SCHEME } from "./views/diffProvider";
import { PlanCodeLensProvider } from "./views/planCodeLens";
import { ArchiveTreeProvider } from "./views/archiveTree";
import { parseArchive } from "./parsers/archive";
import { createTreeAdapter } from "./views/treeAdapter";
import type { SessionState } from "./core/sessionState";
import type { GitExecDeps } from "./core/gitIntegration";

export interface WebviewPanelsDeps {
  session: SessionState;
  workspaceRoot: string | undefined;
  gitExec: GitExecDeps | undefined;
}

export interface WebviewPanelsResult {
  dependencyGraph: DependencyGraphPanel;
  configWizard: ConfigWizardPanel;
  replayViewer: ReplayViewerPanel;
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

  return { dependencyGraph, configWizard, replayViewer, planCodeLens, disposables };
}

export interface ArchiveViewDeps {
  workspaceRoot: string | undefined;
}

export interface ArchiveViewResult {
  archiveTree: ArchiveTreeProvider;
  archiveView: vscode.TreeView<any>;
  archiveDidChange: vscode.EventEmitter<any>;
  resolveArchiveItem: (element: any) => any;
  refreshArchive: () => Promise<void>;
}

export function createArchiveView(deps: ArchiveViewDeps): ArchiveViewResult {
  const archiveTree = new ArchiveTreeProvider();
  const {
    dataProvider: archiveDataProvider,
    emitter: archiveDidChange,
    resolveItem: resolveArchiveItem,
  } = createTreeAdapter(archiveTree, (item, treeItem) => {
    if (item.archiveName) {
      (treeItem as any).archiveName = item.archiveName;
    }
  });

  const archiveView = vscode.window.createTreeView("oxveil.archive", {
    treeDataProvider: archiveDataProvider,
  });

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
    archiveDidChange.fire(undefined);
  };

  return { archiveTree, archiveView, archiveDidChange, resolveArchiveItem, refreshArchive };
}
