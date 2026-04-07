import { randomBytes } from "node:crypto";
import { parsePlanWithDescriptions } from "../parsers/planDescription";
import { validatePlan } from "../parsers/planValidator";
import { parsePlan } from "../parsers/plan";
import { parseSections } from "../parsers/planSections";
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
  readFile: (filePath: string) => Promise<string>;
  findActivePlanFile: () => Promise<string | undefined>;
  onAnnotation: (phase: string, text: string) => void;
  createFileSystemWatcher?: (glob: string) => FileSystemWatcher;
  statFile?: (filePath: string) => Promise<{ birthtimeMs: number } | undefined>;
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
  private _lastFormat: PhaseCardsOptions["format"] = undefined;
  private _lastTitle: string | undefined;
  private _lastKeyword: string | undefined;
  private _watchers: FileSystemWatcher[] = [];
  private _watcherSubscriptions: { dispose: () => void }[] = [];
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private _sessionStartTime: number | undefined;
  private _pinnedFile: string | undefined;

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

  private _lastRawContent: string | undefined;

  beginSession(): void {
    this._sessionStartTime = Date.now();
    this._pinnedFile = undefined;
  }

  endSession(): void {
    this._sessionStartTime = undefined;
    this._pinnedFile = undefined;
  }

  async onFileChanged(): Promise<void> {
    // Pinning logic runs even without panel
    let activePath: string | undefined;

    if (this._pinnedFile) {
      activePath = this._pinnedFile;
    } else if (this._sessionStartTime) {
      activePath = await this._deps.findActivePlanFile();
      // Try to pin if session is active
      if (activePath && this._deps.statFile) {
        const stats = await this._deps.statFile(activePath);
        if (stats && stats.birthtimeMs > this._sessionStartTime) {
          this._pinnedFile = activePath;
        } else {
          activePath = undefined;
        }
      } else if (activePath) {
        // statFile dep not available — cannot verify freshness, refuse to render
        activePath = undefined;
      }
    } else {
      return;
    }

    if (!this._panel) return; // No panel to update

    if (!activePath) {
      this._lastPhases = [];
      this._lastValid = false;
      this._lastRawContent = undefined;
      this._sendUpdate();
      return;
    }

    const content = await this._deps.readFile(activePath);

    // Extract plan title from first # heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    this._lastTitle = titleMatch ? titleMatch[1].trim() : undefined;

    try {
      // 1. Try Phase parser (existing format)
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
        // 2. Try Section parser (Step/Task/numbered formats)
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
          // 3. Formatted markdown fallback
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
      // Parser threw — show raw fallback
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

  dispose(): void {
    this.stopWatching();
    this._panel?.dispose();
    this._panel = undefined;
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
    };
    const html = renderPhaseCardsHtml(options);
    this._panel.webview.postMessage({ type: "update", html });
  }
}
