import { describe, it, expect, vi, beforeEach } from "vitest";

let configChangeHandlers: Array<(e: { affectsConfiguration: (k: string) => boolean }) => void> = [];

vi.mock("vscode", () => ({
  workspace: {
    onDidChangeConfiguration: vi.fn(
      (cb: (e: { affectsConfiguration: (k: string) => boolean }) => void) => {
        configChangeHandlers.push(cb);
        return { dispose: vi.fn() };
      },
    ),
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, def: unknown) => def),
    })),
  },
  commands: { executeCommand: vi.fn() },
}));

vi.mock("../../core/pathResolver", () => ({
  resolveClaudeloopPath: vi.fn().mockResolvedValue(null),
  createPathResolverDeps: vi.fn(() => ({})),
}));

import { createConfigWatcher } from "../../activateConfigWatcher";
import { resolveClaudeloopPath } from "../../core/pathResolver";
import * as vscode from "vscode";

function makeDetection() {
  return {
    updatePath: vi.fn(),
    detect: vi.fn().mockResolvedValue({ status: "detected" }),
  } as any;
}

function makeDeps(detection = makeDetection()) {
  const sidebarState = { setDetectionStatus: vi.fn() } as any;
  const sidebarPanel = { updateState: vi.fn() } as any;
  const statusBar = { update: vi.fn() } as any;
  const manager = { getActiveSession: vi.fn(() => undefined) } as any;
  const folderChangeOpts = { resolvedPath: undefined as string | undefined, detected: false };
  const buildFullState = vi.fn(() => ({
    view: "empty",
    provider: "claude",
  } as any));

  return {
    deps: {
      detection,
      folderChangeOpts,
      sidebarState,
      buildFullState,
      sidebarPanel,
      statusBar,
      manager,
    } as any,
    detection,
    folderChangeOpts,
    sidebarState,
    sidebarPanel,
    statusBar,
    buildFullState,
  };
}

function fireConfigChange(key: string) {
  for (const h of configChangeHandlers) {
    h({ affectsConfiguration: (k) => k === key });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  configChangeHandlers = [];
});

describe("createConfigWatcher", () => {
  it("returns a disposable", () => {
    const { deps } = makeDeps();
    const watcher = createConfigWatcher(deps);
    expect(watcher).toHaveProperty("dispose");
  });

  it("registers a configuration change listener", () => {
    const { deps } = makeDeps();
    createConfigWatcher(deps);
    expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalledTimes(1);
  });

  it("calls detection.updatePath when claudeloopPath changes", async () => {
    const { deps, detection } = makeDeps();
    createConfigWatcher(deps);

    fireConfigChange("oxveil.claudeloopPath");
    await Promise.resolve();
    await Promise.resolve();

    expect(detection.updatePath).toHaveBeenCalled();
  });

  it("calls detection.detect after path update", async () => {
    const { deps, detection } = makeDeps();
    createConfigWatcher(deps);

    fireConfigChange("oxveil.claudeloopPath");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(detection.detect).toHaveBeenCalled();
  });

  it("updates folderChangeOpts.detected to true when detected", async () => {
    const detection = makeDetection();
    detection.detect = vi.fn().mockResolvedValue({ status: "detected" });
    const { deps, folderChangeOpts } = makeDeps(detection);

    createConfigWatcher(deps);
    fireConfigChange("oxveil.claudeloopPath");
    // Drain promise chain
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(folderChangeOpts.detected).toBe(true);
  });

  it("updates folderChangeOpts.detected to false when not-found", async () => {
    const detection = makeDetection();
    detection.detect = vi.fn().mockResolvedValue({ status: "not-found" });
    const { deps, folderChangeOpts } = makeDeps(detection);

    createConfigWatcher(deps);
    fireConfigChange("oxveil.claudeloopPath");
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(folderChangeOpts.detected).toBe(false);
  });

  it("updates sidebarState.setDetectionStatus with detected status", async () => {
    const detection = makeDetection();
    detection.detect = vi.fn().mockResolvedValue({ status: "not-found" });
    const { deps, sidebarState } = makeDeps(detection);

    createConfigWatcher(deps);
    fireConfigChange("oxveil.claudeloopPath");
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(sidebarState.setDetectionStatus).toHaveBeenCalledWith("not-found");
  });

  it("updates sidebarPanel after detection", async () => {
    const { deps, sidebarPanel, buildFullState } = makeDeps();

    createConfigWatcher(deps);
    fireConfigChange("oxveil.claudeloopPath");
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(sidebarPanel.updateState).toHaveBeenCalledWith(buildFullState());
  });

  it("ignores unrelated config changes", async () => {
    const { deps, detection } = makeDeps();
    createConfigWatcher(deps);

    fireConfigChange("oxveil.someOtherSetting");
    await Promise.resolve();

    expect(detection.updatePath).not.toHaveBeenCalled();
  });

  it("uses resolved path when resolveClaudeloopPath returns a result", async () => {
    (resolveClaudeloopPath as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      path: "/resolved/claudeloop",
      source: "shell",
    });
    const { deps, detection, folderChangeOpts } = makeDeps();
    createConfigWatcher(deps);

    fireConfigChange("oxveil.claudeloopPath");
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(detection.updatePath).toHaveBeenCalledWith("/resolved/claudeloop");
    expect(folderChangeOpts.resolvedPath).toBe("/resolved/claudeloop");
  });
});
