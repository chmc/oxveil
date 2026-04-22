import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiParseLoop } from "../../../commands/aiParseLoop";
import type { AiParseResult } from "../../../core/interfaces";

function makeProcessManager(results: AiParseResult[]) {
  let callIndex = 0;
  return {
    aiParse: vi.fn(async () => results[callIndex++]),
    aiParseFeedback: vi.fn(async () => results[callIndex++]),
    isRunning: false,
  };
}

function makeLiveRunPanel() {
  const actionCallbacks: Array<(action: string) => void> = [];
  return {
    reveal: vi.fn(),
    revealForAiParse: vi.fn(),
    onVerifyFailed: vi.fn(),
    onVerifyPassed: vi.fn(),
    onAiParseAction: vi.fn((cb: (action: string) => void) => {
      actionCallbacks.push(cb);
      return () => { actionCallbacks.splice(actionCallbacks.indexOf(cb), 1); };
    }),
    onLogAppended: vi.fn(),
    clearAiParseStatus: vi.fn(),
    visible: false,
    _triggerAction(action: string) {
      for (const cb of actionCallbacks) cb(action);
    },
  };
}

describe("aiParseLoop", () => {
  it("returns pass on immediate verification success", async () => {
    const pm = makeProcessManager([{ exitCode: 0 }]);
    const panel = makeLiveRunPanel();
    const readVerifyReason = vi.fn();

    const result = await aiParseLoop({
      processManager: pm as any,
      liveRunPanel: panel as any,
      granularity: "tasks",
      readVerifyReason,
    });

    expect(result.outcome).toBe("pass");
    expect(panel.onVerifyPassed).toHaveBeenCalled();
  });

  it("shows failure and returns aborted on abort", async () => {
    const pm = makeProcessManager([{ exitCode: 2 }]);
    const panel = makeLiveRunPanel();
    const readVerifyReason = vi.fn().mockResolvedValue("Missing requirement");

    const promise = aiParseLoop({
      processManager: pm as any,
      liveRunPanel: panel as any,
      granularity: "tasks",
      readVerifyReason,
    });

    await vi.waitFor(() => {
      expect(panel.onVerifyFailed).toHaveBeenCalled();
    });

    panel._triggerAction("ai-parse-abort");
    const result = await promise;
    expect(result.outcome).toBe("aborted");
  });

  it("retries on retry action and returns pass", async () => {
    const pm = makeProcessManager([
      { exitCode: 2 },  // first: fail
      { exitCode: 0 },  // retry: pass
    ]);
    const panel = makeLiveRunPanel();
    const readVerifyReason = vi.fn().mockResolvedValue("Missing req");

    const promise = aiParseLoop({
      processManager: pm as any,
      liveRunPanel: panel as any,
      granularity: "tasks",
      readVerifyReason,
    });

    await vi.waitFor(() => {
      expect(panel.onVerifyFailed).toHaveBeenCalled();
    });

    panel._triggerAction("ai-parse-retry");
    const result = await promise;
    expect(result.outcome).toBe("pass");
    expect(pm.aiParseFeedback).toHaveBeenCalledWith("tasks");
  });

  it("returns continued on continue action", async () => {
    const pm = makeProcessManager([{ exitCode: 2 }]);
    const panel = makeLiveRunPanel();
    const readVerifyReason = vi.fn().mockResolvedValue("Issue");

    const promise = aiParseLoop({
      processManager: pm as any,
      liveRunPanel: panel as any,
      granularity: "tasks",
      readVerifyReason,
    });

    await vi.waitFor(() => {
      expect(panel.onVerifyFailed).toHaveBeenCalled();
    });

    panel._triggerAction("ai-parse-continue");
    const result = await promise;
    expect(result.outcome).toBe("continued");
  });

  it("reveals Live Run Panel at start", async () => {
    const pm = makeProcessManager([{ exitCode: 0 }]);
    const panel = makeLiveRunPanel();
    const readVerifyReason = vi.fn();

    await aiParseLoop({
      processManager: pm as any,
      liveRunPanel: panel as any,
      granularity: "tasks",
      readVerifyReason,
    });

    expect(panel.revealForAiParse).toHaveBeenCalled();
  });

  it("calls notificationManager.onAiParseSuccess on pass", async () => {
    const pm = makeProcessManager([{ exitCode: 0 }]);
    const panel = makeLiveRunPanel();
    const readVerifyReason = vi.fn();
    const notificationManager = {
      onAiParseSuccess: vi.fn(),
      onAiParseNeedsInput: vi.fn(),
    };

    await aiParseLoop({
      processManager: pm as any,
      liveRunPanel: panel as any,
      granularity: "tasks",
      readVerifyReason,
      notificationManager: notificationManager as any,
      parsedPlanPath: "/workspace/.claudeloop/ai-parsed-plan.md",
    });

    expect(notificationManager.onAiParseSuccess).toHaveBeenCalledWith(
      "/workspace/.claudeloop/ai-parsed-plan.md",
    );
  });

  it("calls notificationManager.onAiParseNeedsInput on verify-failed", async () => {
    const pm = makeProcessManager([{ exitCode: 2 }]);
    const panel = makeLiveRunPanel();
    const readVerifyReason = vi.fn().mockResolvedValue("Missing req");
    const notificationManager = {
      onAiParseSuccess: vi.fn(),
      onAiParseNeedsInput: vi.fn(),
    };

    const promise = aiParseLoop({
      processManager: pm as any,
      liveRunPanel: panel as any,
      granularity: "tasks",
      readVerifyReason,
      notificationManager: notificationManager as any,
      parsedPlanPath: "/workspace/.claudeloop/ai-parsed-plan.md",
    });

    await vi.waitFor(() => {
      expect(notificationManager.onAiParseNeedsInput).toHaveBeenCalled();
    });

    panel._triggerAction("ai-parse-abort");
    await promise;
  });

  it("removes retry button after max attempts", async () => {
    const pm = makeProcessManager([
      { exitCode: 2 }, { exitCode: 2 }, { exitCode: 2 }, { exitCode: 2 },
    ]);
    const panel = makeLiveRunPanel();
    const readVerifyReason = vi.fn().mockResolvedValue("Issue");

    const promise = aiParseLoop({
      processManager: pm as any,
      liveRunPanel: panel as any,
      granularity: "tasks",
      readVerifyReason,
    });

    // Retry twice (attempts 1, 2)
    for (let i = 0; i < 2; i++) {
      await vi.waitFor(() => {
        expect(panel.onVerifyFailed).toHaveBeenCalledTimes(i + 1);
      });
      panel._triggerAction("ai-parse-retry");
    }

    // 3rd failure: attempt=3 which equals MAX_RETRIES
    await vi.waitFor(() => {
      expect(panel.onVerifyFailed).toHaveBeenCalledTimes(3);
    });
    const lastCall = panel.onVerifyFailed.mock.calls[2][0];
    expect(lastCall.attempt).toBe(3);
    expect(lastCall.maxAttempts).toBe(3);

    // Retry at max → guard returns aborted
    panel._triggerAction("ai-parse-retry");
    const result = await promise;
    expect(result.outcome).toBe("aborted");
  });
});
