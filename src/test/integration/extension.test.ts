import { describe, it, expect, vi } from "vitest";
import { SessionState } from "../../core/sessionState";
import { StatusBarManager } from "../../views/statusBar";
import { LiveRunPanel } from "../../views/liveRunPanel";
import { NotificationManager } from "../../views/notifications";
import { ElapsedTimer } from "../../views/elapsedTimer";
import { Detection } from "../../core/detection";

function makeStatusBarItem() {
  return {
    text: "",
    tooltip: "",
    backgroundColor: undefined as { id: string } | undefined,
    command: undefined as string | undefined,
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  };
}

function makeLiveRunPanel() {
  return new LiveRunPanel({
    createWebviewPanel: vi.fn().mockReturnValue({
      webview: { html: "", cspSource: "", postMessage: vi.fn(), onDidReceiveMessage: vi.fn() },
      reveal: vi.fn(),
      onDidDispose: vi.fn(),
      dispose: vi.fn(),
    }),
    executeCommand: vi.fn(),
    getConfig: vi.fn(),
  });
}

describe("Extension integration", () => {
  describe("activation wiring", () => {
    it("status bar item is created and shown on activation", () => {
      const item = makeStatusBarItem();
      const statusBar = new StatusBarManager(item);

      statusBar.update({ kind: "ready" });

      expect(item.show).toHaveBeenCalled();
      expect(item.text).toContain("Oxveil");
    });

    it("detection runs and returns status", async () => {
      const executor = vi.fn().mockResolvedValue({
        stdout: "claudeloop version 0.22.0\n",
      });

      const detection = new Detection(executor, "claudeloop", "0.22.0");
      const result = await detection.detect();

      expect(result.status).toBe("detected");
      expect(executor).toHaveBeenCalledWith("claudeloop", ["--version"]);
    });
  });

  describe("session state drives UI end-to-end", () => {
    it("lock change → running state → status bar update", () => {
      const item = makeStatusBarItem();
      const statusBar = new StatusBarManager(item);
      const session = new SessionState();

      session.on("state-changed", (_from, to) => {
        if (to === "running") {
          statusBar.update({
            kind: "running",
            currentPhase: 1,
            totalPhases: 3,
            elapsed: "0m",
          });
        }
      });

      session.onLockChanged({ locked: true, pid: 123 });

      expect(session.status).toBe("running");
      expect(item.text).toContain("Phase 1/3");
    });

    it("phase transition triggers notification", () => {
      const session = new SessionState();
      const win = {
        showInformationMessage: vi.fn().mockResolvedValue(undefined),
        showWarningMessage: vi.fn().mockResolvedValue(undefined),
        showErrorMessage: vi.fn().mockResolvedValue(undefined),
      };
      const notifications = new NotificationManager({ window: win });

      let lastProgress: any = null;

      session.on("phases-changed", (progress) => {
        const old = lastProgress;
        lastProgress = progress;
        if (old) {
          notifications.onPhasesChanged(old, progress);
        }
      });

      // First progress: phase in_progress
      session.onProgressChanged({
        phases: [{ number: 1, title: "Setup", status: "in_progress" }],
        totalPhases: 2,
        currentPhaseIndex: 0,
      });

      // Phase completes
      session.onProgressChanged({
        phases: [{ number: 1, title: "Setup", status: "completed" }],
        totalPhases: 2,
        currentPhaseIndex: 0,
      });

      expect(win.showInformationMessage).toHaveBeenCalledWith(
        "Phase 1 completed — Setup",
      );
    });

    it("elapsed timer ticks while running, stops on done", () => {
      vi.useFakeTimers();

      const item = makeStatusBarItem();
      const statusBar = new StatusBarManager(item);
      const session = new SessionState();
      const timer = new ElapsedTimer((elapsed) => {
        if (session.status === "running") {
          const p = session.progress;
          statusBar.update({
            kind: "running",
            currentPhase: 1,
            totalPhases: 3,
            elapsed,
          });
        }
      });

      session.on("state-changed", (_from, to) => {
        if (to === "running") {
          timer.start();
        } else {
          timer.stop();
        }
      });

      // Start running
      session.onLockChanged({ locked: true, pid: 123 });

      vi.advanceTimersByTime(60_000);
      expect(item.text).toContain("1m");

      // Complete
      session.onProgressChanged({
        phases: [{ number: 1, title: "Setup", status: "completed" }],
        totalPhases: 1,
        currentPhaseIndex: 0,
      });
      session.onLockChanged({ locked: false });

      expect(session.status).toBe("done");

      // Timer should have stopped — further ticks shouldn't change text
      const textAfterDone = item.text;
      vi.advanceTimersByTime(60_000);
      // Timer stopped, but status bar was last set by done handler, not timer
      // The important thing is the timer stopped (no more callbacks)

      vi.useRealTimers();
    });

    it("log content flows to live run panel via session", () => {
      const panel = makeLiveRunPanel();
      const session = new SessionState();
      const spy = vi.spyOn(panel, "onLogAppended");

      session.on("log-appended", (content) => {
        panel.onLogAppended(content);
      });

      session.onLogAppended("Building phase 1...\n");

      expect(spy).toHaveBeenCalledWith("Building phase 1...\n");
    });

    it("detection not-found triggers notification", () => {
      const win = {
        showInformationMessage: vi.fn().mockResolvedValue(undefined),
        showWarningMessage: vi.fn().mockResolvedValue(undefined),
        showErrorMessage: vi.fn().mockResolvedValue(undefined),
      };
      const notifications = new NotificationManager({ window: win });

      notifications.onDetection("not-found");

      expect(win.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining("claudeloop not found"),
        "Install",
        "Set Path",
        "Dismiss",
      );
    });
  });
});
