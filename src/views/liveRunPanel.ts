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
  private _runStartedAt: number | undefined;
  private _aiParseActionListeners: Array<(action: string) => void> = [];
  private _aiParseStatus: "idle" | "parsing" | "complete" | "needs-input" = "idle";

  constructor(deps: LiveRunPanelDeps) {
    this._deps = deps;
    this._collapsed = !!deps.getConfig("liveRunDashboardCollapsed");
  }

  get visible(): boolean {
    return this._panel !== undefined;
  }

  get currentFolderUri(): string | undefined {
    return this._currentFolderUri;
  }

  get panel(): WebviewPanel | undefined {
    return this._panel;
  }

  reveal(progress: ProgressState, folderUri?: string): void {
    this._currentFolderUri = folderUri;
    this._lastProgress = progress;
    if (!this._runStartedAt) {
      this._runStartedAt = Date.now();
    }

    // Clear any stale AI parse status when switching to normal run mode
    if (this._aiParseStatus !== "idle") {
      this._aiParseStatus = "idle";
      if (this._panel) {
        this._panel.webview.postMessage({ type: "ai-parse-status", status: "idle" });
      }
    }

    this._ensurePanel();
    this._sendDashboard(progress);
    this._flushBuffer();
  }

  revealForAiParse(folderUri?: string): void {
    this._currentFolderUri = folderUri;
    this._aiParseStatus = "parsing";
    this.clear();
    this._ensurePanel();
    this._panel!.webview.postMessage({ type: "ai-parse-status", status: "parsing" });
  }

  onProgressChanged(progress: ProgressState): void {
    this._lastProgress = progress;
    if (this._panel) {
      // Clear any stale AI parse status when normal run updates arrive
      if (this._aiParseStatus !== "idle") {
        this._aiParseStatus = "idle";
        this._panel.webview.postMessage({ type: "ai-parse-status", status: "idle" });
      }
      this._sendDashboard(progress);
    }
  }

  onLogAppended(fullContent: string): void {
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
      const todoMatch = line.match(/\[Todos:\s*(\d+)\/(\d+)\s+done\]\s*\u25b8\s*"([^"]*)"/);
      if (todoMatch) {
        this._todoDone = parseInt(todoMatch[1], 10);
        this._todoTotal = parseInt(todoMatch[2], 10);
        this._todoCurrentItem = todoMatch[3];
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
      this._panel.webview.postMessage({ type: "log-append", lines });
    }
  }

  onVerifyFailed(options: VerifyFailedOptions): void {
    this._ensurePanel();
    this._aiParseStatus = "needs-input";
    this._panel!.webview.postMessage({ type: "ai-parse-status", status: "needs-input" });
    const html = renderVerifyFailedBannerHtml(options);
    this._panel!.webview.postMessage({ type: "verify-failed", html });
  }

  onVerifyPassed(options: VerifyPassedOptions): void {
    if (!this._panel) return;
    this.onAiParseComplete();
    const html = renderVerifyPassedBannerHtml(options);
    this._panel.webview.postMessage({ type: "verify-passed", html });
  }

  onAiParseComplete(): void {
    if (!this._panel) return;
    this._aiParseStatus = "complete";
    this._panel.webview.postMessage({ type: "ai-parse-status", status: "complete" });
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
    this._panel.webview.postMessage({ type: "run-finished", html });
  }

  clear(): void {
    this._logOffset = 0;
    this._logBuffer = [];
    this._totalCost = 0;
    this._runStartedAt = undefined;
  }

  dispose(): void {
    this._panel?.dispose();
    this._panel = undefined;
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
      });
      this._panel.webview.onDidReceiveMessage((msg: any) => {
        if (msg.type === "toggle-dashboard") {
          this._collapsed = !this._collapsed;
          if (this._lastProgress) {
            this._sendDashboard(this._lastProgress);
          }
        } else if (msg.type === "open-replay") {
          this._deps.executeCommand("oxveil.openReplayViewer");
        } else if (msg.type === "ai-parse-retry" || msg.type === "ai-parse-continue" || msg.type === "ai-parse-abort" || msg.type === "open-result") {
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
    };
    const html = renderDashboardHtml(progress, options);
    this._panel!.webview.postMessage({ type: "dashboard", html });
  }

  private _flushBuffer(): void {
    if (this._logBuffer.length > 0 && this._panel) {
      const lines = this._logBuffer.map((l) => formatLogLine(l));
      this._panel.webview.postMessage({ type: "log-append", lines });
    }
  }

  private _getMaxLines(): number {
    return this._deps.getConfig("liveRunLogLines") ?? 1000;
  }
}
