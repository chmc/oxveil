export type PlanFileCategory = "design" | "implementation" | "plan" | "ai-parsed";

export interface FileSystemWatcher {
  onDidChange: (cb: () => void) => { dispose: () => void };
  onDidCreate: (cb: () => void) => { dispose: () => void };
  onDidDelete: (cb: () => void) => { dispose: () => void };
  dispose: () => void;
}

export interface PersistedPlanState {
  planPath: string;
  resolvedAt: number;
}

export interface PlanPreviewPanelDeps {
  createWebviewPanel: (
    viewType: string,
    title: string,
    showOptions: number,
    options: { enableScripts: boolean; retainContextWhenHidden: boolean },
  ) => WebviewPanel;
  readFile: (filePath: string) => Promise<string>;
  findAllPlanFiles: () => Promise<Array<{ path: string; category: PlanFileCategory; mtimeMs: number }>>;
  onAnnotation: (phase: string, text: string) => void;
  createFileSystemWatcher?: (glob: string) => FileSystemWatcher;
  statFile?: (filePath: string) => Promise<{ birthtimeMs: number; mtimeMs: number } | undefined>;
  onFormPlan?: () => void;
  onStart?: () => void;
  persistPlanPath?: (state: PersistedPlanState | undefined) => void;
  loadPersistedPlanPath?: () => PersistedPlanState | undefined;
  fileExists?: (filePath: string) => Promise<boolean>;
}

export interface WebviewPanel {
  webview: Webview;
  visible: boolean;
  reveal: () => void;
  onDidDispose: (cb: () => void) => void;
  onDidChangeViewState: (cb: () => void) => void;
  dispose: () => void;
}

interface Webview {
  html: string;
  cspSource: string;
  postMessage: (msg: any) => void;
  onDidReceiveMessage: (cb: (msg: any) => void) => void;
}
