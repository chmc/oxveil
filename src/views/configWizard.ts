import * as crypto from "node:crypto";

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

function toggleHtml(
  key: string,
  label: string,
  hint: string,
  value: boolean,
  extra?: string,
): string {
  return `<div class="toggle-row">
  <div class="toggle${value ? " on" : ""}" data-key="${key}" role="switch" aria-checked="${value}" tabindex="0"></div>
  <div>
    <div class="toggle-label">${label}</div>
    <div class="toggle-hint">${hint}</div>
  </div>
</div>${extra ?? ""}`;
}

function numberHtml(
  key: string,
  label: string,
  hint: string,
  value: number,
  min?: number,
  max?: number,
): string {
  const minAttr = min !== undefined ? ` min="${min}"` : "";
  const maxAttr = max !== undefined ? ` max="${max}"` : "";
  return `<div class="form-row">
  <div class="form-label">${label}<span class="hint">${hint}</span></div>
  <div class="form-input"><input type="number" data-key="${key}" value="${value}"${minAttr}${maxAttr}></div>
</div>`;
}

function textHtml(
  key: string,
  label: string,
  hint: string,
  value: string,
): string {
  return `<div class="form-row">
  <div class="form-label">${label}<span class="hint">${hint}</span></div>
  <div class="form-input"><input type="text" data-key="${key}" value="${escapeHtml(value)}" style="font-family:monospace;font-size:12px"></div>
</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPreviewHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (line.startsWith("#")) {
        return `<div><span class="comment">${escapeHtml(line)}</span></div>`;
      }
      const eq = line.indexOf("=");
      if (eq === -1) return `<div>${escapeHtml(line)}</div>`;
      const key = line.slice(0, eq);
      const val = line.slice(eq + 1);
      let valClass = "val-str";
      if (val === "true" || val === "false") valClass = "val-bool";
      else if (/^\d+$/.test(val)) valClass = "val-num";
      return `<div><span class="key">${escapeHtml(key)}</span>=<span class="${valClass}">${escapeHtml(val)}</span></div>`;
    })
    .join("\n");
}

function buildHtml(
  nonce: string,
  cspSource: string,
  config: ConfigState,
  isRunning: boolean,
  previewText: string,
): string {
  const warningBanner = isRunning
    ? `<div class="warning-banner">claudeloop is currently running. Changes may not take effect until the next session.</div>`
    : "";

  const granularityDropdown = `<div class="form-row granularity-row" style="${config.AI_PARSE ? "" : "display:none"}">
  <div class="form-label">Granularity<span class="hint">Phase breakdown level</span></div>
  <div class="form-input"><select data-key="GRANULARITY">
    <option value="phases"${config.GRANULARITY === "phases" ? " selected" : ""}>phases</option>
    <option value="tasks"${config.GRANULARITY === "tasks" ? " selected" : ""}>tasks</option>
    <option value="steps"${config.GRANULARITY === "steps" ? " selected" : ""}>steps</option>
  </select></div>
</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); background: var(--vscode-editor-background); color: var(--vscode-foreground, #ccc); padding: 0; }
    .wizard-container { display: flex; gap: 20px; height: 100vh; }
    .wizard-form { flex: 1; overflow-y: auto; min-width: 0; }
    .wizard-preview { width: 340px; flex-shrink: 0; overflow-y: auto; border-left: 1px solid var(--vscode-panel-border, #333); }

    .wizard-header { background: var(--vscode-titleBar-activeBackground, #333); padding: 10px 16px; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--vscode-panel-border, #444); }
    .wizard-header .gear { color: #007acc; }
    .wizard-body { padding: 20px; }

    .wizard-section { margin-bottom: 24px; }
    .wizard-section-title { font-size: 13px; font-weight: 600; color: #569cd6; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }

    .form-row { display: flex; align-items: center; margin-bottom: 12px; gap: 12px; }
    .form-label { width: 180px; font-size: 13px; flex-shrink: 0; }
    .form-label .hint { display: block; font-size: 11px; color: var(--vscode-descriptionForeground, #888); margin-top: 2px; }
    .form-input { flex: 1; }
    .form-input input, .form-input select { width: 100%; background: var(--vscode-input-background, #3c3c3c); border: 1px solid var(--vscode-input-border, #555); color: var(--vscode-input-foreground, #ccc); padding: 6px 10px; border-radius: 3px; font-size: 13px; font-family: inherit; }
    .form-input select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M3 4.5L6 8l3-3.5H3z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; padding-right: 28px; }
    .form-input input:focus, .form-input select:focus { outline: none; border-color: var(--vscode-focusBorder, #007acc); }
    .form-input input[type="number"] { width: 100px; }

    .toggle-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .toggle { width: 36px; height: 20px; background: #555; border-radius: 10px; position: relative; cursor: pointer; flex-shrink: 0; }
    .toggle.on { background: #007acc; }
    .toggle::after { content: ''; position: absolute; width: 16px; height: 16px; border-radius: 50%; background: white; top: 2px; left: 2px; transition: left 0.15s; }
    .toggle.on::after { left: 18px; }
    .toggle-label { font-size: 13px; }
    .toggle-hint { font-size: 11px; color: var(--vscode-descriptionForeground, #888); }

    .skip-warning { color: #f48771; font-size: 11px; margin-left: 46px; margin-top: -6px; margin-bottom: 10px; }

    .wizard-footer { border-top: 1px solid var(--vscode-panel-border, #333); padding: 12px 20px; display: flex; justify-content: flex-end; gap: 8px; }
    .wizard-btn { padding: 6px 16px; border-radius: 3px; font-size: 13px; cursor: pointer; border: none; }
    .wizard-btn.primary { background: #0e639c; color: #fff; }
    .wizard-btn.primary:hover { background: #1177bb; }
    .wizard-btn.secondary { background: transparent; border: 1px solid var(--vscode-input-border, #555); color: var(--vscode-foreground, #ccc); }
    .wizard-btn.secondary:hover { background: rgba(255,255,255,0.05); }

    .warning-banner { background: #6b4600; color: #fff; padding: 8px 16px; font-size: 13px; display: flex; align-items: center; gap: 8px; }

    .preview-label { font-size: 11px; color: var(--vscode-descriptionForeground, #888); text-transform: uppercase; letter-spacing: 0.5px; padding: 12px 14px 6px; font-weight: 600; }
    .preview-header { background: var(--vscode-editorGroupHeader-tabsBackground, #252526); padding: 6px 12px; font-size: 11px; color: var(--vscode-descriptionForeground, #888); display: flex; align-items: center; gap: 6px; border-bottom: 1px solid var(--vscode-panel-border, #333); }
    .preview-header .file-icon { color: #007acc; }
    .preview-body { font-family: var(--vscode-editor-font-family, 'Cascadia Code', Consolas, monospace); font-size: 12px; line-height: 1.6; padding: 10px 14px; }
    .preview-body .key { color: #9cdcfe; }
    .preview-body .val-str { color: #ce9178; }
    .preview-body .val-num { color: #b5cea8; }
    .preview-body .val-bool { color: #569cd6; }
    .preview-body .comment { color: #6a9955; }
  </style>
</head>
<body>
  ${warningBanner}
  <div class="wizard-container">
    <div class="wizard-form">
      <div class="wizard-header">
        <span class="gear">&#9881;</span>
        claudeloop Configuration
      </div>
      <div class="wizard-body">
        <div class="wizard-section">
          <div class="wizard-section-title">Execution</div>
          ${numberHtml("MAX_RETRIES", "Max Retries", "Per-phase retry limit (0-10)", config.MAX_RETRIES, 0, 10)}
          ${numberHtml("BASE_DELAY", "Base Delay", "Retry delay in seconds", config.BASE_DELAY)}
          ${numberHtml("QUOTA_RETRY_INTERVAL", "Quota Retry Interval", "Seconds between quota retries", config.QUOTA_RETRY_INTERVAL)}
          ${numberHtml("MAX_PHASE_TIME", "Max Phase Time", "Max seconds per phase (0 = unlimited)", config.MAX_PHASE_TIME)}
          ${numberHtml("IDLE_TIMEOUT", "Idle Timeout", "Seconds before idle timeout", config.IDLE_TIMEOUT)}
          ${numberHtml("VERIFY_TIMEOUT", "Verify Timeout", "Seconds for verification step", config.VERIFY_TIMEOUT)}
        </div>

        <div class="wizard-section">
          <div class="wizard-section-title">Behavior</div>
          ${toggleHtml("VERIFY_PHASES", "Verify after each phase", "Run verification checks", config.VERIFY_PHASES)}
          ${toggleHtml("REFACTOR_PHASES", "Refactor after each phase", "Auto-refactor generated code", config.REFACTOR_PHASES)}
          ${numberHtml("REFACTOR_MAX_RETRIES", "Refactor Max Retries", "Max refactoring attempts", config.REFACTOR_MAX_RETRIES)}
          ${toggleHtml("AI_PARSE", "AI parse plan", "Auto-parse plan into phases", config.AI_PARSE)}
          ${granularityDropdown}
          ${toggleHtml("SIMPLE_MODE", "Simple mode", "Simplified execution mode", config.SIMPLE_MODE)}
          ${toggleHtml(
            "SKIP_PERMISSIONS",
            "Skip permissions",
            "Skip permission prompts",
            config.SKIP_PERMISSIONS,
            `<div class="skip-warning" style="${config.SKIP_PERMISSIONS ? "" : "display:none"}">Warning: Skipping permissions bypasses safety prompts</div>`,
          )}
          ${toggleHtml("HOOKS_ENABLED", "Hooks enabled", "Run lifecycle hooks", config.HOOKS_ENABLED)}
        </div>

        <div class="wizard-section">
          <div class="wizard-section-title">Paths</div>
          ${textHtml("PLAN_FILE", "Plan File", "Path to plan file", config.PLAN_FILE)}
          ${textHtml("PROGRESS_FILE", "Progress File", "Path to progress file", config.PROGRESS_FILE)}
          ${textHtml("PHASE_PROMPT_FILE", "Phase Prompt File", "Path to phase prompt template", config.PHASE_PROMPT_FILE)}
        </div>

        <div class="wizard-section">
          <div class="wizard-section-title">Advanced</div>
          ${numberHtml("STREAM_TRUNCATE_LEN", "Stream Truncate Length", "Max chars for stream output", config.STREAM_TRUNCATE_LEN)}
        </div>
      </div>
      <div class="wizard-footer">
        <button class="wizard-btn secondary" id="btn-reset">Reset to Defaults</button>
        <button class="wizard-btn primary" id="btn-save">Save Configuration</button>
      </div>
    </div>

    <div class="wizard-preview">
      <div class="preview-label">Generated Config Preview</div>
      <div class="preview-header">
        <span class="file-icon">&#128196;</span>
        .claudeloop.conf
      </div>
      <div class="preview-body" id="preview-body">
        ${buildPreviewHtml(previewText)}
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function collectConfig() {
      const config = {};
      // Numbers
      document.querySelectorAll('input[type="number"][data-key]').forEach(el => {
        config[el.dataset.key] = Number(el.value);
      });
      // Text
      document.querySelectorAll('input[type="text"][data-key]').forEach(el => {
        config[el.dataset.key] = el.value;
      });
      // Toggles
      document.querySelectorAll('.toggle[data-key]').forEach(el => {
        config[el.dataset.key] = el.classList.contains('on');
      });
      // Selects
      document.querySelectorAll('select[data-key]').forEach(el => {
        config[el.dataset.key] = el.value;
      });
      return config;
    }

    // Toggle click
    document.addEventListener('click', e => {
      const toggle = e.target.closest('.toggle[data-key]');
      if (!toggle) return;
      toggle.classList.toggle('on');
      const key = toggle.dataset.key;
      // Show/hide granularity when AI_PARSE toggled
      if (key === 'AI_PARSE') {
        const row = document.querySelector('.granularity-row');
        if (row) row.style.display = toggle.classList.contains('on') ? '' : 'none';
      }
      // Show/hide skip permissions warning
      if (key === 'SKIP_PERMISSIONS') {
        const warn = document.querySelector('.skip-warning');
        if (warn) warn.style.display = toggle.classList.contains('on') ? '' : 'none';
      }
    });

    // Toggle keyboard support
    document.addEventListener('keydown', e => {
      const toggle = e.target.closest('.toggle[data-key]');
      if (!toggle) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggle.click();
      }
    });

    // Save
    document.getElementById('btn-save').addEventListener('click', () => {
      vscode.postMessage({ type: 'save', config: collectConfig() });
    });

    // Reset
    document.getElementById('btn-reset').addEventListener('click', () => {
      vscode.postMessage({ type: 'reload' });
    });

    // Persist state across tab switches
    const state = vscode.getState();
    if (state && state.scrollTop) {
      document.querySelector('.wizard-form').scrollTop = state.scrollTop;
    }
    document.querySelector('.wizard-form').addEventListener('scroll', e => {
      vscode.setState({ scrollTop: e.target.scrollTop });
    });
  </script>
</body>
</html>`;
}
