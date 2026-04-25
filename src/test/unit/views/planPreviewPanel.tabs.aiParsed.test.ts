import { describe, it, expect, vi, beforeEach } from "vitest";

import { PlanPreviewPanel, type PlanFileCategory } from "../../../views/planPreviewPanel";
import {
  makeDeps,
  DESIGN_PATH,
  DESIGN_CONTENT,
  AI_PARSED_PATH,
  AI_PARSED_CONTENT,
} from "./planPreviewPanel.helpers";

describe("PlanPreviewPanel > ai-parsed category", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should remove ai-parsed tab when file is deleted", async () => {
    const deps = makeDeps();
    const now = Date.now();

    // Start with ai-parsed file
    deps.findAllPlanFiles = vi.fn(async () => [
      { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
      { path: AI_PARSED_PATH, category: "ai-parsed" as PlanFileCategory, mtimeMs: now + 100 },
    ]);
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500, mtimeMs: now + 500 });
    deps.readFile = vi.fn(async (p: string) =>
      p === DESIGN_PATH ? DESIGN_CONTENT : AI_PARSED_CONTENT,
    );

    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    panel.beginSession();

    await panel.onFileChanged();

    // Verify ai-parsed tab is present
    let call = deps._panel.webview.postMessage.mock.calls.at(-1)[0];
    expect(call.html).toContain('data-category="ai-parsed"');

    // File deleted - only design remains
    deps.findAllPlanFiles = vi.fn(async () => [
      { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
    ]);
    deps.readFile = vi.fn(async () => DESIGN_CONTENT);
    deps._panel.webview.postMessage.mockClear();

    await panel.onFileChanged();

    call = deps._panel.webview.postMessage.mock.calls.at(-1)[0];
    expect(call.html).not.toContain('data-category="ai-parsed"');
  });

  it("should show ai-parsed tab when file exists at startup", async () => {
    const deps = makeDeps();
    const now = Date.now();

    deps.findAllPlanFiles = vi.fn(async () => [
      { path: AI_PARSED_PATH, category: "ai-parsed" as PlanFileCategory, mtimeMs: now },
    ]);
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500, mtimeMs: now + 500 });
    deps.readFile = vi.fn(async () => AI_PARSED_CONTENT);

    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    panel.beginSession();

    await panel.onFileChanged();

    // Single file = no tab strip, but content should be from ai-parsed
    expect(panel.getActiveFilePath()).toBe(AI_PARSED_PATH);
    const call = deps._panel.webview.postMessage.mock.calls[0][0];
    expect(call.html).toContain("AI Parsed Plan");
  });

  it("should render AI Parsed tab when ai-parsed file exists", async () => {
    const deps = makeDeps();
    const now = Date.now();
    deps.findAllPlanFiles = vi.fn(async () => [
      { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
      { path: AI_PARSED_PATH, category: "ai-parsed" as PlanFileCategory, mtimeMs: now + 100 },
    ]);
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500, mtimeMs: now + 500 });
    deps.readFile = vi.fn(async (p: string) =>
      p === DESIGN_PATH ? DESIGN_CONTENT : AI_PARSED_CONTENT,
    );

    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    panel.beginSession();

    await panel.onFileChanged();

    const call = deps._panel.webview.postMessage.mock.calls[0][0];
    expect(call.html).toContain('data-category="ai-parsed"');
    expect(call.html).toContain("AI Parsed");
  });

  it("should auto-switch to ai-parsed tab when file is created mid-session", async () => {
    const deps = makeDeps();
    const now = Date.now();

    // Initial state: only design file
    deps.findAllPlanFiles = vi.fn(async () => [
      { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
    ]);
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500, mtimeMs: now + 500 });
    deps.readFile = vi.fn(async () => DESIGN_CONTENT);

    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    panel.beginSession();

    await panel.onFileChanged();

    // Simulate ai-parsed-plan.md creation
    deps.findAllPlanFiles = vi.fn(async () => [
      { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
      { path: AI_PARSED_PATH, category: "ai-parsed" as PlanFileCategory, mtimeMs: now + 1000 },
    ]);
    (deps.statFile as any).mockResolvedValue({ birthtimeMs: now + 500, mtimeMs: now + 1000 });
    deps.readFile = vi.fn(async (p: string) =>
      p === AI_PARSED_PATH ? AI_PARSED_CONTENT : DESIGN_CONTENT,
    );
    deps._panel.webview.postMessage.mockClear();

    // Trigger file change
    await panel.onFileChanged();

    const lastCall = deps._panel.webview.postMessage.mock.calls.at(-1)[0];
    expect(lastCall.html).toContain('data-category="ai-parsed"');
    expect(lastCall.html).toContain('class="tab-pill active"');
    expect(lastCall.html).toContain("AI Parsed");
  });
});
