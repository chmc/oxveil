import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
  ViewColumn: { One: 1 },
}));

import { DependencyGraphPanel, type DependencyGraphDeps } from "../../../views/dependencyGraph";
import type { ProgressState } from "../../../types";

function makeProgress(): ProgressState {
  return {
    phases: [
      { number: 1, title: "Setup", status: "completed" },
      { number: 2, title: "Build", status: "in_progress" },
      { number: 3, title: "Deploy", status: "pending" },
    ],
    totalPhases: 3,
  };
}

function makeMockPanel() {
  return {
    webview: {
      html: "",
      cspSource: "https://mock.csp",
      postMessage: vi.fn(),
    },
    reveal: vi.fn(),
    onDidDispose: vi.fn(),
    dispose: vi.fn(),
  };
}

function makeDeps(mockPanel = makeMockPanel()): DependencyGraphDeps {
  return {
    createWebviewPanel: vi.fn(() => mockPanel) as any,
  };
}

describe("DependencyGraphPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates webview panel on first reveal", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new DependencyGraphPanel(deps);

    panel.reveal(makeProgress());

    expect(deps.createWebviewPanel).toHaveBeenCalledWith(
      "oxveil.dependencyGraph",
      "Dependency Graph",
      1,
      { enableScripts: true, retainContextWhenHidden: true },
    );
  });

  it("reuses existing panel on subsequent reveals", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new DependencyGraphPanel(deps);

    panel.reveal(makeProgress());
    panel.reveal(makeProgress());

    expect(deps.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(mockPanel.reveal).toHaveBeenCalledTimes(1); // only on second call
  });

  it("sets HTML with SVG content on reveal", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new DependencyGraphPanel(deps);

    panel.reveal(makeProgress());

    expect(mockPanel.webview.html).toContain("dag-container");
    expect(mockPanel.webview.html).toContain("<svg");
    expect(mockPanel.webview.html).toContain("Phase 1");
  });

  it("sets CSP header in HTML", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new DependencyGraphPanel(deps);

    panel.reveal(makeProgress());

    expect(mockPanel.webview.html).toContain("Content-Security-Policy");
    expect(mockPanel.webview.html).toContain("https://mock.csp");
    expect(mockPanel.webview.html).toContain("default-src 'none'");
    expect(mockPanel.webview.html).toContain("'unsafe-inline'");
  });

  it("includes nonce for script tag", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new DependencyGraphPanel(deps);

    panel.reveal(makeProgress());

    const nonceMatch = mockPanel.webview.html.match(/nonce-([a-f0-9]+)/);
    expect(nonceMatch).toBeTruthy();
    // Nonce should appear in both CSP and script tag
    const nonce = nonceMatch![1];
    expect(mockPanel.webview.html).toContain(`script-src 'nonce-${nonce}'`);
    expect(mockPanel.webview.html).toContain(`nonce="${nonce}"`);
  });

  it("update sends new SVG to existing panel", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new DependencyGraphPanel(deps);

    panel.reveal(makeProgress());
    // Clear html to verify update sets it again
    mockPanel.webview.html = "";

    const updated: ProgressState = {
      phases: [
        { number: 1, title: "Setup", status: "completed" },
        { number: 2, title: "Build", status: "completed" },
      ],
      totalPhases: 2,
    };
    panel.update(updated);

    expect(mockPanel.webview.html).toContain("<svg");
    expect(mockPanel.webview.html).toContain("Phase 2");
  });

  it("update does nothing when panel is not created", () => {
    const deps = makeDeps();
    const panel = new DependencyGraphPanel(deps);

    // Should not throw
    panel.update(makeProgress());
    expect(deps.createWebviewPanel).not.toHaveBeenCalled();
  });

  it("dispose cleans up panel", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new DependencyGraphPanel(deps);

    panel.reveal(makeProgress());
    expect(panel.panel).toBeDefined();

    panel.dispose();
    expect(mockPanel.dispose).toHaveBeenCalled();
    expect(panel.panel).toBeUndefined();
  });

  it("clears panel reference when panel is disposed externally", () => {
    const mockPanel = makeMockPanel();
    let disposeCallback: () => void = () => {};
    mockPanel.onDidDispose = vi.fn((cb) => {
      disposeCallback = cb;
    });
    const deps = makeDeps(mockPanel);
    const panel = new DependencyGraphPanel(deps);

    panel.reveal(makeProgress());
    expect(panel.panel).toBeDefined();

    // Simulate user closing the panel
    disposeCallback();
    expect(panel.panel).toBeUndefined();
  });

  it("reveal with undefined progress sets empty content", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new DependencyGraphPanel(deps);

    panel.reveal(undefined);

    expect(mockPanel.webview.html).toContain("dag-container");
    expect(mockPanel.webview.html).not.toContain("<svg");
  });

  it("includes message handler script", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new DependencyGraphPanel(deps);

    panel.reveal(makeProgress());

    expect(mockPanel.webview.html).toContain("acquireVsCodeApi");
    expect(mockPanel.webview.html).toContain("addEventListener('message'");
  });
});
