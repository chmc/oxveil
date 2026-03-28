import * as vscode from "vscode";
import * as crypto from "node:crypto";
import type { ProgressState } from "../types";
import { layoutDag } from "./dagLayout";
import { renderDagSvg } from "./dagSvg";

export interface DependencyGraphDeps {
  createWebviewPanel: typeof vscode.window.createWebviewPanel;
  executeCommand: typeof vscode.commands.executeCommand;
}

export class DependencyGraphPanel {
  private _panel: vscode.WebviewPanel | undefined;
  private readonly _deps: DependencyGraphDeps;
  private _currentFolderUri: string | undefined;

  constructor(deps: DependencyGraphDeps) {
    this._deps = deps;
  }

  get currentFolderUri(): string | undefined {
    return this._currentFolderUri;
  }

  get visible(): boolean {
    return this._panel?.visible ?? false;
  }

  reveal(progress: ProgressState | undefined, folderUri?: string): void {
    this._currentFolderUri = folderUri;
    if (this._panel) {
      this._panel.reveal();
    } else {
      this._panel = this._deps.createWebviewPanel(
        "oxveil.dependencyGraph",
        "Dependency Graph",
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this._panel.onDidDispose(() => {
        this._panel = undefined;
      });
      this._panel.webview.onDidReceiveMessage((msg) => {
        if (msg.type === "openLog" && typeof msg.phaseNumber === "number") {
          this._deps.executeCommand("oxveil.viewLog", msg.phaseNumber);
        }
      });
    }
    if (progress) {
      this.update(progress);
    } else {
      this._setHtml("");
    }
  }

  update(progress: ProgressState): void {
    if (!this._panel) return;
    const layout = layoutDag(progress);
    const svg = renderDagSvg(layout);
    this._setHtml(svg);
  }

  dispose(): void {
    this._panel?.dispose();
    this._panel = undefined;
  }

  /** Visible for testing */
  get panel(): vscode.WebviewPanel | undefined {
    return this._panel;
  }

  private _setHtml(svg: string): void {
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
    body { margin: 0; padding: 16px; background: var(--vscode-editor-background); overflow: auto; }
    #dag-container { display: flex; justify-content: center; }
    #dag-container svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <div id="dag-container">${svg}</div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    window.addEventListener('message', (event) => {
      const { type, svg } = event.data;
      if (type === 'update' && svg) {
        document.getElementById('dag-container').innerHTML = svg;
      }
    });
    document.addEventListener('click', (e) => {
      const node = e.target.closest('.dag-node[style*="cursor: pointer"]');
      if (!node) return;
      const phase = Number(node.getAttribute('data-phase'));
      if (phase) vscode.postMessage({ type: 'openLog', phaseNumber: phase });
    });
  </script>
</body>
</html>`;
  }
}
