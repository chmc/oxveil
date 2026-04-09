import { describe, it, expect, vi, beforeEach } from "vitest";

import { PlanPreviewPanel, type PlanFileCategory } from "../../../views/planPreviewPanel";
import { makeDeps, ACTIVE_PLAN_PATH, VALID_PLAN } from "./planPreviewPanel.helpers";

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

describe("PlanPreviewPanel > multi-file tab switching", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("tracks files from multiple categories", async () => {
    const deps = makeDeps();
    const now = Date.now();
    deps.findAllPlanFiles = vi.fn(async () => [
      { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
      { path: IMPL_PATH, category: "implementation" as PlanFileCategory, mtimeMs: now + 100 },
    ]);
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500, mtimeMs: now + 500 });
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
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500, mtimeMs: now + 500 });
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
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500, mtimeMs: now + 500 });
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
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500, mtimeMs: now + 500 });
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
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500, mtimeMs: now + 500 });
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
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500, mtimeMs: now + 500 });
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
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500, mtimeMs: now + 500 });
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
