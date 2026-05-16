import { describe, it, expect, vi, beforeEach } from "vitest";

let capturedOnShowOutput: (() => void) | undefined;
let capturedOnViewLog: ((n: number | string) => void) | undefined;
let capturedOnDetectionArgs: unknown[] = [];

vi.mock("../../views/notifications", () => ({
  NotificationManager: vi.fn().mockImplementation((deps: any) => {
    capturedOnShowOutput = deps.onShowOutput;
    capturedOnViewLog = deps.onViewLog;
    return {
      onDetection: vi.fn((...args: unknown[]) => { capturedOnDetectionArgs = args; }),
    };
  }),
}));

vi.mock("vscode", () => ({
  window: {
    showTextDocument: vi.fn(),
  },
  workspace: {
    openTextDocument: vi.fn().mockReturnValue(Promise.resolve({})),
  },
  commands: { executeCommand: vi.fn() },
  env: { openExternal: vi.fn() },
  Uri: { parse: vi.fn((s: string) => s) },
}));

import {
  createNotificationManager,
  showDetectionNotifications,
} from "../../activateNotifications";
import * as vscode from "vscode";

function makeManager(sessionStatus = "idle", progress = { phases: [], totalPhases: 0 }) {
  return {
    getActiveSession: vi.fn(() => ({
      sessionState: { status: sessionStatus, progress },
      folderUri: "file:///proj",
    })),
  } as any;
}

function makeLiveRunPanel() {
  return { reveal: vi.fn() } as any;
}

describe("createNotificationManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnShowOutput = undefined;
    capturedOnViewLog = undefined;
    capturedOnDetectionArgs = [];
  });

  it("returns a NotificationManager", () => {
    const mgr = createNotificationManager({
      manager: makeManager(),
      liveRunPanel: makeLiveRunPanel(),
    });
    expect(mgr).toBeDefined();
  });

  it("onShowOutput reveals liveRunPanel with active session progress", () => {
    const liveRunPanel = makeLiveRunPanel();
    const progress = { phases: [], totalPhases: 3 };
    const manager = makeManager("running", progress);
    createNotificationManager({ manager, liveRunPanel });

    capturedOnShowOutput?.();

    expect(liveRunPanel.reveal).toHaveBeenCalledWith(progress, "file:///proj");
  });

  it("onShowOutput uses empty progress when no active session", () => {
    const liveRunPanel = makeLiveRunPanel();
    const manager = { getActiveSession: vi.fn(() => undefined) } as any;
    createNotificationManager({ manager, liveRunPanel });

    capturedOnShowOutput?.();

    expect(liveRunPanel.reveal).toHaveBeenCalledWith(
      { phases: [], totalPhases: 0 },
      undefined,
    );
  });

  it("onViewLog dispatches oxveil.viewLog command with phaseNumber", () => {
    createNotificationManager({
      manager: makeManager(),
      liveRunPanel: makeLiveRunPanel(),
    });

    capturedOnViewLog?.(3);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith("oxveil.viewLog", { phaseNumber: 3 });
  });
});

describe("showDetectionNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnDetectionArgs = [];
  });

  it("calls onDetection('not-found') when status is not-found", () => {
    const notifications = createNotificationManager({
      manager: makeManager(),
      liveRunPanel: makeLiveRunPanel(),
    });

    showDetectionNotifications(notifications, "not-found", undefined, "1.0.0");

    expect(capturedOnDetectionArgs[0]).toBe("not-found");
  });

  it("calls onDetection('version-incompatible') with found/required versions", () => {
    const notifications = createNotificationManager({
      manager: makeManager(),
      liveRunPanel: makeLiveRunPanel(),
    });

    showDetectionNotifications(notifications, "version-incompatible", "0.5.0", "1.0.0");

    expect(capturedOnDetectionArgs[0]).toBe("version-incompatible");
    expect(capturedOnDetectionArgs[1]).toEqual({ found: "0.5.0", required: "1.0.0" });
  });

  it("uses 'unknown' when version is undefined for version-incompatible", () => {
    const notifications = createNotificationManager({
      manager: makeManager(),
      liveRunPanel: makeLiveRunPanel(),
    });

    showDetectionNotifications(notifications, "version-incompatible", undefined, "1.0.0");

    expect(capturedOnDetectionArgs[1]).toEqual({ found: "unknown", required: "1.0.0" });
  });

  it("does not call onDetection for 'detected' status", () => {
    const notifications = createNotificationManager({
      manager: makeManager(),
      liveRunPanel: makeLiveRunPanel(),
    }) as any;
    notifications.onDetection.mockClear();

    showDetectionNotifications(notifications, "detected", "1.0.0", "1.0.0");

    expect(notifications.onDetection).not.toHaveBeenCalled();
  });
});
