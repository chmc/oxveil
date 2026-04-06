import { describe, it, expect, vi, beforeEach } from "vitest";

import { PlanPreviewPanel, type PlanPreviewPanelDeps } from "../../../views/planPreviewPanel";

function makeMockPanel() {
  let messageHandler: ((msg: any) => void) | undefined;
  return {
    webview: {
      html: "",
      cspSource: "https://mock.csp",
      postMessage: vi.fn(),
      onDidReceiveMessage: vi.fn((cb) => { messageHandler = cb; }),
    },
    reveal: vi.fn(),
    onDidDispose: vi.fn(),
    dispose: vi.fn(),
    _simulateMessage(msg: any) { messageHandler?.(msg); },
  };
}

const VALID_PLAN = `# Plan

## Phase 1: Setup
[status: pending]
Install dependencies

## Phase 2: Build
[status: pending]
**Depends on:** 1
Compile the project
`;

const INVALID_PLAN = `# Plan

## Phase 1: Setup
[status: pending]
Do stuff

## Phase 1: Duplicate
[status: pending]
Oops duplicate
`;

function makeDeps(mockPanel = makeMockPanel()): PlanPreviewPanelDeps & { _panel: ReturnType<typeof makeMockPanel> } {
  return {
    createWebviewPanel: vi.fn(() => mockPanel) as any,
    readFile: vi.fn(async () => VALID_PLAN),
    onAnnotation: vi.fn(),
    _panel: mockPanel,
  };
}

describe("PlanPreviewPanel", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("reveal() creates webview panel in ViewColumn.Two", () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    expect(deps.createWebviewPanel).toHaveBeenCalledWith(
      "oxveil.planPreview", "Plan Preview", 2,
      { enableScripts: true, retainContextWhenHidden: true },
    );
  });

  it("reveal() sets HTML shell on first reveal", () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    expect(deps._panel.webview.html).toContain("<!DOCTYPE html>");
  });

  it("reveal() reuses panel on subsequent calls", () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    panel.reveal();
    expect(deps.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(deps._panel.reveal).toHaveBeenCalledTimes(1);
  });

  it("onFileChanged() reads PLAN.md and sends parsed data to webview", async () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    deps._panel.webview.postMessage.mockClear();

    await panel.onFileChanged();

    expect(deps.readFile).toHaveBeenCalled();
    expect(deps._panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "update" }),
    );
    // Should contain phase card HTML
    const call = deps._panel.webview.postMessage.mock.calls[0][0];
    expect(call.html).toContain("Phase 1");
    expect(call.html).toContain("Setup");
  });

  it("onFileChanged() with invalid plan sends validation errors", async () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    deps.readFile = vi.fn(async () => INVALID_PLAN);
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    mockPanel.webview.postMessage.mockClear();

    await panel.onFileChanged();

    const call = mockPanel.webview.postMessage.mock.calls[0][0];
    expect(call.type).toBe("update");
    // Invalid plan should not have the valid badge
    expect(call.html).not.toContain("Valid");
  });

  it("onFileChanged() without panel does nothing", async () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    await panel.onFileChanged();
    expect(deps.readFile).not.toHaveBeenCalled();
  });

  it("setSessionActive(false) sends session ended state", async () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();

    // Load plan first
    await panel.onFileChanged();
    deps._panel.webview.postMessage.mockClear();

    panel.setSessionActive(false);

    const call = deps._panel.webview.postMessage.mock.calls[0][0];
    expect(call.type).toBe("update");
    expect(call.html).toContain("Session ended");
  });

  it("setSessionActive(true) re-renders with active state", async () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();

    await panel.onFileChanged();
    panel.setSessionActive(false);
    deps._panel.webview.postMessage.mockClear();

    panel.setSessionActive(true);

    const call = deps._panel.webview.postMessage.mock.calls[0][0];
    expect(call.type).toBe("update");
    expect(call.html).toContain("Live");
  });

  it("dispose() disposes panel", () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    panel.dispose();
    expect(deps._panel.dispose).toHaveBeenCalled();
  });

  it("annotation message from webview calls onAnnotation callback", () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();

    deps._panel._simulateMessage({ type: "annotation", phase: "1", text: "needs more tests" });

    expect(deps.onAnnotation).toHaveBeenCalledWith("1", "needs more tests");
  });

  it("annotation message with missing fields does not call onAnnotation", () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();

    deps._panel._simulateMessage({ type: "annotation" });

    expect(deps.onAnnotation).not.toHaveBeenCalled();
  });
});
