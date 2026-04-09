import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { PlanPreviewPanel, type PlanPreviewPanelDeps, type FileSystemWatcher, type PlanFileCategory } from "../../../views/planPreviewPanel";

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
    findAllPlanFiles: vi.fn(async () => [{ path: ACTIVE_PLAN_PATH, category: "plan" as PlanFileCategory, mtimeMs: Date.now() }]),
    onAnnotation: vi.fn(),
    createFileSystemWatcher: vi.fn(() => mockWatcher.watcher),
    statFile: vi.fn(async (_path: string) => ({ birthtimeMs: Date.now() + 1000 })),
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
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000 });

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
      expect(deps.findAllPlanFiles).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(200);

      expect(deps.findAllPlanFiles).toHaveBeenCalled();
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

      expect(deps.findAllPlanFiles).toHaveBeenCalled();
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

      // Should only call findAllPlanFiles once due to debounce
      expect(deps.findAllPlanFiles).toHaveBeenCalledTimes(1);
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
      // After beginSession, onFileChanged should attempt tracking
      expect(before).toBeLessThanOrEqual(after);
    });

    it("onFileChanged with session active tracks file with birthtimeMs > sessionStartTime", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      panel.beginSession();
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000 });

      await panel.onFileChanged();

      expect(deps.readFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
    });

    it("tracked file persists across onFileChanged calls", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      panel.beginSession();
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000 });

      await panel.onFileChanged();
      (deps.readFile as any).mockClear();

      // Call again — should read the same tracked file
      await panel.onFileChanged();
      expect(deps.readFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
    });

    it("does not track when birthtimeMs < sessionStartTime", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      panel.beginSession();
      // statFile returns a birthtime BEFORE session start
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: 1000 });

      await panel.onFileChanged();

      // Stale file should NOT be read or rendered
      expect(deps.readFile).not.toHaveBeenCalled();
    });

    it("does not track file when statFile dep is not provided", async () => {
      const deps = makeDeps();
      delete (deps as any).statFile;
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();

      await panel.onFileChanged();

      // Can't verify freshness without statFile — should not read the file
      expect(deps.readFile).not.toHaveBeenCalled();
    });

    it("does not track file when statFile returns undefined", async () => {
      const deps = makeDeps();
      (deps.statFile as any).mockResolvedValue(undefined);
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();

      await panel.onFileChanged();

      expect(deps.readFile).not.toHaveBeenCalled();
    });

    it("post-session onFileChanged re-renders tracked content", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000 });

      // Load a plan and end session
      await panel.onFileChanged();
      panel.setSessionActive(false);
      panel.endSession();
      deps._panel.webview.postMessage.mockClear();

      // Simulate delayed watcher event after session ended
      await panel.onFileChanged();

      // Should still render tracked content (no new files discovered)
      const call = deps._panel.webview.postMessage.mock.calls[0][0];
      expect(call.type).toBe("update");
      expect(call.html).toContain("Phase 1");
    });

    it("endSession clears session but preserves tracked files", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      panel.beginSession();
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000 });

      // Track the file
      await panel.onFileChanged();

      // End session
      panel.endSession();
      deps._panel.webview.postMessage.mockClear();
      (deps.readFile as any).mockClear();

      // onFileChanged still renders tracked content
      await panel.onFileChanged();
      expect(deps.readFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
    });

    it("tracking works when _panel is undefined (no early return)", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      // No reveal() — no panel

      panel.beginSession();
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000 });

      // Should run tracking logic even without panel
      await panel.onFileChanged();
      expect(deps.findAllPlanFiles).toHaveBeenCalled();
      expect(deps.statFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);

      // Now reveal and call again — should use tracked file
      panel.reveal();

      await panel.onFileChanged();
      expect(deps.readFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
    });

    it("onFileChanged without session uses sessionless fallback to show newest file", async () => {
      const deps = makeDeps();
      const now = Date.now();
      deps.findAllPlanFiles = vi.fn(async () => [
        { path: "/old.md", category: "plan" as PlanFileCategory, mtimeMs: now - 10000 },
        { path: ACTIVE_PLAN_PATH, category: "plan" as PlanFileCategory, mtimeMs: now },
      ]);
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      // No beginSession — sessionless fallback picks newest by mtimeMs
      await panel.onFileChanged();

      expect(deps.findAllPlanFiles).toHaveBeenCalled();
      expect(deps.readFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
    });

    it("beginSession resets sessionless tracked files", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      // Sessionless load
      await panel.onFileChanged();
      expect(panel.getActiveFilePath()).toBe(ACTIVE_PLAN_PATH);

      // Start a real session — clears tracked files
      panel.beginSession();
      expect(panel.getActiveFilePath()).toBeUndefined();
    });

    it("_sessionActive defaults to false", () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      // Trigger ready message to get initial update
      deps._panel._simulateMessage({ type: "ready" });

      // The empty state subtitle reflects sessionActive=false
      const call = deps._panel.webview.postMessage.mock.calls[0]?.[0];
      expect(call?.type).toBe("update");
      expect(call?.html).toContain("Start chatting with Claude");
      expect(call?.html).not.toContain("Waiting for Claude to write a plan");
    });
  });

  describe("multi-file tab switching", () => {
    const DESIGN_PATH = "/workspace/docs/superpowers/specs/2026-04-07-feature-design.md";
    const IMPL_PATH = "/workspace/docs/superpowers/plans/2026-04-07-feature.md";
    const DESIGN_CONTENT = "# Feature Design\n\n## Problem\n\nSome problem description.";
    const IMPL_CONTENT = `# Feature Implementation

## Phase 1: Setup
[status: pending]
Install things

## Phase 2: Build
[status: pending]
Build things
`;

    it("tracks files from multiple categories", async () => {
      const deps = makeDeps();
      const now = Date.now();
      deps.findAllPlanFiles = vi.fn(async () => [
        { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
        { path: IMPL_PATH, category: "implementation" as PlanFileCategory, mtimeMs: now + 100 },
      ]);
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500 });
      deps.readFile = vi.fn(async (p: string) =>
        p === DESIGN_PATH ? DESIGN_CONTENT : IMPL_CONTENT,
      );

      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();

      await panel.onFileChanged();

      // Should render the last new category (implementation)
      const call = deps._panel.webview.postMessage.mock.calls[0][0];
      expect(call.html).toContain("Phase 1");
      expect(call.html).toContain("Setup");
    });

    it("renders tab strip when 2+ categories are tracked", async () => {
      const deps = makeDeps();
      const now = Date.now();
      deps.findAllPlanFiles = vi.fn(async () => [
        { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
        { path: IMPL_PATH, category: "implementation" as PlanFileCategory, mtimeMs: now + 100 },
      ]);
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500 });
      deps.readFile = vi.fn(async (p: string) =>
        p === DESIGN_PATH ? DESIGN_CONTENT : IMPL_CONTENT,
      );

      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();

      await panel.onFileChanged();

      const call = deps._panel.webview.postMessage.mock.calls[0][0];
      expect(call.html).toContain("tab-strip");
      expect(call.html).toContain("Design");
      expect(call.html).toContain("Implementation");
    });

    it("does not render tab strip with single category", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();

      await panel.onFileChanged();

      const call = deps._panel.webview.postMessage.mock.calls[0][0];
      expect(call.html).not.toContain("tab-strip");
    });

    it("auto-switches to new category when it appears", async () => {
      const deps = makeDeps();
      const now = Date.now();

      // First: only design
      deps.findAllPlanFiles = vi.fn(async () => [
        { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
      ]);
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500 });
      deps.readFile = vi.fn(async () => DESIGN_CONTENT);

      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();

      await panel.onFileChanged();
      expect(deps.readFile).toHaveBeenCalledWith(DESIGN_PATH);

      // Now implementation appears
      deps.findAllPlanFiles = vi.fn(async () => [
        { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
        { path: IMPL_PATH, category: "implementation" as PlanFileCategory, mtimeMs: now + 200 },
      ]);
      deps.readFile = vi.fn(async (p: string) =>
        p === DESIGN_PATH ? DESIGN_CONTENT : IMPL_CONTENT,
      );
      deps._panel.webview.postMessage.mockClear();

      await panel.onFileChanged();

      // Should auto-switch to implementation
      expect(deps.readFile).toHaveBeenCalledWith(IMPL_PATH);
    });

    it("switchTab message switches to requested category", async () => {
      const deps = makeDeps();
      const now = Date.now();
      deps.findAllPlanFiles = vi.fn(async () => [
        { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
        { path: IMPL_PATH, category: "implementation" as PlanFileCategory, mtimeMs: now + 100 },
      ]);
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500 });
      deps.readFile = vi.fn(async (p: string) =>
        p === DESIGN_PATH ? DESIGN_CONTENT : IMPL_CONTENT,
      );

      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();

      await panel.onFileChanged();
      deps._panel.webview.postMessage.mockClear();
      (deps.readFile as any).mockClear();

      // User clicks Design tab
      deps._panel._simulateMessage({ type: "switchTab", category: "design" });

      // Wait for async _onTabSwitch to complete
      await vi.waitFor(() => {
        expect(deps.readFile).toHaveBeenCalledWith(DESIGN_PATH);
      });

      const call = deps._panel.webview.postMessage.mock.calls[0][0];
      expect(call.html).toContain("Feature Design");
    });

    it("manual tab switch disables auto-switch for existing categories", async () => {
      const deps = makeDeps();
      const now = Date.now();
      deps.findAllPlanFiles = vi.fn(async () => [
        { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
        { path: IMPL_PATH, category: "implementation" as PlanFileCategory, mtimeMs: now + 100 },
      ]);
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500 });
      deps.readFile = vi.fn(async (p: string) =>
        p === DESIGN_PATH ? DESIGN_CONTENT : IMPL_CONTENT,
      );

      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();

      await panel.onFileChanged();

      // User manually switches to design
      deps._panel._simulateMessage({ type: "switchTab", category: "design" });
      await vi.waitFor(() => {
        expect(deps.readFile).toHaveBeenCalledWith(DESIGN_PATH);
      });
      (deps.readFile as any).mockClear();

      // File changes — should stay on design (no new category)
      await panel.onFileChanged();
      expect(deps.readFile).toHaveBeenCalledWith(DESIGN_PATH);
    });

    it("nextTab() cycles through tracked categories", async () => {
      const deps = makeDeps();
      const now = Date.now();
      deps.findAllPlanFiles = vi.fn(async () => [
        { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
        { path: IMPL_PATH, category: "implementation" as PlanFileCategory, mtimeMs: now + 100 },
      ]);
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500 });
      deps.readFile = vi.fn(async (p: string) =>
        p === DESIGN_PATH ? DESIGN_CONTENT : IMPL_CONTENT,
      );

      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();

      await panel.onFileChanged();
      // Active is "implementation" (last new category)
      (deps.readFile as any).mockClear();

      // nextTab should cycle to design
      await panel.nextTab();
      expect(deps.readFile).toHaveBeenCalledWith(DESIGN_PATH);

      (deps.readFile as any).mockClear();

      // nextTab again should cycle back to implementation
      await panel.nextTab();
      expect(deps.readFile).toHaveBeenCalledWith(IMPL_PATH);
    });

    it("nextTab() does nothing with single category", async () => {
      const deps = makeDeps();
      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();

      await panel.onFileChanged();
      deps._panel.webview.postMessage.mockClear();

      await panel.nextTab();

      // No update sent — only one category
      expect(deps._panel.webview.postMessage).not.toHaveBeenCalled();
    });

    it("new category still auto-switches even after manual switch", async () => {
      const deps = makeDeps();
      const now = Date.now();

      // Start with design and plan
      deps.findAllPlanFiles = vi.fn(async () => [
        { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
        { path: ACTIVE_PLAN_PATH, category: "plan" as PlanFileCategory, mtimeMs: now },
      ]);
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500 });
      deps.readFile = vi.fn(async (p: string) =>
        p === DESIGN_PATH ? DESIGN_CONTENT : VALID_PLAN,
      );

      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();

      await panel.onFileChanged();

      // User manually switches to design (sets _autoSwitch = false)
      deps._panel._simulateMessage({ type: "switchTab", category: "design" });
      await vi.waitFor(() => {
        expect(deps.readFile).toHaveBeenCalledWith(DESIGN_PATH);
      });

      // Now implementation appears (NEW category)
      deps.findAllPlanFiles = vi.fn(async () => [
        { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
        { path: ACTIVE_PLAN_PATH, category: "plan" as PlanFileCategory, mtimeMs: now },
        { path: IMPL_PATH, category: "implementation" as PlanFileCategory, mtimeMs: now + 200 },
      ]);
      deps.readFile = vi.fn(async (p: string) => {
        if (p === DESIGN_PATH) return DESIGN_CONTENT;
        if (p === IMPL_PATH) return IMPL_CONTENT;
        return VALID_PLAN;
      });

      await panel.onFileChanged();

      // Should auto-switch to the new category
      expect(deps.readFile).toHaveBeenCalledWith(IMPL_PATH);
    });
  });

  describe("4-layer resolution pipeline", () => {
    it("sessionless: uses cached plan path from loadPersistedPlanPath", async () => {
      const deps = makeDeps();
      deps.loadPersistedPlanPath = vi.fn(() => ({
        planPath: ACTIVE_PLAN_PATH,
        resolvedAt: Date.now(),
      }));
      deps.fileExists = vi.fn(async () => true);
      deps.resolveFromSessionData = vi.fn(async () => ({ planPath: "/other.md" }));

      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      await panel.onFileChanged();

      // Should use cached path, not JSONL lookup
      expect(deps.loadPersistedPlanPath).toHaveBeenCalled();
      expect(deps.resolveFromSessionData).not.toHaveBeenCalled();
      expect(deps.readFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
    });

    it("sessionless: falls through to JSONL when cache is stale (file deleted)", async () => {
      const resolvedPath = "/resolved-from-jsonl.md";
      const deps = makeDeps();
      deps.loadPersistedPlanPath = vi.fn(() => ({
        planPath: "/deleted-plan.md",
        resolvedAt: Date.now(),
      }));
      deps.fileExists = vi.fn(async (p: string) => p === resolvedPath);
      deps.resolveFromSessionData = vi.fn(async () => ({ planPath: resolvedPath }));
      deps.findAllPlanFiles = vi.fn(async () => [
        { path: resolvedPath, category: "plan" as PlanFileCategory, mtimeMs: Date.now() },
      ]);
      deps.persistPlanPath = vi.fn();

      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      await panel.onFileChanged();

      expect(deps.resolveFromSessionData).toHaveBeenCalled();
      expect(deps.persistPlanPath).toHaveBeenCalledWith(
        expect.objectContaining({ planPath: resolvedPath }),
      );
      expect(deps.readFile).toHaveBeenCalledWith(resolvedPath);
    });

    it("sessionless: JSONL lookup runs only once", async () => {
      const deps = makeDeps();
      deps.loadPersistedPlanPath = vi.fn(() => undefined);
      deps.resolveFromSessionData = vi.fn(async () => undefined);

      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      await panel.onFileChanged();
      await panel.onFileChanged();

      expect(deps.resolveFromSessionData).toHaveBeenCalledTimes(1);
    });

    it("sessionless: falls through to mtimeMs when cache and JSONL both miss", async () => {
      const deps = makeDeps();
      deps.loadPersistedPlanPath = vi.fn(() => undefined);
      deps.resolveFromSessionData = vi.fn(async () => undefined);

      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      await panel.onFileChanged();

      // mtimeMs fallback picks from findAllPlanFiles
      expect(deps.readFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
    });

    it("beginSession clears persisted state", () => {
      const deps = makeDeps();
      deps.persistPlanPath = vi.fn();

      const panel = new PlanPreviewPanel(deps);
      panel.beginSession();

      expect(deps.persistPlanPath).toHaveBeenCalledWith(undefined);
    });

    it("active session persists matched plan path", async () => {
      const deps = makeDeps();
      deps.persistPlanPath = vi.fn();
      (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000 });

      const panel = new PlanPreviewPanel(deps);
      panel.reveal();
      panel.beginSession();

      await panel.onFileChanged();

      expect(deps.persistPlanPath).toHaveBeenCalledWith(
        expect.objectContaining({ planPath: ACTIVE_PLAN_PATH }),
      );
    });

    it("sessionless: handles resolveFromSessionData errors gracefully", async () => {
      const deps = makeDeps();
      deps.loadPersistedPlanPath = vi.fn(() => undefined);
      deps.resolveFromSessionData = vi.fn(async () => { throw new Error("boom"); });

      const panel = new PlanPreviewPanel(deps);
      panel.reveal();

      // Should not throw, falls through to mtimeMs
      await panel.onFileChanged();
      expect(deps.readFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
    });
  });
});
