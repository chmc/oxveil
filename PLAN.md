# Archive Timeline Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Show Timeline" action to past runs that opens an archived run's phase timeline in a dedicated read-only webview panel with a metadata header bar.

**Architecture:** New `ArchiveTimelinePanel` class manages per-archive webview panels tracked by name. The existing `renderTimelineHtml()` gains an optional `header` parameter that triggers a metadata bar and suppresses the NOW line. A new command `oxveil.archiveTimeline` wires tree item clicks to the panel via the standard `CommandDeps` pattern.

**Tech Stack:** TypeScript, VS Code Webview API, Vitest

**Spec:** `docs/superpowers/specs/2026-03-28-archive-timeline-viewer-design.md`

---

### File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/views/archiveTimelinePanel.ts` | Panel class managing per-archive webview lifecycle |
| Create | `src/test/unit/views/archiveTimelinePanel.test.ts` | Unit tests for archive timeline panel |
| Modify | `src/parsers/timeline.ts` | Export `parseTimestamp` for reuse |
| Modify | `src/views/timelineHtml.ts` | Add optional `header` param, conditional NOW line |
| Modify | `src/test/unit/views/timelineHtml.test.ts` | Tests for header rendering and NOW line suppression |
| Modify | `src/commands.ts` | Register `oxveil.archiveTimeline` command |
| Modify | `src/activateViews.ts` | Instantiate `ArchiveTimelinePanel` |
| Modify | `src/extension.ts` | Wire panel into command deps |
| Modify | `package.json` | Command definition and menu entry |

---

### Task 1: Extend `renderTimelineHtml` with optional header

**Spec:** `docs/superpowers/specs/2026-03-28-archive-timeline-viewer-design.md` §Header Bar, §NOW Line Suppression
**Mockups:** `docs/superpowers/plans/mockups/live-run-completed.{html,png}` (banner style reference), `docs/superpowers/plans/mockups/live-run-active.{html,png}` (NOW line to suppress in archive mode)

**Files:**
- Modify: `src/views/timelineHtml.ts:1-187`
- Modify: `src/test/unit/views/timelineHtml.test.ts`

- [ ] **Step 1: Write failing tests for header rendering**

Add to `src/test/unit/views/timelineHtml.test.ts`:

```typescript
import type { TimelineHeader } from "../../../views/timelineHtml";

const testHeader: TimelineHeader = {
  title: "Test Plan",
  date: "Mar 28",
  duration: "5m",
  status: "completed",
  phaseCount: 3,
};

it("renders header bar when header is provided", () => {
  const html = renderTimelineHtml(makeData(), nonce, cspSource, testHeader);
  expect(html).toContain("Past Run Timeline");
  expect(html).toContain("Test Plan");
  expect(html).toContain("Mar 28");
  expect(html).toContain("3 phases");
  expect(html).toContain("5m");
  expect(html).toContain("READ-ONLY");
});

it("omits NOW line when header is provided", () => {
  const html = renderTimelineHtml(makeData(), nonce, cspSource, testHeader);
  expect(html).not.toContain('class="now-line"');
  expect(html).not.toContain('class="now-label"');
});

it("omits setInterval script when header is provided", () => {
  const html = renderTimelineHtml(makeData(), nonce, cspSource, testHeader);
  expect(html).not.toContain("setInterval");
});

it("renders status icon for completed header", () => {
  const html = renderTimelineHtml(makeData(), nonce, cspSource, testHeader);
  expect(html).toContain("✓");
});

it("renders status icon for failed header", () => {
  const failedHeader = { ...testHeader, status: "failed" };
  const html = renderTimelineHtml(makeData(), nonce, cspSource, failedHeader);
  expect(html).toContain("✗");
});

it("renders question mark icon for unknown status header", () => {
  const unknownHeader = { ...testHeader, status: "unknown" };
  const html = renderTimelineHtml(makeData(), nonce, cspSource, unknownHeader);
  expect(html).toContain("?");
  expect(html).not.toContain("✓");
});

it("still renders NOW line when no header", () => {
  const html = renderTimelineHtml(makeData(), nonce, cspSource);
  expect(html).toContain('class="now-line"');
  expect(html).toContain("setInterval");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/unit/views/timelineHtml.test.ts`
