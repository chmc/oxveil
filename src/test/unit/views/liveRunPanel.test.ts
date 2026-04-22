import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({ ViewColumn: { One: 1 } }));

import { LiveRunPanel, type LiveRunPanelDeps } from "../../../views/liveRunPanel";
import type { ProgressState } from "../../../types";

function makeMockPanel() {
  let messageHandler: ((msg: any) => void) | undefined;
  return {
    webview: {
      html: "",
      cspSource: "https://mock.csp",
      postMessage: vi.fn(),
      onDidReceiveMessage: vi.fn((cb) => { messageHandler = cb; }),
    },
    reveal: vi.fn(),
    onDidDispose: vi.fn(),
    dispose: vi.fn(),
    _simulateMessage(msg: any) { messageHandler?.(msg); },
  };
}

function makeDeps(mockPanel = makeMockPanel()): LiveRunPanelDeps {
  return {
    createWebviewPanel: vi.fn(() => mockPanel) as any,
    executeCommand: vi.fn() as any,
    getConfig: vi.fn((key: string) => {
      if (key === "liveRunLogLines") return 1000;
      if (key === "liveRunDashboardCollapsed") return false;
      return undefined;
    }),
  };
}

function makeProgress(): ProgressState {
  return {
    phases: [
      { number: 1, title: "Setup", status: "completed", started: "2025-01-01 10:00:00", completed: "2025-01-01 10:02:00" },
      { number: 2, title: "Build", status: "in_progress", started: "2025-01-01 10:02:00" },
    ],
    totalPhases: 2,
    currentPhaseIndex: 1,
  };
}

