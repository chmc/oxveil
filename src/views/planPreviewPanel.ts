import { randomBytes } from "node:crypto";
import { parsePlanWithDescriptions } from "../parsers/planDescription";
import { validatePlan } from "../parsers/planValidator";
import { parsePlan } from "../parsers/plan";
import { parseSections } from "../parsers/planSections";
import { renderPhaseCardsHtml, renderPlanPreviewShell, type PhaseCardData, type PhaseCardsOptions } from "./planPreviewHtml";

export type PlanFileCategory = "design" | "implementation" | "plan";

interface TrackedFile {
  path: string;
  category: PlanFileCategory;
  birthtimeMs: number;
}

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
  statFile?: (filePath: string) => Promise<{ birthtimeMs: number } | undefined>;
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
  private _sessionActive = false;
  private _lastPhases: PhaseCardData[] = [];
  private _lastValid = false;
  private _lastFormat: PhaseCardsOptions["format"] = undefined;
  private _lastTitle: string | undefined;
  private _lastKeyword: string | undefined;
  private _watchers: FileSystemWatcher[] = [];
  private _watcherSubscriptions: { dispose: () => void }[] = [];
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private _sessionStartTime: number | undefined;
  private _trackedFiles = new Map<PlanFileCategory, TrackedFile>();
  private _activeCategory: PlanFileCategory | undefined;
  private _autoSwitch = true;
  private _sessionDataResolved = false;

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

  private _lastRawContent: string | undefined;

  beginSession(): void {
    this._sessionStartTime = Date.now();
    this._trackedFiles = new Map();
    this._activeCategory = undefined;
    this._autoSwitch = true;
    this._sessionDataResolved = false;
    this._deps.persistPlanPath?.(undefined);
  }

  endSession(): void {
    this._sessionStartTime = undefined;
  }

  async nextTab(): Promise<void> {
    if (this._trackedFiles.size < 2) return;
    const keys = Array.from(this._trackedFiles.keys());
    const currentIndex = this._activeCategory ? keys.indexOf(this._activeCategory) : -1;
    const nextIndex = (currentIndex + 1) % keys.length;
    await this._onTabSwitch(keys[nextIndex]);
  }

  async onFileChanged(): Promise<void> {
    // Scan all plan files and update tracked files
    const candidates = await this._deps.findAllPlanFiles();
    let newCategoryAdded: PlanFileCategory | undefined;

    if (this._sessionStartTime) {
      // Session-aware tracking: only track files created after session start
      for (const candidate of candidates) {
        if (!this._deps.statFile) continue;

        const stats = await this._deps.statFile(candidate.path);
        if (!stats || stats.birthtimeMs <= this._sessionStartTime) continue;

        const existing = this._trackedFiles.get(candidate.category);
        if (!existing) {
          newCategoryAdded = candidate.category;
          this._trackedFiles.set(candidate.category, {
            path: candidate.path,
            category: candidate.category,
            birthtimeMs: stats.birthtimeMs,
          });
        } else if (stats.birthtimeMs > existing.birthtimeMs) {
          this._trackedFiles.set(candidate.category, {
            path: candidate.path,
            category: candidate.category,
            birthtimeMs: stats.birthtimeMs,
          });
        }
      }
      // Persist matched plan path for reload recovery
      const activePath = this._activeCategory
        ? this._trackedFiles.get(this._activeCategory)?.path
        : this._trackedFiles.size > 0
          ? this._trackedFiles.values().next().value?.path
          : undefined;
      if (activePath) {
        this._deps.persistPlanPath?.({ planPath: activePath, resolvedAt: Date.now() });
      }
    } else {
      // Sessionless resolution: 4-layer pipeline
      const resolved = await this._resolveSessionless(candidates);
      if (resolved) {
        const existing = this._trackedFiles.get(resolved.category);
        if (!existing || existing.path !== resolved.path) {
          this._trackedFiles.set(resolved.category, {
            path: resolved.path,
            category: resolved.category,
            birthtimeMs: resolved.mtimeMs,
          });
          if (!this._activeCategory) {
            newCategoryAdded = resolved.category;
          }
        }
      }
    }

    // Auto-switch: always switch when a new category appears
    if (newCategoryAdded) {
      this._activeCategory = newCategoryAdded;
    } else if (!this._activeCategory && this._trackedFiles.size > 0) {
      this._activeCategory = this._trackedFiles.keys().next().value;
    }

    if (!this._panel) return;

    const tracked = this._activeCategory ? this._trackedFiles.get(this._activeCategory) : undefined;
    if (!tracked) {
      this._lastPhases = [];
      this._lastValid = false;
      this._lastRawContent = undefined;
      this._sendUpdate();
      return;
    }

    await this._parseAndRender(tracked.path);
  }

  private async _resolveSessionless(
    candidates: Array<{ path: string; category: PlanFileCategory; mtimeMs: number }>,
  ): Promise<{ path: string; category: PlanFileCategory; mtimeMs: number } | undefined> {
    // Layer 1: workspaceState cache
    const cached = this._deps.loadPersistedPlanPath?.();
    if (cached) {
      const exists = this._deps.fileExists
        ? await this._deps.fileExists(cached.planPath)
        : candidates.some((c) => c.path === cached.planPath);
      if (exists) {
        const match = candidates.find((c) => c.path === cached.planPath);
        if (match) return match;
        // File exists but not in candidates (e.g., directory not scanned) — use "plan" category
        return { path: cached.planPath, category: "plan", mtimeMs: cached.resolvedAt };
      }
    }

    // Layer 2: Session JSONL lookup (runs once per activation)
    if (!this._sessionDataResolved && this._deps.resolveFromSessionData) {
      this._sessionDataResolved = true;
      try {
        const result = await this._deps.resolveFromSessionData();
        if (result) {
          this._deps.persistPlanPath?.({ planPath: result.planPath, resolvedAt: Date.now() });
          const match = candidates.find((c) => c.path === result.planPath);
          if (match) return match;
          return { path: result.planPath, category: "plan", mtimeMs: Date.now() };
        }
      } catch {
        // Layer 2 failed gracefully — fall through
      }
    }

    // Layer 4: mtimeMs fallback
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
      return candidates[0];
    }

    return undefined;
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
    if (!this._activeCategory) return undefined;
    return this._trackedFiles.get(this._activeCategory)?.path;
  }

  dispose(): void {
    this.stopWatching();
    this._panel?.dispose();
    this._panel = undefined;
  }

  private async _onTabSwitch(category: PlanFileCategory): Promise<void> {
    const tracked = this._trackedFiles.get(category);
    if (!tracked) return;
    this._autoSwitch = false;
    this._activeCategory = category;
    await this._parseAndRender(tracked.path);
  }

  private _buildTabs(): PhaseCardsOptions["tabs"] {
    if (this._trackedFiles.size < 2) return undefined;
    const labelMap: Record<PlanFileCategory, string> = {
      design: "Design",
      implementation: "Implementation",
      plan: "Plan",
    };
    return Array.from(this._trackedFiles.keys()).map((cat) => ({
      category: cat,
      label: labelMap[cat],
      active: cat === this._activeCategory,
    }));
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
      tabs: this._buildTabs(),
      showFormButton: state !== "empty",
    };
    const html = renderPhaseCardsHtml(options);
    this._panel.webview.postMessage({ type: "update", html });
  }
}
