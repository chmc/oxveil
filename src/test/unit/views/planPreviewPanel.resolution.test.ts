import * as os from "node:os";
import * as path from "node:path";
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

    const panel = new PlanPreviewPanel(deps);
    panel.reveal();

    await panel.onFileChanged();

    // Should use cached path
    expect(deps.loadPersistedPlanPath).toHaveBeenCalled();
    expect(deps.readFile).toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
  });

  it("sessionless: cache cleared when newer candidate exists (stale session pointer)", async () => {
    const newerPath = "/workspace/.claude/plans/newer-plan.md";
    const deps = makeDeps();
    const now = Date.now();
    deps.loadPersistedPlanPath = vi.fn(() => ({
      planPath: ACTIVE_PLAN_PATH,
      resolvedAt: now - 10000,
    }));
    deps.persistPlanPath = vi.fn();
    deps.findAllPlanFiles = vi.fn(async () => [
      { path: ACTIVE_PLAN_PATH, category: "plan" as PlanFileCategory, mtimeMs: now - 5000 },
      { path: newerPath, category: "plan" as PlanFileCategory, mtimeMs: now },
    ]);

    const panel = new PlanPreviewPanel(deps);
    panel.reveal();

    await panel.onFileChanged();

    // Cache should be cleared and newest candidate used
    expect(deps.persistPlanPath).toHaveBeenCalledWith(undefined);
    expect(deps.readFile).toHaveBeenCalledWith(newerPath);
  });

  it("sessionless: falls through to mtimeMs when cache miss (file deleted)", async () => {
    const freshPath = "/workspace/.claude/plans/fresh-plan.md";
    const deps = makeDeps();
    deps.loadPersistedPlanPath = vi.fn(() => ({
      planPath: "/deleted-plan.md",
      resolvedAt: Date.now(),
    }));
    deps.fileExists = vi.fn(async (p: string) => p === freshPath);
    deps.findAllPlanFiles = vi.fn(async () => [
      { path: freshPath, category: "plan" as PlanFileCategory, mtimeMs: Date.now() },
    ]);
    deps.persistPlanPath = vi.fn();

    const panel = new PlanPreviewPanel(deps);
    panel.reveal();

    await panel.onFileChanged();

    expect(deps.readFile).toHaveBeenCalledWith(freshPath);
  });

  it("sessionless: rejects candidates older than 4 hours when no session active", async () => {
    const staleTime = Date.now() - 5 * 60 * 60 * 1000; // 5 hours ago
    const deps = makeDeps();
    deps.loadPersistedPlanPath = vi.fn(() => ({
      planPath: ACTIVE_PLAN_PATH,
      resolvedAt: staleTime,
    }));
    deps.persistPlanPath = vi.fn();
    deps.findAllPlanFiles = vi.fn(async () => [
      { path: ACTIVE_PLAN_PATH, category: "plan" as PlanFileCategory, mtimeMs: staleTime },
    ]);

    const panel = new PlanPreviewPanel(deps);
    panel.reveal();

    await panel.onFileChanged();

    expect(deps.persistPlanPath).toHaveBeenCalledWith(undefined);
    expect(deps.readFile).not.toHaveBeenCalledWith(ACTIVE_PLAN_PATH);
  });

  it("sessionless: rejects stale candidates via mtimeMs layer when no cache exists", async () => {
    const staleTime = Date.now() - 5 * 60 * 60 * 1000;
    const deps = makeDeps();
    deps.loadPersistedPlanPath = vi.fn(() => undefined);
    deps.persistPlanPath = vi.fn();
    deps.findAllPlanFiles = vi.fn(async () => [
      { path: ACTIVE_PLAN_PATH, category: "plan" as PlanFileCategory, mtimeMs: staleTime },
    ]);

    const panel = new PlanPreviewPanel(deps);
    panel.reveal();

    await panel.onFileChanged();

    expect(deps.persistPlanPath).toHaveBeenCalledWith(undefined);
    expect(deps.readFile).not.toHaveBeenCalled();
  });

  it("sessionless: falls through to mtimeMs when no cache exists", async () => {
    const deps = makeDeps();
    deps.loadPersistedPlanPath = vi.fn(() => undefined);

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

  it("sessionless mode excludes global plans from candidates", async () => {
    const globalPlanPath = path.join(os.homedir(), ".claude", "plans", "other-project-plan.md");
    const workspacePlanPath = ACTIVE_PLAN_PATH;
    const now = Date.now();

    const deps = makeDeps();
    deps.loadPersistedPlanPath = vi.fn(() => undefined);
    deps.findAllPlanFiles = vi.fn(async () => [
      { path: globalPlanPath, category: "plan" as PlanFileCategory, mtimeMs: now },
      { path: workspacePlanPath, category: "plan" as PlanFileCategory, mtimeMs: now - 1000 },
    ]);

    const panel = new PlanPreviewPanel(deps);
    panel.reveal();

    await panel.onFileChanged();

    expect(deps.readFile).not.toHaveBeenCalledWith(globalPlanPath);
    expect(deps.readFile).toHaveBeenCalledWith(workspacePlanPath);
  });

  it("sessionless: prunes previously tracked global plans on each resolve cycle", async () => {
    const globalPlanPath = path.join(os.homedir(), ".claude", "plans", "stale-plan.md");
    const workspacePlanPath = ACTIVE_PLAN_PATH;
    const now = Date.now();

    const deps = makeDeps();
    deps.loadPersistedPlanPath = vi.fn(() => undefined);
    deps.findAllPlanFiles = vi.fn(async () => [
      { path: globalPlanPath, category: "plan" as PlanFileCategory, mtimeMs: now },
    ]);

    const panel = new PlanPreviewPanel(deps);
    panel.reveal();

    // First call: global plan should be excluded
    await panel.onFileChanged();
    expect(deps.readFile).not.toHaveBeenCalled();

    // Second call: workspace plan now appears — global plan must NOT persist in trackedFiles
    deps.findAllPlanFiles = vi.fn(async () => [
      { path: workspacePlanPath, category: "plan" as PlanFileCategory, mtimeMs: now },
    ]);
    await panel.onFileChanged();
    expect(deps.readFile).toHaveBeenCalledWith(workspacePlanPath);
    expect(deps.readFile).not.toHaveBeenCalledWith(globalPlanPath);
  });

});
