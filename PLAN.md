# Live Run Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the VS Code Output Channel with a rich webview panel that shows live run progress — phase dashboard with todo progress, color-coded log stream, and completion summary.

**Architecture:** A new `LiveRunPanel` webview uses message passing to update two sections: a collapsible dashboard rendered from `ProgressState` and a formatted log stream parsed by `logFormatter`. The panel wires into existing `phases-changed` and `log-appended` events, replacing `OutputChannelManager`.

**Tech Stack:** TypeScript, VS Code Webview API, Vitest

**Spec:** `docs/superpowers/specs/2026-04-04-live-run-panel-design.md`

**Incremental delivery:** Each task produces a demoable visual increment with `/visual-verification`.

---

### Visual Mockups

Reference these mockups when implementing the HTML/CSS. Source HTML files are in `docs/superpowers/plans/mockups/`.

**Active run state** — dashboard expanded with phase list, todo progress, and formatted log stream:

![Active run](mockups/live-run-active.png)

**Completed run state** — completion banner with duration/cost summary and "Open Replay" button:

![Completed run](mockups/live-run-completed.png)

**Collapsed dashboard** — phase list collapses to a single-line summary bar, but **todo section stays visible**:

![Collapsed dashboard](mockups/live-run-collapsed.png)

---

### Design Decisions (from critic review)

These decisions simplify the spec where the critics identified over-engineering:

- **No per-phase cost.** Dashboard shows only total cost from `[Session:]` log lines. Per-phase cost deferred until claudeloop emits structured cost data.
- **Cost fallback.** Show "—" when no `[Session:]` lines seen yet.
- **Simple todo display.** Show progress bar (N/T) and current item text from most recent `[Todos: N/T done]` line. Do NOT reconstruct a full checklist from log lines — the data isn't structured enough. The mockup checklist is aspirational; for v1, just show the progress bar + current item.
- **No "Show earlier output" disk read.** The link is present but disabled for v1. Buffer cap is the max visible history.
- **Simple buffer.** `string[]` capped at `liveRunLogLines`. On overflow, `shift()` oldest. On panel open, send full buffer. No `log-trim` protocol needed — the buffer IS the DOM.
- **Log offset tracking.** The `log-appended` event delivers the full file on each change. `LiveRunPanel` tracks byte offset to extract only new content.
- **Panel manages its own meta.** `SessionMeta` is internal to the panel — no caller needs to construct it. `reveal()` takes only `ProgressState` and optional `folderUri`. Panel derives `planName` from progress data and accumulates cost from log lines.
- **Delete OutputChannel in Task 1.** Replace immediately, no dual-wiring.
- **Collapse state.** Simple instance variable initialized from setting. No `workspaceState` needed — resets on each new run naturally.
- **Shared `escapeHtml`.** Extract to `src/utils/html.ts` before using in logFormatter.

---

### File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/utils/html.ts` | Shared `escapeHtml` utility |
| Create | `src/parsers/logFormatter.ts` | Pure function: raw log line → HTML string |
| Create | `src/test/unit/parsers/logFormatter.test.ts` | Unit tests for all log line patterns |
| Create | `src/views/liveRunHtml.ts` | HTML shell + dashboard renderer |
| Create | `src/test/unit/views/liveRunHtml.test.ts` | Unit tests for HTML shell and dashboard |
| Create | `src/views/liveRunPanel.ts` | Panel class with message passing, buffer, lifecycle |
| Create | `src/test/unit/views/liveRunPanel.test.ts` | Unit tests for panel behavior |
| Modify | `src/views/timelineHtml.ts` | Import shared `escapeHtml` instead of local copy |
| Modify | `src/views/configWizardHtml.ts` | Import shared `escapeHtml` instead of local copy |
| Modify | `src/sessionWiring.ts` | Replace `outputManager` with `liveRunPanel` |
| Modify | `src/workspaceSetup.ts` | Update `SessionWiringContext` type |
| Modify | `src/activateViews.ts` | Instantiate `LiveRunPanel`, add to result |
| Modify | `src/extension.ts` | Remove OutputChannel, wire LiveRunPanel |
| Modify | `src/commands.ts` | Register `oxveil.showLiveRun` command |
| Modify | `package.json` | Add command, settings, command palette entry |
| Delete | `src/views/outputChannel.ts` | Replaced by LiveRunPanel |
| Delete | `src/test/unit/views/outputChannel.test.ts` | Tests for removed file |

