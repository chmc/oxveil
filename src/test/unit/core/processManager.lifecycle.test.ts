import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "../../../core/processManager";
import { MockChildProcess, SpawnCall, createMockChild, flushMicrotasks } from "./processManager.helpers";

describe("ProcessManager", () => {
  let spawnCalls: SpawnCall[];
  let mockChild: MockChildProcess;
  let spawnFn: ReturnType<typeof vi.fn>;
  let lockExists: ReturnType<typeof vi.fn>;
  let deleteLock: ReturnType<typeof vi.fn>;
  let getSettings: ReturnType<typeof vi.fn>;
  let closeCallback: ((code: number | null) => void) | undefined;

  beforeEach(() => {
    spawnCalls = [];
    closeCallback = undefined;
    mockChild = createMockChild();
    mockChild.on.mockImplementation((event: string, cb: (...args: any[]) => void) => {
      if (event === "close") closeCallback = cb;
      return mockChild;
    });
    spawnFn = vi.fn().mockImplementation((cmd, args, opts) => {
      spawnCalls.push({ command: cmd, args, options: opts });
      return mockChild;
    });
    lockExists = vi.fn().mockResolvedValue(false);
    deleteLock = vi.fn().mockResolvedValue(undefined);
    getSettings = vi.fn().mockReturnValue({
      verify: false,
      refactor: false,
      dryRun: false,
      aiParse: false,
      provider: "claude",
      opencodePath: "",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function createManager(platform = "darwin"): ProcessManager {
    return new ProcessManager({
      claudeloopPath: "/usr/local/bin/claudeloop",
      workspaceRoot: "/home/user/project",
      spawn: spawnFn,
      lockExists,
      deleteLock,
      getSettings,
      platform,
    });
  }

  async function startSpawn(pm: ProcessManager): Promise<void> {
    pm.spawn();
    await flushMicrotasks();
  }

  describe("stop", () => {
    it("sends SIGINT on Unix, escalates to SIGKILL after 5s", async () => {
      vi.useFakeTimers();
      const pm = createManager("darwin");
      await startSpawn(pm);

      const stopPromise = pm.stop();

      expect(mockChild.kill).toHaveBeenCalledWith("SIGINT");

      await vi.advanceTimersByTimeAsync(5000);

      expect(mockChild.kill).toHaveBeenCalledWith("SIGKILL");

      closeCallback?.(137);
      await stopPromise;
    });

    it("resolves immediately when process exits before escalation", async () => {
      vi.useFakeTimers();
      const pm = createManager("darwin");
      await startSpawn(pm);

      const stopPromise = pm.stop();

      expect(mockChild.kill).toHaveBeenCalledWith("SIGINT");

      closeCallback?.(130);
      await stopPromise;

      expect(mockChild.kill).not.toHaveBeenCalledWith("SIGKILL");
    });

    it("sends SIGTERM on Windows instead of SIGINT", async () => {
      vi.useFakeTimers();
      const pm = createManager("win32");
      await startSpawn(pm);

      const stopPromise = pm.stop();

      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");

      closeCallback?.(0);
      await stopPromise;
    });

    it("resolves immediately if no process is running", async () => {
      const pm = createManager();
      await pm.stop();
    });
  });

  describe("deactivate", () => {
    it("sends SIGINT, escalates to SIGKILL after 3s (distinct from stop)", async () => {
      vi.useFakeTimers();
      const pm = createManager("darwin");
      await startSpawn(pm);

      const deactivatePromise = pm.deactivate();

      expect(mockChild.kill).toHaveBeenCalledWith("SIGINT");

      await vi.advanceTimersByTimeAsync(3000);

      expect(mockChild.kill).toHaveBeenCalledWith("SIGKILL");

      closeCallback?.(137);
      await deactivatePromise;
    });

    it("resolves immediately if no process is running", async () => {
      const pm = createManager();
      await pm.deactivate();
    });
  });
});
