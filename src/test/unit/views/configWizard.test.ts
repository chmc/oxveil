import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
  ViewColumn: { One: 1 },
}));

import {
  ConfigWizardPanel,
  type ConfigWizardDeps,
} from "../../../views/configWizard";

const SAMPLE_CONF = `# claudeloop configuration
MAX_RETRIES=5
SIMPLE_MODE=true
PLAN_FILE=PLAN.md
VERIFY_PHASES=true
AI_PARSE=true
GRANULARITY=tasks
`;

function makeMockPanel() {
  const messageListeners: ((msg: any) => void)[] = [];
  return {
    webview: {
      html: "",
      cspSource: "https://mock.csp",
      onDidReceiveMessage: vi.fn((cb: (msg: any) => void) => {
        messageListeners.push(cb);
      }),
    },
    reveal: vi.fn(),
    onDidDispose: vi.fn(),
    dispose: vi.fn(),
    _messageListeners: messageListeners,
  };
}

function makeDeps(
  mockPanel = makeMockPanel(),
  fileContent = SAMPLE_CONF,
): { deps: ConfigWizardDeps; mockPanel: ReturnType<typeof makeMockPanel> } {
  return {
    deps: {
      createWebviewPanel: vi.fn(() => mockPanel) as any,
      readFile: vi.fn(async () => fileContent),
      writeFile: vi.fn(async () => {}),
      sessionStatus: vi.fn(() => "idle"),
    },
    mockPanel,
  };
}

