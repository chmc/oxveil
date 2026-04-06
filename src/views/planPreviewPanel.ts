import { randomBytes } from "node:crypto";
import { parsePlanWithDescriptions } from "../parsers/planDescription";
import { validatePlan } from "../parsers/planValidator";
import { parsePlan } from "../parsers/plan";
import { renderPhaseCardsHtml, renderPlanPreviewShell, type PhaseCardData, type PhaseCardsOptions } from "./planPreviewHtml";

export interface PlanPreviewPanelDeps {
  createWebviewPanel: (
    viewType: string,
    title: string,
    showOptions: number,
    options: { enableScripts: boolean; retainContextWhenHidden: boolean },
  ) => WebviewPanel;
  readFile: () => Promise<string>;
  onAnnotation: (phase: string, text: string) => void;
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
  private _sessionActive = true;
  private _lastPhases: PhaseCardData[] = [];
  private _lastValid = false;

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
        if (msg.type === "annotation" && msg.phase && msg.text) {
          this._deps.onAnnotation(msg.phase, msg.text);
        }
      });
    } else {
      this._panel.reveal();
    }
  }

  async onFileChanged(): Promise<void> {
    if (!this._panel) return;

    const content = await this._deps.readFile();
    const parsed = parsePlanWithDescriptions(content);
    const basePlan = parsePlan(content);
    const validation = validatePlan(basePlan);

    this._lastValid = validation.valid;
    this._lastPhases = parsed.phases.map((p) => ({
      number: p.number,
      title: p.title,
      description: p.description,
      dependencies: p.dependencies,
    }));

    this._sendUpdate();
  }

  setSessionActive(active: boolean): void {
    this._sessionActive = active;
    this._sendUpdate();
  }

  dispose(): void {
    this._panel?.dispose();
    this._panel = undefined;
  }

  private _sendUpdate(): void {
    if (!this._panel) return;

    const state: PhaseCardsOptions["state"] = this._sessionActive ? "active" : "session-ended";
    const options: PhaseCardsOptions = {
      state,
      phases: this._lastPhases,
      sessionActive: this._sessionActive,
      isValid: this._lastValid,
    };
    const html = renderPhaseCardsHtml(options);
    this._panel.webview.postMessage({ type: "update", html });
  }
}
