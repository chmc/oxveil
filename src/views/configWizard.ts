import * as crypto from "node:crypto";
import { buildHtml, buildPreviewHtml } from "./configWizardHtml";

export { buildPreviewHtml } from "./configWizardHtml";

export interface ConfigWizardDeps {
  createWebviewPanel: (
    viewType: string,
    title: string,
    showOptions: number,
    options: { enableScripts: boolean; retainContextWhenHidden: boolean },
  ) => WebviewPanel;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  sessionStatus: () => string;
}

export interface Webview {
  html: string;
  cspSource: string;
  onDidReceiveMessage: (cb: (msg: any) => void) => void;
}

export interface WebviewPanel {
  webview: Webview;
  reveal: () => void;
  onDidDispose: (cb: () => void) => void;
  dispose: () => void;
}

// Inline imports to avoid circular deps — types only
interface ConfigState {
  PLAN_FILE: string;
  PROGRESS_FILE: string;
  MAX_RETRIES: number;
  SIMPLE_MODE: boolean;
  PHASE_PROMPT_FILE: string;
  BASE_DELAY: number;
  QUOTA_RETRY_INTERVAL: number;
  SKIP_PERMISSIONS: boolean;
  STREAM_TRUNCATE_LEN: number;
  HOOKS_ENABLED: boolean;
  MAX_PHASE_TIME: number;
  IDLE_TIMEOUT: number;
  VERIFY_TIMEOUT: number;
  AI_PARSE: boolean;
  GRANULARITY: "phases" | "tasks" | "steps";
  VERIFY_PHASES: boolean;
  REFACTOR_PHASES: boolean;
  REFACTOR_MAX_RETRIES: number;
}

export class ConfigWizardPanel {
  private _panel: WebviewPanel | undefined;
  private readonly _deps: ConfigWizardDeps;

  constructor(deps: ConfigWizardDeps) {
    this._deps = deps;
  }

  async reveal(configPath: string): Promise<void> {
    if (this._panel) {
      this._panel.reveal();
    } else {
      this._panel = this._deps.createWebviewPanel(
        "oxveil.configWizard",
        "claudeloop Configuration",
        1,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this._panel.onDidDispose(() => {
        this._panel = undefined;
      });
      this._panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === "save" && msg.config) {
          const { parseConfig, serializeConfig } = await import(
            "../parsers/config"
          );
          // Preserve comments/unknown keys from original file
          let original;
          try {
            const content = await this._deps.readFile(configPath);
            original = parseConfig(content);
          } catch {
            original = parseConfig("");
          }
          original.config = msg.config as ConfigState;
          await this._deps.writeFile(configPath, serializeConfig(original));
          // Re-render with saved state
          await this._renderForm(configPath);
        } else if (msg.type === "reload") {
          await this._renderForm(configPath);
        }
      });
    }
    await this._renderForm(configPath);
  }

  dispose(): void {
    this._panel?.dispose();
    this._panel = undefined;
  }

  /** Visible for testing */
  get panel(): WebviewPanel | undefined {
    return this._panel;
  }

  private async _renderForm(configPath: string): Promise<void> {
    if (!this._panel) return;
    const { parseConfig, serializeConfig } = await import("../parsers/config");

    let parsed;
    try {
      const content = await this._deps.readFile(configPath);
      parsed = parseConfig(content);
    } catch {
      parsed = parseConfig("");
    }

    const config = parsed.config;
    const isRunning = this._deps.sessionStatus() === "running";
    const nonce = crypto.randomBytes(16).toString("hex");
    const cspSource = this._panel.webview.cspSource;
    const previewText = serializeConfig(parsed);

    this._panel.webview.html = buildHtml(
      nonce,
      cspSource,
      config,
      isRunning,
      previewText,
    );
  }
}
