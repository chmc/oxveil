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

  it("sets HTML on resolveWebviewView", () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    expect(view.webview.html).toContain("<!DOCTYPE html>");
    expect(view.webview.html).toContain("Initializing");
  });

  it("enables scripts on webview", () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    expect(view.webview.options.enableScripts).toBe(true);
  });

  it("sends fullState to webview on updateState", () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    const state: SidebarState = { view: "empty", archives: [] };
    panel.updateState(state);
    expect(view.webview.postMessage).toHaveBeenCalledWith({
      type: "fullState",
      state,
    });
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

  it("sends progressUpdate to webview", () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    const update = { phases: [], elapsed: "1m", currentPhase: 1 };
    panel.sendProgressUpdate(update);
    expect(view.webview.postMessage).toHaveBeenCalledWith({
      type: "progressUpdate",
      update,
    });
  });
});
