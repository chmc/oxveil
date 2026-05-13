// src/test/unit/views/sidebarPanel.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SidebarPanel } from "../../../views/sidebarPanel";
import type { SidebarState } from "../../../views/sidebarState";

function makeMockWebviewView() {
  let messageHandler: ((msg: any) => void) | undefined;
  return {
    webview: {
      html: "",
      cspSource: "https://mock.csp",
      options: {} as any,
      postMessage: vi.fn(),
      onDidReceiveMessage: vi.fn((cb) => { messageHandler = cb; }),
    },
    onDidDispose: vi.fn((cb: () => void) => ({ dispose: vi.fn() })),
    _simulateMessage(msg: any) { messageHandler?.(msg); },
  };
}

function makeDeps() {
  return {
    executeCommand: vi.fn(),
  };
}

describe("SidebarPanel", () => {
  let panel: SidebarPanel;
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
    panel = new SidebarPanel(deps);
  });

  it("sets HTML on resolveWebviewView with fallback state", () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    expect(view.webview.html).toContain("<!DOCTYPE html>");
    // Fallback state renders "empty" view instead of "Initializing..." spinner
    expect(view.webview.html).toContain("From Idea to Reality");
  });

  it("enables scripts on webview", () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    expect(view.webview.options.enableScripts).toBe(true);
  });

  it("sends fullState message on updateState instead of replacing HTML", () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    // Simulate webview script ready
    view._simulateMessage({ command: "__ready" });
    const initialHtml = view.webview.html;
    const state: SidebarState = { view: "empty", archives: [] };
    panel.updateState(state);
    // HTML should NOT change — updateState uses postMessage now
    expect(view.webview.html).toBe(initialHtml);
    // Instead, a fullState message is posted
    expect(view.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "fullState", html: expect.stringContaining("From Idea to Reality") }),
    );
  });

  it("dispatches webview messages to commands", () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    view._simulateMessage({ command: "start" });
    expect(deps.executeCommand).toHaveBeenCalledWith("oxveil.start");
  });

  it("buffers state when no webview is resolved and renders into initial HTML", () => {
    const state: SidebarState = { view: "ready", archives: [], plan: { filename: "PLAN.md", phases: [] } };
    panel.updateState(state);
    // No error thrown
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    // Buffered state is rendered into initial HTML, not sent via postMessage
    expect(view.webview.html).toContain("PLAN.md");
    expect(view.webview.postMessage).not.toHaveBeenCalled();
  });

  it("dispatches resumePlan to onPlanChoice callback", () => {
    const onPlanChoice = vi.fn();
    const panel2 = new SidebarPanel({ executeCommand: vi.fn(), onPlanChoice });
    const view = makeMockWebviewView();
    panel2.resolveWebviewView(view as any);
    view._simulateMessage({ command: "resumePlan" });
    expect(onPlanChoice).toHaveBeenCalledWith("resume");
  });

  it("dispatches dismissPlan to onPlanChoice callback", () => {
    const onPlanChoice = vi.fn();
    const panel2 = new SidebarPanel({ executeCommand: vi.fn(), onPlanChoice });
    const view = makeMockWebviewView();
    panel2.resolveWebviewView(view as any);
    view._simulateMessage({ command: "dismissPlan" });
    expect(onPlanChoice).toHaveBeenCalledWith("dismiss");
  });

  it("simulateClick dispatches restart as oxveil.reset", () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    panel.simulateClick("restart");
    expect(deps.executeCommand).toHaveBeenCalledWith("oxveil.reset");
  });

  it("simulateClick works without webview resolved", () => {
    panel.simulateClick("restart");
    expect(deps.executeCommand).toHaveBeenCalledWith("oxveil.reset");
  });

  it("simulateClick dispatches resumePlan via onPlanChoice", () => {
    const onPlanChoice = vi.fn();
    const p = new SidebarPanel({ executeCommand: vi.fn(), onPlanChoice });
    p.simulateClick("resumePlan");
    expect(onPlanChoice).toHaveBeenCalledWith("resume");
  });

  it("simulateClick with phase command but no phase is a no-op", () => {
    panel.simulateClick("retry");
    expect(deps.executeCommand).not.toHaveBeenCalled();
  });

  it("triggerClick resolves true when webview reports element found", async () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    view._simulateMessage({ command: "__ready" });

    const clickPromise = panel.triggerClick("[data-command='start']");
    // Capture the requestId from the posted message
    const posted = view.webview.postMessage.mock.calls.find(
      (c: any[]) => c[0].type === "triggerClick"
    );
    const requestId = posted![0].requestId;
    view._simulateMessage({ type: "clickResult", requestId, found: true });

    expect(await clickPromise).toBe(true);
  });

  it("triggerClick resolves false when webview reports element not found", async () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    view._simulateMessage({ command: "__ready" });

    const clickPromise = panel.triggerClick("[data-command='missing']");
    const posted = view.webview.postMessage.mock.calls.find(
      (c: any[]) => c[0].type === "triggerClick"
    );
    const requestId = posted![0].requestId;
    view._simulateMessage({ type: "clickResult", requestId, found: false });

    expect(await clickPromise).toBe(false);
  });

  it("triggerClick resolves false on dispose before response", async () => {
    const view = makeMockWebviewView();
    let disposeHandler: (() => void) | undefined;
    const viewWithDispose = {
      ...view,
      onDidDispose: vi.fn((cb: () => void) => { disposeHandler = cb; return { dispose: vi.fn() }; }),
    };
    panel.resolveWebviewView(viewWithDispose as any);
    viewWithDispose._simulateMessage({ command: "__ready" });

    const clickPromise = panel.triggerClick("[data-command='start']");
    disposeHandler!();

    expect(await clickPromise).toBe(false);
  });

  it("sends progressUpdate to webview", () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    // Simulate webview script ready
    view._simulateMessage({ command: "__ready" });
    const update = { phases: [], elapsed: "1m", currentPhase: 1 };
    panel.sendProgressUpdate(update);
    expect(view.webview.postMessage).toHaveBeenCalledWith({
      type: "progressUpdate",
      update,
    });
  });
});
