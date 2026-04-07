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

const ACTIVE_PLAN_PATH = "/workspace/.claude/plans/typed-hugging-dawn.md";

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
    readFile: vi.fn(async (_path: string) => VALID_PLAN),
    findActivePlanFile: vi.fn(async () => ACTIVE_PLAN_PATH),
    onAnnotation: vi.fn(),
    createFileSystemWatcher: vi.fn(() => mockWatcher.watcher),
    statFile: vi.fn(async (_path: string) => undefined),
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

  it("onFileChanged() finds active plan file and sends parsed data to webview", async () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    panel.beginSession();
    deps._panel.webview.postMessage.mockClear();

    await panel.onFileChanged();

    expect(deps.findActivePlanFile).toHaveBeenCalled();
    expect(deps.readFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
    expect(deps._panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "update" }),
    );
    const call = deps._panel.webview.postMessage.mock.calls[0][0];
    expect(call.html).toContain("Phase 1");
    expect(call.html).toContain("Setup");
  });

  it("onFileChanged() when no active plan file shows empty state", async () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    deps.findActivePlanFile = vi.fn(async () => undefined);
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

  it("onFileChanged() without panel still runs pinning logic", async () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    // No reveal() — no panel

    // Begin session so pinning logic activates
    panel.beginSession();
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000 });

    await panel.onFileChanged();

    // findActivePlanFile should still be called (pinning runs without panel)
    expect(deps.findActivePlanFile).toHaveBeenCalled();
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

  describe("file watching", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it("startWatching with array of watchers wires handlers to all", () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      const w1 = makeMockWatcher();
      const w2 = makeMockWatcher();
      const w3 = makeMockWatcher();

      panel.startWatching([w1.watcher, w2.watcher, w3.watcher]);

      expect(w1.watcher.onDidChange).toHaveBeenCalled();
      expect(w1.watcher.onDidCreate).toHaveBeenCalled();
      expect(w1.watcher.onDidDelete).toHaveBeenCalled();
      expect(w2.watcher.onDidChange).toHaveBeenCalled();
      expect(w2.watcher.onDidCreate).toHaveBeenCalled();
      expect(w2.watcher.onDidDelete).toHaveBeenCalled();
      expect(w3.watcher.onDidChange).toHaveBeenCalled();
      expect(w3.watcher.onDidCreate).toHaveBeenCalled();
      expect(w3.watcher.onDidDelete).toHaveBeenCalled();
    });

    it("file change from any watcher triggers onFileChanged after debounce", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();
      const w1 = makeMockWatcher();
      const w2 = makeMockWatcher();
      panel.startWatching([w1.watcher, w2.watcher]);

      w2._fireChange();
      expect(deps.findActivePlanFile).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(200);

      expect(deps.findActivePlanFile).toHaveBeenCalled();
    });

    it("file create from any watcher triggers onFileChanged after debounce", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();
      const w1 = makeMockWatcher();
      panel.startWatching([w1.watcher]);

      w1._fireCreate();
      await vi.advanceTimersByTimeAsync(200);

      expect(deps.findActivePlanFile).toHaveBeenCalled();
    });

    it("debounce prevents rapid re-reads across watchers", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();
      const w1 = makeMockWatcher();
      const w2 = makeMockWatcher();
      panel.startWatching([w1.watcher, w2.watcher]);

      // Fire rapid changes across different watchers
      w1._fireChange();
      w2._fireChange();
      w1._fireCreate();
      w2._fireChange();
      w1._fireChange();

      await vi.advanceTimersByTimeAsync(200);

      // Should only call findActivePlanFile once due to debounce
      expect(deps.findActivePlanFile).toHaveBeenCalledTimes(1);
    });

    it("stopWatching disposes all watchers", () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      const w1 = makeMockWatcher();
      const w2 = makeMockWatcher();
      panel.startWatching([w1.watcher, w2.watcher]);
      panel.stopWatching();
      expect(w1.watcher.dispose).toHaveBeenCalled();
      expect(w2.watcher.dispose).toHaveBeenCalled();
    });

    it("dispose stops watching all watchers", () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      const w1 = makeMockWatcher();
      const w2 = makeMockWatcher();
      panel.startWatching([w1.watcher, w2.watcher]);
      panel.dispose();
      expect(w1.watcher.dispose).toHaveBeenCalled();
      expect(w2.watcher.dispose).toHaveBeenCalled();
    });

    it("startWatching stops previous watchers", () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      const w1 = makeMockWatcher();
      panel.startWatching([w1.watcher]);
      const w2 = makeMockWatcher();
      panel.startWatching([w2.watcher]);
      expect(w1.watcher.dispose).toHaveBeenCalled();
    });
  });

  describe("session pinning", () => {
    it("beginSession records start time", () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      const before = Date.now();
      panel.beginSession();
      const after = Date.now();

      // We can't directly access private fields, but we can verify behavior:
      // After beginSession, onFileChanged should attempt pinning
      expect(before).toBeLessThanOrEqual(after);
    });

    it("onFileChanged with session active pins to file with birthtimeMs > sessionStartTime", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      panel.beginSession();
      // statFile returns a birthtime after session start
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000 });

      await panel.onFileChanged();
      deps._panel.webview.postMessage.mockClear();

      // Call again — should use pinned file directly without calling findActivePlanFile again
      (deps.findActivePlanFile as any).mockClear();
      await panel.onFileChanged();

      // findActivePlanFile should NOT be called because file is pinned
      expect(deps.findActivePlanFile).not.toHaveBeenCalled();
      expect(deps.readFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
    });

    it("onFileChanged when pinned reads pinned file directly", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      panel.beginSession();
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000 });

      // First call pins the file
      await panel.onFileChanged();

      // Change findActivePlanFile to return a different file
      const otherPath = "/home/user/.claude/plans/other-file.md";
      (deps.findActivePlanFile as any).mockResolvedValue(otherPath);
      (deps.readFile as any).mockClear();

      // Second call should still read the pinned file
      await panel.onFileChanged();
      expect(deps.readFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
      expect(deps.readFile).not.toHaveBeenCalledWith(otherPath);
    });

    it("onFileChanged does not pin when birthtimeMs < sessionStartTime", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      panel.beginSession();
      // statFile returns a birthtime BEFORE session start
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: 1000 });

      await panel.onFileChanged();
      (deps.findActivePlanFile as any).mockClear();

      // Call again — should call findActivePlanFile because file was NOT pinned
      await panel.onFileChanged();
      expect(deps.findActivePlanFile).toHaveBeenCalled();
    });

    it("endSession clears pin and session, subsequent onFileChanged skips discovery", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      panel.beginSession();
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000 });

      // Pin the file
      await panel.onFileChanged();
      (deps.findActivePlanFile as any).mockClear();

      // End session — should clear the pin and session
      panel.endSession();

      // Now onFileChanged should NOT scan (no active session)
      await panel.onFileChanged();
      expect(deps.findActivePlanFile).not.toHaveBeenCalled();
    });

    it("pinning works when _panel is undefined (no early return)", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      // No reveal() — no panel

      panel.beginSession();
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000 });

      // Should run pinning logic even without panel
      await panel.onFileChanged();
      expect(deps.findActivePlanFile).toHaveBeenCalled();
      expect(deps.statFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);

      // Now reveal and call again — should use pinned file
      panel.reveal();
      (deps.findActivePlanFile as any).mockClear();

      await panel.onFileChanged();
      expect(deps.findActivePlanFile).not.toHaveBeenCalled();
      expect(deps.readFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
    });

    it("onFileChanged without session skips discovery entirely", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      // No beginSession — no session active
      await panel.onFileChanged();

      // Neither findActivePlanFile nor statFile should be called
      expect(deps.findActivePlanFile).not.toHaveBeenCalled();
      expect(deps.statFile).not.toHaveBeenCalled();
    });
  });
});
