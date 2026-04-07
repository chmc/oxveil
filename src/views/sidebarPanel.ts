import { randomBytes } from "node:crypto";
import { renderSidebar } from "./sidebarHtml";
import { dispatchSidebarMessage } from "./sidebarMessages";
import type { SidebarState, ProgressUpdate } from "./sidebarState";
import type { SidebarCommand } from "./sidebarMessages";

export interface SidebarPanelDeps {
  executeCommand: (command: string, ...args: any[]) => void;
  onPlanChoice?: (choice: "resume" | "dismiss") => void;
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
  private readonly _deps: SidebarPanelDeps;

  constructor(deps: SidebarPanelDeps) {
    this._deps = deps;
  }

  resolveWebviewView(webviewView: WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    const nonce = randomBytes(16).toString("hex");
    webviewView.webview.html = renderSidebar(
      nonce,
      webviewView.webview.cspSource,
      this._pendingState,
    );

    webviewView.webview.onDidReceiveMessage((msg: SidebarCommand) => {
      if (msg.command === "resumePlan" || msg.command === "dismissPlan") {
        this._deps.onPlanChoice?.(msg.command === "resumePlan" ? "resume" : "dismiss");
        return;
      }
      dispatchSidebarMessage(msg, this._deps.executeCommand);
    });

    webviewView.onDidDispose(() => {
      this._view = undefined;
    });

    // If state was buffered before view resolved, it was already rendered
    // into the initial HTML via renderSidebar(). No need to also postMessage.
    this._pendingState = undefined;
  }

  updateState(state: SidebarState): void {
    if (this._view) {
      const nonce = randomBytes(16).toString("hex");
      this._view.webview.html = renderSidebar(
        nonce,
        this._view.webview.cspSource,
        state,
      );
    } else {
      this._pendingState = state;
    }
  }

  sendProgressUpdate(update: ProgressUpdate): void {
    this._postMessage({ type: "progressUpdate", update });
  }

  private _postMessage(msg: any): void {
    this._view?.webview.postMessage(msg);
  }
}
