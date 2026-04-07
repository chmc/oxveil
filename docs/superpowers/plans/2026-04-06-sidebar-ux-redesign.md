# Sidebar UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native tree view sidebar (Phases + Past Runs) with a unified webview panel that adapts to 7 context-aware states, providing clear onboarding and actionable UX.

**Architecture:** Single `WebviewViewProvider` registered in the sidebar activity bar. The provider renders HTML for one of 7 states (not-found, empty, ready, running, stopped, failed, completed) based on `deriveViewState()`. State updates flow from `SessionState` events through `sessionWiring.ts` to the webview via `postMessage`. User actions in the webview send messages back to the extension, which dispatches existing VS Code commands.

**Tech Stack:** VS Code Webview API (`WebviewViewProvider`), inline HTML/CSS with `--vscode-*` theme variables, VS Code codicons font, Vitest for testing.

**Spec:** `docs/superpowers/specs/2026-04-06-sidebar-ux-redesign-design.md`

---

### Task 1: State Detection — `deriveViewState()`

**Files:**
- Create: `src/views/sidebarState.ts`
- Test: `src/test/unit/views/sidebarState.test.ts`

- [ ] **Step 1: Write failing tests for deriveViewState**

```typescript
// src/test/unit/views/sidebarState.test.ts
import { describe, it, expect } from "vitest";
import { deriveViewState } from "../../views/sidebarState";
import type { ProgressState } from "../../types";

const noProgress: ProgressState | undefined = undefined;
const allPending: ProgressState = {
  phases: [
    { number: 1, title: "A", status: "pending" },
    { number: 2, title: "B", status: "pending" },
  ],
  totalPhases: 2,
};
const partial: ProgressState = {
  phases: [
    { number: 1, title: "A", status: "completed" },
    { number: 2, title: "B", status: "pending" },
  ],
  totalPhases: 2,
};
const allDone: ProgressState = {
  phases: [
    { number: 1, title: "A", status: "completed" },
    { number: 2, title: "B", status: "completed" },
  ],
  totalPhases: 2,
};
const hasFailed: ProgressState = {
  phases: [
    { number: 1, title: "A", status: "completed" },
    { number: 2, title: "B", status: "failed" },
  ],
  totalPhases: 2,
};

describe("deriveViewState", () => {
  it("returns not-found when not detected", () => {
    expect(deriveViewState("not-found", "idle", false, noProgress)).toBe("not-found");
  });
  it("returns not-found for version-incompatible", () => {
    expect(deriveViewState("version-incompatible", "idle", false, noProgress)).toBe("not-found");
  });
  it("returns empty when detected, idle, no plan, no progress", () => {
    expect(deriveViewState("detected", "idle", false, noProgress)).toBe("empty");
  });
  it("returns ready when plan detected and idle", () => {
    expect(deriveViewState("detected", "idle", true, allPending)).toBe("ready");
  });
  it("returns running when status is running", () => {
    expect(deriveViewState("detected", "running", true, partial)).toBe("running");
  });
  it("returns completed when done and all phases complete", () => {
    expect(deriveViewState("detected", "done", true, allDone)).toBe("completed");
  });
  it("returns stopped when done but phases incomplete without failure", () => {
    expect(deriveViewState("detected", "done", true, partial)).toBe("stopped");
  });
  it("returns failed when status is failed", () => {
    expect(deriveViewState("detected", "failed", true, hasFailed)).toBe("failed");
  });
  it("returns stopped on idle with orphaned partial progress", () => {
    expect(deriveViewState("detected", "idle", true, partial)).toBe("stopped");
  });
  it("returns failed on idle with orphaned failed progress", () => {
    expect(deriveViewState("detected", "idle", true, hasFailed)).toBe("failed");
  });
  it("returns ready when idle with plan but no progress", () => {
    expect(deriveViewState("detected", "idle", true, noProgress)).toBe("ready");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/unit/views/sidebarState.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement deriveViewState and SidebarState types**

```typescript
// src/views/sidebarState.ts
import type {
  DetectionStatus,
  SessionStatus,
  PhaseStatus,
  ProgressState,
  PhaseState,
} from "../types";

export type SidebarView =
  | "not-found"
  | "empty"
  | "ready"
  | "running"
  | "stopped"
  | "failed"
  | "completed";

export interface SidebarState {
  view: SidebarView;
  notFoundReason?: "not-installed" | "version-incompatible";
  plan?: {
    filename: string;
    phases: PhaseView[];
  };
  session?: {
    elapsed: string;
    cost?: string;
    todos?: { done: number; total: number };
    currentPhase?: number;
    attemptCount?: number;
    maxRetries?: number;
    errorSnippet?: string;
  };
  archives: ArchiveView[];
  folders?: FolderView[];
  activeFolder?: string;
}

export interface PhaseView {
  number: number | string;
  title: string;
  status: PhaseStatus;
  duration?: string;
  attempts?: number;
}

