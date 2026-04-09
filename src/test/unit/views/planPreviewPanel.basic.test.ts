import { describe, it, expect, vi, beforeEach } from "vitest";

import { PlanPreviewPanel } from "../../../views/planPreviewPanel";
import { makeDeps, makeMockPanel, ACTIVE_PLAN_PATH, VALID_PLAN, INVALID_PLAN } from "./planPreviewPanel.helpers";

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

  it("onFileChanged() finds plan files and sends parsed data to webview", async () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    panel.beginSession();
    deps._panel.webview.postMessage.mockClear();

    await panel.onFileChanged();

    expect(deps.findAllPlanFiles).toHaveBeenCalled();
    expect(deps.readFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
    expect(deps._panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "update" }),
    );
    const call = deps._panel.webview.postMessage.mock.calls[0][0];
    expect(call.html).toContain("Phase 1");
    expect(call.html).toContain("Setup");
  });

  it("onFileChanged() when no plan files shows empty state", async () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    deps.findAllPlanFiles = vi.fn(async () => []);
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    panel.beginSession();
    mockPanel.webview.postMessage.mockClear();

    await panel.onFileChanged();

    expect(deps.readFile).not.toHaveBeenCalled();
    const call = mockPanel.webview.postMessage.mock.calls[0][0];
    expect(call.type).toBe("update");
  });

  it("onFileChanged() with invalid plan sends validation errors", async () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    deps.readFile = vi.fn(async (_path: string) => INVALID_PLAN);
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    panel.beginSession();
    mockPanel.webview.postMessage.mockClear();

    await panel.onFileChanged();

    const call = mockPanel.webview.postMessage.mock.calls[0][0];
    expect(call.type).toBe("update");
    // Invalid plan should not have the valid badge
    expect(call.html).not.toContain("Valid");
  });

  it("onFileChanged() with content but no phases shows raw markdown fallback", async () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    deps.readFile = vi.fn(async (_path: string) => "This is just some text\nwith no phase headers");
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    panel.beginSession();
    mockPanel.webview.postMessage.mockClear();

    await panel.onFileChanged();

    const call = mockPanel.webview.postMessage.mock.calls[0][0];
    expect(call.type).toBe("update");
    expect(call.html).toContain("This is just some text");
    expect(call.html).not.toContain("Could not parse plan format");
  });

  it("onFileChanged() without panel still runs tracking logic", async () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    // No reveal() — no panel

    panel.beginSession();
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000, mtimeMs: Date.now() + 1000 });

    await panel.onFileChanged();

    // findAllPlanFiles should still be called (tracking runs without panel)
    expect(deps.findAllPlanFiles).toHaveBeenCalled();
    // But postMessage should NOT be called (no panel)
    expect(deps._panel.webview.postMessage).not.toHaveBeenCalled();
  });

  it("setSessionActive(false) sends session ended state", async () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    panel.beginSession();

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
    panel.beginSession();

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
