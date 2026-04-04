import { randomBytes } from "node:crypto";
import type { ProgressState } from "../types";
import { renderDashboardHtml, type DashboardOptions } from "./liveRunHtml";
import { renderLiveRunShell } from "./liveRunHtml";
import { escapeHtml } from "../utils/html";

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
          this._deps.executeCommand("oxveil.openReplay");
        }
      });
    } else {
      this._panel.reveal();
    }

    this._sendDashboard(progress);
    this._flushBuffer();
  }

  onProgressChanged(progress: ProgressState): void {
    this._lastProgress = progress;
    if (this._panel) {
      this._sendDashboard(progress);
    }
  }

  onLogAppended(fullContent: string): void {
    const newContent = fullContent.slice(this._logOffset);
    this._logOffset = fullContent.length;
    if (!newContent) return;

    const newLines = newContent.split("\n").filter((l) => l.length > 0);
    if (newLines.length === 0) return;

    // Parse cost from session summary lines
    for (const line of newLines) {
      const costMatch = line.match(/cost=\$([0-9.]+)/);
      if (costMatch) {
        this._totalCost += parseFloat(costMatch[1]) || 0;
      }
    }

    const maxLines = this._getMaxLines();
    for (const line of newLines) {
      this._logBuffer.push(line);
    }
    while (this._logBuffer.length > maxLines) {
      this._logBuffer.shift();
    }

    if (this._panel) {
      const lines = newLines.map((l) => escapeHtml(l));
      this._panel.webview.postMessage({ type: "log-append", lines });
    }
  }

  onRunFinished(_status?: string): void {
    // Stub — implemented in Task 3
  }

  clear(): void {
    this._logOffset = 0;
    this._logBuffer = [];
    this._totalCost = 0;
  }

  dispose(): void {
    this._panel?.dispose();
    this._panel = undefined;
  }

  private _sendDashboard(progress: ProgressState): void {
    const options: DashboardOptions = {
      totalCost: this._totalCost || undefined,
      collapsed: this._collapsed,
    };
    const html = renderDashboardHtml(progress, options);
    this._panel!.webview.postMessage({ type: "dashboard", html });
  }

  private _flushBuffer(): void {
    if (this._logBuffer.length > 0 && this._panel) {
      const lines = this._logBuffer.map((l) => escapeHtml(l));
      this._panel.webview.postMessage({ type: "log-append", lines });
    }
  }

  private _getMaxLines(): number {
    return this._deps.getConfig("liveRunLogLines") ?? 1000;
  }
}
