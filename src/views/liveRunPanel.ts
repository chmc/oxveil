import { randomBytes } from "node:crypto";
import type { ProgressState } from "../types";
import { renderDashboardHtml, renderCompletionBannerHtml, renderVerifyFailedBannerHtml, renderVerifyPassedBannerHtml, type DashboardOptions, type VerifyFailedOptions, type VerifyPassedOptions } from "./liveRunHtml";
import { renderLiveRunShell } from "./liveRunHtml";
import { formatLogLine } from "../parsers/logFormatter";

export interface LiveRunPanelDeps {
  createWebviewPanel: (
    viewType: string,
    title: string,
    showOptions: number,
    options: { enableScripts: boolean; retainContextWhenHidden: boolean },
  ) => WebviewPanel;
  executeCommand: (command: string, ...args: any[]) => void;
  getConfig: (key: string) => any;
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

export class LiveRunPanel {
  private _panel: WebviewPanel | undefined;
  private _disposed = false;
  private readonly _deps: LiveRunPanelDeps;
  private _currentFolderUri: string | undefined;

  private _logOffset = 0;
  private _logBuffer: string[] = [];
  private _totalCost = 0;
  private _collapsed = false;
  private _lastProgress: ProgressState | undefined;
  private _todoDone = 0;
  private _todoTotal = 0;
  private _todoCurrentItem: string | undefined;
  private _taskItems: Array<{ name: string; status: 'pending' | 'in_progress' | 'completed' }> = [];
  private _runStartedAt: number | undefined;
  private _aiParseActionListeners: Array<(action: string) => void> = [];
  private _aiParseStatus: "idle" | "parsing" | "complete" | "needs-input" = "idle";
  private _webviewReady = false;
  private _pendingMessages: unknown[] = [];

  constructor(deps: LiveRunPanelDeps) {
    this._deps = deps;
    this._collapsed = !!deps.getConfig("liveRunDashboardCollapsed");
  }

  get visible(): boolean {
    return this._panel !== undefined && this._webviewReady;
  }

  get currentFolderUri(): string | undefined {
    return this._currentFolderUri;
  }

  get panel(): WebviewPanel | undefined {
    return this._panel;
  }

  clearAiParseStatus(): void {
    if (this._aiParseStatus !== "idle") {
      this._aiParseStatus = "idle";
      this._postMessage({ type: "ai-parse-status", status: "idle" });
      // Also clear any verify banner that might be showing
      this._postMessage({ type: "clear-verify-banner" });
    }
  }

  reveal(progress: ProgressState, folderUri?: string): void {
    if (this._disposed) return;
    this._currentFolderUri = folderUri;
    this._lastProgress = progress;
    if (!this._runStartedAt) {
      this._runStartedAt = Date.now();
    }

    this._ensurePanel();
    // Clear any stale AI parse status when switching to normal run mode
    this.clearAiParseStatus();
    this._sendDashboard(progress);
    this._flushBuffer();
  }

  revealForAiParse(folderUri?: string): void {
    if (this._disposed) return;
    this._currentFolderUri = folderUri;
    this._aiParseStatus = "parsing";
    this.clear();
    this._ensurePanel();
    this._postMessage({ type: "ai-parse-status", status: "parsing" });
  }

  onProgressChanged(progress: ProgressState): void {
    this._lastProgress = progress;
    if (this._panel) {
      // Skip dashboard updates when ai-parse is in a terminal state (complete or needs-input)
      // to prevent file watcher activity from clearing the verify banner.
      // These states are cleared explicitly by reveal() or clearAiParseStatus().
      if (this._aiParseStatus === "complete" || this._aiParseStatus === "needs-input") {
        return;
      }
      this._sendDashboard(progress);
    }
  }

  onLogAppended(fullContent: string): void {
    if (this._disposed) return;
    if (fullContent.length < this._logOffset) {
      this._logOffset = 0;
    }
    const newContent = fullContent.slice(this._logOffset);
    this._logOffset = fullContent.length;
    if (!newContent) return;

    const newLines = newContent.split("\n").filter((l) => l.length > 0);
    if (newLines.length === 0) return;

    // Parse cost and todo progress from log lines
    let todoUpdated = false;
    for (const line of newLines) {
      const costMatch = line.match(/cost=\$([0-9.]+)/);
      if (costMatch) {
        this._totalCost += parseFloat(costMatch[1]) || 0;
      }
      const createdMatch = line.match(/\[Todo created\]\s*"([^"]+)"/);
      if (createdMatch) {
        this._taskItems.push({ name: createdMatch[1], status: 'pending' });
        todoUpdated = true;
      }

      const completedMatch = line.match(/\[Todo completed\]\s*\u2713\s*"([^"]+)"/);
      if (completedMatch) {
        const item = this._taskItems.find(t => t.name === completedMatch[1]);
        if (item) item.status = 'completed';
        todoUpdated = true;
      }

      const todoMatch = line.match(/\[Todos:\s*(\d+)\/(\d+)\s+done\]\s*\u25b8\s*"([^"]*)"/);
      if (todoMatch) {
        this._todoDone = parseInt(todoMatch[1], 10);
        this._todoTotal = parseInt(todoMatch[2], 10);
        this._todoCurrentItem = todoMatch[3];
        const inProgressItem = this._taskItems.find(t => t.name === todoMatch[3]);
        if (inProgressItem) inProgressItem.status = 'in_progress';
        todoUpdated = true;
      }

