// src/views/sidebarMessages.ts

/** Messages sent from the webview to the extension. */
export type SidebarCommand =
  | { command: "install" }
  | { command: "setPath" }
  | { command: "createPlan" }
  | { command: "openPlan" }
  | { command: "editPlan" }
  | { command: "writePlan" }
  | { command: "configure" }
  | { command: "start" }
  | { command: "stop" }
  | { command: "resume"; phase: number }
  | { command: "restart" }
  | { command: "retry"; phase: number }
  | { command: "skip"; phase: number }
  | { command: "markComplete"; phase: number }
  | { command: "runFromPhase"; phase: number }
  | { command: "aiParse" }
  | { command: "formPlan" }
  | { command: "planChat" }
  | { command: "focusPlanChat" }
  | { command: "showPlanPreview" }
  | { command: "openTimeline" }
  | { command: "openGraph" }
  | { command: "openLog"; phase?: number }
  | { command: "openDiff"; phase?: number }
  | { command: "openReplay"; archive: string }
  | { command: "restoreArchive"; archive: string }
  | { command: "forceUnlock" }
  | { command: "reset" }
  | { command: "refreshArchives" }
  | { command: "discardPlan" }
  | { command: "resumePlan" }
  | { command: "dismissPlan" }
  // selectFolder deferred to multi-root follow-up
  ;

/** Messages sent from the extension to the webview. */
export type SidebarUpdate =
  | { type: "fullState"; html: string }
  | { type: "progressUpdate"; update: import("./sidebarState").ProgressUpdate };

type ExecuteCommand = (command: string, ...args: any[]) => void | Thenable<unknown>;
type ShowError = (message: string) => void;

function safeExec(result: void | Thenable<unknown>, showError?: ShowError): void {
  if (result && typeof (result as any).then === "function") {
    (result as Thenable<unknown>).then(undefined, (err) => {
      console.warn("[Oxveil] Command failed:", err);
      if (showError) {
        const message = err instanceof Error ? err.message : String(err);
        showError(message);
      }
    });
  }
}

// Simple commands: sidebar message → VS Code command (no arguments)
const COMMAND_MAP: Record<string, string> = {
  install: "oxveil.install",
  createPlan: "oxveil.createPlan",
  writePlan: "oxveil.writePlan",
  openPlan: "oxveil.writePlan",
  editPlan: "oxveil.writePlan",   // writePlan opens existing if present
  configure: "oxveil.openConfigWizard",
  start: "oxveil.start",
  stop: "oxveil.stop",
  restart: "oxveil.reset",          // Reset clears state; user starts fresh
  aiParse: "oxveil.aiParsePlan",
  formPlan: "oxveil.formPlan",
  discardPlan: "oxveil.discardPlan",
  planChat: "oxveil.openPlanChat",
  focusPlanChat: "oxveil.focusPlanChat",
  showPlanPreview: "oxveil.showPlanPreview",
  openTimeline: "oxveil.showTimeline",
  openGraph: "oxveil.showDependencyGraph",
  forceUnlock: "oxveil.forceUnlock",
  reset: "oxveil.reset",
  refreshArchives: "oxveil.archiveRefresh",
};

// Phase commands: pass { phaseNumber } to match commands.ts argument shape
const PHASE_COMMAND_MAP: Record<string, string> = {
  resume: "oxveil.runFromPhase",
  retry: "oxveil.runFromPhase",
  skip: "oxveil.markPhaseComplete",
  markComplete: "oxveil.markPhaseComplete",
  runFromPhase: "oxveil.runFromPhase",
};

const ARCHIVE_COMMAND_MAP: Record<string, string> = {
  openReplay: "oxveil.archiveReplay",
  restoreArchive: "oxveil.archiveRestore",
};

export function dispatchSidebarMessage(
  msg: SidebarCommand,
  executeCommand: ExecuteCommand,
  showError?: ShowError,
): void {
  // setPath opens VS Code settings directly (no oxveil command exists)
  if (msg.command === "setPath") {
    safeExec(executeCommand("workbench.action.openSettings", "oxveil.claudeloopPath"), showError);
    return;
  }

  const simple = COMMAND_MAP[msg.command];
  if (simple) {
    safeExec(executeCommand(simple), showError);
    return;
  }

  // Phase commands wrap in { phaseNumber } to match commands.ts signature
  const phaseCmd = PHASE_COMMAND_MAP[msg.command];
  if (phaseCmd && "phase" in msg) {
    safeExec(executeCommand(phaseCmd, { phaseNumber: msg.phase }), showError);
    return;
  }

  const archiveCmd = ARCHIVE_COMMAND_MAP[msg.command];
  if (archiveCmd && "archive" in msg) {
    safeExec(executeCommand(archiveCmd, { archiveName: msg.archive }), showError);
    return;
  }

  // openLog/openDiff also wrap in { phaseNumber }
  if (msg.command === "openLog") {
    safeExec(executeCommand("oxveil.viewLog", "phase" in msg ? { phaseNumber: msg.phase } : undefined), showError);
    return;
  }

  if (msg.command === "openDiff") {
    safeExec(executeCommand("oxveil.viewDiff", "phase" in msg ? { phaseNumber: msg.phase } : undefined), showError);
    return;
  }

  // Multi-root folder selection — handled by sidebar panel directly (not a registered command)
  // The sidebar panel's message handler calls sessionManager.setActiveFolder(uri) directly
}
