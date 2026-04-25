import { randomBytes } from "node:crypto";
import { parsePlanWithDescriptions } from "../parsers/planDescription";
import { validatePlan } from "../parsers/planValidator";
import { parsePlan } from "../parsers/plan";
import { parseSections } from "../parsers/planSections";
import { renderPhaseCardsHtml, renderPlanPreviewShell, type PhaseCardData, type PhaseCardsOptions } from "./planPreviewHtml";
import { PlanFileResolver } from "./planFileResolver";

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
  persistPlanPath?: (state: PersistedPlanState | undefined) => void;
  loadPersistedPlanPath?: () => PersistedPlanState | undefined;
  resolveFromSessionData?: () => Promise<{ planPath: string } | undefined>;
  fileExists?: (filePath: string) => Promise<boolean>;
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
  private readonly _resolver: PlanFileResolver;
  private _sessionActive = false;
  private _lastPhases: PhaseCardData[] = [];
  private _lastValid = false;
  private _lastFormat: PhaseCardsOptions["format"] = undefined;
  private _lastTitle: string | undefined;
  private _lastKeyword: string | undefined;
  private _watchers: FileSystemWatcher[] = [];
  private _watcherSubscriptions: { dispose: () => void }[] = [];
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private _lastRawContent: string | undefined;

  constructor(deps: PlanPreviewPanelDeps) {
    this._deps = deps;
    this._resolver = new PlanFileResolver({
      statFile: deps.statFile,
      persistPlanPath: deps.persistPlanPath,
      loadPersistedPlanPath: deps.loadPersistedPlanPath,
      resolveFromSessionData: deps.resolveFromSessionData,
      fileExists: deps.fileExists,
    });
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
        } else if (msg.type === "switchTab" && msg.category) {
          this._onTabSwitch(msg.category as PlanFileCategory);
        } else if (msg.type === "formPlan") {
          this._deps.onFormPlan?.();
        }
      });
    } else {
      this._panel.reveal();
    }
  }

  beginSession(): void {
    this._resolver.beginSession();
  }

  endSession(): void {
    this._resolver.endSession();
  }

  async nextTab(): Promise<void> {
    const nextCategory = this._resolver.nextTabCategory();
    if (nextCategory) {
      await this._onTabSwitch(nextCategory);
    }
  }

  async onFileChanged(): Promise<void> {
    const candidates = await this._deps.findAllPlanFiles();
    const tracked = await this._resolver.resolve(candidates);

    if (!this._panel) return;

    if (!tracked) {
      this._lastPhases = [];
      this._lastValid = false;
      this._lastRawContent = undefined;
      this._sendUpdate();
      return;
    }

    await this._parseAndRender(tracked.path);
  }

  private async _parseAndRender(filePath: string): Promise<void> {
    const content = await this._deps.readFile(filePath);

    const titleMatch = content.match(/^#\s+(.+)$/m);
    this._lastTitle = titleMatch ? titleMatch[1].trim() : undefined;

    try {
      const parsed = parsePlanWithDescriptions(content);
      const basePlan = parsePlan(content);
      const validation = validatePlan(basePlan);

      if (parsed.phases.length > 0) {
        this._lastValid = validation.valid;
        this._lastFormat = "phase";
        this._lastPhases = parsed.phases.map((p) => ({
          number: p.number,
          title: p.title,
          description: p.description,
          dependencies: p.dependencies,
        }));
        this._lastRawContent = undefined;
      } else {
        const sectionResult = parseSections(content);
        if (sectionResult.phases.length > 0) {
          this._lastFormat = sectionResult.format === "keyword" ? "keyword" : "numbered";
          this._lastPhases = sectionResult.phases.map((p) => ({
            number: p.number,
            title: p.title,
            description: p.description,
            dependencies: p.dependencies,
          }));
          this._lastValid = true;
          this._lastRawContent = undefined;
          this._lastKeyword = sectionResult.keyword;
        } else if (content.trim().length > 0) {
          this._lastPhases = [];
          this._lastValid = false;
          this._lastRawContent = content;
        } else {
          this._lastPhases = [];
          this._lastValid = false;
          this._lastRawContent = undefined;
        }
      }
    } catch {
      this._lastPhases = [];
      this._lastValid = false;
      this._lastRawContent = content;
    }

    this._sendUpdate();
  }

  setSessionActive(active: boolean): void {
    this._sessionActive = active;
    this._sendUpdate();
  }

  startWatching(watchers: FileSystemWatcher[]): void {
    this.stopWatching();

    this._watchers = watchers;

    const handler = () => {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this._debounceTimer = undefined;
        this.onFileChanged();
      }, 200);
    };

    for (const watcher of this._watchers) {
      this._watcherSubscriptions.push(
        watcher.onDidChange(handler),
        watcher.onDidCreate(handler),
        watcher.onDidDelete(handler),
      );
    }
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
    for (const watcher of this._watchers) {
      watcher.dispose();
    }
    this._watchers = [];
  }

  getActiveFilePath(): string | undefined {
    return this._resolver.getActiveFilePath();
  }

  dispose(): void {
    this.stopWatching();
    this._panel?.dispose();
    this._panel = undefined;
  }

  private async _onTabSwitch(category: PlanFileCategory): Promise<void> {
    const tracked = this._resolver.switchTab(category);
    if (!tracked) return;
    await this._parseAndRender(tracked.path);
  }

  private _sendUpdate(): void {
    if (!this._panel) return;

    const hasPhases = this._lastPhases.length > 0;
    let state: PhaseCardsOptions["state"];
    if (this._lastRawContent !== undefined) {
      state = "raw-markdown";
    } else if (!hasPhases) {
      state = "empty";
    } else if (this._sessionActive) {
      state = "active";
    } else {
      state = "session-ended";
    }
    const options: PhaseCardsOptions = {
      state,
      phases: this._lastPhases,
      sessionActive: this._sessionActive,
      isValid: this._lastValid,
      rawMarkdown: this._lastRawContent,
      title: this._lastTitle,
      format: this._lastFormat,
      keyword: this._lastKeyword,
      tabs: this._resolver.buildTabs(),
      showFormButton: state !== "empty",
    };
    const html = renderPhaseCardsHtml(options);
    this._panel.webview.postMessage({ type: "update", html });
  }
}
