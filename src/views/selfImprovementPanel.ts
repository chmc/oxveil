import type { Lesson } from "../types";
import { renderSelfImprovementHtml } from "./selfImprovementHtml";

export interface SelfImprovementPanelDeps {
  createWebviewPanel: (
    viewType: string,
    title: string,
    showOptions: number,
    options: { enableScripts: boolean },
  ) => WebviewPanel;
  executeCommand: (command: string, ...args: unknown[]) => PromiseLike<unknown>;
}

export interface Webview {
  html: string;
  cspSource: string;
  onDidReceiveMessage: (callback: (message: unknown) => void) => Disposable;
}

export interface WebviewPanel {
  webview: Webview;
  reveal: () => void;
  onDidDispose: (cb: () => void) => Disposable;
  dispose: () => void;
}

export interface Disposable {
  dispose: () => void;
}

export class SelfImprovementPanel {
  private _panel: WebviewPanel | undefined;
  private readonly _deps: SelfImprovementPanelDeps;
  private _currentLessons: Lesson[] = [];
  private _messageDisposable: Disposable | undefined;

  constructor(deps: SelfImprovementPanelDeps) {
    this._deps = deps;
  }

  get visible(): boolean {
    return this._panel !== undefined;
  }

  get currentLessons(): Lesson[] {
    return this._currentLessons;
  }

  reveal(lessons: Lesson[]): void {
    this._currentLessons = lessons;

    if (this._panel) {
      this._panel.reveal();
      this._updateContent();
    } else {
      this._panel = this._deps.createWebviewPanel(
        "oxveil.selfImprovement",
        "Self-Improvement",
        1, // ViewColumn.One
        { enableScripts: true },
      );

      this._panel.onDidDispose(() => {
        this._messageDisposable?.dispose();
        this._messageDisposable = undefined;
        this._panel = undefined;
      });

      this._messageDisposable = this._panel.webview.onDidReceiveMessage((message: unknown) => {
        this._handleMessage(message);
      });

      this._updateContent();
    }
  }

  close(): void {
    this._panel?.dispose();
    this._panel = undefined;
    this._currentLessons = [];
  }

  dispose(): void {
    this._messageDisposable?.dispose();
    this._panel?.dispose();
    this._panel = undefined;
  }

  /** Visible for testing */
  get panel(): WebviewPanel | undefined {
    return this._panel;
  }

  private _updateContent(): void {
    if (!this._panel) return;

    const nonce = generateNonce();
    const html = renderSelfImprovementHtml({
      lessons: this._currentLessons,
      cspSource: this._panel.webview.cspSource,
      nonce,
    });
    this._panel.webview.html = html;
  }

  private _handleMessage(message: unknown): void {
    if (!message || typeof message !== "object") return;
    const msg = message as { type?: string };

    switch (msg.type) {
      case "start":
        this._deps.executeCommand("oxveil.selfImprovement.start");
        break;
      case "skip":
        this._deps.executeCommand("oxveil.selfImprovement.skip");
        break;
    }
  }
}

function generateNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
