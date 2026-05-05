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
      closeCallback?.(0);
      await flushMicrotasks();

      pm.reset();
      await flushMicrotasks();

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
