import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "../../../core/processManager";

interface MockChildProcess {
  pid: number;
  kill: ReturnType<typeof vi.fn>;
  stderr: { on: ReturnType<typeof vi.fn> };
  on: ReturnType<typeof vi.fn>;
  exitCode: number | null;
}

function createMockChild(pid = 1234): MockChildProcess {
  return {
    pid,
    kill: vi.fn().mockReturnValue(true),
    stderr: { on: vi.fn() },
    on: vi.fn(),
    exitCode: null,
  };
}

interface SpawnCall {
  command: string;
  args: string[];
  options: Record<string, unknown>;
}

/** Flush microtask queue so async lockExists resolves.
 *  Works with both real and fake timers. */
async function flushMicrotasks(): Promise<void> {
  // Multiple awaits to drain the microtask queue
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("ProcessManager", () => {
  let spawnCalls: SpawnCall[];
  let mockChild: MockChildProcess;
  let spawnFn: ReturnType<typeof vi.fn>;
  let lockExists: ReturnType<typeof vi.fn>;
  let deleteLock: ReturnType<typeof vi.fn>;
  let getSettings: ReturnType<typeof vi.fn>;
  let closeCallback: ((code: number | null) => void) | undefined;
  let errorCallback: ((err: Error) => void) | undefined;

  beforeEach(() => {
    spawnCalls = [];
    closeCallback = undefined;
    errorCallback = undefined;
    mockChild = createMockChild();
    // Default: capture close and error handlers
    mockChild.on.mockImplementation((event: string, cb: (...args: any[]) => void) => {
      if (event === "close") closeCallback = cb;
      if (event === "error") errorCallback = cb;
      return mockChild;
    });
    spawnFn = vi.fn().mockImplementation((cmd, args, opts) => {
      spawnCalls.push({ command: cmd, args, options: opts });
      return mockChild;
    });
    lockExists = vi.fn().mockResolvedValue(false);
    deleteLock = vi.fn().mockResolvedValue(undefined);
    getSettings = vi.fn().mockReturnValue({
      verify: true,
      refactor: true,
      dryRun: false,
      aiParse: true,
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

  /** Start spawn and wait for async lock check to complete (process is now running) */
  async function startSpawn(pm: ProcessManager): Promise<void> {
    pm.spawn(); // Don't await — it resolves on process exit
    await flushMicrotasks();
  }

  describe("spawn", () => {
    it("builds correct args from settings (all enabled)", async () => {
      const pm = createManager();
      await startSpawn(pm);

      expect(spawnCalls).toHaveLength(1);
      const call = spawnCalls[0];
      expect(call.command).toBe("/usr/local/bin/claudeloop");
      expect(call.args).toContain("--verify");
      expect(call.args).toContain("--refactor");
      expect(call.args).toContain("--ai-parse");
      expect(call.args).not.toContain("--dry-run");

      closeCallback?.(0); // Clean up
    });

    it("includes --dry-run when dryRun is true", async () => {
      getSettings.mockReturnValue({
        verify: false,
        refactor: false,
        dryRun: true,
        aiParse: false,
      });
      const pm = createManager();
      await startSpawn(pm);

      const call = spawnCalls[0];
      expect(call.args).toContain("--dry-run");
      expect(call.args).not.toContain("--verify");
      expect(call.args).not.toContain("--refactor");
      expect(call.args).not.toContain("--ai-parse");

      closeCallback?.(0);
    });

    it("rejects when lock file exists (double-spawn prevention)", async () => {
      lockExists.mockResolvedValue(true);
      const pm = createManager();

      await expect(pm.spawn()).rejects.toThrow("lock file exists");
    });

    it("uses stdio config: ignore stdout, pipe stderr", async () => {
      const pm = createManager();
      await startSpawn(pm);

      expect(spawnCalls[0].options.stdio).toEqual(["ignore", "ignore", "pipe"]);
      closeCallback?.(0);
    });

    it("sets cwd to workspace root", async () => {
      const pm = createManager();
      await startSpawn(pm);

      expect(spawnCalls[0].options.cwd).toBe("/home/user/project");
      closeCallback?.(0);
    });

    it("reports isRunning true while process is alive", async () => {
      const pm = createManager();
      await startSpawn(pm);

      expect(pm.isRunning).toBe(true);

      closeCallback?.(0);
      await flushMicrotasks();

      expect(pm.isRunning).toBe(false);
    });

    it("rejects when child process emits error event", async () => {
      const pm = createManager();
      const spawnPromise = pm.spawn();
      await flushMicrotasks();

      errorCallback?.(new Error("spawn ENOENT"));

      await expect(spawnPromise).rejects.toThrow("spawn ENOENT");
      expect(pm.isRunning).toBe(false);
    });

    it("rejects with exit code and stderr on non-zero exit", async () => {
      const stderrData = vi.fn();
      mockChild.stderr.on.mockImplementation((event: string, cb: (...args: any[]) => void) => {
        if (event === "data") stderrData.mockImplementation(cb);
      });

      const pm = createManager();
      const spawnPromise = pm.spawn();
      await flushMicrotasks();

      stderrData(Buffer.from("something went wrong"));
      closeCallback?.(1);

      await expect(spawnPromise).rejects.toThrow("claudeloop exited with code 1: something went wrong");
      expect(pm.isRunning).toBe(false);
    });

    it("rejects with exit code only when stderr is empty", async () => {
      const pm = createManager();
      const spawnPromise = pm.spawn();
      await flushMicrotasks();

      closeCallback?.(2);

      await expect(spawnPromise).rejects.toThrow("claudeloop exited with code 2");
      expect(pm.isRunning).toBe(false);
    });
  });

  describe("stop", () => {
    it("sends SIGINT on Unix, escalates to SIGKILL after 5s", async () => {
      vi.useFakeTimers();
      const pm = createManager("darwin");
      await startSpawn(pm);

      const stopPromise = pm.stop();

      expect(mockChild.kill).toHaveBeenCalledWith("SIGINT");

      // Advance past 5s timeout — process hasn't exited
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockChild.kill).toHaveBeenCalledWith("SIGKILL");

      // Now simulate exit
      closeCallback?.(137);
      await stopPromise;
    });

    it("resolves immediately when process exits before escalation", async () => {
      vi.useFakeTimers();
      const pm = createManager("darwin");
      await startSpawn(pm);

      const stopPromise = pm.stop();

      expect(mockChild.kill).toHaveBeenCalledWith("SIGINT");

      // Process exits quickly
      closeCallback?.(130);
      await stopPromise;

      // SIGKILL should never have been sent
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
      await pm.stop(); // Should not throw
    });
  });

  describe("deactivate", () => {
    it("sends SIGINT, escalates to SIGKILL after 3s (distinct from stop)", async () => {
      vi.useFakeTimers();
      const pm = createManager("darwin");
      await startSpawn(pm);

      const deactivatePromise = pm.deactivate();

      expect(mockChild.kill).toHaveBeenCalledWith("SIGINT");

      // Advance 3s (not 5s like stop)
      await vi.advanceTimersByTimeAsync(3000);

      expect(mockChild.kill).toHaveBeenCalledWith("SIGKILL");

      closeCallback?.(137);
      await deactivatePromise;
    });

    it("resolves immediately if no process is running", async () => {
      const pm = createManager();
      await pm.deactivate(); // Should not throw
    });
  });

  describe("aiParse (legacy)", () => {
    it("spawns with --ai-parse, --no-retry, and --granularity flags", async () => {
      const pm = createManager();
      pm.aiParse("medium");
      await flushMicrotasks();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["--ai-parse", "--no-retry", "--granularity", "medium"]);

      closeCallback?.(0);
    });

    it("passes custom granularity string", async () => {
      const pm = createManager();
      pm.aiParse("create exactly 7 phases");
      await flushMicrotasks();

      expect(spawnCalls[0].args).toEqual([
        "--ai-parse",
        "--no-retry",
        "--granularity",
        "create exactly 7 phases",
      ]);

      closeCallback?.(0);
    });

    it("rejects when lock file exists", async () => {
      lockExists.mockResolvedValue(true);
      const pm = createManager();

      await expect(pm.aiParse("coarse")).rejects.toThrow("lock file exists");
    });
  });

  describe("aiParse", () => {
    it("passes --no-retry flag", async () => {
      const pm = createManager();
      const promise = pm.aiParse("tasks");
      await flushMicrotasks();

      expect(spawnCalls[0].args).toContain("--no-retry");
      closeCallback?.(0);
      const result = await promise;
      expect(result).toEqual({ exitCode: 0 });
    });

    it("resolves with exitCode 2 on verification failure", async () => {
      const pm = createManager();
      const promise = pm.aiParse("tasks");
      await flushMicrotasks();

      closeCallback?.(2);
      const result = await promise;
      expect(result).toEqual({ exitCode: 2 });
    });

    it("rejects on exit code 1 (process error)", async () => {
      const pm = createManager();
      const promise = pm.aiParse("tasks");
      await flushMicrotasks();

      const assertion = expect(promise).rejects.toThrow("claudeloop exited with code 1");
      closeCallback?.(1);
      await assertion;
    });
  });

  describe("aiParseFeedback", () => {
    it("spawns with --ai-parse-feedback flag", async () => {
      const pm = createManager();
      const promise = pm.aiParseFeedback("tasks");
      await flushMicrotasks();

      expect(spawnCalls[0].args).toContain("--ai-parse-feedback");
      expect(spawnCalls[0].args).toContain("--granularity");
      expect(spawnCalls[0].args).toContain("tasks");
      closeCallback?.(0);
      const result = await promise;
      expect(result).toEqual({ exitCode: 0 });
    });
  });

  describe("markComplete", () => {
    it("spawns with --mark-complete and phase arg", async () => {
      const pm = createManager();
      pm.markComplete(3);
      await flushMicrotasks();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["--mark-complete", "3"]);

      closeCallback?.(0);
    });

    it("rejects when lock file exists (double-spawn prevention)", async () => {
      lockExists.mockResolvedValue(true);
      const pm = createManager();

      await expect(pm.markComplete(3)).rejects.toThrow("lock file exists");
    });
  });

  describe("reset", () => {
    it("spawns with --reset flag", async () => {
      const pm = createManager();
      await startSpawn(pm);
      // Verify it was the reset call
      // Actually, let's test reset independently
      closeCallback?.(0); // end current process
      await flushMicrotasks();

      // Now reset
      pm.reset(); // Don't await — resolves on exit
      await flushMicrotasks();

      // The second spawn call should have --reset
      expect(spawnCalls).toHaveLength(2);
      expect(spawnCalls[1].args).toContain("--reset");

      closeCallback?.(0);
    });

    it("rejects when lock file exists", async () => {
      lockExists.mockResolvedValue(true);
      const pm = createManager();

      await expect(pm.reset()).rejects.toThrow("lock file exists");
    });
  });
});
