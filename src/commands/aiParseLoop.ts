import type { IProcessManager, AiParseResult } from "../core/interfaces";
import type { LiveRunPanel } from "../views/liveRunPanel";
import type { NotificationManager } from "../views/notifications";

const MAX_RETRIES = 3;

export interface AiParseLoopResult {
  outcome: "pass" | "continued" | "aborted";
}

export interface AiParseLoopDeps {
  processManager: IProcessManager;
  liveRunPanel: LiveRunPanel;
  granularity: string;
  readVerifyReason: () => Promise<string>;
  options?: { dryRun?: boolean };
  notificationManager?: NotificationManager;
  parsedPlanPath?: string;
}

export async function aiParseLoop(deps: AiParseLoopDeps): Promise<AiParseLoopResult> {
  const { processManager, liveRunPanel, granularity, readVerifyReason, options, notificationManager, parsedPlanPath } = deps;
  let attempt = 0;

  liveRunPanel.revealForAiParse();

  // Initial parse
  let result: AiParseResult = await processManager.aiParse(granularity, options);

  while (true) {
    if (result.exitCode === 0) {
      liveRunPanel.onVerifyPassed({ retryCount: attempt });
      if (parsedPlanPath) {
        notificationManager?.onAiParseSuccess(parsedPlanPath);
      }
      return { outcome: "pass" };
    }

    // Exit code 2: verification failed
    attempt++;
    const reason = await readVerifyReason();
    const atMax = attempt >= MAX_RETRIES;

    liveRunPanel.onVerifyFailed({
      reason,
      attempt: Math.min(attempt, MAX_RETRIES),
      maxAttempts: MAX_RETRIES,
    });
    notificationManager?.onAiParseNeedsInput();

    // Wait for user action
    const action = await waitForAction(liveRunPanel);

    if (action === "ai-parse-abort") {
      return { outcome: "aborted" };
    }

    if (action === "ai-parse-continue") {
      return { outcome: "continued" };
    }

    // action === "ai-parse-retry"
    if (atMax) {
      // Should not happen — retry button hidden at max, but guard anyway
      return { outcome: "aborted" };
    }

    result = await processManager.aiParseFeedback(granularity);
  }
}

function waitForAction(liveRunPanel: LiveRunPanel): Promise<string> {
  return new Promise((resolve) => {
    const unsubscribe = liveRunPanel.onAiParseAction((action) => {
      unsubscribe();
      resolve(action);
    });
  });
}
