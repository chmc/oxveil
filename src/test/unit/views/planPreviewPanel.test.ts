import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { PlanPreviewPanel, type PlanPreviewPanelDeps, type FileSystemWatcher } from "../../../views/planPreviewPanel";

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

function makeMockWatcher() {
  const handlers: Record<string, (() => void)[]> = { change: [], create: [], delete: [] };
  return {
    watcher: {
      onDidChange: vi.fn((cb: () => void) => {
        handlers.change.push(cb);
        return { dispose: vi.fn() };
      }),
      onDidCreate: vi.fn((cb: () => void) => {
        handlers.create.push(cb);
        return { dispose: vi.fn() };
      }),
      onDidDelete: vi.fn((cb: () => void) => {
        handlers.delete.push(cb);
        return { dispose: vi.fn() };
      }),
      dispose: vi.fn(),
    } satisfies FileSystemWatcher,
    _fireChange() { handlers.change.forEach(cb => cb()); },
    _fireCreate() { handlers.create.forEach(cb => cb()); },
    _fireDelete() { handlers.delete.forEach(cb => cb()); },
  };
}

function makeDeps(mockPanel = makeMockPanel()): PlanPreviewPanelDeps & { _panel: ReturnType<typeof makeMockPanel>; _watcher: ReturnType<typeof makeMockWatcher> } {
  const mockWatcher = makeMockWatcher();
  return {
    createWebviewPanel: vi.fn(() => mockPanel) as any,
    readFile: vi.fn(async () => VALID_PLAN),
    onAnnotation: vi.fn(),
    createFileSystemWatcher: vi.fn(() => mockWatcher.watcher),
    _panel: mockPanel,
    _watcher: mockWatcher,
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

  describe("file watching", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it("startWatching creates a file system watcher", () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.startWatching("/workspace");
      expect(deps.createFileSystemWatcher).toHaveBeenCalledWith("/workspace/PLAN.md");
    });

    it("file change triggers onFileChanged after debounce", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.startWatching("/workspace");

      deps._watcher._fireChange();
      // Should not have called readFile yet (debounce pending)
      expect(deps.readFile).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      // Wait for the async onFileChanged to complete
      await vi.runAllTimersAsync();

      expect(deps.readFile).toHaveBeenCalled();
    });

    it("file create triggers onFileChanged after debounce", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.startWatching("/workspace");

      deps._watcher._fireCreate();
      await vi.advanceTimersByTimeAsync(200);

      expect(deps.readFile).toHaveBeenCalled();
    });

    it("debounce prevents rapid re-reads", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.startWatching("/workspace");

      // Fire 5 rapid changes
      deps._watcher._fireChange();
      deps._watcher._fireChange();
      deps._watcher._fireChange();
      deps._watcher._fireChange();
      deps._watcher._fireChange();

      await vi.advanceTimersByTimeAsync(200);

      // Should only call readFile once due to debounce
      expect(deps.readFile).toHaveBeenCalledTimes(1);
    });

    it("stopWatching disposes watcher", () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.startWatching("/workspace");
      panel.stopWatching();
      expect(deps._watcher.watcher.dispose).toHaveBeenCalled();
    });

    it("dispose stops watching", () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.startWatching("/workspace");
      panel.dispose();
      expect(deps._watcher.watcher.dispose).toHaveBeenCalled();
    });

    it("startWatching stops previous watcher", () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.startWatching("/workspace");
      const firstWatcher = deps._watcher.watcher;
      panel.startWatching("/other");
      expect(firstWatcher.dispose).toHaveBeenCalled();
    });
  });
});
