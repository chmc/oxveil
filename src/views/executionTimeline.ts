import * as vscode from "vscode";
import * as crypto from "node:crypto";
import type { ProgressState } from "../types";
import { computeTimeline } from "../parsers/timeline";
import { renderTimelineHtml } from "./timelineHtml";

export interface ExecutionTimelineDeps {
  createWebviewPanel: typeof vscode.window.createWebviewPanel;
  executeCommand: typeof vscode.commands.executeCommand;
}

export class ExecutionTimelinePanel {
  private _panel: vscode.WebviewPanel | undefined;
  private readonly _deps: ExecutionTimelineDeps;

  constructor(deps: ExecutionTimelineDeps) {
    this._deps = deps;
  }

  reveal(progress: ProgressState | undefined): void {
    if (this._panel) {
      this._panel.reveal();
    } else {
      this._panel = this._deps.createWebviewPanel(
        "oxveil.executionTimeline",
        "Execution Timeline",
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this._panel.onDidDispose(() => {
        this._panel = undefined;
      });
    }
    if (progress) {
      this.update(progress);
    } else {
      this._setEmptyHtml();
    }
  }

  update(progress: ProgressState): void {
    if (!this._panel) return;
    const data = computeTimeline(progress, new Date());
    const nonce = crypto.randomBytes(16).toString("hex");
    const cspSource = this._panel.webview.cspSource;
    this._panel.webview.html = renderTimelineHtml(data, nonce, cspSource);
  }

  dispose(): void {
    this._panel?.dispose();
    this._panel = undefined;
  }

  /** Visible for testing */
  get panel(): vscode.WebviewPanel | undefined {
    return this._panel;
  }

  private _setEmptyHtml(): void {
    if (!this._panel) return;
    const nonce = crypto.randomBytes(16).toString("hex");
    const cspSource = this._panel.webview.cspSource;
    this._panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 16px; background: var(--vscode-editor-background); color: var(--vscode-foreground); }
  </style>
</head>
<body>
  <p>No timeline data available.</p>
</body>
</html>`;
  }
}
