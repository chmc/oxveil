import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
  window: {
    showQuickPick: vi.fn(),
  },
}));

import * as vscode from "vscode";
import { pickWorkspaceFolder } from "../../../views/folderPicker";
import type { WorkspaceSessionManager } from "../../../core/workspaceSessionManager";
import type { WorkspaceSession } from "../../../core/workspaceSession";

function makeSession(
  folderUri: string,
  workspaceRoot: string,
  status: "idle" | "running" | "done" | "failed" = "idle",
  progress?: { currentPhaseIndex?: number; totalPhases: number; phases: unknown[] },
): WorkspaceSession {
  return {
    folderUri,
    workspaceRoot,
    sessionState: {
      status,
      progress: progress ?? undefined,
    },
  } as unknown as WorkspaceSession;
}

function makeManager(sessions: WorkspaceSession[]): WorkspaceSessionManager {
  return {
    getAllSessions: () => sessions,
  } as unknown as WorkspaceSessionManager;
}

describe("pickWorkspaceFolder", () => {
  beforeEach(() => {
    vi.mocked(vscode.window.showQuickPick).mockReset();
  });

  it("returns undefined when no sessions exist", async () => {
    const result = await pickWorkspaceFolder(makeManager([]));
    expect(result).toBeUndefined();
    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it("returns the only session in single-root without showing picker", async () => {
    const session = makeSession("file:///workspace", "/workspace");
    const result = await pickWorkspaceFolder(makeManager([session]));
    expect(result).toBe(session);
    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it("shows quick pick for multi-root workspaces", async () => {
    const sessionA = makeSession("file:///a", "/projects/my-api", "running", {
      currentPhaseIndex: 2,
      totalPhases: 5,
      phases: [],
    });
    const sessionB = makeSession("file:///b", "/projects/my-web", "idle");

    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: "$(folder) my-api",
      detail: "Running — Phase 3/5",
      session: sessionA,
    } as any);

    const result = await pickWorkspaceFolder(makeManager([sessionA, sessionB]));

    expect(result).toBe(sessionA);
    expect(vscode.window.showQuickPick).toHaveBeenCalledOnce();

    const [items, options] = vi.mocked(vscode.window.showQuickPick).mock.calls[0];
    expect(options).toEqual({ placeHolder: "Select workspace folder" });
    expect(items).toEqual([
      {
        label: "$(folder) my-api",
        detail: "Running — Phase 3/5",
        session: sessionA,
      },
      {
        label: "$(folder) my-web",
        detail: "Idle — No active session",
        session: sessionB,
      },
    ]);
  });

  it("returns undefined when picker is dismissed", async () => {
    const sessionA = makeSession("file:///a", "/projects/a");
    const sessionB = makeSession("file:///b", "/projects/b");

    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

    const result = await pickWorkspaceFolder(makeManager([sessionA, sessionB]));
    expect(result).toBeUndefined();
  });

  it("uses custom placeholder", async () => {
    const sessionA = makeSession("file:///a", "/projects/a");
    const sessionB = makeSession("file:///b", "/projects/b");

    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

    await pickWorkspaceFolder(makeManager([sessionA, sessionB]), "Pick a folder");

    const [, options] = vi.mocked(vscode.window.showQuickPick).mock.calls[0];
    expect(options).toEqual({ placeHolder: "Pick a folder" });
  });

  it("formats done session detail", async () => {
    const sessionA = makeSession("file:///a", "/projects/alpha", "done", {
      totalPhases: 7,
      phases: [],
    });
    const sessionB = makeSession("file:///b", "/projects/beta");

    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

    await pickWorkspaceFolder(makeManager([sessionA, sessionB]));

    const [items] = vi.mocked(vscode.window.showQuickPick).mock.calls[0];
    expect((items as any[])[0].detail).toBe("Done — 7/7 phases");
  });

  it("formats failed session detail", async () => {
    const sessionA = makeSession("file:///a", "/projects/alpha", "failed");
    const sessionB = makeSession("file:///b", "/projects/beta");

    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

    await pickWorkspaceFolder(makeManager([sessionA, sessionB]));

    const [items] = vi.mocked(vscode.window.showQuickPick).mock.calls[0];
    expect((items as any[])[0].detail).toBe("Failed");
  });
});
