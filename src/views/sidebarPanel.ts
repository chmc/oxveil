import { randomBytes } from "node:crypto";
import { renderSidebar } from "./sidebarHtml";
import { renderBody } from "./sidebarRenderers";
import { dispatchSidebarMessage } from "./sidebarMessages";
import type { SidebarState, ProgressUpdate } from "./sidebarState";
import type { SidebarCommand } from "./sidebarMessages";

export interface SidebarPanelDeps {
  executeCommand: (command: string, ...args: any[]) => void;
  onPlanChoice?: (choice: "resume" | "dismiss") => void;
  buildState?: () => SidebarState;
}

interface Webview {
  html: string;
  cspSource: string;
  options: { enableScripts?: boolean };
  postMessage: (msg: any) => void;
  onDidReceiveMessage: (cb: (msg: any) => void) => void;
}

interface WebviewView {
  webview: Webview;
  onDidDispose: (cb: () => void) => { dispose: () => void };
}

export class SidebarPanel {
  static readonly viewType = "oxveil.sidebar";

  private _view: WebviewView | undefined;
  private _pendingState: SidebarState | undefined;
  private _lastState: SidebarState | undefined;
  private _webviewReady = false;
  private readonly _deps: SidebarPanelDeps;

  constructor(deps: SidebarPanelDeps) {
    this._deps = deps;
  }

  resolveWebviewView(webviewView: WebviewView): void {
    this._view = webviewView;
    this._webviewReady = false;
    webviewView.webview.options = { enableScripts: true };

    // Use pending state, or build current state on demand to avoid "Initializing..." spinner.
    // resolveWebviewView can be called during activate()'s await calls, before any updateState().
    let initialState: SidebarState | undefined = this._pendingState ?? this._lastState;
    if (!initialState && this._deps.buildState) {
      try {
        initialState = this._deps.buildState();
      } catch (err) {
        console.error("[Oxveil] buildState failed in resolveWebviewView:", err);
      }
    }
    // Fallback: always show something rather than the loading spinner
    if (!initialState) {
      initialState = { view: "empty", archives: [] };
    }

    const nonce = randomBytes(16).toString("hex");
    webviewView.webview.html = renderSidebar(
      nonce,
      webviewView.webview.cspSource,
      initialState,
    );

    webviewView.webview.onDidReceiveMessage((msg: any) => {
      // Webview script signals it has loaded and registered handlers
      if (msg.command === "__ready") {
        this._webviewReady = true;
        // Re-send state — postMessage during HTML load is often lost
        const state = this._lastState ?? this._deps.buildState?.();
        if (state) {
          this._postMessage({ type: "fullState", html: renderBody(state) });
        }
        return;
      }
      console.log("[Oxveil] webview message received:", msg.command);
      if (msg.command === "resumePlan" || msg.command === "dismissPlan") {
        this._deps.onPlanChoice?.(msg.command === "resumePlan" ? "resume" : "dismiss");
        return;
      }
      dispatchSidebarMessage(msg, this._deps.executeCommand);
    });

    webviewView.onDidDispose(() => {
      this._view = undefined;
      this._webviewReady = false;
    });

    // If state was buffered before view resolved, it was already rendered
    // into the initial HTML via renderSidebar(). No need to also postMessage.
    this._pendingState = undefined;
  }

  updateState(state: SidebarState): void {
    this._lastState = state;
    if (this._view) {
      this._postMessage({ type: "fullState", html: renderBody(state) });
    } else {
      this._pendingState = state;
    }
  }

  simulateClick(command: string): void {
    if (!this._webviewReady) return;
    this._postMessage({ type: "simulateClick", command });
  }

  sendProgressUpdate(update: ProgressUpdate): void {
    this._postMessage({ type: "progressUpdate", update });
  }

  private _postMessage(msg: any): void {
    console.log("[Oxveil] posting to webview:", msg.type);
    this._view?.webview.postMessage(msg);
  }
}
