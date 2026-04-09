import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { PlanPreviewPanel } from "../../../views/planPreviewPanel";
import { makeDeps, makeMockWatcher } from "./planPreviewPanel.helpers";

describe("PlanPreviewPanel > file watching", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
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
