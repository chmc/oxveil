import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProcessManager, ProcessManagerDeps } from "../../../core/processManager";
import {
  MockChildProcess,
  SpawnCall,
  createMockChild,
  flushMicrotasks,
} from "./processManager.helpers";

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

  /** Start spawn and wait for async lock check to complete (process is now running) */
  async function startSpawn(pm: ProcessManager): Promise<void> {
    pm.spawn();
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

      closeCallback?.(0);
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

    describe("provider flags", () => {
      it("omits --provider flag when provider is 'claude' (default)", async () => {
        getSettings.mockReturnValue({
          verify: false,
          refactor: false,
          dryRun: false,
          aiParse: false,
          provider: "claude",
          opencodePath: "",
        });
        const pm = createManager();
        await startSpawn(pm);

        expect(spawnCalls[0].args).not.toContain("--provider");
        closeCallback?.(0);
      });

      it("includes --provider opencode when provider is 'opencode'", async () => {
        getSettings.mockReturnValue({
          verify: false,
          refactor: false,
          dryRun: false,
          aiParse: false,
          provider: "opencode",
          opencodePath: "",
        });
        const pm = createManager();
        await startSpawn(pm);

        const args = spawnCalls[0].args;
        expect(args).toContain("--provider");
        expect(args[args.indexOf("--provider") + 1]).toBe("opencode");
        expect(args).not.toContain("--provider-path");
        closeCallback?.(0);
      });

      it("includes --provider-path when provider is 'opencode' and opencodePath is set", async () => {
        getSettings.mockReturnValue({
          verify: false,
          refactor: false,
          dryRun: false,
          aiParse: false,
          provider: "opencode",
          opencodePath: "/usr/local/bin/opencode",
        });
        const pm = createManager();
        await startSpawn(pm);

        const args = spawnCalls[0].args;
        expect(args).toContain("--provider");
        expect(args[args.indexOf("--provider") + 1]).toBe("opencode");
        expect(args).toContain("--provider-path");
        expect(args[args.indexOf("--provider-path") + 1]).toBe("/usr/local/bin/opencode");
        closeCallback?.(0);
      });
    });
  });
});

describe("concurrent spawn protection", () => {
  function createProcessManager(overrides?: Partial<ProcessManagerDeps>) {
    let closeCallback: ((code: number | null) => void) | undefined;
    const mockChild = createMockChild();
    mockChild.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === "close") closeCallback = cb;
      return mockChild;
    });
    const pm = new ProcessManager({
      claudeloopPath: "/usr/local/bin/claudeloop",
      workspaceRoot: "/home/user/project",
      spawn: vi.fn().mockReturnValue(mockChild),
      lockExists: vi.fn().mockResolvedValue(false),
      deleteLock: vi.fn().mockResolvedValue(undefined),
      getSettings: vi.fn().mockReturnValue({
        verify: false,
        refactor: false,
        dryRun: false,
        aiParse: false,
        provider: "claude",
        opencodePath: "",
      }),
      platform: "darwin",
      ...overrides,
    });
    return { pm, close: (code = 0) => closeCallback?.(code) };
  }

  it("rejects concurrent spawn attempts", async () => {
    const { pm, close } = createProcessManager();
    const first = pm.spawn();
    const second = pm.spawn();
    await expect(second).rejects.toThrow("spawn already in progress");
    await flushMicrotasks(); // let lockExists resolve so closeCallback is registered
    close();
    await first;
  });

  it("clears _spawning flag when lockExists throws", async () => {
    const { pm } = createProcessManager({
      lockExists: vi.fn().mockRejectedValue(new Error("fs error")),
    });
    await expect(pm.spawn()).rejects.toThrow("fs error");
    await expect(pm.spawn()).rejects.toThrow("fs error"); // not "spawn already in progress"
  });

  it("clears _spawning flag when lock exists", async () => {
    const { pm } = createProcessManager({
      lockExists: vi.fn().mockResolvedValue(true),
    });
    await expect(pm.spawn()).rejects.toThrow("lock file exists");
    await expect(pm.spawn()).rejects.toThrow("lock file exists"); // allows retry
  });

  it("rejects spawn during stop", async () => {
    const { pm, close } = createProcessManager();
    pm.spawn(); // start but don't await — process must remain running
    await flushMicrotasks(); // let lockExists resolve so _process is set
    const stopPromise = pm.stop(); // sets _stopping = true synchronously
    await expect(pm.spawn()).rejects.toThrow("shutting down");
    close();
    await stopPromise;
  });

  it("rejects spawn when already running", async () => {
    const { pm, close } = createProcessManager();
    pm.spawn(); // start but don't await — _process stays set
    await flushMicrotasks(); // let lockExists resolve so _process is set
    await expect(pm.spawn()).rejects.toThrow("already running");
    close(); // cleanup
  });

  it("rejects concurrent aiParse attempts", async () => {
    const { pm, close } = createProcessManager();
    const first = pm.aiParse("phase");
    const second = pm.aiParse("phase");
    await expect(second).rejects.toThrow("spawn already in progress");
    await flushMicrotasks(); // let lockExists resolve so closeCallback is registered
    close();
    await first;
  });
});
