// src/test/unit/views/sidebarMessages.test.ts
import { describe, it, expect, vi } from "vitest";
import { dispatchSidebarMessage } from "../../../views/sidebarMessages";

describe("dispatchSidebarMessage", () => {
  it("dispatches start command", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "start" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.start");
  });

  it("dispatches resume with phase object", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "resume", phase: 3 }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.runFromPhase", { phaseNumber: 3 });
  });

  it("dispatches stop command", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "stop" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.stop");
  });

  it("dispatches createPlan", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "createPlan" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.createPlan");
  });

  it("dispatches editPlan by opening the plan file", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "editPlan" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.createPlan");
  });

  it("dispatches configure", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "configure" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.openConfigWizard");
  });

  it("dispatches retry with phase object", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "retry", phase: 2 }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.runFromPhase", { phaseNumber: 2 });
  });

  it("dispatches skip (markComplete) with phase object", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "skip", phase: 2 }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.markPhaseComplete", { phaseNumber: 2 });
  });

  it("dispatches restart as reset then start", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "restart" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.reset");
    // Note: start must be triggered after reset completes; the command handler chains this
  });

  it("dispatches install", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "install" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.install");
  });

  it("dispatches setPath by opening settings", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "setPath" }, exec);
    expect(exec).toHaveBeenCalledWith("workbench.action.openSettings", "oxveil.claudeloopPath");
  });

  it("dispatches forceUnlock", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "forceUnlock" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.forceUnlock");
  });

  it("dispatches aiParse", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "aiParse" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.aiParsePlan");
  });

  it("dispatches planChat", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "planChat" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.openPlanChat");
  });

  it("dispatches viewLog with phase object", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "openLog", phase: 2 }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.viewLog", { phaseNumber: 2 });
  });

  it("dispatches viewDiff with phase object", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "openDiff", phase: 1 }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.viewDiff", { phaseNumber: 1 });
  });

  it("dispatches openReplay with archive object", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "openReplay", archive: "20260406" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.archiveReplay", { archiveName: "20260406" });
  });

  it("ignores unknown commands", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "unknown" } as any, exec);
    expect(exec).not.toHaveBeenCalled();
  });

  // --- Additional tests for missing coverage (Issue #7) ---

  it("dispatches openPlan", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "openPlan" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.createPlan");
  });

  it("dispatches openTimeline", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "openTimeline" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.showTimeline");
  });

  it("dispatches openGraph", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "openGraph" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.showDependencyGraph");
  });

  it("dispatches reset", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "reset" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.reset");
  });

  it("dispatches refreshArchives", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "refreshArchives" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.archiveRefresh");
  });

  it("dispatches restoreArchive with archive object", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "restoreArchive", archive: "20260406" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.archiveRestore", { archiveName: "20260406" });
  });

  it("dispatches markComplete with phase object", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "markComplete", phase: 4 }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.markPhaseComplete", { phaseNumber: 4 });
  });

  it("dispatches runFromPhase with phase object", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "runFromPhase", phase: 5 }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.runFromPhase", { phaseNumber: 5 });
  });

  it("dispatches openLog without phase argument", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "openLog" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.viewLog", undefined);
  });

  it("dispatches openDiff without phase argument", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "openDiff" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.viewDiff", undefined);
  });
});