      const taskCreatedMatch = line.match(/\[Task created\]\s*"([^"]+)"/);
      if (taskCreatedMatch) {
        this._taskItems.push({ name: taskCreatedMatch[1], status: 'pending' });
        todoUpdated = true;
      }

      const taskCompletedMatch = line.match(/\[Task completed\]\s*\u2713\s*"([^"]+)"/);
      if (taskCompletedMatch) {
        const item = this._taskItems.find(t => t.name === taskCompletedMatch[1]);
        if (item) item.status = 'completed';
        todoUpdated = true;
      }

      const taskMatch = line.match(/\[Tasks:\s*(\d+)\/(\d+)\s+done\]\s*\u25b8\s*"([^"]*)"/);
      if (taskMatch) {
        this._todoDone = parseInt(taskMatch[1], 10);
        this._todoTotal = parseInt(taskMatch[2], 10);
        const inProgressItem = this._taskItems.find(t => t.name === taskMatch[3]);
        if (inProgressItem) inProgressItem.status = 'in_progress';
        todoUpdated = true;
      }
    }

    if (todoUpdated && this._panel && this._lastProgress) {
      this._sendDashboard(this._lastProgress);
    }

    const maxLines = this._getMaxLines();
    for (const line of newLines) {
      this._logBuffer.push(line);
    }
    while (this._logBuffer.length > maxLines) {
      this._logBuffer.shift();
    }

    if (this._panel) {
      const lines = newLines.map((l) => formatLogLine(l));
      this._postMessage({ type: "log-append", lines });
    }
  }

  onVerifyFailed(options: VerifyFailedOptions): void {
    if (this._disposed) return;
    this._ensurePanel();
    this._aiParseStatus = "needs-input";
    this._postMessage({ type: "ai-parse-status", status: "needs-input" });
    const html = renderVerifyFailedBannerHtml(options);
    this._postMessage({ type: "verify-failed", html });
  }

  onVerifyPassed(options: VerifyPassedOptions): void {
    if (!this._panel) return;
    this.onAiParseComplete();
    const html = renderVerifyPassedBannerHtml(options);
    this._postMessage({ type: "verify-passed", html });
  }

  onAiParseComplete(): void {
    if (!this._panel) return;
    this._aiParseStatus = "complete";
    this._postMessage({ type: "ai-parse-status", status: "complete" });
  }

  onAiParseAction(listener: (action: string) => void): () => void {
    this._aiParseActionListeners.push(listener);
    return () => {
      const idx = this._aiParseActionListeners.indexOf(listener);
      if (idx !== -1) this._aiParseActionListeners.splice(idx, 1);
    };
  }

  triggerAiParseAction(action: string): void {
    for (const listener of this._aiParseActionListeners) {
      listener(action);
    }
  }

  onRunFinished(status?: string): void {
    if (!this._panel) return;
    const durationMs = this._runStartedAt ? Date.now() - this._runStartedAt : undefined;
    const html = renderCompletionBannerHtml(status ?? "done", {
      totalCost: this._totalCost || undefined,
      totalPhases: this._lastProgress?.totalPhases,
      durationMs,
    });
    this._postMessage({ type: "run-finished", html });
  }

  clear(): void {
    this._logOffset = 0;
    this._logBuffer = [];
    this._totalCost = 0;
    this._runStartedAt = undefined;
    this._taskItems = [];
  }

  dispose(): void {
    this._disposed = true;
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

  private _ensurePanel(): void {
    if (!this._panel) {
      const nonce = randomBytes(16).toString("hex");
      this._panel = this._deps.createWebviewPanel(
        "oxveil.liveRun",
        "Live Run",
        1, // ViewColumn.One
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this._panel.webview.html = renderLiveRunShell(nonce, this._panel.webview.cspSource);
      this._panel.onDidDispose(() => {
        this._panel = undefined;
        this._webviewReady = false;
        this._pendingMessages = [];
      });
      this._panel.webview.onDidReceiveMessage((msg: any) => {
        if (msg.type === "ready") {
          this._webviewReady = true;
          for (const pending of this._pendingMessages) {
            this._panel?.webview.postMessage(pending);
          }
          this._pendingMessages = [];
          return;
        }
        if (msg.type === "toggle-dashboard") {
          this._collapsed = !this._collapsed;
          if (this._lastProgress) {
            this._sendDashboard(this._lastProgress);
          }
        } else if (msg.type === "open-replay") {
          this._deps.executeCommand("oxveil.openReplayViewer");
        } else if (msg.type === "open-result") {
          // Handle open-result directly - open the ai-parsed-plan.md file
          // Pass the folder URI so the correct workspace's file is opened
          this._deps.executeCommand("oxveil._openParsedPlan", this._currentFolderUri);
          for (const listener of this._aiParseActionListeners) {
            listener(msg.type);
          }
        } else if (msg.type === "ai-parse-retry" || msg.type === "ai-parse-continue" || msg.type === "ai-parse-abort") {
          for (const listener of this._aiParseActionListeners) {
            listener(msg.type);
          }
        }
      });
    } else {
      this._panel.reveal();
    }
  }

  private _sendDashboard(progress: ProgressState): void {
    const options: DashboardOptions = {
      totalCost: this._totalCost || undefined,
      collapsed: this._collapsed,
      todoDone: this._todoTotal > 0 ? this._todoDone : undefined,
      todoTotal: this._todoTotal > 0 ? this._todoTotal : undefined,
      todoCurrentItem: this._todoCurrentItem,
      taskItems: this._taskItems.length > 0 ? this._taskItems : undefined,
    };
    const html = renderDashboardHtml(progress, options);
    this._postMessage({ type: "dashboard", html });
  }

  private _flushBuffer(): void {
    if (this._logBuffer.length > 0 && this._panel) {
      const lines = this._logBuffer.map((l) => formatLogLine(l));
      this._postMessage({ type: "log-append", lines });
    }
  }

  private _getMaxLines(): number {
    return this._deps.getConfig("liveRunLogLines") ?? 1000;
  }
}