---

### Task 1: Panel with Live Dashboard, Replacing OutputChannel

**Demo after this task:** Run starts → panel auto-opens showing live phase dashboard. Raw (unformatted) log lines stream below. OutputChannel is gone.

**Files:**
- Create: `src/utils/html.ts`
- Create: `src/views/liveRunHtml.ts`, `src/test/unit/views/liveRunHtml.test.ts`
- Create: `src/views/liveRunPanel.ts`, `src/test/unit/views/liveRunPanel.test.ts`
- Modify: `src/views/timelineHtml.ts`, `src/views/configWizardHtml.ts` (use shared escapeHtml)
- Modify: `src/activateViews.ts`, `src/commands.ts`, `src/sessionWiring.ts`, `src/workspaceSetup.ts`, `src/extension.ts`, `package.json`
- Delete: `src/views/outputChannel.ts`, `src/test/unit/views/outputChannel.test.ts`

- [ ] **Step 1: Extract shared escapeHtml utility**

Create `src/utils/html.ts`:

```typescript
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

Update `src/views/timelineHtml.ts` and `src/views/configWizardHtml.ts`: replace their local `escapeHtml`/`esc` functions with `import { escapeHtml } from "../utils/html"`.

- [ ] **Step 2: Write failing tests for liveRunHtml**

Create `src/test/unit/views/liveRunHtml.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderLiveRunShell, renderDashboardHtml } from "../../../views/liveRunHtml";
import type { ProgressState } from "../../../types";

const nonce = "abc123";
const cspSource = "https://mock.csp";

describe("renderLiveRunShell", () => {
  it("returns valid HTML with CSP", () => {
    const html = renderLiveRunShell(nonce, cspSource);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain(`nonce="${nonce}"`);
  });

  it("contains dashboard and log containers", () => {
    const html = renderLiveRunShell(nonce, cspSource);
    expect(html).toContain('id="dashboard"');
    expect(html).toContain('id="log-container"');
  });

  it("contains message handler script", () => {
    const html = renderLiveRunShell(nonce, cspSource);
    expect(html).toContain("addEventListener");
    expect(html).toContain('"dashboard"');
    expect(html).toContain('"log-append"');
  });

  it("contains CSS for log classes", () => {
    const html = renderLiveRunShell(nonce, cspSource);
    for (const cls of [".log-ts", ".log-tool", ".log-todo", ".log-warn", ".log-error", ".log-phase-header"]) {
      expect(html).toContain(cls);
    }
  });
});

