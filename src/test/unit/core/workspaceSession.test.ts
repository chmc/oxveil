import { describe, it, expect, vi } from "vitest";
import { WorkspaceSession } from "../../../core/workspaceSession";

describe("WorkspaceSession", () => {
  const init = {
    folderUri: "file:///project",
    workspaceRoot: "/project",
  };

  it("stores folderUri and workspaceRoot", () => {
    const session = new WorkspaceSession(init);
    expect(session.folderUri).toBe("file:///project");
    expect(session.workspaceRoot).toBe("/project");
  });

  it("creates a SessionState instance", () => {
    const session = new WorkspaceSession(init);
    expect(session.sessionState).toBeDefined();
    expect(session.sessionState.status).toBe("idle");
  });

  it("starts with undefined processManager and gitExec", () => {
    const session = new WorkspaceSession(init);
    expect(session.processManager).toBeUndefined();
    expect(session.gitExec).toBeUndefined();
  });

  it("allows setting processManager and gitExec", () => {
    const session = new WorkspaceSession(init);
    const fakePM = { spawn: vi.fn() } as never;
    const fakeGit = { exec: vi.fn(), cwd: "/project" };

    session.processManager = fakePM;
    session.gitExec = fakeGit;

    expect(session.processManager).toBe(fakePM);
    expect(session.gitExec).toBe(fakeGit);
  });

  describe("dispose", () => {
    it("removes all sessionState listeners", () => {
      const session = new WorkspaceSession(init);
      const handler = vi.fn();
      session.sessionState.on("state-changed", handler);

      session.dispose();

      session.sessionState.emit("state-changed", "idle", "running");
      expect(handler).not.toHaveBeenCalled();
    });

    it("clears processManager and gitExec", () => {
      const session = new WorkspaceSession(init);
      session.processManager = { spawn: vi.fn() } as never;
      session.gitExec = { exec: vi.fn(), cwd: "/project" };

      session.dispose();

      expect(session.processManager).toBeUndefined();
      expect(session.gitExec).toBeUndefined();
    });
  });

  it("sessionState transitions work through the session", () => {
    const session = new WorkspaceSession(init);
    const handler = vi.fn();
    session.sessionState.on("state-changed", handler);

    session.sessionState.onLockChanged({ locked: true, pid: 123 });

    expect(session.sessionState.status).toBe("running");
    expect(handler).toHaveBeenCalledWith("idle", "running");
  });
});
