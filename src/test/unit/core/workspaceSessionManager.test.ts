import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkspaceSessionManager } from "../../../core/workspaceSessionManager";
import type { WorkspaceSessionManagerDeps } from "../../../core/workspaceSessionManager";

function makeDeps(
  activeFolderUri?: string,
): WorkspaceSessionManagerDeps & { setActive: (uri?: string) => void } {
  let active = activeFolderUri;
  return {
    getActiveFolderUri: () => active,
    setActive: (uri?: string) => {
      active = uri;
    },
  };
}

const folderA = {
  folderUri: "file:///projectA",
  workspaceRoot: "/projectA",
};

const folderB = {
  folderUri: "file:///projectB",
  workspaceRoot: "/projectB",
};

describe("WorkspaceSessionManager", () => {
  let deps: ReturnType<typeof makeDeps>;
  let manager: WorkspaceSessionManager;

  beforeEach(() => {
    deps = makeDeps();
    manager = new WorkspaceSessionManager(deps);
  });

  describe("createSession", () => {
    it("creates and stores a new session", () => {
      const session = manager.createSession(folderA);
      expect(session.folderUri).toBe(folderA.folderUri);
      expect(session.workspaceRoot).toBe(folderA.workspaceRoot);
      expect(session.sessionState.status).toBe("idle");
    });

    it("returns existing session for same folderUri", () => {
      const first = manager.createSession(folderA);
      const second = manager.createSession(folderA);
      expect(second).toBe(first);
    });

    it("creates separate sessions for different folders", () => {
      const a = manager.createSession(folderA);
      const b = manager.createSession(folderB);
      expect(a).not.toBe(b);
      expect(a.folderUri).toBe(folderA.folderUri);
      expect(b.folderUri).toBe(folderB.folderUri);
    });
  });

  describe("getSession", () => {
    it("returns session by folderUri", () => {
      const created = manager.createSession(folderA);
      expect(manager.getSession(folderA.folderUri)).toBe(created);
    });

    it("returns undefined for unknown folderUri", () => {
      expect(manager.getSession("file:///unknown")).toBeUndefined();
    });
  });

  describe("getActiveSession", () => {
    it("returns undefined when no active folder", () => {
      manager.createSession(folderA);
      expect(manager.getActiveSession()).toBeUndefined();
    });

    it("returns session matching active folder URI", () => {
      const session = manager.createSession(folderA);
      deps.setActive(folderA.folderUri);
      expect(manager.getActiveSession()).toBe(session);
    });

    it("returns undefined when active folder has no session", () => {
      deps.setActive("file:///noSession");
      expect(manager.getActiveSession()).toBeUndefined();
    });

    it("tracks active folder changes", () => {
      const a = manager.createSession(folderA);
      const b = manager.createSession(folderB);

      deps.setActive(folderA.folderUri);
      expect(manager.getActiveSession()).toBe(a);

      deps.setActive(folderB.folderUri);
      expect(manager.getActiveSession()).toBe(b);
    });
  });

  describe("getAllSessions", () => {
    it("returns empty array when no sessions", () => {
      expect(manager.getAllSessions()).toEqual([]);
    });

    it("returns all created sessions", () => {
      const a = manager.createSession(folderA);
      const b = manager.createSession(folderB);
      const all = manager.getAllSessions();
      expect(all).toHaveLength(2);
      expect(all).toContain(a);
      expect(all).toContain(b);
    });
  });

  describe("removeSession", () => {
    it("removes session and disposes it", () => {
      const session = manager.createSession(folderA);
      const handler = vi.fn();
      session.sessionState.on("state-changed", handler);

      const removed = manager.removeSession(folderA.folderUri);

      expect(removed).toBe(true);
      expect(manager.getSession(folderA.folderUri)).toBeUndefined();

      // Verify dispose was called — listeners should be removed
      session.sessionState.emit("state-changed", "idle", "running");
      expect(handler).not.toHaveBeenCalled();
    });

    it("returns false for unknown folderUri", () => {
      expect(manager.removeSession("file:///unknown")).toBe(false);
    });

    it("emits active-session-changed when removing the active session", () => {
      const session = manager.createSession(folderA);
      deps.setActive(folderA.folderUri);

      const handler = vi.fn();
      manager.on("active-session-changed", handler);

      manager.removeSession(folderA.folderUri);

      expect(handler).toHaveBeenCalledWith(undefined, session);
    });

    it("does not emit active-session-changed when removing a non-active session", () => {
      manager.createSession(folderA);
      manager.createSession(folderB);
      deps.setActive(folderB.folderUri);

      const handler = vi.fn();
      manager.on("active-session-changed", handler);

      manager.removeSession(folderA.folderUri);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("notifyActiveChanged", () => {
    it("emits active-session-changed with current active session", () => {
      const session = manager.createSession(folderA);
      deps.setActive(folderA.folderUri);

      const handler = vi.fn();
      manager.on("active-session-changed", handler);

      manager.notifyActiveChanged();

      expect(handler).toHaveBeenCalledWith(session, undefined);
    });

    it("emits with undefined when no active session", () => {
      const handler = vi.fn();
      manager.on("active-session-changed", handler);

      manager.notifyActiveChanged();

      expect(handler).toHaveBeenCalledWith(undefined, undefined);
    });
  });

  describe("dispose", () => {
    it("disposes all sessions and clears the map", () => {
      const a = manager.createSession(folderA);
      const b = manager.createSession(folderB);

      const handlerA = vi.fn();
      const handlerB = vi.fn();
      a.sessionState.on("state-changed", handlerA);
      b.sessionState.on("state-changed", handlerB);

      manager.dispose();

      expect(manager.getAllSessions()).toEqual([]);

      // Verify sessions were disposed
      a.sessionState.emit("state-changed", "idle", "running");
      b.sessionState.emit("state-changed", "idle", "running");
      expect(handlerA).not.toHaveBeenCalled();
      expect(handlerB).not.toHaveBeenCalled();
    });

    it("removes manager event listeners", () => {
      const handler = vi.fn();
      manager.on("active-session-changed", handler);

      manager.dispose();

      manager.emit("active-session-changed", undefined, undefined);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("single-folder equivalence", () => {
    it("works identically to a standalone SessionState for single folder", () => {
      deps.setActive(folderA.folderUri);
      const session = manager.createSession(folderA);

      // Session state transitions work through the manager
      const handler = vi.fn();
      session.sessionState.on("state-changed", handler);

      session.sessionState.onLockChanged({ locked: true, pid: 123 });
      expect(session.sessionState.status).toBe("running");
      expect(handler).toHaveBeenCalledWith("idle", "running");

      // Active session resolves correctly
      expect(manager.getActiveSession()).toBe(session);
      expect(manager.getAllSessions()).toHaveLength(1);
    });
  });
});
