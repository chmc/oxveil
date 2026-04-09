import { describe, it, expect, vi, beforeEach } from "vitest";

import { PlanPreviewPanel, type PlanFileCategory } from "../../../views/planPreviewPanel";
import { makeDeps, ACTIVE_PLAN_PATH } from "./planPreviewPanel.helpers";

describe("PlanPreviewPanel > 4-layer resolution pipeline", () => {
  beforeEach(() => { vi.clearAllMocks(); });

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
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: Date.now() + 1000, mtimeMs: Date.now() + 1000 });

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
