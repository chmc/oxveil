import { randomBytes } from "node:crypto";
import { parsePlanWithDescriptions } from "../parsers/planDescription";
import { validatePlan } from "../parsers/planValidator";
import { parsePlan } from "../parsers/plan";
import { renderPhaseCardsHtml, renderPlanPreviewShell, type PhaseCardData, type PhaseCardsOptions } from "./planPreviewHtml";

export interface FileSystemWatcher {
  onDidChange: (cb: () => void) => { dispose: () => void };
  onDidCreate: (cb: () => void) => { dispose: () => void };
  onDidDelete: (cb: () => void) => { dispose: () => void };
  dispose: () => void;
}

export interface PlanPreviewPanelDeps {
  createWebviewPanel: (
    viewType: string,
    title: string,
    showOptions: number,
    options: { enableScripts: boolean; retainContextWhenHidden: boolean },
  ) => WebviewPanel;
  readFile: () => Promise<string>;
  onAnnotation: (phase: string, text: string) => void;
  createFileSystemWatcher?: (glob: string) => FileSystemWatcher;
}

interface Webview {
  html: string;
  cspSource: string;
  postMessage: (msg: any) => void;
  onDidReceiveMessage: (cb: (msg: any) => void) => void;
}

interface WebviewPanel {
  webview: Webview;
  reveal: () => void;
  onDidDispose: (cb: () => void) => void;
  dispose: () => void;
}

export class PlanPreviewPanel {
  private _panel: WebviewPanel | undefined;
  private readonly _deps: PlanPreviewPanelDeps;
  private _sessionActive = true;
  private _lastPhases: PhaseCardData[] = [];
  private _lastValid = false;
  private _watcher: FileSystemWatcher | undefined;
  private _watcherSubscriptions: { dispose: () => void }[] = [];
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(deps: PlanPreviewPanelDeps) {
    this._deps = deps;
  }

  reveal(): void {
    if (!this._panel) {
      const nonce = randomBytes(16).toString("hex");
      this._panel = this._deps.createWebviewPanel(
        "oxveil.planPreview",
        "Plan Preview",
        2, // ViewColumn.Two
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this._panel.webview.html = renderPlanPreviewShell(nonce, this._panel.webview.cspSource);
      this._panel.onDidDispose(() => {
        this._panel = undefined;
      });
      this._panel.webview.onDidReceiveMessage((msg: any) => {
        if (msg.type === "ready") {
          this._sendUpdate();
        } else if (msg.type === "annotation" && msg.phase && msg.text) {
          this._deps.onAnnotation(msg.phase, msg.text);
        }
      });
    } else {
      this._panel.reveal();
    }
  }

  async onFileChanged(): Promise<void> {
    if (!this._panel) return;

    const content = await this._deps.readFile();
    const parsed = parsePlanWithDescriptions(content);
    const basePlan = parsePlan(content);
    const validation = validatePlan(basePlan);

    this._lastValid = validation.valid;
    this._lastPhases = parsed.phases.map((p) => ({
      number: p.number,
      title: p.title,
      description: p.description,
      dependencies: p.dependencies,
    }));

    this._sendUpdate();
  }

  setSessionActive(active: boolean): void {
    this._sessionActive = active;
    this._sendUpdate();
  }

  startWatching(workspaceRoot: string): void {
    if (!this._deps.createFileSystemWatcher) return;
    this.stopWatching();

    const glob = `${workspaceRoot}/PLAN.md`;
    this._watcher = this._deps.createFileSystemWatcher(glob);

    const handler = () => {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this._debounceTimer = undefined;
        this.onFileChanged();
      }, 200);
    };

    this._watcherSubscriptions.push(
      this._watcher.onDidChange(handler),
      this._watcher.onDidCreate(handler),
      this._watcher.onDidDelete(handler),
    );
  }

  stopWatching(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = undefined;
    }
    for (const sub of this._watcherSubscriptions) {
      sub.dispose();
    }
    this._watcherSubscriptions = [];
    this._watcher?.dispose();
    this._watcher = undefined;
  }

  dispose(): void {
    this.stopWatching();
    this._panel?.dispose();
    this._panel = undefined;
  }

  private _sendUpdate(): void {
    if (!this._panel) return;

    const hasPhases = this._lastPhases.length > 0;
    const state: PhaseCardsOptions["state"] = !hasPhases ? "empty" : this._sessionActive ? "active" : "session-ended";
    const options: PhaseCardsOptions = {
      state,
      phases: this._lastPhases,
      sessionActive: this._sessionActive,
      isValid: this._lastValid,
    };
    const html = renderPhaseCardsHtml(options);
    this._panel.webview.postMessage({ type: "update", html });
  }
}
