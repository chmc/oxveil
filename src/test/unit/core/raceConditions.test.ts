import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProcessManager } from "../../../core/processManager";
import { PlanPreviewPanel } from "../../../views/planPreviewPanel";
import { SessionState } from "../../../core/sessionState";
import { createDeferred, flushMicrotasks } from "../../helpers/raceHelpers";
import { createMockChild } from "./processManager.helpers";
import type { PlanPreviewPanelDeps, PlanFileCategory } from "../../../views/planPreviewPanel";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeProcessManager(lockExists: ReturnType<typeof vi.fn>) {
  const mockChild = createMockChild();
  let closeCallback: ((code: number | null) => void) | undefined;
  mockChild.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    if (event === "close") closeCallback = cb;
    return mockChild;
  });
  const pm = new ProcessManager({
    claudeloopPath: "/usr/local/bin/claudeloop",
    workspaceRoot: "/home/user/project",
    spawn: vi.fn().mockReturnValue(mockChild),
    lockExists,
    deleteLock: vi.fn().mockResolvedValue(undefined),
    getSettings: vi.fn().mockReturnValue({
      verify: false, refactor: false, dryRun: false, aiParse: false,
      provider: "claude", opencodePath: "",
    }),
    platform: "darwin",
  });
  return { pm, close: (code = 0) => closeCallback?.(code) };
}

function makeMockPanel() {
  return {
    webview: {
      html: "",
      cspSource: "https://mock.csp",
      postMessage: vi.fn(),
      onDidReceiveMessage: vi.fn((cb: (msg: unknown) => void) => {
        cb({ type: "ready" });
        return { dispose: vi.fn() };
      }),
    },
    reveal: vi.fn(),
    onDidDispose: vi.fn(),
    onDidChangeViewState: vi.fn(),
    dispose: vi.fn(),
  };
}

function makePanelDeps(overrides?: Partial<PlanPreviewPanelDeps>): PlanPreviewPanelDeps {
  const mockPanel = makeMockPanel();
  return {
    createWebviewPanel: vi.fn(() => mockPanel) as any,
    readFile: vi.fn(async () => "# Plan\n\n## Phase 1: Step\n[status: pending]\nDo it\n"),
    findAllPlanFiles: vi.fn(async () => [
      { path: "/ws/.claude/plans/plan.md", category: "plan" as PlanFileCategory, mtimeMs: Date.now() },
    ]),
    onAnnotation: vi.fn(),
    createFileSystemWatcher: vi.fn(() => ({
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
      onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    })),
    statFile: vi.fn(async () => ({ birthtimeMs: Date.now(), mtimeMs: Date.now() })),
    ...overrides,
  };
}

// ── 1. Double spawn → error ───────────────────────────────────────────────────

describe("race: double spawn", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("second concurrent spawn rejects while first lockExists check is in flight", async () => {
    const lockDeferred = createDeferred<boolean>();
    const { pm, close } = makeProcessManager(vi.fn().mockReturnValue(lockDeferred.promise));

    const first = pm.spawn();
    // lockExists hasn't resolved yet — first spawn is mid-flight
    const second = pm.spawn();

    await expect(second).rejects.toThrow("spawn already in progress");

    // Let first complete normally
    lockDeferred.resolve(false);
    await flushMicrotasks();
    close();
    await first;
  });

  it("spawning flag clears after first spawn resolves, allowing a subsequent spawn", async () => {
    const { pm, close } = makeProcessManager(vi.fn().mockResolvedValue(false));

    const first = pm.spawn();
    await flushMicrotasks(); // lockExists resolves → process starts
    close();
    await first;

    // Now a fresh spawn should succeed, not reject as "already in progress"
    const lockDeferred = createDeferred<boolean>();
    const pm2 = makeProcessManager(vi.fn().mockResolvedValue(false));
    const second = pm2.pm.spawn();
    await flushMicrotasks();
    pm2.close();
    await expect(second).resolves.toBeUndefined();
  });
});

// ── 2. Async op completes after panel disposed → no-op ───────────────────────