Expected: FAIL — `TimelineHeader` type does not exist, 4th arg not accepted

- [ ] **Step 3: Export `parseTimestamp` from `src/parsers/timeline.ts`**

Add `export` keyword to the existing `parseTimestamp` function (line 3):

```typescript
// Before:
function parseTimestamp(ts: string): number {

// After:
export function parseTimestamp(ts: string): number {
```

- [ ] **Step 4: Add `TimelineHeader` type and update `renderTimelineHtml`**

In `src/views/timelineHtml.ts`, add the type export before the existing functions:

```typescript
export interface TimelineHeader {
  title: string;
  date: string;
  duration: string;
  status: string;
  phaseCount: number;
}
```

Update `renderTimelineHtml` signature:

```typescript
export function renderTimelineHtml(
  data: TimelineData,
  nonce: string,
  cspSource: string,
  header?: TimelineHeader,
): string {
```

Add header bar HTML. After the `nowLineHtml` variable assignment, add:

```typescript
const isArchive = !!header;

const statusIcon = header?.status === "completed" ? "✓"
  : header?.status === "failed" ? "✗"
  : "?";
const statusColor = header?.status === "completed" ? "#2e7d32"
  : header?.status === "failed" ? "#c72e2e"
  : "#888";

const headerBarHtml = header
  ? `<div class="archive-header">
      <span style="color:${statusColor}">${statusIcon}</span>
      <span class="archive-title">${escapeHtml(header.title)}</span>
      <span class="archive-meta">${escapeHtml(header.date)} · ${header.phaseCount} phases · ${escapeHtml(header.duration)}</span>
      <span class="archive-badge">READ-ONLY</span>
    </div>`
  : "";
```

In the CSS `<style>` block, add after the `.now-label` rule:

```css
.archive-header { background: var(--vscode-titleBar-activeBackground, #2d2d3d); padding: 8px 16px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--vscode-panel-border, #444); font-size: 13px; }
.archive-title { font-weight: 600; color: var(--vscode-foreground, #ccc); }
.archive-meta { color: #888; font-size: 11px; }
.archive-badge { margin-left: auto; font-size: 10px; background: #333; color: #888; padding: 2px 6px; border-radius: 3px; }
```

In the `<body>`, change the header text conditionally:

```typescript
const headerTitle = isArchive ? "Past Run Timeline" : "Execution Timeline";
```

Use `headerTitle` in the `.timeline-header` span. Insert `${headerBarHtml}` after the `.timeline-header` div.

Conditionally render NOW line and script:

```typescript
const nowHtml = isArchive ? "" : nowLineHtml;
const scriptHtml = isArchive ? "" : `<script nonce="${nonce}">...</script>`;
```

Use `${nowHtml}` instead of `${nowLineHtml}` in the tracks div. Use `${scriptHtml}` instead of the inline script block.

Add a comment at the top of the function body: `// Serves both live (no header) and archive (with header) timeline views.`

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/test/unit/views/timelineHtml.test.ts`
Expected: All tests PASS (both new header tests and existing 14 backward-compat tests)

- [ ] **Step 6: Commit**

```bash
git add src/parsers/timeline.ts src/views/timelineHtml.ts src/test/unit/views/timelineHtml.test.ts
git commit -m "feat: add optional header to renderTimelineHtml for archive view"
```

---

### Task 2: Create `ArchiveTimelinePanel`

**Spec:** `docs/superpowers/specs/2026-03-28-archive-timeline-viewer-design.md` §Panel Lifecycle, §Webview Content
**Mockups:** `docs/superpowers/plans/mockups/live-run-completed.{html,png}` (header bar visual reference for archive panel)

**Files:**
- Create: `src/views/archiveTimelinePanel.ts`
- Create: `src/test/unit/views/archiveTimelinePanel.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/test/unit/views/archiveTimelinePanel.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
  ViewColumn: { One: 1 },
}));