describe("LiveRunPanel", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("creates panel on reveal", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());
    expect(deps.createWebviewPanel).toHaveBeenCalledWith(
      "oxveil.liveRun", "Live Run", 1,
      { enableScripts: true, retainContextWhenHidden: true },
    );
  });

  it("sets HTML shell on first reveal", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());
    expect(mockPanel.webview.html).toContain("<!DOCTYPE html>");
  });

  it("sends dashboard on reveal", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "dashboard" }),
    );
  });

  it("reuses panel on subsequent reveals", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());
    panel.reveal(makeProgress());
    expect(deps.createWebviewPanel).toHaveBeenCalledTimes(1);
  });

  it("onProgressChanged sends dashboard update", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());
    mockPanel.webview.postMessage.mockClear();
    panel.onProgressChanged(makeProgress());
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "dashboard" }),
    );
  });

  it("onLogAppended sends log-append", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());
    mockPanel.webview.postMessage.mockClear();
    panel.onLogAppended("[14:00:00] hello\n");
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "log-append" }),
    );
  });

  it("tracks log offset to avoid duplicates", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());
    mockPanel.webview.postMessage.mockClear();

    panel.onLogAppended("line1\nline2\n");
    panel.onLogAppended("line1\nline2\nline3\n"); // full file re-delivered
    const logCalls = mockPanel.webview.postMessage.mock.calls.filter(
      (c: any) => c[0].type === "log-append",
    );
    // Second call should only contain line3, not line1+line2 again
    expect(logCalls).toHaveLength(2);
    expect(logCalls[1][0].lines).not.toContainEqual('<div class="log-line">line1</div>');
    expect(logCalls[1][0].lines).toContainEqual('<div class="log-line">line3</div>');
  });

  it("buffers log when panel not open, replays on reveal", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.onLogAppended("buffered line\n");
    panel.reveal(makeProgress());
    const logCalls = mockPanel.webview.postMessage.mock.calls.filter(
      (c: any) => c[0].type === "log-append",
    );
    expect(logCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("caps buffer at configured limit", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    deps.getConfig = vi.fn(() => 5); // 5 line limit
    const panel = new LiveRunPanel(deps);
    // Feed 10 lines
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}\n`).join("");
    panel.onLogAppended(lines);
    panel.reveal(makeProgress());
    const logCalls = mockPanel.webview.postMessage.mock.calls.filter(
      (c: any) => c[0].type === "log-append",
    );
    // Buffer should contain at most 5 lines
    const allLines = logCalls.flatMap((c: any) => c[0].lines);
    expect(allLines).not.toContainEqual('<div class="log-line">line0</div>');
    expect(allLines).toContainEqual('<div class="log-line">line9</div>');
  });

  it("dispose cleans up", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());
    panel.dispose();
    expect(mockPanel.dispose).toHaveBeenCalled();
  });

  it("empty state when no progress", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal({ phases: [], totalPhases: 0 });
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "dashboard" }),
    );
  });

  it("handles toggle-dashboard message", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());
    mockPanel.webview.postMessage.mockClear();
    mockPanel._simulateMessage({ type: "toggle-dashboard" });
    // Should re-send dashboard (with toggled state)
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "dashboard" }),
    );
  });

  it("handles open-replay message", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());
    mockPanel._simulateMessage({ type: "open-replay" });
    expect(deps.executeCommand).toHaveBeenCalledWith("oxveil.openReplayViewer");
  });

  it("onRunFinished sends run-finished message", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());
    mockPanel.webview.postMessage.mockClear();
    panel.onRunFinished("done");
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "run-finished" }),
    );
  });

  it("onRunFinished('stopped') sends stopped banner (not failed)", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());
    mockPanel.webview.postMessage.mockClear();
    panel.onRunFinished("stopped");
    const call = mockPanel.webview.postMessage.mock.calls.find(
      (c: any) => c[0].type === "run-finished",
    );
    expect(call).toBeDefined();
    expect(call![0].html).toContain("Run Stopped");
    expect(call![0].html).not.toContain("Run Failed");
    expect(call![0].html).not.toContain("run-failed");
  });

  it("resets offset when log file is truncated", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());
    mockPanel.webview.postMessage.mockClear();

    // First delivery: 3 lines
    panel.onLogAppended("line1\nline2\nline3\n");
    // Simulate truncation: new file is shorter than previous offset
    panel.onLogAppended("new-line1\n");
    const logCalls = mockPanel.webview.postMessage.mock.calls.filter(
      (c: any) => c[0].type === "log-append",
    );
    // Second call should contain the truncated file's content
    expect(logCalls).toHaveLength(2);
    expect(logCalls[1][0].lines).toContainEqual('<div class="log-line">new-line1</div>');
  });

  it("tracks todo progress from log lines", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());
    mockPanel.webview.postMessage.mockClear();
    panel.onLogAppended('[14:00:00] [Todos: 3/7 done] \u25b8 "Writing test"\n');
    // Should re-send dashboard with todo data
    const dashCalls = mockPanel.webview.postMessage.mock.calls.filter(
      (c: any) => c[0].type === "dashboard",
    );
    expect(dashCalls.length).toBeGreaterThanOrEqual(1);
  });

  describe("ai-parse state management", () => {
    it("revealForAiParse resets log offset so fresh content is shown", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);

      // First: reveal and process log content (this sets _logOffset)
      panel.reveal(makeProgress());
      panel.onLogAppended("old content from previous run\n");

      // Now call revealForAiParse - should reset offset
      mockPanel.webview.postMessage.mockClear();
      panel.revealForAiParse();

      // Now provide the SAME content again (simulating a fresh live.log write)
      // If offset wasn't reset, this would be a no-op since offset > 0
      panel.onLogAppended("fresh content\n");

      const logCalls = mockPanel.webview.postMessage.mock.calls.filter(
        (c: any) => c[0].type === "log-append",
      );
      // Should have log-append call with fresh content
      expect(logCalls.length).toBeGreaterThanOrEqual(1);
      expect(logCalls[0][0].lines).toContainEqual('<div class="log-line">fresh content</div>');
    });

    it("revealForAiParse clears buffered log lines", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);

      // Add logs without revealing (goes to buffer)
      panel.onLogAppended("buffered old line\n");

      // Now revealForAiParse - should clear buffer
      panel.revealForAiParse();

      // The buffered old line should NOT be flushed
      const logCalls = mockPanel.webview.postMessage.mock.calls.filter(
        (c: any) => c[0].type === "log-append",
      );
      const allLines = logCalls.flatMap((c: any) => c[0].lines);
      expect(allLines).not.toContainEqual('<div class="log-line">buffered old line</div>');
    });
  });

  describe("ai-parse status header", () => {
    it("revealForAiParse sends ai-parse-status message with parsing state", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      panel.revealForAiParse();
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "ai-parse-status", status: "parsing" }),
      );
    });

    it("onAiParseComplete sends ai-parse-status message with complete state", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      panel.revealForAiParse();
      mockPanel.webview.postMessage.mockClear();
      panel.onAiParseComplete();
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "ai-parse-status", status: "complete" }),
      );
    });

    it("onVerifyFailed reveals panel if disposed", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);

      // First reveal to create panel, then simulate dispose
      panel.revealForAiParse();
      const disposeCallback = mockPanel.onDidDispose.mock.calls[0][0];
      disposeCallback(); // Simulate panel being closed

      // Reset mock to track new calls
      deps.createWebviewPanel.mockClear();

      // onVerifyFailed should re-create panel
      panel.onVerifyFailed({ reason: "Missing req", attempt: 1, maxAttempts: 3 });

      expect(deps.createWebviewPanel).toHaveBeenCalled();
    });

    it("onVerifyFailed sends ai-parse-status message with needs-input state", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      panel.revealForAiParse();
      mockPanel.webview.postMessage.mockClear();
      panel.onVerifyFailed({ reason: "Missing req", attempt: 1, maxAttempts: 3 });
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "ai-parse-status", status: "needs-input" }),
      );
    });

    it("onVerifyPassed calls onAiParseComplete", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      panel.revealForAiParse();
      mockPanel.webview.postMessage.mockClear();
      panel.onVerifyPassed({ retryCount: 0 });
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "ai-parse-status", status: "complete" }),
      );
    });
  });

  describe("verify messages", () => {
    it("posts verify-failed message to webview", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      panel.reveal(makeProgress());

      panel.onVerifyFailed({ reason: "Missing req", attempt: 1, maxAttempts: 3 });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "verify-failed" }),
      );
    });

    it("posts verify-passed message to webview", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      panel.reveal(makeProgress());

      panel.onVerifyPassed({ retryCount: 1 });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "verify-passed" }),
      );
    });

    it("emits action events from webview messages", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      panel.reveal(makeProgress());

      const actions: string[] = [];
      panel.onAiParseAction((action) => actions.push(action));

      (mockPanel as any)._simulateMessage({ type: "ai-parse-retry" });
      expect(actions).toEqual(["ai-parse-retry"]);
    });

    it("reveal() after onVerifyPassed sends dashboard (clears banner in webview)", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      panel.revealForAiParse();
      panel.onVerifyPassed({ retryCount: 0 });
      mockPanel.webview.postMessage.mockClear();

      panel.reveal(makeProgress());

      const types = mockPanel.webview.postMessage.mock.calls.map((c: any) => c[0].type);
      expect(types).toContain("dashboard");
    });

    it("reveal() clears stale AI parse status header", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      panel.revealForAiParse();
      panel.onAiParseComplete();
      mockPanel.webview.postMessage.mockClear();

      // reveal() for normal run should clear the "complete" status
      panel.reveal(makeProgress());

      const aiParseStatusCalls = mockPanel.webview.postMessage.mock.calls.filter(
        (c: any) => c[0].type === "ai-parse-status",
      );
      expect(aiParseStatusCalls).toHaveLength(1);
      expect(aiParseStatusCalls[0][0].status).toBe("idle");
    });

    it("onProgressChanged() skips dashboard when ai-parse is complete", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      // AI parse leaves panel open with "complete" status
      panel.revealForAiParse();
      panel.onAiParseComplete();
      mockPanel.webview.postMessage.mockClear();

      // File watcher triggers onProgressChanged - should NOT send any messages
      // to preserve the verify-passed banner
      panel.onProgressChanged(makeProgress());

      expect(mockPanel.webview.postMessage).not.toHaveBeenCalled();
    });

    it("onProgressChanged() skips dashboard when ai-parse needs-input", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      panel.revealForAiParse();
      panel.onVerifyFailed({ reason: "Test failure", attempt: 1, maxAttempts: 3 });
      mockPanel.webview.postMessage.mockClear();

      // File watcher triggers onProgressChanged - should NOT send any messages
      // to preserve the verify-failed banner
      panel.onProgressChanged(makeProgress());

      expect(mockPanel.webview.postMessage).not.toHaveBeenCalled();
    });

    it("clearAiParseStatus() resets status and sends messages when not idle", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      panel.revealForAiParse();
      panel.onAiParseComplete();
      mockPanel.webview.postMessage.mockClear();

      panel.clearAiParseStatus();

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "ai-parse-status", status: "idle" }),
      );
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "clear-verify-banner" }),
      );
    });

    it("clearAiParseStatus() does nothing when already idle", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      panel.reveal(makeProgress());
      mockPanel.webview.postMessage.mockClear();

      panel.clearAiParseStatus();

      const aiParseStatusCalls = mockPanel.webview.postMessage.mock.calls.filter(
        (c: any) => c[0].type === "ai-parse-status",
      );
      expect(aiParseStatusCalls).toHaveLength(0);
    });

    it("onLogAppended() skips dashboard when ai-parse is complete", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      panel.revealForAiParse();
      panel.onAiParseComplete();
      // Set up lastProgress so dashboard would normally be sent
      panel.onProgressChanged(makeProgress());
      mockPanel.webview.postMessage.mockClear();

      // Log with todo update - should NOT trigger dashboard in ai-parse complete state
      panel.onLogAppended("some content\n[Todos: 1/3 done] \u25b8 \"current task\"\nmore content");

      const dashboardCalls = mockPanel.webview.postMessage.mock.calls.filter(
        (c: any) => c[0].type === "dashboard",
      );
      expect(dashboardCalls).toHaveLength(0);
    });

    it("reveal() after onRunFinished sends dashboard (clears banner in webview)", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      panel.reveal(makeProgress());
      panel.onRunFinished("done");
      mockPanel.webview.postMessage.mockClear();

      panel.reveal(makeProgress());

      const types = mockPanel.webview.postMessage.mock.calls.map((c: any) => c[0].type);
      expect(types).toContain("dashboard");
    });

    it("onVerifyPassed after prior run sends verify-passed (clears run-finished in webview)", () => {
      const mockPanel = makeMockPanel();
      const deps = makeDeps(mockPanel);
      const panel = new LiveRunPanel(deps);
      panel.reveal(makeProgress());
      panel.onRunFinished("done");
      mockPanel.webview.postMessage.mockClear();

      panel.revealForAiParse();
      panel.onVerifyPassed({ retryCount: 0 });

      const types = mockPanel.webview.postMessage.mock.calls.map((c: any) => c[0].type);
      expect(types).toContain("verify-passed");
    });
  });
});
