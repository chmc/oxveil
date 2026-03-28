import * as crypto from "node:crypto";

export interface ReplayViewerDeps {
  createWebviewPanel: (
    viewType: string,
    title: string,
    showOptions: number,
    options: { enableScripts: boolean; localResourceRoots?: { fsPath: string }[] },
  ) => WebviewPanel;
  readFile: (path: string) => Promise<string>;
  showInformationMessage: (msg: string) => void;
}

export interface Webview {
  html: string;
  cspSource: string;
}

export interface WebviewPanel {
  webview: Webview;
  reveal: () => void;
  onDidDispose: (cb: () => void) => void;
  dispose: () => void;
}

export class ReplayViewerPanel {
  private _panel: WebviewPanel | undefined;
  private readonly _deps: ReplayViewerDeps;

  constructor(deps: ReplayViewerDeps) {
    this._deps = deps;
  }

  async reveal(replayPath: string, claudeloopRoot: string): Promise<void> {
    let html: string;
    try {
      html = await this._deps.readFile(replayPath);
    } catch {
      this._deps.showInformationMessage("No replay available");
      return;
    }

    if (this._panel) {
      this._panel.reveal();
    } else {
      this._panel = this._deps.createWebviewPanel(
        "oxveil.replayViewer",
        "Replay",
        1, // ViewColumn.One
        {
          enableScripts: true,
          localResourceRoots: [{ fsPath: claudeloopRoot }],
        },
      );
      this._panel.onDidDispose(() => {
        this._panel = undefined;
      });
    }

    this._panel.webview.html = this._injectSecurity(html, this._panel.webview.cspSource);
  }

  dispose(): void {
    this._panel?.dispose();
    this._panel = undefined;
  }

  /** Visible for testing */
  get panel(): WebviewPanel | undefined {
    return this._panel;
  }

  private _injectSecurity(html: string, cspSource: string): string {
    const nonce = crypto.randomBytes(16).toString("hex");

    // Inject nonce into existing <script> tags
    let result = html.replace(/<script(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`);

    // Inject nonce into existing <style> tags
    result = result.replace(/<style(?![^>]*\bnonce=)/gi, `<style nonce="${nonce}"`);

    // Inject CSP meta tag after <head> or at the start
    const cspTag = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${cspSource} data:;">`;
    if (/<head[^>]*>/i.test(result)) {
      result = result.replace(/(<head[^>]*>)/i, `$1\n  ${cspTag}`);
    } else {
      result = cspTag + "\n" + result;
    }

    return result;
  }
}