describe("renderDashboardHtml", () => {
  const progress: ProgressState = {
    phases: [
      { number: 1, title: "Setup", status: "completed", started: "2025-01-01 10:00:00", completed: "2025-01-01 10:00:39" },
      { number: 2, title: "Build", status: "in_progress", started: "2025-01-01 10:00:39" },
      { number: 3, title: "Deploy", status: "pending" },
    ],
    totalPhases: 3,
    currentPhaseIndex: 1,
  };

  it("renders completed phase", () => {
    expect(renderDashboardHtml(progress)).toContain("Setup");
  });

  it("renders active phase highlighted", () => {
    const html = renderDashboardHtml(progress);
    expect(html).toContain("phase-active");
    expect(html).toContain("Build");
  });

  it("renders pending phases dimmed", () => {
    const html = renderDashboardHtml(progress);
    expect(html).toContain("phase-pending");
  });

  it("shows cost as dash when unknown", () => {
    expect(renderDashboardHtml(progress)).toContain("—");
  });

  it("shows cost when provided", () => {
    expect(renderDashboardHtml(progress, { totalCost: 1.24 })).toContain("$1.24");
  });

  it("escapes HTML in phase titles", () => {
    const xss: ProgressState = {
      phases: [{ number: 1, title: "<script>alert(1)</script>", status: "pending" }],
      totalPhases: 1,
    };
    expect(renderDashboardHtml(xss)).not.toContain("<script>alert");
  });

  it("renders empty state when no phases", () => {
    const empty: ProgressState = { phases: [], totalPhases: 0 };
    const html = renderDashboardHtml(empty);
    expect(html).toContain("No active run");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/test/unit/views/liveRunHtml.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement liveRunHtml.ts**

Create `src/views/liveRunHtml.ts`. Two exports:

1. `renderLiveRunShell(nonce, cspSource)` — Full HTML document with:
   - CSP meta tag (same pattern as `timelineHtml.ts`)
   - All CSS for dashboard and log styling (reference active run mockup)
   - Empty `<div id="dashboard">` and `<div id="log-container">` containers
   - Nonce-protected `<script>`: handles `dashboard`, `log-append`, `run-finished` messages
   - Auto-scroll: only if user is within 50px of bottom
   - 1-second interval to update elapsed time from `data-started` attribute
   - Posts `toggle-dashboard`, `open-replay` back to extension

2. `renderDashboardHtml(progress, options?)` — HTML fragment:
   - `options?: { totalCost?: number; collapsed?: boolean; todoDone?: number; todoTotal?: number; todoCurrentItem?: string }`
   - Phase list with status icons (✓/↻/✗/○), number, title, duration for completed
   - Active phase highlighted, pending dimmed
   - Cost: show `$X.XX` if `totalCost` provided, "—" otherwise
   - Empty state: "No active run" when no phases
   - Collapse toggle (text link), todo progress bar — stubbed for now, implemented in Task 3

- [ ] **Step 5: Run liveRunHtml tests**

Run: `npx vitest run src/test/unit/views/liveRunHtml.test.ts`
Expected: All PASS

- [ ] **Step 6: Write failing tests for LiveRunPanel**

Create `src/test/unit/views/liveRunPanel.test.ts`:

```typescript
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
    expect(logCalls[1][0].html).not.toContain("line1");
    expect(logCalls[1][0].html).toContain("line3");
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
    const totalHtml = logCalls.map((c: any) => c[0].html).join("");
    expect(totalHtml).not.toContain("line0");
    expect(totalHtml).toContain("line9");
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
});
```

- [ ] **Step 7: Implement LiveRunPanel**

Create `src/views/liveRunPanel.ts`:

- `LiveRunPanelDeps`: `createWebviewPanel`, `executeCommand`, `getConfig`
- No `SessionMeta` in public API. Panel manages meta internally:
  - `_totalCost: number` — accumulated from `[Session:]` log lines
  - `_logOffset: number` — tracks bytes processed to deduplicate full-file deliveries
  - `_logBuffer: string[]` — capped at config `liveRunLogLines`, shift oldest on overflow
  - `_collapsed: boolean` — initialized from config `liveRunDashboardCollapsed`
- `reveal(progress, folderUri?)`: lazy-create panel, set `webview.html` to shell, send dashboard + buffered log
- `onProgressChanged(progress)`: re-render dashboard, send `{ type: "dashboard", html }`
- `onLogAppended(fullContent)`: compare with `_logOffset`, extract new lines only, format (raw for now — Task 2 adds formatting), append to buffer (cap), send `{ type: "log-append", html }`. Parse `[Session:]` lines to update `_totalCost`.
- `onRunFinished(status)`: stub — implemented in Task 3
- `clear()`: reset offset, buffer, cost for new run
- `visible`, `currentFolderUri`, `panel` getters

Log offset deduplication:
```typescript
onLogAppended(fullContent: string): void {
  const newContent = fullContent.slice(this._logOffset);
  this._logOffset = fullContent.length;
  if (!newContent) return;
  // process new lines only
}
```

- [ ] **Step 8: Run panel tests**

Run: `npx vitest run src/test/unit/views/liveRunPanel.test.ts`
Expected: All PASS

- [ ] **Step 9: Wire into extension, delete OutputChannel**

1. **`package.json`**: Add command `oxveil.showLiveRun` ("Oxveil: Show Live Run"), palette entry `when: "oxveil.detected"`. Add settings: `oxveil.liveRunAutoOpen` (boolean, true), `oxveil.liveRunDashboardCollapsed` (boolean, false), `oxveil.liveRunLogLines` (number, 1000, min 100, max 10000).

2. **`src/activateViews.ts`**: Import `LiveRunPanel`. Add to `WebviewPanelsResult`. Instantiate in `createWebviewPanels()`.

3. **`src/commands.ts`**: Add `liveRunPanel?: LiveRunPanel` to `CommandDeps`. Register `oxveil.showLiveRun`: resolve folder, call `liveRunPanel?.reveal(session.progress ?? { phases: [], totalPhases: 0 }, folderUri)`.

4. **`src/sessionWiring.ts`**: Replace `outputManager: OutputChannelManager` with `liveRunPanel?: LiveRunPanel` in `SessionWiringDeps`. In `phases-changed`: call `deps.liveRunPanel?.onProgressChanged(progress)`. Replace `log-appended` handler: call `deps.liveRunPanel?.onLogAppended(content)`. In `state-changed` → `"running"`: auto-open if `liveRunAutoOpen` setting is true.

5. **`src/extension.ts`**: Remove `OutputChannelManager` import and output channel creation. Extract `liveRunPanel` from panels. Replace `outputManager` with `liveRunPanel` in `wiringCtx`. Update notifications `onShowOutput` to reveal live run panel. Add `liveRunPanel` to `registerCommands` deps and `active-session-changed` handler.

6. **Delete** `src/views/outputChannel.ts` and `src/test/unit/views/outputChannel.test.ts`.

- [ ] **Step 10: Run full test suite + type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All pass, no type errors

- [ ] **Step 11: Build and install**

Run: `npm run build`
Action: `/install-dev`

- [ ] **Step 12: Visual verification**

Action: `/visual-verification`

Verify against active run mockup (`mockups/live-run-active.png`):
- "Oxveil: Show Live Run" command appears in command palette
- Panel opens with dark theme, dashboard shows phase list
- Status icons: ✓ completed, ↻ running, ○ pending
- Active phase has highlighted row
- Start a run → panel auto-opens, dashboard updates live
- Raw log lines stream below dashboard (unformatted — formatting in Task 2)
- Close and reopen panel mid-run → buffered content appears
- OutputChannel "Oxveil" entry is gone from Output panel

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: add live run panel with dashboard, replace OutputChannel

LiveRunPanel webview replaces OutputChannelManager. Shows live
phase dashboard with status icons. Raw log stream below.
Auto-opens on run start. Log offset tracking prevents duplicates."
```

---

### Task 2: Formatted Log Stream

**Demo after this task:** Start a run → log lines are color-coded. Tool calls blue, timestamps dimmed, todos green, warnings yellow, errors red.

**Files:**
- Create: `src/parsers/logFormatter.ts`, `src/test/unit/parsers/logFormatter.test.ts`
- Modify: `src/views/liveRunPanel.ts`

- [ ] **Step 1: Write failing tests for log formatter**

Create `src/test/unit/parsers/logFormatter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatLogLine } from "../../../parsers/logFormatter";

describe("formatLogLine", () => {
  it("formats timestamp", () => {
    const html = formatLogLine("[14:31:02] hello");
    expect(html).toContain('<span class="log-ts">[14:31:02]</span>');
  });

  it("formats tool call with path", () => {
    const html = formatLogLine("  [14:31:02] [Tool: Read] src/foo.ts");
    expect(html).toContain('<span class="log-tool">[Tool: Read]</span>');
    expect(html).toContain('<span class="log-path">src/foo.ts</span>');
  });

  it("formats tool call with command", () => {
    const html = formatLogLine('  [14:31:08] [Tool: Bash] npm test');
    expect(html).toContain('<span class="log-tool">[Tool: Bash]</span>');
    expect(html).toContain('<span class="log-cmd">');
  });

  it("formats phase header", () => {
    const html = formatLogLine("[14:00:17] ▶ Executing Phase 3/5: Write tests");
    expect(html).toContain('class="log-phase-header"');
  });

  it("formats todo update", () => {
    const html = formatLogLine('[14:01:51] [Todos: 4/7 done] ▸ "Writing test"');
    expect(html).toContain('class="log-todo"');
  });

  it("formats TodoWrite", () => {
    const html = formatLogLine("[14:01:51] [TodoWrite] 9 items");
    expect(html).toContain('class="log-todo-create"');
  });

  it("formats warning", () => {
    expect(formatLogLine("[14:00:03] ⚠ Plan exists")).toContain('class="log-warn"');
  });

  it("formats success", () => {
    expect(formatLogLine("[14:42:18] ✓ Saved")).toContain('class="log-success"');
  });

  it("formats session summary", () => {
    expect(formatLogLine("[14:09:10] [Session: model=opus cost=$2.40]")).toContain('class="log-session"');
  });

  it("formats error result", () => {
    expect(formatLogLine("[14:00:47] [Result [error]: 204 chars] Error: too large")).toContain('class="log-error"');
  });

  it("formats divider", () => {
    expect(formatLogLine("[14:00:17] ───────────────────")).toContain('class="log-divider"');
  });

  it("formats refactor", () => {
    expect(formatLogLine("[14:33:10] 🔧 Refactoring phase 17...")).toContain('class="log-refactor"');
  });

  it("escapes HTML", () => {
    const html = formatLogLine("[14:00:00] <script>alert('xss')</script>");
    expect(html).not.toContain("<script>");
  });

  it("handles empty line", () => {
    expect(formatLogLine("")).toBe('<div class="log-line">&nbsp;</div>');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/test/unit/parsers/logFormatter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement logFormatter**

Create `src/parsers/logFormatter.ts`. Import `escapeHtml` from `../utils/html`. Reference active run mockup (`mockups/live-run-active.png`).

Pure function `formatLogLine(line: string): string`:
- Extract and dim timestamp `[HH:MM:SS]`
- Pattern priority: divider → phase header → tool call → todo → TodoWrite → session → error → refactor → warning → success → default
- Bash tool args get `.log-cmd` class, other tool args get `.log-path`
- Returns `<div class="log-line">...</div>`
- Empty line → `<div class="log-line">&nbsp;</div>`

- [ ] **Step 4: Run formatter tests**

Run: `npx vitest run src/test/unit/parsers/logFormatter.test.ts`
Expected: All PASS

- [ ] **Step 5: Wire formatter into LiveRunPanel**

Modify `src/views/liveRunPanel.ts`:
- Import `formatLogLine`
- In `onLogAppended()`, format each new line via `formatLogLine()` before buffering and sending

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 7: Build and install**

Run: `npm run build`
Action: `/install-dev`

- [ ] **Step 8: Visual verification**

Action: `/visual-verification`

Verify against active run mockup log section:
- Timestamps `[HH:MM:SS]` dimmed gray
- `[Tool: Read]`, `[Tool: Bash]` blue with paths/commands styled differently
- `[Todos: N/T done]` green
- Phase headers `▶ Executing Phase N/T:` bold blue with badge
- Warnings `⚠` yellow, errors red
- Dividers as horizontal rules
- `[Session:]` summaries in subdued style
- `● thinking...` inline on single line

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add color-coded log formatter

12 log line patterns with distinct styling: tool calls, todos,
phase headers, warnings, errors, session summaries, etc."
```

---

### Task 3: Dashboard Collapse, Todo Progress, and Run Completion

**Demo after this task:** Click collapse → phase list hides, todo progress stays visible. Run completes → green banner with "Open Replay" button.

**Files:**
- Modify: `src/views/liveRunHtml.ts`, `src/test/unit/views/liveRunHtml.test.ts`
- Modify: `src/views/liveRunPanel.ts`, `src/test/unit/views/liveRunPanel.test.ts`
- Modify: `src/sessionWiring.ts`

- [ ] **Step 1: Write failing tests for collapse, todos, and completion**

Add to `src/test/unit/views/liveRunHtml.test.ts`:

```typescript
it("renders collapse toggle", () => {
  expect(renderDashboardHtml(progress)).toContain("dashboard-toggle");
});

it("renders todo progress when provided", () => {
  const html = renderDashboardHtml(progress, { todoDone: 4, todoTotal: 7, todoCurrentItem: "Writing test" });
  expect(html).toContain("todo-progress");
  expect(html).toContain("4/7");
  expect(html).toContain("Writing test");
});

it("omits todo when not provided", () => {
  expect(renderDashboardHtml(progress)).not.toContain("todo-progress");
});

it("renders collapsed summary bar", () => {
  const html = renderDashboardHtml(progress, { collapsed: true });
  expect(html).toContain("dashboard-collapsed");
  expect(html).not.toContain("phase-list");
});

it("shows todo progress even when collapsed", () => {
  const html = renderDashboardHtml(progress, { collapsed: true, todoDone: 2, todoTotal: 5 });
  expect(html).toContain("todo-progress");
});
```

Add `renderCompletionBannerHtml` tests:

```typescript
import { renderCompletionBannerHtml } from "../../../views/liveRunHtml";

describe("renderCompletionBannerHtml", () => {
  it("renders success banner for done", () => {
    const html = renderCompletionBannerHtml("done", { totalCost: 5.99, totalPhases: 5 });
    expect(html).toContain("Run Completed");
    expect(html).toContain("$5.99");
    expect(html).toContain("open-replay");
  });

  it("renders failure banner for failed", () => {
    const html = renderCompletionBannerHtml("failed", { totalCost: 2.0, totalPhases: 3 });
    expect(html).toContain("Run Failed");
  });
});
```

Add to panel tests:

```typescript
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

it("tracks todo progress from log lines", () => {
  const mockPanel = makeMockPanel();
  const deps = makeDeps(mockPanel);
  const panel = new LiveRunPanel(deps);
  panel.reveal(makeProgress());
  mockPanel.webview.postMessage.mockClear();
  panel.onLogAppended('[14:00:00] [Todos: 3/7 done] ▸ "Writing test"\n');
  // Should re-send dashboard with todo data
  const dashCalls = mockPanel.webview.postMessage.mock.calls.filter(
    (c: any) => c[0].type === "dashboard",
  );
  expect(dashCalls.length).toBeGreaterThanOrEqual(1);
});

it("auto-open disabled suppresses reveal", () => {
  // Tested via sessionWiring integration — ensure setting is respected
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npx vitest run`
Expected: New tests FAIL

- [ ] **Step 3: Implement collapse, todos, and completion**

1. **`liveRunHtml.ts`**: Add collapse toggle, collapsed summary bar, todo progress (N/T bar + current item text), `renderCompletionBannerHtml()`. Add CSS for `.dashboard-collapsed`, `.todo-progress`, `.completion-banner`. Reference collapsed mockup and completed mockup.

2. **`liveRunPanel.ts`**:
   - Parse `[Todos: N/T done] ▸ "description"` from log lines → update `_todoDone`, `_todoTotal`, `_todoCurrentItem` → re-send dashboard with todo data
   - Handle `toggle-dashboard` message: flip `_collapsed`, re-send dashboard
   - Handle `open-replay` message: execute `oxveil.openReplayViewer`
   - Implement `onRunFinished(status)`: render completion banner, send `{ type: "run-finished", html }`

3. **`sessionWiring.ts`**: In `state-changed` → `"done"` and `"failed"`: call `deps.liveRunPanel?.onRunFinished(to)`

- [ ] **Step 4: Run all tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All pass

- [ ] **Step 5: Build and install**

Run: `npm run build`
Action: `/install-dev`

- [ ] **Step 6: Visual verification**

Action: `/visual-verification`

Verify against all three mockups:
- **Active** (`mockups/live-run-active.png`): todo progress shows N/T with current item
- **Collapsed** (`mockups/live-run-collapsed.png`): phase list hides, todo progress stays visible
- **Completed** (`mockups/live-run-completed.png`): green banner with ✓, duration, cost, "Open Replay"
- Click "Open Replay" → replay viewer opens
- Failed run → red banner with ✗
- Setting `oxveil.liveRunAutoOpen: false` → panel does NOT auto-open

- [ ] **Step 7: Update documentation**

Review `README.md` and `ARCHITECTURE.md` for Output Channel references. Update to describe Live Run Panel.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: dashboard collapse, todo tracking, run completion

Collapsible dashboard with todo progress bar (always visible).
Completion banner with Open Replay button. Documentation updated."
```