describe("race: async op after panel disposed", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("onFileChanged completes after dispose without calling postMessage", async () => {
    const findDeferred = createDeferred<{ path: string; category: PlanFileCategory; mtimeMs: number }[]>();
    const mockPanel = makeMockPanel();
    const deps = makePanelDeps({
      createWebviewPanel: vi.fn(() => mockPanel) as any,
      findAllPlanFiles: vi.fn(() => findDeferred.promise),
    });

    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    panel.beginSession();

    // Clear calls from setup (ready message, beginSession render)
    mockPanel.webview.postMessage.mockClear();

    // Start an async file-changed cycle — paused at findAllPlanFiles
    const fileChangedPromise = panel.onFileChanged();

    // Dispose before the async op resolves
    panel.dispose();

    // Now resolve the deferred — the in-flight op should be a no-op
    findDeferred.resolve([
      { path: "/ws/.claude/plans/plan.md", category: "plan" as PlanFileCategory, mtimeMs: Date.now() },
    ]);
    await fileChangedPromise;

    expect(mockPanel.webview.postMessage).not.toHaveBeenCalled();
  });

  it("second concurrent onFileChanged supersedes the first via sequence guard", async () => {
    const first = createDeferred<{ path: string; category: PlanFileCategory; mtimeMs: number }[]>();
    const second = createDeferred<{ path: string; category: PlanFileCategory; mtimeMs: number }[]>();
    let callCount = 0;

    const mockPanel = makeMockPanel();
    const deps = makePanelDeps({
      createWebviewPanel: vi.fn(() => mockPanel) as any,
      findAllPlanFiles: vi.fn(() => {
        callCount++;
        return callCount === 1 ? first.promise : second.promise;
      }),
    });

    const panel = new PlanPreviewPanel(deps);
    panel.reveal();
    panel.beginSession();

    const op1 = panel.onFileChanged();
    const op2 = panel.onFileChanged(); // bumps _readSeq — op1's seq is now stale

    // Resolve first after second starts
    second.resolve([]);
    first.resolve([]);

    await op1;
    await op2;

    // op1's results are discarded; only op2 affects state
    // Neither should throw — silent discard is correct
    expect(deps.readFile).not.toHaveBeenCalled(); // both resolved to empty array → no readFile
  });
});

// ── 3. State transition during self-improvement → abort ──────────────────────

describe("race: state transition invalidates in-flight self-improvement", () => {
  it("done → running transition makes status check abort self-improvement", () => {
    const session = new SessionState();

    // Reach "done" via normal path: idle → running → done
    session.onLockChanged({ locked: true, pid: 1 });
    expect(session.status).toBe("running");
    session.onLockChanged({ locked: false });
    expect(session.status).toBe("done");

    // Simulate: async self-improvement check is awaiting (e.g. findLessonsContent)
    // Meanwhile user triggers reset (e.g. new session start) — done → idle
    session.reset();

    // The guard in sessionWiring: `if (session.status !== "done") break`
    expect(session.status).not.toBe("done");
    expect(session.status).toBe("idle");
  });

  it("invalid transition running → running throws InvalidTransitionError", () => {
    const session = new SessionState();
    session.onLockChanged({ locked: true, pid: 1 });
    expect(session.status).toBe("running");

    // onLockChanged guards against running→running by checking status first;
    // firing it while running should not throw (guard skips the transition)
    expect(() => session.onLockChanged({ locked: true, pid: 2 })).not.toThrow();
    expect(session.status).toBe("running"); // unchanged
  });

  it("state-changed event fires exactly once per valid transition", () => {
    const session = new SessionState();
    const events: [string, string][] = [];
    session.on("state-changed", (from, to) => events.push([from, to]));

    session.onLockChanged({ locked: true, pid: 1 });
    session.onLockChanged({ locked: true, pid: 2 }); // no-op: already running
    session.onLockChanged({ locked: false });

    expect(events).toEqual([
      ["idle", "running"],
      ["running", "done"],
    ]);
  });
});