import {
  ArchiveTimelinePanel,
  type ArchiveTimelineDeps,
} from "../../../views/archiveTimelinePanel";
import type { ProgressState } from "../../../types";
import type { ArchiveMetadata } from "../../../parsers/archive";

function makeProgress(): ProgressState {
  return {
    phases: [
      {
        number: 1,
        title: "Setup",
        status: "completed",
        started: "2025-01-01 10:00:00",
        completed: "2025-01-01 10:02:00",
      },
      {
        number: 2,
        title: "Build",
        status: "completed",
        started: "2025-01-01 10:02:00",
        completed: "2025-01-01 10:05:00",
      },
    ],
    totalPhases: 2,
  };
}

function makeMetadata(): ArchiveMetadata {
  return {
    plan: "Test Plan",
    started: "2025-01-01 10:00:00",
    finished: "2025-01-01 10:05:00",
    status: "completed",
    phasesTotal: 2,
    phasesCompleted: 2,
    phasesFailed: 0,
    claudeloopVersion: "0.4.0",
  };
}

function makeMockPanel() {
  return {
    webview: {
      html: "",
      cspSource: "https://mock.csp",
    },
    reveal: vi.fn(),
    onDidDispose: vi.fn(),
    dispose: vi.fn(),
  };
}

function makeDeps(mockPanel = makeMockPanel()): ArchiveTimelineDeps {
  return {
    createWebviewPanel: vi.fn(() => mockPanel) as any,
  };
}

