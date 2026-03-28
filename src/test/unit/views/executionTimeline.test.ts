import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
  ViewColumn: { One: 1 },
}));

import {
  ExecutionTimelinePanel,
  type ExecutionTimelineDeps,
} from "../../../views/executionTimeline";
import type { ProgressState } from "../../../types";

function makeProgress(): ProgressState {
  return {
    phases: [
      {
        number: 1,
        title: "Setup",
        status: "completed",
        started: "2025-01-01 10:00:00",
        completed: "2025-01-01 10:02:00",
      },
      {
        number: 2,
        title: "Build",
        status: "in_progress",
        started: "2025-01-01 10:02:00",
      },
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
      onDidReceiveMessage: vi.fn(),
    },
    reveal: vi.fn(),
    onDidDispose: vi.fn(),
    dispose: vi.fn(),
  };
}

function makeDeps(mockPanel = makeMockPanel()): ExecutionTimelineDeps {
  return {
    createWebviewPanel: vi.fn(() => mockPanel) as any,
    executeCommand: vi.fn() as any,
  };
}

describe("ExecutionTimelinePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates webview panel on first reveal", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ExecutionTimelinePanel(deps);

    panel.reveal(makeProgress());

    expect(deps.createWebviewPanel).toHaveBeenCalledWith(
      "oxveil.executionTimeline",
      "Execution Timeline",
      1,
      { enableScripts: true, retainContextWhenHidden: true },
    );
  });

  it("reuses existing panel on subsequent reveals", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ExecutionTimelinePanel(deps);

    panel.reveal(makeProgress());
    panel.reveal(makeProgress());

    expect(deps.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(mockPanel.reveal).toHaveBeenCalledTimes(1);
  });

  it("sets HTML with timeline content on reveal", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ExecutionTimelinePanel(deps);

    panel.reveal(makeProgress());

    expect(mockPanel.webview.html).toContain("Execution Timeline");
    expect(mockPanel.webview.html).toContain("Setup");
    expect(mockPanel.webview.html).toContain("Build");
  });

  it("sets CSP header in HTML", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ExecutionTimelinePanel(deps);

    panel.reveal(makeProgress());

    expect(mockPanel.webview.html).toContain("Content-Security-Policy");
    expect(mockPanel.webview.html).toContain("https://mock.csp");
    expect(mockPanel.webview.html).toContain("default-src 'none'");
  });

  it("includes nonce for script tag", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ExecutionTimelinePanel(deps);

    panel.reveal(makeProgress());

    const nonceMatch = mockPanel.webview.html.match(/nonce-([a-f0-9]+)/);
    expect(nonceMatch).toBeTruthy();
    const nonce = nonceMatch![1];
    expect(mockPanel.webview.html).toContain(`script-src 'nonce-${nonce}'`);
    expect(mockPanel.webview.html).toContain(`nonce="${nonce}"`);
  });

  it("update re-renders HTML with new progress", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ExecutionTimelinePanel(deps);

    panel.reveal(makeProgress());
    mockPanel.webview.html = "";

    const updated: ProgressState = {
      phases: [
        {
          number: 1,
          title: "Setup",
          status: "completed",
          started: "2025-01-01 10:00:00",
          completed: "2025-01-01 10:02:00",
        },
        {
          number: 2,
          title: "Build",
          status: "completed",
          started: "2025-01-01 10:02:00",
          completed: "2025-01-01 10:05:00",
        },
      ],
      totalPhases: 2,
    };
    panel.update(updated);

    expect(mockPanel.webview.html).toContain("Execution Timeline");
    expect(mockPanel.webview.html).toContain("Build");
  });

  it("update does nothing when panel is not created", () => {
    const deps = makeDeps();
    const panel = new ExecutionTimelinePanel(deps);

    panel.update(makeProgress());
    expect(deps.createWebviewPanel).not.toHaveBeenCalled();
  });

  it("dispose cleans up panel", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ExecutionTimelinePanel(deps);

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
    const panel = new ExecutionTimelinePanel(deps);

    panel.reveal(makeProgress());
    expect(panel.panel).toBeDefined();

    disposeCallback();
    expect(panel.panel).toBeUndefined();
  });

  it("reveal with undefined progress shows empty state", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ExecutionTimelinePanel(deps);

    panel.reveal(undefined);

    expect(mockPanel.webview.html).toContain("No timeline data available");
    expect(mockPanel.webview.html).not.toContain("Execution Timeline");
  });

  it("renders phase bars with correct status classes", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ExecutionTimelinePanel(deps);

    panel.reveal(makeProgress());

    expect(mockPanel.webview.html).toContain("complete");
    expect(mockPanel.webview.html).toContain("running");
    expect(mockPanel.webview.html).toContain("pending");
  });

  it("renders time axis ticks", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ExecutionTimelinePanel(deps);

    panel.reveal(makeProgress());

    expect(mockPanel.webview.html).toContain("tick");
    expect(mockPanel.webview.html).toContain("0m");
  });

  it("renders total elapsed time in header", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ExecutionTimelinePanel(deps);

    panel.reveal(makeProgress());

    expect(mockPanel.webview.html).toContain("Total:");
  });
});