export interface ArchiveView {
  name: string;
  label: string;
  date: string;
  phaseCount: number;
  duration?: string;
  status: "completed" | "failed" | "unknown";
}

export interface FolderView {
  uri: string;
  name: string;
  sessionStatus: SessionStatus;
}

export interface ProgressUpdate {
  phases: PhaseView[];
  elapsed: string;
  cost?: string;
  todos?: { done: number; total: number };
  currentPhase?: number;
  attemptCount?: number;
  maxRetries?: number;
}

export function deriveViewState(
  detection: DetectionStatus,
  sessionStatus: SessionStatus,
  planDetected: boolean,
  progress: ProgressState | undefined,
): SidebarView {
  if (detection !== "detected") return "not-found";
  if (sessionStatus === "running") return "running";
  if (sessionStatus === "failed") return "failed";
  if (sessionStatus === "done") {
    const allCompleted =
      progress?.phases.length &&
      progress.phases.every((p) => p.status === "completed");
    return allCompleted ? "completed" : "stopped";
  }
  // idle — check for orphaned progress (extension restart after crash)
  if (progress?.phases.some((p) => p.status === "failed")) return "failed";
  if (
    progress?.phases.some((p) => p.status === "completed") &&
    progress?.phases.some((p) => p.status === "pending")
  )
    return "stopped";
  if (!planDetected && !progress) return "empty";
  return "ready";
}

