import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  ReplayViewerPanel,
  type ReplayViewerDeps,
  type WebviewPanel,
} from "../../../views/replayViewer";

function makeMockPanel(): WebviewPanel & { _disposeCallbacks: (() => void)[] } {
  const disposeCallbacks: (() => void)[] = [];
  return {
    webview: {
      html: "",
      cspSource: "https://mock.csp",
    },
    reveal: vi.fn(),
    onDidDispose: vi.fn((cb: () => void) => {
      disposeCallbacks.push(cb);
    }),
    dispose: vi.fn(),
    _disposeCallbacks: disposeCallbacks,
  };
}

function makeDeps(
  overrides: Partial<ReplayViewerDeps> = {},
  mockPanel = makeMockPanel(),
): ReplayViewerDeps & { mockPanel: ReturnType<typeof makeMockPanel> } {
  return {
    createWebviewPanel: vi.fn(() => mockPanel) as any,
    readFile: vi.fn(async () => "<html><head></head><body><script>console.log('hi');</script><style>body{}</style></body></html>"),
    showInformationMessage: vi.fn(),
    mockPanel,
    ...overrides,
  };
}

describe("ReplayViewerPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates webview panel on first reveal", async () => {
    const deps = makeDeps();
    const panel = new ReplayViewerPanel(deps);

    await panel.reveal("/path/to/replay.html", "/path/to/.claudeloop");

    expect(deps.createWebviewPanel).toHaveBeenCalledWith(
      "oxveil.replayViewer",
      "Replay",
      1,
      {
        enableScripts: true,
        localResourceRoots: [{ fsPath: "/path/to/.claudeloop" }],
      },
    );
  });

  it("reuses existing panel on subsequent reveals", async () => {
    const deps = makeDeps();
    const panel = new ReplayViewerPanel(deps);

    await panel.reveal("/path/replay.html", "/root");
    await panel.reveal("/path/replay.html", "/root");

    expect(deps.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(deps.mockPanel.reveal).toHaveBeenCalledTimes(1);
  });

  it("injects nonce into script tags", async () => {
    const deps = makeDeps();
    const panel = new ReplayViewerPanel(deps);

    await panel.reveal("/path/replay.html", "/root");

    const html = deps.mockPanel.webview.html;
    const nonceMatch = html.match(/nonce="([a-f0-9]+)"/);
    expect(nonceMatch).toBeTruthy();
    expect(html).toContain(`<script nonce="${nonceMatch![1]}"`);
  });

  it("injects nonce into style tags", async () => {
    const deps = makeDeps();
    const panel = new ReplayViewerPanel(deps);

    await panel.reveal("/path/replay.html", "/root");

    const html = deps.mockPanel.webview.html;
    const nonceMatch = html.match(/nonce="([a-f0-9]+)"/);
    expect(nonceMatch).toBeTruthy();
    expect(html).toContain(`<style nonce="${nonceMatch![1]}"`);
  });

  it("injects CSP meta tag", async () => {
    const deps = makeDeps();
    const panel = new ReplayViewerPanel(deps);

    await panel.reveal("/path/replay.html", "/root");

    const html = deps.mockPanel.webview.html;
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("https://mock.csp");
    expect(html).toContain("default-src 'none'");
  });

  it("CSP nonce matches script/style nonces", async () => {
    const deps = makeDeps();
    const panel = new ReplayViewerPanel(deps);

    await panel.reveal("/path/replay.html", "/root");

    const html = deps.mockPanel.webview.html;
    const nonceMatch = html.match(/nonce="([a-f0-9]+)"/);
    const nonce = nonceMatch![1];
    expect(html).toContain(`script-src 'nonce-${nonce}'`);
    expect(html).toContain(`style-src https://mock.csp 'nonce-${nonce}'`);
  });

  it("shows info message when file is missing", async () => {
    const deps = makeDeps({
      readFile: vi.fn(async () => { throw new Error("ENOENT"); }),
    });
    const panel = new ReplayViewerPanel(deps);

    await panel.reveal("/missing/replay.html", "/root");

    expect(deps.showInformationMessage).toHaveBeenCalledWith("No replay available");
    expect(deps.createWebviewPanel).not.toHaveBeenCalled();
  });

  it("does not create panel when file read fails", async () => {
    const deps = makeDeps({
      readFile: vi.fn(async () => { throw new Error("ENOENT"); }),
    });
    const panel = new ReplayViewerPanel(deps);

    await panel.reveal("/missing/replay.html", "/root");

    expect(panel.panel).toBeUndefined();
  });

  it("dispose cleans up panel", async () => {
    const deps = makeDeps();
    const panel = new ReplayViewerPanel(deps);

    await panel.reveal("/path/replay.html", "/root");
    expect(panel.panel).toBeDefined();

    panel.dispose();
    expect(deps.mockPanel.dispose).toHaveBeenCalled();
    expect(panel.panel).toBeUndefined();
  });

  it("clears panel reference when panel is disposed externally", async () => {
    const deps = makeDeps();
    const panel = new ReplayViewerPanel(deps);

    await panel.reveal("/path/replay.html", "/root");
    expect(panel.panel).toBeDefined();

    deps.mockPanel._disposeCallbacks[0]();
    expect(panel.panel).toBeUndefined();
  });

  it("creates new panel after external dispose", async () => {
    const deps = makeDeps();
    const panel = new ReplayViewerPanel(deps);

    await panel.reveal("/path/replay.html", "/root");
    deps.mockPanel._disposeCallbacks[0]();

    await panel.reveal("/path/replay.html", "/root");
    expect(deps.createWebviewPanel).toHaveBeenCalledTimes(2);
  });

  it("preserves script tags that already have nonce", async () => {
    const deps = makeDeps({
      readFile: vi.fn(async () => '<html><head></head><body><script nonce="existing">x</script></body></html>'),
    });
    const panel = new ReplayViewerPanel(deps);

    await panel.reveal("/path/replay.html", "/root");

    const html = deps.mockPanel.webview.html;
    expect(html).toContain('nonce="existing"');
  });

  it("injects CSP after head tag", async () => {
    const deps = makeDeps({
      readFile: vi.fn(async () => "<html><head><title>Replay</title></head><body></body></html>"),
    });
    const panel = new ReplayViewerPanel(deps);

    await panel.reveal("/path/replay.html", "/root");

    const html = deps.mockPanel.webview.html;
    const headIdx = html.indexOf("<head>");
    const cspIdx = html.indexOf("Content-Security-Policy");
    expect(cspIdx).toBeGreaterThan(headIdx);
  });

  it("handles HTML without head tag", async () => {
    const deps = makeDeps({
      readFile: vi.fn(async () => "<div>content</div>"),
    });
    const panel = new ReplayViewerPanel(deps);

    await panel.reveal("/path/replay.html", "/root");

    const html = deps.mockPanel.webview.html;
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("<div>content</div>");
  });
});