describe("ConfigWizardPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates webview panel on first reveal", async () => {
    const { deps } = makeDeps();
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");

    expect(deps.createWebviewPanel).toHaveBeenCalledWith(
      "oxveil.configWizard",
      "claudeloop Configuration",
      1,
      { enableScripts: true, retainContextWhenHidden: true },
    );
  });

  it("reuses existing panel on subsequent reveals", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");
    await panel.reveal("/path/.claudeloop.conf");

    expect(deps.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(mockPanel.reveal).toHaveBeenCalledTimes(1);
  });

  it("sets HTML with form content on reveal", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");

    expect(mockPanel.webview.html).toContain("claudeloop Configuration");
    expect(mockPanel.webview.html).toContain("MAX_RETRIES");
    expect(mockPanel.webview.html).toContain("Save Configuration");
    expect(mockPanel.webview.html).toContain("Reset to Defaults");
  });

  it("includes CSP header with nonce", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");

    expect(mockPanel.webview.html).toContain("Content-Security-Policy");
    expect(mockPanel.webview.html).toContain("https://mock.csp");
    expect(mockPanel.webview.html).toContain("default-src 'none'");

    const nonceMatch = mockPanel.webview.html.match(/nonce-([a-f0-9]+)/);
    expect(nonceMatch).toBeTruthy();
    const nonce = nonceMatch![1];
    expect(mockPanel.webview.html).toContain(`script-src 'nonce-${nonce}'`);
    expect(mockPanel.webview.html).toContain(`nonce="${nonce}"`);
  });

  it("renders all config sections", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");

    const html = mockPanel.webview.html;
    // Section titles (uppercase via CSS text-transform, HTML has title case)
    expect(html).toContain("Execution");
    expect(html).toContain("Behavior");
    expect(html).toContain("Paths");
    expect(html).toContain("Advanced");
    // Keys from each section
    expect(html).toContain('data-key="MAX_RETRIES"');
    expect(html).toContain('data-key="BASE_DELAY"');
    expect(html).toContain('data-key="VERIFY_PHASES"');
    expect(html).toContain('data-key="AI_PARSE"');
    expect(html).toContain('data-key="GRANULARITY"');
    expect(html).toContain('data-key="PLAN_FILE"');
    expect(html).toContain('data-key="STREAM_TRUNCATE_LEN"');
  });

  it("renders config values from file", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");

    const html = mockPanel.webview.html;
    // MAX_RETRIES=5 from SAMPLE_CONF
    expect(html).toContain('value="5"');
    // PLAN_FILE=PLAN.md
    expect(html).toContain('value="PLAN.md"');
    // SIMPLE_MODE=true → toggle should be on
    expect(html).toContain('class="toggle on" data-key="SIMPLE_MODE"');
  });

  it("shows live preview panel", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");

    const html = mockPanel.webview.html;
    expect(html).toContain("Generated Config Preview");
    expect(html).toContain(".claudeloop.conf");
    expect(html).toContain("preview-body");
    expect(html).toContain('class="key"');
    expect(html).toContain('class="val-bool"');
  });

  it("shows warning banner when session is running", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    (deps.sessionStatus as any).mockReturnValue("running");
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");

    expect(mockPanel.webview.html).toContain("warning-banner");
    expect(mockPanel.webview.html).toContain("currently running");
  });

  it("does not show warning banner when session is idle", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");

    expect(mockPanel.webview.html).not.toContain("currently running");
  });

  it("handles save message by writing config", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");

    const handler = mockPanel._messageListeners[0];
    await handler({
      type: "save",
      config: {
        MAX_RETRIES: 7,
        BASE_DELAY: 5,
        QUOTA_RETRY_INTERVAL: 900,
        MAX_PHASE_TIME: 0,
        IDLE_TIMEOUT: 600,
        VERIFY_TIMEOUT: 300,
        VERIFY_PHASES: true,
        REFACTOR_PHASES: false,
        REFACTOR_MAX_RETRIES: 3,
        AI_PARSE: true,
        GRANULARITY: "phases",
        SIMPLE_MODE: false,
        SKIP_PERMISSIONS: false,
        HOOKS_ENABLED: true,
        PLAN_FILE: "PLAN.md",
        PROGRESS_FILE: "",
        PHASE_PROMPT_FILE: "",
        STREAM_TRUNCATE_LEN: 300,
      },
    });

    expect(deps.writeFile).toHaveBeenCalledTimes(1);
    const writtenPath = (deps.writeFile as any).mock.calls[0][0];
    const writtenContent = (deps.writeFile as any).mock.calls[0][1];
    expect(writtenPath).toBe("/path/.claudeloop.conf");
    expect(writtenContent).toContain("MAX_RETRIES=7");
  });

  it("handles reload message by re-reading file", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");
    (deps.readFile as any).mockClear();

    const handler = mockPanel._messageListeners[0];
    await handler({ type: "reload" });

    expect(deps.readFile).toHaveBeenCalledWith("/path/.claudeloop.conf");
  });

  it("handles missing config file gracefully", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    (deps.readFile as any).mockRejectedValue(new Error("ENOENT"));
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");

    // Should render with defaults
    expect(mockPanel.webview.html).toContain("claudeloop Configuration");
    expect(mockPanel.webview.html).toContain('value="3"'); // default MAX_RETRIES
  });

  it("dispose cleans up panel", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");
    expect(panel.panel).toBeDefined();

    panel.dispose();
    expect(mockPanel.dispose).toHaveBeenCalled();
    expect(panel.panel).toBeUndefined();
  });

  it("clears panel reference when disposed externally", async () => {
    const mockPanel = makeMockPanel();
    let disposeCallback: () => void = () => {};
    mockPanel.onDidDispose = vi.fn((cb) => {
      disposeCallback = cb;
    });
    const { deps } = makeDeps(mockPanel);
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");
    expect(panel.panel).toBeDefined();

    disposeCallback();
    expect(panel.panel).toBeUndefined();
  });

  it("includes getState/setState for persistence", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");

    expect(mockPanel.webview.html).toContain("getState");
    expect(mockPanel.webview.html).toContain("setState");
  });

  it("includes toggle interaction script", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");

    expect(mockPanel.webview.html).toContain("acquireVsCodeApi");
    expect(mockPanel.webview.html).toContain("collectConfig");
    expect(mockPanel.webview.html).toContain("classList.toggle");
  });

  it("shows skip_permissions warning div", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");

    expect(mockPanel.webview.html).toContain("skip-warning");
    expect(mockPanel.webview.html).toContain("bypasses safety prompts");
  });

  it("shows granularity dropdown conditionally based on AI_PARSE", async () => {
    const mockPanel = makeMockPanel();
    const { deps } = makeDeps(mockPanel);
    const panel = new ConfigWizardPanel(deps);

    await panel.reveal("/path/.claudeloop.conf");

    // AI_PARSE is true in SAMPLE_CONF, so granularity should be visible
    expect(mockPanel.webview.html).toContain("granularity-row");
    expect(mockPanel.webview.html).toContain('data-key="GRANULARITY"');
  });
});
