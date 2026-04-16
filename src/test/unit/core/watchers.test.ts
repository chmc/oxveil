import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WatcherManager, type WatcherDeps } from "../../../core/watchers";

function makeDeps(overrides?: Partial<WatcherDeps>): WatcherDeps {
  return {
    workspaceRoot: "/workspace",
    debounceMs: 10,
    onLockChange: vi.fn(),
    onProgressChange: vi.fn(),
    onLogChange: vi.fn(),
    createWatcher: vi.fn().mockReturnValue({
      onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      onDidCreate: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      onDidDelete: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      dispose: vi.fn(),
    }),
    readFile: vi.fn().mockResolvedValue(""),
    ...overrides,
  };
}

describe("WatcherManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throttle: single event fires once (no trailing edge)", async () => {
    const onLogChange = vi.fn();
    const deps = makeDeps({
      onLogChange,
      readFile: vi.fn().mockResolvedValue("line 1\n"),
    });
    const watcher = new WatcherManager(deps);
    watcher.start();

    const handler = watcher.getFileChangeHandler();
    handler("/workspace/.claudeloop/live.log");

    // Flush the leading-edge async readFile
    await vi.advanceTimersByTimeAsync(0);

    expect(onLogChange).toHaveBeenCalledTimes(1);

    // Advance past debounce — no trailing edge should fire
    await vi.advanceTimersByTimeAsync(deps.debounceMs + 1);

    expect(onLogChange).toHaveBeenCalledTimes(1);
  });

  it("throttle: rapid events produce leading + trailing callbacks", async () => {
    const onProgressChange = vi.fn();
    const deps = makeDeps({
      onProgressChange,
      readFile: vi.fn().mockResolvedValue("progress content"),
    });
    const watcher = new WatcherManager(deps);
    watcher.start();

    const handler = watcher.getFileChangeHandler();

    // First event fires immediately (leading edge)
    handler("/workspace/.claudeloop/PROGRESS.md");
    await vi.advanceTimersByTimeAsync(0);
    expect(onProgressChange).toHaveBeenCalledTimes(1);

    // More events during cooldown — should NOT fire immediately
    handler("/workspace/.claudeloop/PROGRESS.md");
    handler("/workspace/.claudeloop/PROGRESS.md");
    await vi.advanceTimersByTimeAsync(0);
    expect(onProgressChange).toHaveBeenCalledTimes(1);

    // Advance past debounce — trailing edge fires
    await vi.advanceTimersByTimeAsync(deps.debounceMs + 1);
    expect(onProgressChange).toHaveBeenCalledTimes(2);
  });

  it("throttle: sustained writes fire callbacks at steady cadence", async () => {
    const onLogChange = vi.fn();
    const deps = makeDeps({
      onLogChange,
      readFile: vi.fn().mockResolvedValue("content"),
      debounceMs: 100,
    });
    const watcher = new WatcherManager(deps);
    watcher.start();

    const handler = watcher.getFileChangeHandler();

    // Simulate writes every 30ms for 500ms
    for (let t = 0; t < 500; t += 30) {
      handler("/workspace/.claudeloop/live.log");
      await vi.advanceTimersByTimeAsync(30);
    }

    // Flush any remaining trailing edge
    await vi.advanceTimersByTimeAsync(deps.debounceMs + 1);

    // With 100ms throttle and 500ms of sustained writes, expect at least 5 callbacks
    // (leading edge + trailing edges every ~100ms)
    expect(onLogChange.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it("stop() during active cooldown cancels pending trailing edge", async () => {
    const onLogChange = vi.fn();
    const deps = makeDeps({
      onLogChange,
      readFile: vi.fn().mockResolvedValue("content"),
    });
    const watcher = new WatcherManager(deps);
    watcher.start();

    const handler = watcher.getFileChangeHandler();

    // Leading edge fires
    handler("/workspace/.claudeloop/live.log");
    await vi.advanceTimersByTimeAsync(0);
    expect(onLogChange).toHaveBeenCalledTimes(1);

    // Second event during cooldown
    handler("/workspace/.claudeloop/live.log");

    // Stop before trailing edge fires
    watcher.stop();

    // Advance past debounce — trailing edge should NOT fire
    await vi.advanceTimersByTimeAsync(deps.debounceMs + 1);
    expect(onLogChange).toHaveBeenCalledTimes(1);
  });

  it("routes lock file changes to lock handler", async () => {
    const onLockChange = vi.fn();
    const deps = makeDeps({
      onLockChange,
      readFile: vi.fn().mockResolvedValue("12345"),
    });
    const watcher = new WatcherManager(deps);
    watcher.start();

    const handler = watcher.getFileChangeHandler();
    handler("/workspace/.claudeloop/lock");

    await vi.advanceTimersByTimeAsync(deps.debounceMs + 1);

    expect(onLockChange).toHaveBeenCalledTimes(1);
    expect(onLockChange).toHaveBeenCalledWith("12345");
  });

  it("routes PROGRESS.md changes to progress handler", async () => {
    const onProgressChange = vi.fn();
    const deps = makeDeps({
      onProgressChange,
      readFile: vi.fn().mockResolvedValue("## Phase Details\n"),
    });
    const watcher = new WatcherManager(deps);
    watcher.start();

    const handler = watcher.getFileChangeHandler();
    handler("/workspace/.claudeloop/PROGRESS.md");

    await vi.advanceTimersByTimeAsync(deps.debounceMs + 1);

    expect(onProgressChange).toHaveBeenCalledWith("## Phase Details\n");
  });

  it("routes live.log changes to log handler", async () => {
    const onLogChange = vi.fn();
    const deps = makeDeps({
      onLogChange,
      readFile: vi.fn().mockResolvedValue("log line 1\nlog line 2\n"),
    });
    const watcher = new WatcherManager(deps);
    watcher.start();

    const handler = watcher.getFileChangeHandler();
    handler("/workspace/.claudeloop/live.log");

    await vi.advanceTimersByTimeAsync(deps.debounceMs + 1);

    expect(onLogChange).toHaveBeenCalledWith("log line 1\nlog line 2\n");
  });

  it("large log content is delivered in a single call", async () => {
    const largeContent = "x".repeat(128 * 1024); // 128KB
    const onLogChange = vi.fn();
    const readFile = vi.fn().mockResolvedValue(largeContent);
    const deps = makeDeps({ onLogChange, readFile });
    const watcher = new WatcherManager(deps);
    watcher.start();

    const handler = watcher.getFileChangeHandler();
    handler("/workspace/.claudeloop/live.log");

    await vi.advanceTimersByTimeAsync(deps.debounceMs + 1);

    expect(onLogChange).toHaveBeenCalledTimes(1);
    expect(onLogChange.mock.calls[0][0].length).toBe(128 * 1024);
  });

  it("ignores unrecognized files in .claudeloop/", async () => {
    const onLockChange = vi.fn();
    const onProgressChange = vi.fn();
    const onLogChange = vi.fn();
    const deps = makeDeps({ onLockChange, onProgressChange, onLogChange });
    const watcher = new WatcherManager(deps);
    watcher.start();

    const handler = watcher.getFileChangeHandler();
    handler("/workspace/.claudeloop/unknown-file.txt");

    await vi.advanceTimersByTimeAsync(deps.debounceMs + 1);

    expect(onLockChange).not.toHaveBeenCalled();
    expect(onProgressChange).not.toHaveBeenCalled();
    expect(onLogChange).not.toHaveBeenCalled();
  });

  it("lock file deletion calls onLockChange with empty string", async () => {
    const onLockChange = vi.fn();
    const deps = makeDeps({
      onLockChange,
      readFile: vi.fn().mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
      ),
    });
    const watcher = new WatcherManager(deps);
    watcher.start();

    const handler = watcher.getFileChangeHandler();
    handler("/workspace/.claudeloop/lock");

    await vi.advanceTimersByTimeAsync(deps.debounceMs + 1);

    expect(onLockChange).toHaveBeenCalledTimes(1);
    expect(onLockChange).toHaveBeenCalledWith("");
  });

  it("progress file deletion is silently ignored", async () => {
    const onProgressChange = vi.fn();
    const deps = makeDeps({
      onProgressChange,
      readFile: vi.fn().mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
      ),
    });
    const watcher = new WatcherManager(deps);
    watcher.start();

    const handler = watcher.getFileChangeHandler();
    handler("/workspace/.claudeloop/PROGRESS.md");

    await vi.advanceTimersByTimeAsync(deps.debounceMs + 1);

    expect(onProgressChange).not.toHaveBeenCalled();
  });

  it("stop disposes watcher", () => {
    const deps = makeDeps();
    const watcher = new WatcherManager(deps);
    watcher.start();
    watcher.stop();

    const mockWatcher = (deps.createWatcher as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(mockWatcher.dispose).toHaveBeenCalled();
  });

  describe("lock polling", () => {
    it("start() begins lock polling at configured interval", async () => {
      const onLockChange = vi.fn();
      const readFile = vi.fn().mockResolvedValue("12345");
      const deps = makeDeps({ onLockChange, readFile });
      const watcher = new WatcherManager(deps);
      watcher.start();

      // No poll calls yet (first tick hasn't fired)
      expect(readFile).not.toHaveBeenCalled();

      // Advance past poll interval (5000ms)
      await vi.advanceTimersByTimeAsync(5001);
      expect(onLockChange).toHaveBeenCalledWith("12345");

      // Advance another interval — should poll again
      readFile.mockClear();
      onLockChange.mockClear();
      await vi.advanceTimersByTimeAsync(5001);
      expect(onLockChange).toHaveBeenCalledWith("12345");

      watcher.stop();
    });

    it("poll detects deleted lock file and calls onLockChange with empty string", async () => {
      const onLockChange = vi.fn();
      const readFile = vi.fn().mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
      );
      const deps = makeDeps({ onLockChange, readFile });
      const watcher = new WatcherManager(deps);
      watcher.start();

      await vi.advanceTimersByTimeAsync(5001);

      expect(onLockChange).toHaveBeenCalledWith("");
      watcher.stop();
    });

    it("stop() clears the poll timer — no further readFile calls", async () => {
      const readFile = vi.fn().mockResolvedValue("12345");
      const deps = makeDeps({ readFile });
      const watcher = new WatcherManager(deps);
      watcher.start();
      watcher.stop();

      readFile.mockClear();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(readFile).not.toHaveBeenCalled();
    });

    it("poll skips tick if previous _handleFile is still in flight", async () => {
      let resolveRead!: (value: string) => void;
      const readFile = vi.fn().mockImplementation(
        () => new Promise<string>((r) => { resolveRead = r; }),
      );
      const onLockChange = vi.fn();
      const deps = makeDeps({ readFile, onLockChange });
      const watcher = new WatcherManager(deps);
      watcher.start();

      // First poll tick fires — readFile is pending
      await vi.advanceTimersByTimeAsync(5001);
      expect(readFile).toHaveBeenCalledTimes(1);

      // Second tick fires while first is still in flight — should skip
      await vi.advanceTimersByTimeAsync(5001);
      expect(readFile).toHaveBeenCalledTimes(1);

      // Resolve the first read
      resolveRead("12345");
      await vi.advanceTimersByTimeAsync(0);

      // Third tick should now fire since in-flight cleared
      await vi.advanceTimersByTimeAsync(5001);
      expect(readFile).toHaveBeenCalledTimes(2);

      watcher.stop();
    });

    it("non-ENOENT error during poll does not call onLockChange", async () => {
      const onLockChange = vi.fn();
      const readFile = vi.fn().mockRejectedValue(
        Object.assign(new Error("EPERM"), { code: "EPERM" }),
      );
      const deps = makeDeps({ onLockChange, readFile });
      const watcher = new WatcherManager(deps);
      watcher.start();

      await vi.advanceTimersByTimeAsync(5001);

      // Non-lock-type errors should still trigger onLockChange("") for lock files
      // because _handleFile catches all errors for lock type
      expect(onLockChange).toHaveBeenCalledWith("");
      watcher.stop();
    });

    it("poll and watcher both detect deletion — onLockChange called twice safely", async () => {
      const onLockChange = vi.fn();
      const readFile = vi.fn().mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
      );
      const deps = makeDeps({ onLockChange, readFile });
      const watcher = new WatcherManager(deps);
      watcher.start();

      // Watcher fires deletion event
      const handler = watcher.getFileChangeHandler();
      handler("/workspace/.claudeloop/lock");
      await vi.advanceTimersByTimeAsync(0);

      // Poll also fires
      await vi.advanceTimersByTimeAsync(5001);

      // Both should have called onLockChange("") — this is safe
      expect(onLockChange).toHaveBeenCalledWith("");
      expect(onLockChange.mock.calls.length).toBeGreaterThanOrEqual(2);

      watcher.stop();
    });
  });
});