describe("ArchiveTimelinePanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates webview panel on first reveal", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), makeMetadata());

    expect(deps.createWebviewPanel).toHaveBeenCalledWith(
      "oxveil.archiveTimeline",
      "Timeline: Test Plan",
      1,
      { enableScripts: false, retainContextWhenHidden: false },
    );
  });

  it("renders timeline with header bar", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), makeMetadata());

    expect(mockPanel.webview.html).toContain("Past Run Timeline");
    expect(mockPanel.webview.html).toContain("Test Plan");
    expect(mockPanel.webview.html).toContain("READ-ONLY");
    expect(mockPanel.webview.html).toContain("Setup");
    expect(mockPanel.webview.html).toContain("Build");
  });

  it("does not render NOW line", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), makeMetadata());

    expect(mockPanel.webview.html).not.toContain('class="now-line"');
    expect(mockPanel.webview.html).not.toContain("setInterval");
  });

  it("reuses existing panel for same archive", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), makeMetadata());
    panel.reveal("20250101-100000", makeProgress(), makeMetadata());

    expect(deps.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(mockPanel.reveal).toHaveBeenCalledTimes(1);
  });

  it("creates new panel for different archive", () => {
    const mockPanel1 = makeMockPanel();
    const mockPanel2 = makeMockPanel();
    let callCount = 0;
    const deps: ArchiveTimelineDeps = {
      createWebviewPanel: vi.fn(() => {
        callCount++;
        return callCount === 1 ? mockPanel1 : mockPanel2;
      }) as any,
    };
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), makeMetadata());
    panel.reveal("20250102-120000", makeProgress(), makeMetadata());

    expect(deps.createWebviewPanel).toHaveBeenCalledTimes(2);
  });

  it("removes panel from tracking on dispose", () => {
    const mockPanel = makeMockPanel();
    let disposeCallback: () => void = () => {};
    mockPanel.onDidDispose = vi.fn((cb) => { disposeCallback = cb; });
    const deps = makeDeps(mockPanel);
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), makeMetadata());
    disposeCallback();
    panel.reveal("20250101-100000", makeProgress(), makeMetadata());

    expect(deps.createWebviewPanel).toHaveBeenCalledTimes(2);
  });

  it("uses fallback title when metadata is null", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), null);

    expect(deps.createWebviewPanel).toHaveBeenCalledWith(
      "oxveil.archiveTimeline",
      "Timeline: 20250101-100000",
      1,
      expect.any(Object),
    );
  });

  it("dispose cleans up all panels", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new ArchiveTimelinePanel(deps);

    panel.reveal("20250101-100000", makeProgress(), makeMetadata());
    panel.dispose();

    expect(mockPanel.dispose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/unit/views/archiveTimelinePanel.test.ts`
Expected: FAIL — module `archiveTimelinePanel` does not exist

- [ ] **Step 3: Implement `ArchiveTimelinePanel`**

Create `src/views/archiveTimelinePanel.ts`:

```typescript
import * as vscode from "vscode";
import * as crypto from "node:crypto";
import type { ProgressState } from "../types";
import type { ArchiveMetadata } from "../parsers/archive";
import { computeTimeline, parseTimestamp } from "../parsers/timeline";
import { renderTimelineHtml, type TimelineHeader } from "./timelineHtml";
import { formatDate, computeDuration } from "../parsers/archive";

export interface ArchiveTimelineDeps {
  createWebviewPanel: typeof vscode.window.createWebviewPanel;
}

export class ArchiveTimelinePanel {
  private readonly _deps: ArchiveTimelineDeps;
  private readonly _panels = new Map<string, vscode.WebviewPanel>();

  constructor(deps: ArchiveTimelineDeps) {
    this._deps = deps;
  }

  reveal(
    archiveName: string,
    progress: ProgressState,
    metadata: ArchiveMetadata | null,
  ): void {
    const existing = this._panels.get(archiveName);
    if (existing) {
      existing.reveal();
      return;
    }

    const title = metadata?.plan ?? archiveName;
    const panel = this._deps.createWebviewPanel(
      "oxveil.archiveTimeline",
      `Timeline: ${title}`,
      vscode.ViewColumn.One,
      { enableScripts: false, retainContextWhenHidden: false },
    );

    panel.onDidDispose(() => {
      this._panels.delete(archiveName);
    });

    this._panels.set(archiveName, panel);

    // Use latest phase completion as the "now" for timeline computation
    const finishedDate = this._resolveFinishDate(progress, metadata);
    const data = computeTimeline(progress, finishedDate);
    const nonce = crypto.randomBytes(16).toString("hex");
    const cspSource = panel.webview.cspSource;

    const header: TimelineHeader = {
      title,
      date: metadata ? formatDate(metadata.started) : "",
      duration: this._computePhaseDuration(progress),
      status: metadata?.status ?? "unknown",
      phaseCount: progress.totalPhases,
    };

    panel.webview.html = renderTimelineHtml(data, nonce, cspSource, header);
  }

  dispose(): void {
    for (const panel of this._panels.values()) {
      panel.dispose();
    }
    this._panels.clear();
  }

  private _resolveFinishDate(
    progress: ProgressState,
    metadata: ArchiveMetadata | null,
  ): Date {
    // Find latest completion timestamp from phases using the same parser as computeTimeline
    let latestMs = 0;
    for (const phase of progress.phases) {
      if (phase.completed) {
        const t = parseTimestamp(phase.completed);
        if (t > latestMs) latestMs = t;
      }
    }
    if (latestMs > 0) return new Date(latestMs);

    // Fall back to metadata finished time
    if (metadata?.finished) {
      const t = new Date(metadata.finished).getTime();
      if (!isNaN(t)) return new Date(t);
    }

    // Last resort: use earliest started phase as the "end" to avoid a broken timeline
    // This produces zero-width bars, which is better than bars compressed to invisible
    for (const phase of progress.phases) {
      if (phase.started) {
        const t = parseTimestamp(phase.started);
        if (t > 0) return new Date(t);
      }
    }

    return new Date();
  }

  private _computePhaseDuration(progress: ProgressState): string {
    // Find earliest start and latest completion from phase timestamps
    let earliestStarted = "";
    let latestCompleted = "";
    for (const phase of progress.phases) {
      if (phase.started && (!earliestStarted || phase.started < earliestStarted)) {
        earliestStarted = phase.started;
      }
      if (phase.completed && (!latestCompleted || phase.completed > latestCompleted)) {
        latestCompleted = phase.completed;
      }
    }
    if (!earliestStarted || !latestCompleted) return "";
    // Reuse existing computeDuration from archive.ts
    return computeDuration(earliestStarted, latestCompleted);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/unit/views/archiveTimelinePanel.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/archiveTimelinePanel.ts src/test/unit/views/archiveTimelinePanel.test.ts
git commit -m "feat: add ArchiveTimelinePanel for read-only past run timelines"
```

---

### Task 3: Register command and wire into extension

**Spec:** `docs/superpowers/specs/2026-03-28-archive-timeline-viewer-design.md` §Command Registration, §Extension Wiring

**Files:**
- Modify: `src/commands.ts:19-31` (CommandDeps), `src/commands.ts:163-178` (near archive commands)
- Modify: `src/activateViews.ts:22-30` (WebviewPanelsResult), `src/activateViews.ts:32-82` (createWebviewPanels)
- Modify: `src/extension.ts:173` (destructure), `src/extension.ts:184` (pass to deps)
- Modify: `package.json` (commands, menus)

- [ ] **Step 1: Add command definition and menu entry in `package.json`**

Add to the `commands` array (near `oxveil.archiveReplay`):

```json
{
  "command": "oxveil.archiveTimeline",
  "title": "Show Timeline",
  "icon": "$(graph-line)"
}
```

Add to `menus.view/item/context` array (alongside archiveReplay and archiveRestore entries):

```json
{
  "command": "oxveil.archiveTimeline",
  "when": "view == oxveil.archive && viewItem == archive",
  "group": "inline"
}
```

Add to `menus.commandPalette` array to hide it:

```json
{
  "command": "oxveil.archiveTimeline",
  "when": "false"
}
```

- [ ] **Step 2: Rename `_parseMetadataForTest` to `parseMetadata` in `src/parsers/archive.ts`**

Change the export line at the bottom of `src/parsers/archive.ts`:

```typescript
// Before:
export { extractTimestamp, computeDuration, formatDate, parseMetadata as _parseMetadataForTest };

// After:
export { extractTimestamp, computeDuration, formatDate, parseMetadata };
```

Update `src/test/unit/parsers/archive.test.ts` line 9 — change:

```typescript
// Before:
_parseMetadataForTest as parseMetadata,

// After:
parseMetadata,
```

- [ ] **Step 3: Extend `CommandDeps` and register command in `src/commands.ts`**

Add imports at top:

```typescript
import * as fs from "node:fs/promises";
import type { ArchiveTimelinePanel } from "./views/archiveTimelinePanel";
import { parseProgress } from "./parsers/progress";
import { type ArchiveMetadata, parseMetadata } from "./parsers/archive";
```

Add to `CommandDeps` interface:

```typescript
archiveTimelinePanel?: ArchiveTimelinePanel;
```

Add to destructure in `registerCommands`:

```typescript
const { ..., archiveTimelinePanel } = deps;
```

Add command registration **inside the returned array** in `registerCommands`, after the `oxveil.archiveRestore` entry (around line 208). It must be an element in the array so its disposable is tracked:

```typescript
vscode.commands.registerCommand(
  "oxveil.archiveTimeline",
  async (arg?: string | { archiveName?: string }) => {
    const active = getActive();
    const resolved = typeof arg === "string" ? resolveArchiveItem?.(arg) : arg;
    if (!active?.workspaceRoot || !resolved?.archiveName) return;

    const archiveDir = path.join(
      active.workspaceRoot,
      ".claudeloop",
      "archive",
      resolved.archiveName,
    );

    let progressContent: string;
    try {
      progressContent = await fs.readFile(
        path.join(archiveDir, "PROGRESS.md"),
        "utf-8",
      );
    } catch {
      vscode.window.showInformationMessage(
        "Oxveil: No timeline data for this run",
      );
      return;
    }

    const progress = parseProgress(progressContent);
    if (progress.phases.length === 0) {
      vscode.window.showInformationMessage(
        "Oxveil: No timeline data for this run",
      );
      return;
    }

    let metadata: ArchiveMetadata | null = null;
    try {
      const metaContent = await fs.readFile(
        path.join(archiveDir, "metadata.txt"),
        "utf-8",
      );
      metadata = parseMetadata(metaContent);
    } catch {
      // metadata is optional — proceed with null
    }

    archiveTimelinePanel?.reveal(resolved.archiveName, progress, metadata);
  },
),
```

- [ ] **Step 4: Wire `ArchiveTimelinePanel` in `src/activateViews.ts`**

Add import:

```typescript
import { ArchiveTimelinePanel } from "./views/archiveTimelinePanel";
```

Add to `WebviewPanelsResult` interface:

```typescript
archiveTimelinePanel: ArchiveTimelinePanel;
```

Add panel creation in `createWebviewPanels` (after `replayViewer`):

```typescript
const archiveTimelinePanel = new ArchiveTimelinePanel({
  createWebviewPanel: vscode.window.createWebviewPanel,
});
disposables.push({ dispose: () => archiveTimelinePanel.dispose() });
```

Add to return statement:

```typescript
return { dependencyGraph, executionTimeline, configWizard, replayViewer, archiveTimelinePanel, planCodeLens, disposables };
```

- [ ] **Step 5: Wire in `src/extension.ts`**

Add `archiveTimelinePanel` to the destructure of `panels` (line 173):

```typescript
const { dependencyGraph, executionTimeline, configWizard, replayViewer, archiveTimelinePanel } = panels;
```

Pass to `registerCommands` deps (around line 275, inside the `registerCommands({...})` call):

```typescript
archiveTimelinePanel,
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/commands.ts src/activateViews.ts src/extension.ts src/parsers/archive.ts src/test/unit/parsers/archive.test.ts package.json
git commit -m "feat: register oxveil.archiveTimeline command and wire into extension"
```

---

### Task 4: Visual verification

**Spec:** `docs/superpowers/specs/2026-03-28-archive-timeline-viewer-design.md` §Acceptance Criteria
**Mockups:** Compare against all `docs/superpowers/plans/mockups/live-run-*.png` for visual consistency — `live-run-active.png` (timeline layout), `live-run-completed.png` (banner/header style), `live-run-collapsed.png` (overall VS Code integration)

- [ ] **Step 1: Build the extension**

Run: `npm run compile` (or equivalent build command)
Expected: No errors

- [ ] **Step 2: Launch EDH and verify**

Action: `/visual-verification`

Verify:
- Past run tree items show the new `$(graph-line)` icon alongside replay and restore
- Clicking the icon on a past run opens a new "Timeline: {plan name}" panel
- Panel shows the metadata header bar with status icon, plan name, date, phase count, duration, READ-ONLY badge
- Timeline bars render correctly with phase names and durations
- No NOW line is visible
- Clicking the same past run's timeline icon again reveals the existing panel (no duplicate)
- Clicking a different past run's timeline icon opens a second panel
- Closing a panel and re-clicking the icon opens a fresh panel

---

### Task 5: Documentation

**Spec:** `docs/superpowers/specs/2026-03-28-archive-timeline-viewer-design.md`

- [ ] **Step 1: Create ADR**

Check next ADR number in `docs/adr/`. Create `docs/adr/NNNN-archive-timeline-viewer.md` using the template. Key points:
- Decision: dedicated `ArchiveTimelinePanel` with read-only header, separate from live timeline
- Alternatives considered: reusing live panel with mode switch, extending replay viewer
- Rationale: separation of concerns, side-by-side viewing, no state conflicts

- [ ] **Step 2: Update ADR index**

Add entry to `docs/adr/README.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/
git commit -m "docs: add ADR for archive timeline viewer"
```
