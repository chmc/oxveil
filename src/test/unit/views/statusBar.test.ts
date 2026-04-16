import { describe, it, expect } from "vitest";
import { StatusBarManager } from "../../../views/statusBar";
import type { StatusBarState } from "../../../types";

/** Plain object mock of vscode.StatusBarItem */
function makeStatusBarItem() {
  return {
    text: "",
    tooltip: "",
    backgroundColor: undefined as { id: string } | undefined,
    command: undefined as string | undefined,
    show: () => {},
    hide: () => {},
    dispose: () => {},
  };
}

describe("StatusBarManager", () => {
  it("renders not-found state", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({ kind: "not-found" });

    expect(item.text).toBe("$(warning) Oxveil: claudeloop not found");
    expect(item.tooltip).toBe("claudeloop not found — click to install");
    expect(item.backgroundColor).toEqual({ id: "statusBarItem.warningBackground" });
  });

  it("renders installing state", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({ kind: "installing" });

    expect(item.text).toBe("$(sync~spin) Oxveil: installing claudeloop...");
    expect(item.tooltip).toBe("Installing claudeloop...");
    expect(item.backgroundColor).toBeUndefined();
  });

  it("renders ready state", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({ kind: "ready" });

    expect(item.text).toBe("$(symbol-event) Oxveil: ready");
    expect(item.tooltip).toBe("claudeloop detected — ready to run");
    expect(item.backgroundColor).toBeUndefined();
  });

  it("renders idle state", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({ kind: "idle" });

    expect(item.text).toBe("$(symbol-event) Oxveil: idle");
    expect(item.tooltip).toBe("No active session");
    expect(item.backgroundColor).toBeUndefined();
  });

  it("renders running state with phase info", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({
      kind: "running",
      currentPhase: 3,
      totalPhases: 7,
      elapsed: "12m",
    });

    expect(item.text).toBe("$(sync~spin) Oxveil: Phase 3/7 | 12m");
    expect(item.tooltip).toBe("Running — Phase 3 of 7 (12m elapsed)");
    expect(item.backgroundColor).toBeUndefined();
  });

  it("renders failed state with error background", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({ kind: "failed", failedPhase: 3 });

    expect(item.text).toBe("$(error) Oxveil: Phase 3 failed");
    expect(item.tooltip).toBe("Phase 3 failed — click for details");
    expect(item.backgroundColor).toEqual({ id: "statusBarItem.errorBackground" });
  });

  it("renders done state", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({ kind: "done", elapsed: "24m" });

    expect(item.text).toBe("$(check) Oxveil: done | 24m");
    expect(item.tooltip).toBe("All phases completed (24m)");
    expect(item.backgroundColor).toBeUndefined();
  });

  it("sets click command to focus tree view", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({ kind: "ready" });

    expect(item.command).toBe("oxveil.phases.focus");
  });

  it("renders running state with folder prefix in multi-root", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({
      kind: "running",
      currentPhase: 3,
      totalPhases: 5,
      elapsed: "4m",
      folderName: "my-api",
    });

    expect(item.text).toBe("$(sync~spin) Oxveil: my-api — Phase 3/5 | 4m");
    expect(item.tooltip).toBe("Running — Phase 3 of 5 (4m elapsed)");
  });

  it("renders running state with folder prefix and other-roots summary", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({
      kind: "running",
      currentPhase: 3,
      totalPhases: 5,
      elapsed: "4m",
      folderName: "my-api",
      otherRootsSummary: "+1 idle",
    });

    expect(item.text).toBe("$(sync~spin) Oxveil: my-api — Phase 3/5 | 4m (+1 idle)");
    expect(item.tooltip).toBe("Running — Phase 3 of 5 (4m elapsed)");
  });

  it("renders failed state with folder prefix", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({ kind: "failed", failedPhase: 3, folderName: "my-api" });

    expect(item.text).toBe("$(error) Oxveil: my-api — Phase 3 failed");
  });

  it("renders done state with folder prefix", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({ kind: "done", elapsed: "24m", folderName: "my-api" });

    expect(item.text).toBe("$(check) Oxveil: my-api — done | 24m");
  });

  it("renders done state with other-roots summary", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({
      kind: "done",
      elapsed: "24m",
      folderName: "my-api",
      otherRootsSummary: "+2 running",
    });

    expect(item.text).toBe("$(check) Oxveil: my-api — done | 24m (+2 running)");
  });

  it("omits folder prefix when folderName undefined (single-root)", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({
      kind: "running",
      currentPhase: 3,
      totalPhases: 7,
      elapsed: "12m",
    });

    // Same as existing running test — no prefix
    expect(item.text).toBe("$(sync~spin) Oxveil: Phase 3/7 | 12m");
  });

  it("renders stopped state", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({ kind: "stopped" });

    expect(item.text).toBe("$(debug-pause) Oxveil: stopped");
    expect(item.tooltip).toBe("Execution stopped — click to resume");
    expect(item.backgroundColor).toBeUndefined();
  });

  it("renders stopped state with folder prefix", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({ kind: "stopped", folderName: "my-api" });

    expect(item.text).toBe("$(debug-pause) Oxveil: my-api — stopped");
  });

  it("renders stopped state with other-roots summary", () => {
    const item = makeStatusBarItem();
    const manager = new StatusBarManager(item);

    manager.update({ kind: "stopped", folderName: "my-api", otherRootsSummary: "+1 idle" });

    expect(item.text).toBe("$(debug-pause) Oxveil: my-api — stopped (+1 idle)");
  });

  it("disposes status bar item", () => {
    const item = makeStatusBarItem();
    let disposed = false;
    item.dispose = () => { disposed = true; };
    const manager = new StatusBarManager(item);

    manager.dispose();

    expect(disposed).toBe(true);
  });
});
