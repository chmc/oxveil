import { describe, it, expect, vi } from "vitest";
import { NotificationManager } from "../../../views/notifications";
import type { ProgressState } from "../../../types";

interface MockWindow {
  showInformationMessage: ReturnType<typeof vi.fn>;
  showWarningMessage: ReturnType<typeof vi.fn>;
  showErrorMessage: ReturnType<typeof vi.fn>;
}

function makeWindow(): MockWindow {
  return {
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
  };
}

function makeProgress(overrides: Partial<ProgressState> = {}): ProgressState {
  return {
    phases: [],
    totalPhases: 0,
    ...overrides,
  };
}

describe("NotificationManager", () => {
  describe("phase transitions", () => {
    it("shows info notification when phase completes", () => {
      const win = makeWindow();
      const mgr = new NotificationManager({ window: win });

      const oldProgress = makeProgress({
        phases: [
          { number: 3, title: "Implement auth module", status: "in_progress" },
        ],
        totalPhases: 5,
        currentPhaseIndex: 0,
      });

      const newProgress = makeProgress({
        phases: [
          { number: 3, title: "Implement auth module", status: "completed", completed: "2024-01-01T00:00:00Z" },
        ],
        totalPhases: 5,
        currentPhaseIndex: 0,
      });

      mgr.onPhasesChanged(oldProgress, newProgress);

      expect(win.showInformationMessage).toHaveBeenCalledWith(
        "Phase 3 completed — Implement auth module",
      );
    });

    it("shows error notification with Show Output action when phase fails", async () => {
      const win = makeWindow();
      const showOutput = vi.fn();
      const mgr = new NotificationManager({ window: win, onShowOutput: showOutput });

      const oldProgress = makeProgress({
        phases: [
          { number: 3, title: "Implement auth module", status: "in_progress" },
        ],
        totalPhases: 5,
        currentPhaseIndex: 0,
      });

      const newProgress = makeProgress({
        phases: [
          { number: 3, title: "Implement auth module", status: "failed" },
        ],
        totalPhases: 5,
        currentPhaseIndex: 0,
      });

      win.showErrorMessage.mockResolvedValue("Show Output");

      mgr.onPhasesChanged(oldProgress, newProgress);

      expect(win.showErrorMessage).toHaveBeenCalledWith(
        "Phase 3 failed — Implement auth module",
        "Show Output",
        "Dismiss",
      );

      // Simulate user clicking "Show Output"
      await vi.waitFor(() => {
        expect(showOutput).toHaveBeenCalled();
      });
    });
  });

  describe("detection notifications", () => {
    it("shows warning with Install and Set Path actions when not found", () => {
      const win = makeWindow();
      const mgr = new NotificationManager({ window: win });

      mgr.onDetection("not-found");

      expect(win.showWarningMessage).toHaveBeenCalledWith(
        "claudeloop not found — Oxveil requires claudeloop to run. Would you like to install it?",
        "Install",
        "Set Path",
        "Dismiss",
      );
    });

    it("invokes install callback when Install is clicked", async () => {
      const win = makeWindow();
      const onInstall = vi.fn();
      const mgr = new NotificationManager({ window: win, onInstall });

      win.showWarningMessage.mockResolvedValue("Install");

      mgr.onDetection("not-found");

      await vi.waitFor(() => {
        expect(onInstall).toHaveBeenCalled();
      });
    });

    it("invokes set-path callback when Set Path is clicked", async () => {
      const win = makeWindow();
      const onSetPath = vi.fn();
      const mgr = new NotificationManager({ window: win, onSetPath });

      win.showWarningMessage.mockResolvedValue("Set Path");

      mgr.onDetection("not-found");

      await vi.waitFor(() => {
        expect(onSetPath).toHaveBeenCalled();
      });
    });

    it("shows warning with update guidance when version incompatible", () => {
      const win = makeWindow();
      const mgr = new NotificationManager({ window: win });

      mgr.onDetection("version-incompatible", { found: "0.8.2", required: "0.22.0" });

      expect(win.showWarningMessage).toHaveBeenCalledWith(
        "claudeloop version incompatible — found v0.8.2, requires >=0.22.0. Please update claudeloop.",
        "Update Guide",
        "Dismiss",
      );
    });
  });

  describe("double-spawn notification", () => {
    it("shows error notification with Stop and Force Unlock actions", () => {
      const win = makeWindow();
      const mgr = new NotificationManager({ window: win });

      mgr.onDoubleSpawn(42891);

      expect(win.showErrorMessage).toHaveBeenCalledWith(
        "claudeloop is already running — a process is already active (PID 42891). Stop it first or use Force Unlock if it crashed.",
        "Stop",
        "Force Unlock",
      );
    });

    it("invokes stop callback when Stop is clicked", async () => {
      const win = makeWindow();
      const onStop = vi.fn();
      const mgr = new NotificationManager({ window: win, onStop });

      win.showErrorMessage.mockResolvedValue("Stop");

      mgr.onDoubleSpawn(42891);

      await vi.waitFor(() => {
        expect(onStop).toHaveBeenCalled();
      });
    });

    it("invokes force-unlock callback when Force Unlock is clicked", async () => {
      const win = makeWindow();
      const onForceUnlock = vi.fn();
      const mgr = new NotificationManager({ window: win, onForceUnlock });

      win.showErrorMessage.mockResolvedValue("Force Unlock");

      mgr.onDoubleSpawn(42891);

      await vi.waitFor(() => {
        expect(onForceUnlock).toHaveBeenCalled();
      });
    });
  });
});
