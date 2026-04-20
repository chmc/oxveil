import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

import { SessionState } from "../../core/sessionState";
import { wireSessionEvents, type SessionWiringDeps } from "../../sessionWiring";
import { NotificationManager } from "../../views/notifications";
import { deriveViewState } from "../../views/sidebarState";
import type { ProgressState, StatusBarState } from "../../types";
import type { SidebarView } from "../../views/sidebarState";

function makeProgress(
  phases: Array<{ number: number; title: string; status: string }>,
): ProgressState {
  return {
    phases: phases.map((p) => ({ ...p, status: p.status as any })),
    totalPhases: phases.length,
  };
}

function wireDeps(
  session: SessionState,
  getSidebarView: () => SidebarView,
): { statusBarUpdates: StatusBarState[] } {
  const statusBarUpdates: StatusBarState[] = [];
  const deps: SessionWiringDeps = {
    session,
    statusBar: {
      update: (state: StatusBarState) => statusBarUpdates.push(state),
      dispose: vi.fn(),
    },
    notifications: { onPhasesChanged: vi.fn(), reset: vi.fn() },
    elapsedTimer: { start: vi.fn(), stop: vi.fn(), elapsed: "0m" },
    isActiveSession: () => true,
    folderUri: "/test",
    buildSidebarState: () => ({
      view: getSidebarView(),
      archives: [],
    }),
    sidebarPanel: { updateState: vi.fn(), sendProgressUpdate: vi.fn() } as any,
  };
  wireSessionEvents(deps);
  return { statusBarUpdates };
}

describe("Status bar / sidebar state sync", () => {
  it("orphan stopped progress + idle session → status bar shows stopped (not ready/idle)", () => {
    // Simulate: wiring is attached, then session resets to idle.
    // buildSidebarState returns "stopped" (as deriveViewState would for orphan progress).
    const session = new SessionState();
    const { statusBarUpdates } = wireDeps(session, () => "stopped");

    // Drive to failed, then reset to idle — triggers idle handler in wiring
    session.onLockChanged({ locked: true, pid: 1 });
    session.onProgressChanged(
      makeProgress([{ number: 1, title: "S", status: "failed" }]),
    );
    session.onLockChanged({ locked: false });
    session.reset();

    const lastUpdate = statusBarUpdates[statusBarUpdates.length - 1];
    expect(lastUpdate.kind).toBe("stopped");
    expect(lastUpdate.kind).not.toBe("ready");
    expect(lastUpdate.kind).not.toBe("idle");
  });

  it("orphan failed progress + idle session → status bar shows failed with phase", () => {
    const session = new SessionState();
    const progress = makeProgress([
      { number: 1, title: "Setup", status: "completed" },
      { number: 2, title: "Build", status: "failed" },
    ]);

    // Load orphan progress
    session.checkInitialState({ lock: { locked: false }, progress });
    expect(session.status).toBe("idle");

    const sidebarView = deriveViewState("detected", "idle", false, progress);
    expect(sidebarView).toBe("failed");

    // Wire — buildSidebarState dynamically derives from session state
    const { statusBarUpdates } = wireDeps(session, () =>
      deriveViewState("detected", session.status, false, session.progress),
    );

    // Drive to failed state: lock acquired, then released with failed progress
    session.onLockChanged({ locked: true, pid: 1 });
    session.onProgressChanged(progress);
    session.onLockChanged({ locked: false });
    // Session is now "failed" (has failed phase). Wiring sends {kind:"failed"}.

    // Re-acquire lock to go running, then release with clean progress for done
    session.onLockChanged({ locked: true, pid: 2 });
    // Restore failed progress so sidebar still derives "failed" when we go idle
    session.onProgressChanged(progress);
    session.onLockChanged({ locked: false });
    // Session is "failed" again. Now the wiring sends {kind:"failed", failedPhase:2}.

    const failedUpdates = statusBarUpdates.filter((u) => u.kind === "failed");
    expect(failedUpdates.length).toBeGreaterThan(0);
    const lastFailed = failedUpdates[failedUpdates.length - 1];
    if (lastFailed.kind === "failed") {
      expect(lastFailed.failedPhase).toBe(2);
    }
  });

  it("status bar kind agrees with deriveViewState for all idle sidebar states", () => {
    // This test verifies the mapping from sidebar view → status bar kind
    // by wiring a session with buildSidebarState returning each possible view
    // and triggering the idle path.
    const testCases: Array<{
      label: string;
      sidebarView: SidebarView;
      progress: ProgressState | undefined;
      expectedStatusBarKind: string;
    }> = [
      { label: "empty → idle", sidebarView: "empty", progress: undefined, expectedStatusBarKind: "idle" },
      { label: "ready → ready", sidebarView: "ready", progress: undefined, expectedStatusBarKind: "ready" },
      { label: "stale → idle", sidebarView: "stale", progress: undefined, expectedStatusBarKind: "idle" },
      { label: "stopped → stopped", sidebarView: "stopped", progress: makeProgress([{ number: 1, title: "S", status: "in_progress" }]), expectedStatusBarKind: "stopped" },
      { label: "failed → failed", sidebarView: "failed", progress: makeProgress([{ number: 1, title: "S", status: "failed" }]), expectedStatusBarKind: "failed" },
      { label: "completed → done", sidebarView: "completed", progress: makeProgress([{ number: 1, title: "S", status: "completed" }]), expectedStatusBarKind: "done" },
      { label: "not-found → not-found", sidebarView: "not-found", progress: undefined, expectedStatusBarKind: "not-found" },
    ];

    for (const tc of testCases) {
      const session = new SessionState();
      const { statusBarUpdates } = wireDeps(session, () => tc.sidebarView);

      // Drive to failed state then reset to idle to trigger idle handler
      session.onLockChanged({ locked: true, pid: 1 });
      if (tc.progress) session.onProgressChanged(tc.progress);
      session.onProgressChanged(
        makeProgress([{ number: 1, title: "S", status: "failed" }]),
      );
      session.onLockChanged({ locked: false });
      // Session is now "failed". Reset to idle — this triggers the idle path in wiring.
      session.reset();

      const lastUpdate = statusBarUpdates[statusBarUpdates.length - 1];
      expect(lastUpdate.kind, tc.label).toBe(tc.expectedStatusBarKind);
    }
  });

  it("partial-progress done → status bar shows stopped (not done)", () => {
    const session = new SessionState();
    const progress = makeProgress([
      { number: 1, title: "Setup", status: "completed" },
      { number: 2, title: "Build", status: "pending" },
    ]);

    const { statusBarUpdates } = wireDeps(session, () =>
      deriveViewState("detected", session.status, false, session.progress),
    );

    // Lock acquired → progress with partial completion → lock released
    session.onLockChanged({ locked: true, pid: 1 });
    session.onProgressChanged(progress);
    session.onLockChanged({ locked: false });

    // Session transitions to "done" (fallback), sidebar derives "stopped"
    expect(session.status).toBe("done");

    const lastUpdate = statusBarUpdates[statusBarUpdates.length - 1];
    expect(lastUpdate.kind).toBe("stopped");
  });

  it("all-completed done → status bar shows done with elapsed", () => {
    const session = new SessionState();
    const progress = makeProgress([
      { number: 1, title: "Setup", status: "completed" },
      { number: 2, title: "Build", status: "completed" },
    ]);

    const { statusBarUpdates } = wireDeps(session, () =>
      deriveViewState("detected", session.status, false, session.progress),
    );

    session.onLockChanged({ locked: true, pid: 1 });
    session.onProgressChanged(progress);
    session.onLockChanged({ locked: false });

    expect(session.status).toBe("done");

    const lastUpdate = statusBarUpdates[statusBarUpdates.length - 1];
    expect(lastUpdate.kind).toBe("done");
    if (lastUpdate.kind === "done") {
      expect(lastUpdate.elapsed).toBe("0m"); // from mock elapsedTimer
    }
  });

  it("undefined progress done → status bar shows stopped", () => {
    const session = new SessionState();

    const { statusBarUpdates } = wireDeps(session, () =>
      deriveViewState("detected", session.status, false, session.progress),
    );

    // Lock acquired → lock released with no progress
    session.onLockChanged({ locked: true, pid: 1 });
    session.onLockChanged({ locked: false });

    expect(session.status).toBe("done");

    const lastUpdate = statusBarUpdates[statusBarUpdates.length - 1];
    expect(lastUpdate.kind).toBe("stopped");
  });
});