export function mapPhases(phases: PhaseState[]): PhaseView[] {
  return phases.map((p) => ({
    number: p.number,
    title: p.title,
    status: p.status,
    duration: p.started && p.completed
      ? formatDuration(
          new Date(p.completed).getTime() - new Date(p.started).getTime(),
        )
      : undefined,
    attempts: p.attempts,
  }));
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/unit/views/sidebarState.test.ts`
Expected: All 11 tests PASS

- [ ] **Step 5: Add tests for mapPhases and formatDuration**

```typescript
// Append to sidebarState.test.ts
import { mapPhases, formatDuration } from "../../views/sidebarState";

describe("formatDuration", () => {
  it("formats seconds", () => expect(formatDuration(32000)).toBe("32s"));
  it("formats minutes", () => expect(formatDuration(120000)).toBe("2m"));
  it("formats minutes and seconds", () => expect(formatDuration(128000)).toBe("2m 8s"));
});

describe("mapPhases", () => {
  it("maps PhaseState to PhaseView", () => {
    const result = mapPhases([
      { number: 1, title: "Setup", status: "completed", started: "2026-01-01T00:00:00Z", completed: "2026-01-01T00:00:32Z" },
      { number: 2, title: "Build", status: "pending" },
    ]);
    expect(result).toEqual([
      { number: 1, title: "Setup", status: "completed", duration: "32s", attempts: undefined },
      { number: 2, title: "Build", status: "pending", duration: undefined, attempts: undefined },
    ]);
  });
});
```

- [ ] **Step 6: Run all tests, verify pass**

Run: `npx vitest run src/test/unit/views/sidebarState.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/views/sidebarState.ts src/test/unit/views/sidebarState.test.ts
git commit -m "feat: add deriveViewState and sidebar state types"
```

---

### Task 2: Message Types — `sidebarMessages.ts`

**Files:**
- Create: `src/views/sidebarMessages.ts`
- Test: `src/test/unit/views/sidebarMessages.test.ts`

- [ ] **Step 1: Write failing test for message dispatch**

```typescript
// src/test/unit/views/sidebarMessages.test.ts
import { describe, it, expect, vi } from "vitest";
import { dispatchSidebarMessage } from "../../views/sidebarMessages";

describe("dispatchSidebarMessage", () => {
  it("dispatches start command", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "start" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.start");
  });

  it("dispatches resume with phase object", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "resume", phase: 3 }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.runFromPhase", { phaseNumber: 3 });
  });

  it("dispatches stop command", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "stop" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.stop");
  });

  it("dispatches createPlan", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "createPlan" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.createPlan");
  });

  it("dispatches editPlan by opening the plan file", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "editPlan" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.createPlan");
  });

  it("dispatches configure", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "configure" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.openConfigWizard");
  });

  it("dispatches retry with phase object", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "retry", phase: 2 }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.runFromPhase", { phaseNumber: 2 });
  });

  it("dispatches skip (markComplete) with phase object", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "skip", phase: 2 }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.markPhaseComplete", { phaseNumber: 2 });
  });

  it("dispatches restart as reset then start", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "restart" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.reset");
    // Note: start must be triggered after reset completes; the command handler chains this
  });

  it("dispatches install", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "install" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.install");
  });

  it("dispatches setPath by opening settings", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "setPath" }, exec);
    expect(exec).toHaveBeenCalledWith("workbench.action.openSettings", "oxveil.claudeloopPath");
  });

  it("dispatches forceUnlock", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "forceUnlock" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.forceUnlock");
  });

  it("dispatches aiParse", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "aiParse" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.aiParsePlan");
  });

  it("dispatches planChat", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "planChat" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.openPlanChat");
  });

  it("dispatches viewLog with phase object", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "openLog", phase: 2 }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.viewLog", { phaseNumber: 2 });
  });

  it("dispatches viewDiff with phase object", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "openDiff", phase: 1 }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.viewDiff", { phaseNumber: 1 });
  });

  it("dispatches openReplay with archive name", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "openReplay", archive: "20260406" }, exec);
    expect(exec).toHaveBeenCalledWith("oxveil.archiveReplay", "20260406");
  });

  it("ignores unknown commands", () => {
    const exec = vi.fn();
    dispatchSidebarMessage({ command: "unknown" } as any, exec);
    expect(exec).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/unit/views/sidebarMessages.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement message types and dispatch**

```typescript
// src/views/sidebarMessages.ts

/** Messages sent from the webview to the extension. */
export type SidebarCommand =
  | { command: "install" }
  | { command: "setPath" }
  | { command: "createPlan" }
  | { command: "openPlan" }
  | { command: "editPlan" }
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
  | { command: "planChat" }
  | { command: "openTimeline" }
  | { command: "openGraph" }
  | { command: "openLog"; phase?: number }
  | { command: "openDiff"; phase?: number }
  | { command: "openReplay"; archive: string }
  | { command: "restoreArchive"; archive: string }
  | { command: "forceUnlock" }
  | { command: "reset" }
  | { command: "refreshArchives" }
  // selectFolder deferred to multi-root follow-up
  ;

/** Messages sent from the extension to the webview. */
export type SidebarUpdate =
  | { type: "fullState"; state: import("./sidebarState").SidebarState }
  | { type: "progressUpdate"; update: import("./sidebarState").ProgressUpdate };

type ExecuteCommand = (command: string, ...args: any[]) => void;

// Simple commands: sidebar message → VS Code command (no arguments)
const COMMAND_MAP: Record<string, string> = {
  install: "oxveil.install",
  createPlan: "oxveil.createPlan",
  openPlan: "oxveil.createPlan",
  editPlan: "oxveil.createPlan",   // createPlan opens existing if present
  configure: "oxveil.openConfigWizard",
  start: "oxveil.start",
  stop: "oxveil.stop",
  restart: "oxveil.reset",          // Reset clears state; user starts fresh
  aiParse: "oxveil.aiParsePlan",
  planChat: "oxveil.openPlanChat",
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
): void {
  // setPath opens VS Code settings directly (no oxveil command exists)
  if (msg.command === "setPath") {
    executeCommand("workbench.action.openSettings", "oxveil.claudeloopPath");
    return;
  }

  const simple = COMMAND_MAP[msg.command];
  if (simple) {
    executeCommand(simple);
    return;
  }

  // Phase commands wrap in { phaseNumber } to match commands.ts signature
  const phaseCmd = PHASE_COMMAND_MAP[msg.command];
  if (phaseCmd && "phase" in msg) {
    executeCommand(phaseCmd, { phaseNumber: msg.phase });
    return;
  }

  const archiveCmd = ARCHIVE_COMMAND_MAP[msg.command];
  if (archiveCmd && "archive" in msg) {
    executeCommand(archiveCmd, msg.archive);
    return;
  }

  // openLog/openDiff also wrap in { phaseNumber }
  if (msg.command === "openLog") {
    executeCommand("oxveil.viewLog", "phase" in msg ? { phaseNumber: msg.phase } : undefined);
    return;
  }

  if (msg.command === "openDiff") {
    executeCommand("oxveil.viewDiff", "phase" in msg ? { phaseNumber: msg.phase } : undefined);
    return;
  }

  // Multi-root folder selection — handled by sidebar panel directly (not a registered command)
  // The sidebar panel's message handler calls sessionManager.setActiveFolder(uri) directly
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/unit/views/sidebarMessages.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/sidebarMessages.ts src/test/unit/views/sidebarMessages.test.ts
git commit -m "feat: add sidebar message types and dispatch"
```

---

### Task 3: HTML Rendering — `sidebarHtml.ts`

**Files:**
- Create: `src/views/sidebarHtml.ts`
- Test: `src/test/unit/views/sidebarHtml.test.ts`

This is the largest task. The HTML renderer produces a complete page for each state using VS Code CSS custom properties and codicon font. Follow the existing pattern in `src/views/liveRunHtml.ts` — inline `<style>`, nonce-gated `<script>`, message passing via `acquireVsCodeApi()`.

- [ ] **Step 1: Write failing tests for HTML rendering**

Test that each state produces expected HTML structure:

```typescript
// src/test/unit/views/sidebarHtml.test.ts
import { describe, it, expect } from "vitest";
import { renderSidebar } from "../../views/sidebarHtml";
import type { SidebarState } from "../../views/sidebarState";

const nonce = "test-nonce";
const csp = "https://mock.csp";

describe("renderSidebar", () => {
  it("renders loading state when no state provided", () => {
    const html = renderSidebar(nonce, csp);
    expect(html).toContain("Initializing");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain(`nonce-${nonce}`);
  });

  it("renders not-found state", () => {
    const state: SidebarState = {
      view: "not-found",
      notFoundReason: "not-installed",
      archives: [],
    };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("claudeloop not found");
    expect(html).toContain("Install");
  });

  it("renders empty state", () => {
    const state: SidebarState = { view: "empty", archives: [] };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("Create a Plan");
    expect(html).toContain("How it works");
  });

  it("renders ready state with phases and actions", () => {
    const state: SidebarState = {
      view: "ready",
      plan: {
        filename: "PLAN.md",
        phases: [
          { number: 1, title: "Setup", status: "pending" },
          { number: 2, title: "Build", status: "pending" },
        ],
      },
      archives: [],
    };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("PLAN.md");
    expect(html).toContain("Ready");
    expect(html).toContain("Start");
    expect(html).toContain("AI Parse");
    expect(html).toContain("Setup");
    expect(html).toContain("Build");
  });

  it("renders running state with progress", () => {
    const state: SidebarState = {
      view: "running",
      plan: {
        filename: "PLAN.md",
        phases: [
          { number: 1, title: "Setup", status: "completed", duration: "32s" },
          { number: 2, title: "Build", status: "in_progress" },
          { number: 3, title: "Test", status: "pending" },
        ],
      },
      session: { elapsed: "2m 40s", cost: "$0.42", currentPhase: 2, attemptCount: 1 },
      archives: [],
    };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("Running");
    expect(html).toContain("Stop");
    expect(html).toContain("$0.42");
  });

  it("renders stopped state with resume action", () => {
    const state: SidebarState = {
      view: "stopped",
      plan: {
        filename: "PLAN.md",
        phases: [
          { number: 1, title: "Setup", status: "completed", duration: "32s" },
          { number: 2, title: "Build", status: "pending" },
        ],
      },
      archives: [],
    };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("Stopped");
    expect(html).toContain("Resume");
  });

  it("renders failed state with retry and error snippet", () => {
    const state: SidebarState = {
      view: "failed",
      plan: {
        filename: "PLAN.md",
        phases: [
          { number: 1, title: "Setup", status: "completed" },
          { number: 2, title: "Build", status: "failed", attempts: 3 },
        ],
      },
      session: { elapsed: "5m", errorSnippet: "Error: test failed" },
      archives: [],
    };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("Failed");
    expect(html).toContain("Retry");
    expect(html).toContain("Skip");
    expect(html).toContain("Error: test failed");
  });

  it("renders completed state with summary", () => {
    const state: SidebarState = {
      view: "completed",
      plan: {
        filename: "PLAN.md",
        phases: [
          { number: 1, title: "Setup", status: "completed", duration: "32s" },
          { number: 2, title: "Build", status: "completed", duration: "2m" },
        ],
      },
      session: { elapsed: "2m 32s", cost: "$1.23" },
      archives: [
        { name: "20260406", label: "PLAN.md", date: "Just now", phaseCount: 2, duration: "2m 32s", status: "completed" },
      ],
    };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("Completed");
    expect(html).toContain("All 2 phases completed");
    expect(html).toContain("Replay");
  });

  it("renders archives section", () => {
    const state: SidebarState = {
      view: "ready",
      plan: { filename: "PLAN.md", phases: [] },
      archives: [
        { name: "a1", label: "Test Plan", date: "Mar 28", phaseCount: 3, duration: "30s", status: "completed" },
        { name: "a2", label: "Other", date: "Mar 29", phaseCount: 4, status: "failed" },
      ],
    };
    const html = renderSidebar(nonce, csp, state);
    expect(html).toContain("Recent Runs");
    expect(html).toContain("Test Plan");
    expect(html).toContain("Mar 28");
  });

  it("includes CSP meta tag", () => {
    const html = renderSidebar(nonce, csp);
    expect(html).toContain(`nonce-${nonce}`);
    expect(html).toContain(csp);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/unit/views/sidebarHtml.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement renderSidebar**

Create `src/views/sidebarHtml.ts`. This is a large file (~400 lines). Follow the pattern established in `src/views/liveRunHtml.ts`:

Key structure:
- `renderSidebar(nonce, cspSource, state?)` → full HTML document
- Private helper functions: `renderNotFound()`, `renderEmpty()`, `renderReady()`, `renderRunning()`, `renderStopped()`, `renderFailed()`, `renderCompleted()`, `renderArchives()`, `renderPhaseList()`, `renderActionBar()`
- CSS uses `var(--vscode-*)` theme variables for all colors
- Icons use codicon classes: `codicon-check`, `codicon-error`, `codicon-sync~spin`, `codicon-circle-outline`, `codicon-debug-pause`
- All buttons call `vscode.postMessage({ command: '...' })` via onclick handlers
- Loading state is the default HTML when `state` is undefined
- The `<script>` block handles `window.addEventListener("message", ...)` for `fullState` and `progressUpdate` messages, re-rendering the appropriate sections

Implementation notes:
- Reference `src/views/liveRunHtml.ts` for CSP, nonce, and acquireVsCodeApi pattern
- Reference `src/views/configWizardHtml.ts` for form/button styling pattern
- The `progressUpdate` handler should update phase list, progress bar, and info bar DOM nodes directly (by ID) without full page re-render
- The `fullState` handler replaces the entire `#content` div innerHTML

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/unit/views/sidebarHtml.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/sidebarHtml.ts src/test/unit/views/sidebarHtml.test.ts
git commit -m "feat: add sidebar HTML rendering for all states"
```

---

### Task 4: Sidebar Panel Provider — `sidebarPanel.ts`

**Files:**
- Create: `src/views/sidebarPanel.ts`
- Test: `src/test/unit/views/sidebarPanel.test.ts`

This is the `WebviewViewProvider` that VS Code calls to populate the sidebar. Follow the DI pattern from `src/views/liveRunPanel.ts`.

- [ ] **Step 1: Write failing tests**

```typescript
// src/test/unit/views/sidebarPanel.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SidebarPanel } from "../../views/sidebarPanel";
import type { SidebarState } from "../../views/sidebarState";

function makeMockWebviewView() {
  let messageHandler: ((msg: any) => void) | undefined;
  return {
    webview: {
      html: "",
      cspSource: "https://mock.csp",
      options: {} as any,
      postMessage: vi.fn(),
      onDidReceiveMessage: vi.fn((cb) => { messageHandler = cb; }),
    },
    onDidDispose: vi.fn((cb: () => void) => ({ dispose: vi.fn() })),
    _simulateMessage(msg: any) { messageHandler?.(msg); },
  };
}

function makeDeps() {
  return {
    executeCommand: vi.fn(),
  };
}

describe("SidebarPanel", () => {
  let panel: SidebarPanel;
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
    panel = new SidebarPanel(deps);
  });

  it("sets HTML on resolveWebviewView", () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    expect(view.webview.html).toContain("<!DOCTYPE html>");
    expect(view.webview.html).toContain("Initializing");
  });

  it("enables scripts on webview", () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    expect(view.webview.options.enableScripts).toBe(true);
  });

  it("sends fullState to webview on updateState", () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    const state: SidebarState = { view: "empty", archives: [] };
    panel.updateState(state);
    expect(view.webview.postMessage).toHaveBeenCalledWith({
      type: "fullState",
      state,
    });
  });

  it("dispatches webview messages to commands", () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    view._simulateMessage({ command: "start" });
    expect(deps.executeCommand).toHaveBeenCalledWith("oxveil.start");
  });

  it("buffers state when no webview is resolved and renders into initial HTML", () => {
    const state: SidebarState = { view: "ready", archives: [], plan: { filename: "PLAN.md", phases: [] } };
    panel.updateState(state);
    // No error thrown
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    // Buffered state is rendered into initial HTML, not sent via postMessage
    expect(view.webview.html).toContain("PLAN.md");
    expect(view.webview.postMessage).not.toHaveBeenCalled();
  });

  it("sends progressUpdate to webview", () => {
    const view = makeMockWebviewView();
    panel.resolveWebviewView(view as any);
    const update = { phases: [], elapsed: "1m", currentPhase: 1 };
    panel.sendProgressUpdate(update);
    expect(view.webview.postMessage).toHaveBeenCalledWith({
      type: "progressUpdate",
      update,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/unit/views/sidebarPanel.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SidebarPanel**

```typescript
// src/views/sidebarPanel.ts
import { randomBytes } from "node:crypto";
import { renderSidebar } from "./sidebarHtml";
import { dispatchSidebarMessage } from "./sidebarMessages";
import type { SidebarState, ProgressUpdate } from "./sidebarState";
import type { SidebarCommand } from "./sidebarMessages";

export interface SidebarPanelDeps {
  executeCommand: (command: string, ...args: any[]) => void;
}

interface Webview {
  html: string;
  cspSource: string;
  options: { enableScripts?: boolean };
  postMessage: (msg: any) => void;
  onDidReceiveMessage: (cb: (msg: any) => void) => void;
}

interface WebviewView {
  webview: Webview;
  onDidDispose: (cb: () => void) => { dispose: () => void };
}

export class SidebarPanel {
  static readonly viewType = "oxveil.sidebar";

  private _view: WebviewView | undefined;
  private _pendingState: SidebarState | undefined;
  private readonly _deps: SidebarPanelDeps;

  constructor(deps: SidebarPanelDeps) {
    this._deps = deps;
  }

  resolveWebviewView(webviewView: WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    const nonce = randomBytes(16).toString("hex");
    webviewView.webview.html = renderSidebar(
      nonce,
      webviewView.webview.cspSource,
      this._pendingState,
    );

    webviewView.webview.onDidReceiveMessage((msg: SidebarCommand) => {
      dispatchSidebarMessage(msg, this._deps.executeCommand);
    });

    webviewView.onDidDispose(() => {
      this._view = undefined;
    });

    // If state was buffered before view resolved, it was already rendered
    // into the initial HTML via renderSidebar(). No need to also postMessage.
    this._pendingState = undefined;
  }

  updateState(state: SidebarState): void {
    if (this._view) {
      this._postMessage({ type: "fullState", state });
    } else {
      this._pendingState = state;
    }
  }

  sendProgressUpdate(update: ProgressUpdate): void {
    this._postMessage({ type: "progressUpdate", update });
  }

  private _postMessage(msg: any): void {
    this._view?.webview.postMessage(msg);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/unit/views/sidebarPanel.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/sidebarPanel.ts src/test/unit/views/sidebarPanel.test.ts
git commit -m "feat: add SidebarPanel WebviewViewProvider"
```

---

### Task 5: Register Sidebar in package.json and Extension

**Files:**
- Modify: `package.json` — add webview view, keep tree views temporarily
- Modify: `src/extension.ts` — register SidebarPanel provider
- Modify: `src/activateViews.ts` — export sidebar panel creation

- [ ] **Step 1: Add webview view to package.json**

In `package.json`, add the webview view alongside existing tree views (parallel registration during migration):

```json
"views": {
  "oxveil": [
    {
      "type": "webview",
      "id": "oxveil.sidebar",
      "name": "Oxveil"
    },
    { "id": "oxveil.phases", "name": "Phases" },
    { "id": "oxveil.archive", "name": "Past Runs" }
  ]
}
```

- [ ] **Step 2: Register provider in extension.ts**

Add to `src/extension.ts` activation:

```typescript
import { SidebarPanel } from "./views/sidebarPanel";

// In activate():
const sidebarPanel = new SidebarPanel({
  executeCommand: vscode.commands.executeCommand,
});
context.subscriptions.push(
  vscode.window.registerWebviewViewProvider(
    SidebarPanel.viewType,
    sidebarPanel,
    { webviewOptions: { retainContextWhenHidden: true } },
  ),
);
```

- [ ] **Step 3: Build and verify sidebar appears**

Run: `npm run compile` (or `npm run watch`)
Launch Extension Development Host and verify:
- The "Oxveil" sidebar shows both the new webview (showing "Initializing...") and the old tree views
- No errors in Developer Tools console

- [ ] **Step 4: Commit**

```bash
git add package.json src/extension.ts
git commit -m "feat: register sidebar webview provider alongside tree views"
```

---

### Task 6: Wire Session Events to Sidebar

**Files:**
- Modify: `src/sessionWiring.ts` — add sidebar panel updates
- Modify: `src/extension.ts` — pass sidebar panel to wiring context
- Modify: `src/workspaceSetup.ts` — if sidebar needs folder updates

- [ ] **Step 1: Add SidebarPanel to SessionWiringDeps**

In `src/sessionWiring.ts`, add to `SessionWiringDeps`:

```typescript
sidebarPanel?: SidebarPanel;
```

- [ ] **Step 2: Add required fields to SessionWiringDeps**

Add these fields to `SessionWiringDeps` in `src/sessionWiring.ts`:

```typescript
sidebarPanel?: SidebarPanel;
detectionStatus?: DetectionStatus;        // from activateDetection result
planDetected?: boolean;                    // from plan file watcher
planFilename?: string;                     // e.g. "PLAN.md"
getArchives?: () => ArchiveView[];         // reads current archive list
```

- [ ] **Step 3: Wire state-changed events to sidebar**

In `wireSessionEvents()`, add sidebar updates in the `state-changed` handler. Build `SidebarState` using `deriveViewState()` and send via `sidebarPanel.updateState()`:

```typescript
import { deriveViewState, mapPhases } from "./views/sidebarState";
import type { SidebarPanel } from "./views/sidebarPanel";

// In state-changed handler:
if (deps.sidebarPanel) {
  const viewState = deriveViewState(
    deps.detectionStatus ?? "detected",
    to,
    deps.planDetected ?? false,
    session.progress,
  );
  deps.sidebarPanel.updateState({
    view: viewState,
    plan: session.progress ? {
      filename: deps.planFilename ?? "PLAN.md",
      phases: mapPhases(session.progress.phases),
    } : undefined,
    session: to === "running" || to === "done" || to === "failed" ? {
      elapsed: deps.elapsedTimer?.elapsed ?? "0s",
      // cost and todos come from log parsing — populated via progressUpdate
    } : undefined,
    archives: deps.getArchives?.() ?? [],
  });
}
```

Note: `ElapsedTimer` exposes `.elapsed` (not `.current`). See `src/views/elapsedTimer.ts`.

- [ ] **Step 4: Wire phases-changed events to sidebar**

In the `phases-changed` handler, send `progressUpdate`:

```typescript
if (deps.sidebarPanel) {
  deps.sidebarPanel.sendProgressUpdate({
    phases: mapPhases(progress.phases),
    elapsed: deps.elapsedTimer?.elapsed ?? "0s",
    currentPhase: progress.currentPhaseIndex,
  });
}
```

- [ ] **Step 5: Add error snippet extraction for failed state**

When a phase fails (detected in `phases-changed` handler), read the last non-empty line from `.claudeloop/phase-N.log` and include it in the next `fullState` update as `session.errorSnippet`. Add a helper:

```typescript
// In sidebarState.ts
export async function readErrorSnippet(
  workspaceRoot: string,
  phaseNumber: number | string,
  readFile: (path: string) => Promise<string>,
): Promise<string | undefined> {
  try {
    const logPath = `${workspaceRoot}/.claudeloop/phase-${phaseNumber}.log`;
    const content = await readFile(logPath);
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    return lines.length > 0 ? lines[lines.length - 1].slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 6: Pass sidebar panel and deps through extension.ts wiring context**

In `src/extension.ts`, add `sidebarPanel`, `detectionStatus`, `planDetected`, `planFilename`, and `getArchives` to the wiring context object passed to `wireAllSessions()`.

- [ ] **Step 5: Build and test state updates**

Run: `npm run compile`
Launch EDH, create a PLAN.md, verify sidebar transitions from "Empty" → "Ready" showing the plan name and phases.

- [ ] **Step 6: Commit**

```bash
git add src/sessionWiring.ts src/extension.ts src/workspaceSetup.ts
git commit -m "feat: wire session events to sidebar panel"
```

---

### Task 7: Wire Archive Data to Sidebar

**Files:**
- Modify: `src/extension.ts` — pass archive data to sidebar on refresh
- Modify: `src/activateViews.ts` — expose archive refresh for sidebar

- [ ] **Step 1: On archive refresh, update sidebar state**

In `src/extension.ts`, after `refreshArchive()` runs (on state transitions and on command), rebuild and send the full `SidebarState` to the sidebar panel. The archive entries from `ArchiveTreeProvider` need to be mapped to `ArchiveView[]` format.

- [ ] **Step 2: Format archive dates as relative strings**

Add a `formatRelativeDate(iso: string): string` utility to `src/views/sidebarState.ts`:
- "Just now" for <1 min
- "5m ago" for <1 hour
- "Today" / "Yesterday"
- "Mar 28" for older dates

- [ ] **Step 3: Add tests for formatRelativeDate**

- [ ] **Step 4: Build and verify archives appear in sidebar**

Launch EDH with a workspace that has `.claudeloop/archive/` entries. Verify the sidebar "Recent Runs" section shows human-readable dates and plan names.

- [ ] **Step 5: Commit**

```bash
git add src/views/sidebarState.ts src/test/unit/views/sidebarState.test.ts src/extension.ts src/activateViews.ts
git commit -m "feat: wire archive data to sidebar with relative dates"
```

---

### Task 8: Visual Verification — All States

**Files:** None (verification only)

- [ ] **Step 1: Invoke `/visual-verification` skill**

Action: `/visual-verification`

Verify all 7 states render correctly in the Extension Development Host:
1. **Not Found**: Uninstall/rename claudeloop, reload → should show install prompt
2. **Empty**: Ensure no PLAN.md exists → should show "Create a Plan"
3. **Ready**: Create PLAN.md with phases → should show card with Start button
4. **Running**: Start session → should show live progress
5. **Stopped**: Stop session mid-run → should show Resume
6. **Failed**: Let a phase fail all retries → should show Retry/Skip with error
7. **Completed**: Let all phases complete → should show success summary

Check both dark and light themes. Verify codicon icons render correctly. Verify buttons trigger correct commands.

- [ ] **Step 2: Fix any visual issues found**

- [ ] **Step 3: Commit fixes if any**

---

### Task 9: Remove Old Tree Views

**Files:**
- Delete: `src/views/phaseTree.ts`
- Delete: `src/views/archiveTree.ts`
- Delete: `src/views/treeAdapter.ts`
- Delete: `src/test/unit/views/archiveTree.test.ts`
- Modify: `package.json` — remove tree view registrations, phase context menus
- Modify: `src/extension.ts` — remove tree provider setup, remove resolvePhaseItem/resolveArchiveItem
- Modify: `src/activateViews.ts` — remove createArchiveView
- Modify: `src/sessionWiring.ts` — remove phaseTree/onDidChangeTreeData from deps
- Modify: `src/workspaceSetup.ts` — remove phaseTree references
- Modify: `src/commands.ts` — remove resolvePhaseItem parameter, phase commands now receive phase number directly from sidebar messages

- [ ] **Step 1: Remove tree view entries from package.json**

Remove `oxveil.phases` and `oxveil.archive` from `views.oxveil`. Remove phase-related entries from `menus.view/item/context`. Remove archive-related view/title menu entry. Keep the webview view as sole entry:

```json
"views": {
  "oxveil": [
    { "type": "webview", "id": "oxveil.sidebar", "name": "Oxveil" }
  ]
}
```

- [ ] **Step 2: Remove PhaseTreeProvider and related code from extension.ts**

Remove imports, creation, adapter wrapping, tree view registration, and all phaseTree references.

- [ ] **Step 3: Remove ArchiveTreeProvider and createArchiveView**

Remove from `src/activateViews.ts` and `src/extension.ts`.

- [ ] **Step 4: Remove phaseTree/onDidChangeTreeData from sessionWiring.ts**

Remove the `PhaseTreeProvider` dependency and all `phaseTree.update()` / `onDidChangeTreeData.fire()` calls. The sidebar panel is now the sole UI consumer.

- [ ] **Step 5: Remove phaseTree references from workspaceSetup.ts**

Remove `phaseTree.update()` and `phaseTree.removeFolder()` calls.

- [ ] **Step 6: Update commands.ts**

Remove `resolvePhaseItem` parameter. Phase commands (`viewLog`, `viewDiff`, `runFromPhase`, `markPhaseComplete`) now receive phase number directly as an argument (passed from sidebar webview messages).

- [ ] **Step 7: Delete source files and their tests**

```bash
rm src/views/phaseTree.ts src/views/archiveTree.ts src/views/treeAdapter.ts
rm src/test/unit/views/archiveTree.test.ts
```

Also check for and delete any test files that import from the removed files:
- `src/test/unit/views/phaseTree.test.ts` (if it exists — imports `PhaseTreeProvider`)
- Any imports of `treeAdapter` in test files

- [ ] **Step 8: Run all tests to verify nothing is broken**

Run: `npx vitest run`
Expected: All tests PASS (some tests for deleted files should have been removed)

- [ ] **Step 9: Build and verify clean sidebar**

Run: `npm run compile`
Launch EDH → verify only the webview sidebar appears, no tree views.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: remove tree views, sidebar webview is sole UI"
```

---

### Task 10: Final Integration Test & Polish

**Files:**
- Modify: `src/test/integration/extension.test.ts` — update for new sidebar
- Modify: `ARCHITECTURE.md` — update sidebar documentation

- [ ] **Step 1: Update integration tests**

Update `src/test/integration/extension.test.ts` to verify:
- Sidebar webview view is registered with id `oxveil.sidebar`
- No tree views are registered

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Update ARCHITECTURE.md**

Update the sidebar/views section to reflect the new unified webview architecture. Remove references to PhaseTreeProvider and ArchiveTreeProvider.

- [ ] **Step 4: Invoke `/visual-verification` for final check**

Action: `/visual-verification`

Full end-to-end verification of all states, dark/light themes, button actions.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: update architecture for sidebar webview redesign"
```

---

### Task 11: Create ADR for Tree View → Webview Migration

**Files:**
- Create: `docs/adr/NNNN-sidebar-webview-migration.md` (assign next number)
- Modify: `docs/adr/README.md`

- [ ] **Step 1: Create ADR**

Document the decision to replace native tree views with a unified webview sidebar panel. Include context (UX limitations of tree views), decision (single webview with adaptive states), consequences (more implementation effort, loss of native keyboard nav, gain of rich UI control).

- [ ] **Step 2: Update ADR index**

Add entry to `docs/adr/README.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/
git commit -m "docs: add ADR for sidebar webview migration"
```

---

**Note — Multi-root folder selector:** The spec defines a folder selector for multi-root workspaces. This plan implements the `FolderView` types and `selectFolder` message type but does **not** implement the folder selector UI or the `selectFolder` command handler. Multi-root support is deferred to a follow-up task since it requires additional `WorkspaceSessionManager` changes and the current single-folder UX is the immediate priority.

---

## Verification

- [ ] All unit tests pass: `npx vitest run`
- [ ] Extension builds cleanly: `npm run compile`
- [ ] All 7 sidebar states render correctly in EDH (both dark and light themes)
- [ ] Buttons in each state trigger the correct VS Code commands
- [ ] Past runs show human-readable dates and plan names
- [ ] Multi-root workspace shows folder selector (if applicable)
- [ ] No console errors in EDH Developer Tools
- [ ] ARCHITECTURE.md is up to date
