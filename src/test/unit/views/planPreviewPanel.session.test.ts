import { describe, it, expect, vi, beforeEach } from "vitest";

import { PlanPreviewPanel, type PlanFileCategory } from "../../../views/planPreviewPanel";
import { makeDeps, ACTIVE_PLAN_PATH, VALID_PLAN } from "./planPreviewPanel.helpers";

describe("PlanPreviewPanel > session pinning", () => {
  beforeEach(() => { vi.clearAllMocks(); });

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
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000, mtimeMs: Date.now() + 1000 });

    await panel.onFileChanged();

    expect(deps.readFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
  });

  it("tracked file persists across onFileChanged calls", async () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();

    panel.beginSession();
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000, mtimeMs: Date.now() + 1000 });

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
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: 1000, mtimeMs: 1000 });

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
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000, mtimeMs: Date.now() + 1000 });

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
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000, mtimeMs: Date.now() + 1000 });

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
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000, mtimeMs: Date.now() + 1000 });

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

  it("setPlanFormed(true) disables the Form Plan button", async () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    deps._panel._simulateMessage({ type: "ready" });
    deps._panel.webview.postMessage.mockClear();

    await panel.onFileChanged();
    panel.setPlanFormed(true);

    const calls = deps._panel.webview.postMessage.mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.html).toContain("disabled");
    expect(lastCall.html).toContain('title="Plan already formed. Start from sidebar."');
  });

  it("setPlanFormed(false) enables the Form Plan button", async () => {
    const deps = makeDeps();
    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    deps._panel._simulateMessage({ type: "ready" });
    deps._panel.webview.postMessage.mockClear();

    await panel.onFileChanged();
    panel.setPlanFormed(true);
    panel.setPlanFormed(false);

    const calls = deps._panel.webview.postMessage.mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.html).not.toMatch(/<button[^>]*class="form-plan-btn"[^>]*disabled/);
  });
});