function makeWindow() {
  return {
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
  };
}

function wireWithRealNotifications(
  session: SessionState,
  getSidebarView: () => SidebarView,
) {
  const statusBarUpdates: StatusBarState[] = [];
  const mockWindow = makeWindow();
  const notifications = new NotificationManager({ window: mockWindow });
  const deps: SessionWiringDeps = {
    session,
    statusBar: {
      update: (state: StatusBarState) => statusBarUpdates.push(state),
      dispose: vi.fn(),
    },
    notifications,
    elapsedTimer: { start: vi.fn(), stop: vi.fn(), elapsed: "0m" },
    isActiveSession: () => true,
    folderUri: "/test",
    buildSidebarState: () => ({
      view: getSidebarView(),
      archives: [],
    }),
    sidebarPanel: { updateState: vi.fn(), sendProgressUpdate: vi.fn() } as any,
  };
  wireSessionEvents(deps);
  return { statusBarUpdates, mockWindow, notifications };
}

describe("Notification deduplication during retries", () => {
  it("phase fails 5 times during retry loop — notification count <= 2", () => {
    const session = new SessionState();
    const { mockWindow } = wireWithRealNotifications(session, () =>
      deriveViewState("detected", session.status, false, session.progress),
    );

    // Session starts
    session.onLockChanged({ locked: true, pid: 1 });

    // Initial progress: phase 1 in_progress
    session.onProgressChanged(
      makeProgress([{ number: 1, title: "Setup", status: "in_progress" }]),
    );

    // 5 retry failures
    for (let attempt = 1; attempt <= 5; attempt++) {
      session.onProgressChanged(
        makeProgress([{ number: 1, title: "Setup", status: "failed" }]),
      );
      if (attempt < 5) {
        session.onProgressChanged(
          makeProgress([{ number: 1, title: "Setup", status: "in_progress" }]),
        );
      }
    }

    expect(mockWindow.showErrorMessage.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("new session run clears failure tracking", () => {
    const session = new SessionState();
    const { mockWindow } = wireWithRealNotifications(session, () =>
      deriveViewState("detected", session.status, false, session.progress),
    );

    // First session: phase 1 fails
    session.onLockChanged({ locked: true, pid: 1 });
    session.onProgressChanged(
      makeProgress([{ number: 1, title: "Setup", status: "in_progress" }]),
    );
    session.onProgressChanged(
      makeProgress([{ number: 1, title: "Setup", status: "failed" }]),
    );

    // Session ends
    session.onLockChanged({ locked: false });

    // New session starts (triggers reset)
    session.reset();
    session.onLockChanged({ locked: true, pid: 2 });
    session.onProgressChanged(
      makeProgress([{ number: 1, title: "Setup", status: "in_progress" }]),
    );
    session.onProgressChanged(
      makeProgress([{ number: 1, title: "Setup", status: "failed" }]),
    );

    expect(mockWindow.showErrorMessage).toHaveBeenCalledTimes(2);
  });
});
