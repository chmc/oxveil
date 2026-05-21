import { randomBytes } from "node:crypto";
import { parsePlanWithDescriptions } from "../parsers/planDescription";
import { validatePlan } from "../parsers/planValidator";
import { parsePlan } from "../parsers/plan";
import { parseSections } from "../parsers/planSections";
import { renderPhaseCardsHtml, type PhaseCardData, type PhaseCardsOptions } from "./planPreviewHtml";
import { renderPlanPreviewShell } from "./planPreviewShell";
import { PlanFileResolver } from "./planFileResolver";
import type { PlanPreviewState } from "./sidebarState";
import type {
  PlanFileCategory,
  FileSystemWatcher,
  PersistedPlanState,
  PlanPreviewPanelDeps,
  WebviewPanel,
} from "./planPreviewTypes";

export type { PlanFileCategory, FileSystemWatcher, PersistedPlanState, PlanPreviewPanelDeps };

export class PlanPreviewPanel {
  private _panel: WebviewPanel | undefined;
  private readonly _deps: PlanPreviewPanelDeps;
  private readonly _resolver: PlanFileResolver;
  private _sessionActive = false;
  private _planFormed = false;
  private _lastPhases: PhaseCardData[] = [];
  private _lastValid = false;
  private _lastFormat: PhaseCardsOptions["format"] = undefined;
  private _lastTitle: string | undefined;
  private _lastKeyword: string | undefined;
  private _watchers: FileSystemWatcher[] = [];
  private _watcherSubscriptions: { dispose: () => void }[] = [];
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private _pollTimer: ReturnType<typeof setInterval> | undefined;
  private _readSeq = 0;
  private _lastRawContent: string | undefined;
  private _webviewReady = false;
  private _pendingMessages: unknown[] = [];
  private _disposed = false;

  constructor(deps: PlanPreviewPanelDeps) {
    this._deps = deps;
    this._resolver = new PlanFileResolver({
      statFile: deps.statFile,
      persistPlanPath: deps.persistPlanPath,
      loadPersistedPlanPath: deps.loadPersistedPlanPath,
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
        { enableScripts: true, retainContextWhenHidden: false },
      );
      this._setupPanel(nonce);
    } else {
      this._panel.reveal();
    }
    this._startPolling();
  }

  /**
   * Restore panel from VS Code's webview serializer (called after reload).
   */
  restorePanel(panel: WebviewPanel): void {
    if (this._panel) {
      panel.dispose();
      return;
    }
    this._panel = panel;
    const nonce = randomBytes(16).toString("hex");
    this._setupPanel(nonce);
    this._startPolling();
    void this.onFileChanged();
  }

  private _setupPanel(nonce: string): void {
    if (!this._panel) return;
    this._panel.webview.html = renderPlanPreviewShell(nonce, this._panel.webview.cspSource);
    this._panel.onDidDispose(() => {
      this._panel = undefined;
      this._webviewReady = false;
      this._pendingMessages = [];
      clearInterval(this._pollTimer);
      this._pollTimer = undefined;
    });
    this._panel.onDidChangeViewState(() => {
      if (this._panel?.visible && this._webviewReady) {
        void this.onFileChanged();
      }
    });
    this._panel.webview.onDidReceiveMessage((msg: any) => {
      if (msg.type === "ready") {
        this._webviewReady = true;
        for (const pending of this._pendingMessages) {
          this._panel?.webview.postMessage(pending);
        }
        this._pendingMessages = [];
        this._sendUpdate();
      } else if (msg.type === "annotation" && msg.phase && msg.text) {
        this._deps.onAnnotation(msg.phase, msg.text);
      } else if (msg.type === "switchTab" && msg.category) {
        void this._onTabSwitch(msg.category as PlanFileCategory);
      } else if (msg.type === "formPlan") {
        this._deps.onFormPlan?.();
      } else if (msg.type === "start") {
        this._deps.onStart?.();
      }
    });
  }

  private _startPolling(): void {
    if (this._pollTimer) return;
    this._pollTimer = setInterval(() => { void this.onFileChanged(); }, 5000);
  }

  beginSession(): void {
    this._resolver.beginSession();
    this._lastTitle = undefined;
    this._lastPhases = [];
    this._lastValid = false;
    this._lastFormat = undefined;
    this._lastKeyword = undefined;
    this._lastRawContent = undefined;
    if (this._panel) this._sendUpdate();
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
    if (this._disposed) return;
    const seq = ++this._readSeq;
    const candidates = await this._deps.findAllPlanFiles();
    if (seq !== this._readSeq) return;
    const tracked = await this._resolver.resolve(candidates);
    if (seq !== this._readSeq) return;

    if (!tracked) {
      this._lastPhases = [];
      this._lastValid = false;
      this._lastRawContent = undefined;
      this._lastTitle = undefined;
      this._lastFormat = undefined;
      this._lastKeyword = undefined;
      if (this._panel) this._sendUpdate();
      return;
    }

    await this._parseAndRender(tracked.path, seq);
  }

  private async _parseAndRender(filePath: string, seq?: number): Promise<void> {
    if (this._disposed) return;
    const content = await this._deps.readFile(filePath);
    if (seq !== undefined && seq !== this._readSeq) return;

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

    if (this._panel) this._sendUpdate();
  }

  setSessionActive(active: boolean): void {
    this._sessionActive = active;
    this._sendUpdate();
  }

  setPlanFormed(formed: boolean): void {
    this._planFormed = formed;
    this._sendUpdate();
  }

  startWatching(watchers: FileSystemWatcher[]): void {
    this.stopWatching();

    this._watchers = watchers;

    const handler = () => {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this._debounceTimer = undefined;
        void this.onFileChanged();
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

  getTrackedPaths(): string[] {
    return this._resolver?.getTrackedPaths() ?? [];
  }

  public getPlanPreviewState(): PlanPreviewState {
    return {
      visible: this._panel !== undefined && this._webviewReady,
      sessionActive: this._sessionActive,
      planFormed: this._planFormed,
      valid: this._lastValid,
      format: this._lastFormat,
      title: this._lastTitle,
      phases: this._lastPhases.map(p => ({
        number: p.number,
        title: p.title,
        description: p.description,
      })),
      activeFilePath: this.getActiveFilePath(),
    };
  }

  refresh(): void {
    this._sendUpdate();
  }

  dispose(): void {
    this._disposed = true;
    this.stopWatching();
    clearInterval(this._pollTimer);
    this._pollTimer = undefined;
    this._panel?.dispose();
    this._panel = undefined;
    this._webviewReady = false;
    this._pendingMessages = [];
  }

  private _postMessage(msg: unknown): void {
    if (!this._panel) return;
    if (!this._webviewReady) {
      if (this._pendingMessages.length < 100) {
        this._pendingMessages.push(msg);
      }
      return;
    }
    this._panel.webview.postMessage(msg);
  }

  private async _onTabSwitch(category: PlanFileCategory): Promise<void> {
    if (this._disposed) return;
    const seq = ++this._readSeq;
    const tracked = this._resolver.switchTab(category);
    if (!tracked) return;
    await this._parseAndRender(tracked.path, seq);
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
      planFormed: this._planFormed,
    };
    const html = renderPhaseCardsHtml(options);
    this._postMessage({ type: "update", html });
  }
}
