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

    it("shows error notification with View Log and Show Output actions when phase fails", async () => {
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
        "View Log",
        "Show Output",
        "Dismiss",
      );

      // Simulate user clicking "Show Output"
      await vi.waitFor(() => {
        expect(showOutput).toHaveBeenCalled();
      });
    });

    it("includes attempt count in failure message when attempts > 1", () => {
      const win = makeWindow();
      const mgr = new NotificationManager({ window: win });

      const oldProgress = makeProgress({
        phases: [
          { number: 3, title: "Implement auth module", status: "in_progress", attempts: 3 },
        ],
        totalPhases: 5,
        currentPhaseIndex: 0,
      });

      const newProgress = makeProgress({
        phases: [
          { number: 3, title: "Implement auth module", status: "failed", attempts: 3 },
        ],
        totalPhases: 5,
        currentPhaseIndex: 0,
      });

      mgr.onPhasesChanged(oldProgress, newProgress);

      expect(win.showErrorMessage).toHaveBeenCalledWith(
        "Phase 3 failed — Implement auth module (attempt 3)",
        "View Log",
        "Show Output",
        "Dismiss",
      );
    });

    it("omits attempt count when attempts is 1", () => {
      const win = makeWindow();
      const mgr = new NotificationManager({ window: win });

      const oldProgress = makeProgress({
        phases: [
          { number: 3, title: "Implement auth module", status: "in_progress", attempts: 1 },
        ],
        totalPhases: 5,
        currentPhaseIndex: 0,
      });

      const newProgress = makeProgress({
        phases: [
          { number: 3, title: "Implement auth module", status: "failed", attempts: 1 },
        ],
        totalPhases: 5,
        currentPhaseIndex: 0,
      });

      mgr.onPhasesChanged(oldProgress, newProgress);

      expect(win.showErrorMessage).toHaveBeenCalledWith(
        "Phase 3 failed — Implement auth module",
        "View Log",
        "Show Output",
        "Dismiss",
      );
    });

    it("triggers onViewLog callback with correct phase number when View Log is clicked", async () => {
      const win = makeWindow();
      const viewLog = vi.fn();
      const mgr = new NotificationManager({ window: win, onViewLog: viewLog });

      const oldProgress = makeProgress({
        phases: [
          { number: 5, title: "Deploy service", status: "in_progress" },
        ],
        totalPhases: 8,
        currentPhaseIndex: 0,
      });

      const newProgress = makeProgress({
        phases: [
          { number: 5, title: "Deploy service", status: "failed" },
        ],
        totalPhases: 8,
        currentPhaseIndex: 0,
      });

      win.showErrorMessage.mockResolvedValue("View Log");

      mgr.onPhasesChanged(oldProgress, newProgress);

      await vi.waitFor(() => {
        expect(viewLog).toHaveBeenCalledWith(5);
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

  describe("failure deduplication", () => {
    it("suppresses duplicate failure notifications for same phase during retries", () => {
      const win = makeWindow();
      const mgr = new NotificationManager({ window: win });

      // Attempt 1: in_progress -> failed
      mgr.onPhasesChanged(
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "in_progress", attempts: 1 }], totalPhases: 5 }),
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "failed", attempts: 1 }], totalPhases: 5 }),
      );
      expect(win.showErrorMessage).toHaveBeenCalledTimes(1);

      // Retry starts: failed -> in_progress
      mgr.onPhasesChanged(
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "failed", attempts: 1 }], totalPhases: 5 }),
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "in_progress", attempts: 2 }], totalPhases: 5 }),
      );

      // Attempt 2: in_progress -> failed (should be suppressed)
      mgr.onPhasesChanged(
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "in_progress", attempts: 2 }], totalPhases: 5 }),
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "failed", attempts: 2 }], totalPhases: 5 }),
      );

      // Retry starts again: failed -> in_progress
      mgr.onPhasesChanged(
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "failed", attempts: 2 }], totalPhases: 5 }),
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "in_progress", attempts: 3 }], totalPhases: 5 }),
      );

      // Attempt 3: in_progress -> failed (should be suppressed)
      mgr.onPhasesChanged(
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "in_progress", attempts: 3 }], totalPhases: 5 }),
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "failed", attempts: 3 }], totalPhases: 5 }),
      );

      expect(win.showErrorMessage).toHaveBeenCalledTimes(1);
    });

    it("fires separate notifications for different phases failing", () => {
      const win = makeWindow();
      const mgr = new NotificationManager({ window: win });

      mgr.onPhasesChanged(
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "in_progress" }], totalPhases: 5 }),
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "failed" }], totalPhases: 5 }),
      );

      mgr.onPhasesChanged(
        makeProgress({ phases: [{ number: 4, title: "Build", status: "in_progress" }], totalPhases: 5 }),
        makeProgress({ phases: [{ number: 4, title: "Build", status: "failed" }], totalPhases: 5 }),
      );

      expect(win.showErrorMessage).toHaveBeenCalledTimes(2);
    });

    it("allows re-notification after phase completes then fails again", () => {
      const win = makeWindow();
      const mgr = new NotificationManager({ window: win });

      // First failure
      mgr.onPhasesChanged(
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "in_progress" }], totalPhases: 5 }),
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "failed" }], totalPhases: 5 }),
      );

      // Phase completes (recovers)
      mgr.onPhasesChanged(
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "failed" }], totalPhases: 5 }),
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "completed" }], totalPhases: 5 }),
      );

      // Fails again — should notify since phase recovered
      mgr.onPhasesChanged(
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "in_progress" }], totalPhases: 5 }),
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "failed" }], totalPhases: 5 }),
      );

      expect(win.showErrorMessage).toHaveBeenCalledTimes(2);
    });

    it("reset() clears tracked failures allowing fresh notifications", () => {
      const win = makeWindow();
      const mgr = new NotificationManager({ window: win });

      mgr.onPhasesChanged(
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "in_progress" }], totalPhases: 5 }),
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "failed" }], totalPhases: 5 }),
      );

      mgr.reset();

      mgr.onPhasesChanged(
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "in_progress" }], totalPhases: 5 }),
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "failed" }], totalPhases: 5 }),
      );

      expect(win.showErrorMessage).toHaveBeenCalledTimes(2);
    });

    it("first failure still includes actions and attempt suffix", () => {
      const win = makeWindow();
      const mgr = new NotificationManager({ window: win });

      mgr.onPhasesChanged(
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "in_progress", attempts: 1 }], totalPhases: 5 }),
        makeProgress({ phases: [{ number: 3, title: "Setup", status: "failed", attempts: 1 }], totalPhases: 5 }),
      );

      expect(win.showErrorMessage).toHaveBeenCalledWith(
        "Phase 3 failed — Setup",
        "View Log",
        "Show Output",
        "Dismiss",
      );
    });
  });

  describe("ai-parse notifications", () => {
    it("onAiParseSuccess shows info message with Open Plan button", () => {
      const win = makeWindow();
      const mgr = new NotificationManager({ window: win });

      mgr.onAiParseSuccess("/workspace/.claudeloop/ai-parsed-plan.md");

      expect(win.showInformationMessage).toHaveBeenCalledWith(
        "Plan parsed successfully",
        "Open Plan",
      );
    });

    it("onAiParseSuccess Open Plan button opens file", async () => {
      const win = makeWindow();
      const onOpenFile = vi.fn();
      const mgr = new NotificationManager({ window: win, onOpenFile });

      win.showInformationMessage.mockResolvedValue("Open Plan");

      mgr.onAiParseSuccess("/workspace/.claudeloop/ai-parsed-plan.md");

      await vi.waitFor(() => {
        expect(onOpenFile).toHaveBeenCalledWith("/workspace/.claudeloop/ai-parsed-plan.md");
      });
    });

    it("onAiParseNeedsInput shows warning message with View Options button", () => {
      const win = makeWindow();
      const mgr = new NotificationManager({ window: win });

      mgr.onAiParseNeedsInput();

      expect(win.showWarningMessage).toHaveBeenCalledWith(
        "Claudeloop needs input",
        "View Options",
      );
    });

    it("onAiParseNeedsInput View Options button focuses Live Run panel", async () => {
      const win = makeWindow();
      const onFocusLiveRun = vi.fn();
      const mgr = new NotificationManager({ window: win, onFocusLiveRun });

      win.showWarningMessage.mockResolvedValue("View Options");

      mgr.onAiParseNeedsInput();

      await vi.waitFor(() => {
        expect(onFocusLiveRun).toHaveBeenCalled();
      });
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

  describe("update notification", () => {
    it("shows info notification with Update, Release Notes, and Dismiss actions", () => {
      const win = makeWindow();
      const mgr = new NotificationManager({ window: win });

      mgr.onUpdateAvailable("0.27.0", "0.28.0", "https://github.com/chmc/claudeloop/releases/tag/v0.28.0");

      expect(win.showInformationMessage).toHaveBeenCalledWith(
        "claudeloop update available: v0.27.0 → v0.28.0",
        "Update",
        "Release Notes",
        "Dismiss",
      );
    });

    it("invokes onUpdate callback when Update is clicked", async () => {
      const win = makeWindow();
      const onUpdate = vi.fn();
      const mgr = new NotificationManager({ window: win, onUpdate });

      win.showInformationMessage.mockResolvedValue("Update");

      mgr.onUpdateAvailable("0.27.0", "0.28.0", "https://example.com");

      await vi.waitFor(() => {
        expect(onUpdate).toHaveBeenCalled();
      });
    });

    it("invokes onReleaseNotes callback with URL when Release Notes is clicked", async () => {
      const win = makeWindow();
      const onReleaseNotes = vi.fn();
      const mgr = new NotificationManager({ window: win, onReleaseNotes });

      win.showInformationMessage.mockResolvedValue("Release Notes");

      mgr.onUpdateAvailable("0.27.0", "0.28.0", "https://github.com/chmc/claudeloop/releases/tag/v0.28.0");

      await vi.waitFor(() => {
        expect(onReleaseNotes).toHaveBeenCalledWith("https://github.com/chmc/claudeloop/releases/tag/v0.28.0");
      });
    });
  });
});
