# v0.2 Rich Monitoring — Implementation Plan

## Context

Oxveil v0.1 ships basic monitoring: status bar, flat phase tree, output channel, notifications. v0.2 adds rich monitoring: dependency graph webview, click-to-open phase logs, archive browser, smart failure notifications, phase-specific git diffs. See [chmc/oxveil#1](https://github.com/chmc/oxveil/issues/1).

All data sources already exist in claudeloop:
- Dependencies: `Depends on:` lines in PROGRESS.md (not yet parsed by oxveil). Format: `Depends on: Phase 1 ✅ Phase 2 ⏳`. Written by `lib/progress.sh` `generate_phase_details()`. Optional — plans without dependency declarations produce no `Depends on:` lines.
- Per-phase logs: `.claudeloop/logs/phase-N.log` (per-attempt: `phase-N.attempt-M.log`, verify: `phase-N.verify.log`). Created by `lib/execution.sh`.
- Archives: `.claudeloop/archive/YYYYMMDD-HHMMSS/` with `metadata.txt` (key=value: plan_file, archived_at, phase_count, completed, failed, pending), PROGRESS.md copy, logs/, replay.html. Created by `lib/archive.sh`.
- Git commits per phase: `git commit -m "Phase N: <label>"` convention in `lib/phase_state.sh:128`. Always-on, cannot be disabled.

Feature flag: all v0.2 features gated by existing `oxveil.experimental` (single gatekeeper for v0.1–v0.2 per feature-flags skill).

Reference mockups (visual targets for each feature):
- `docs/mockups/v02-dependency-graph-webview.png` — DAG with nodes colored by status, edges, legend
- `docs/mockups/v02-click-to-open-phase-logs.png` — Context menu (View Log/View Diff) + log viewer panel
- `docs/mockups/v02-archive-browser.png` — Past runs list with status dots, Replay/Restore buttons
- `docs/mockups/v02-phase-git-diffs.png` — Phase tree click → VS Code diff editor
- `docs/mockups/v02-rich-monitoring.html` — Full interactive HTML reference for all v0.2 UI

### Graceful degradation principle

Every new view must handle missing data gracefully:
- No `.claudeloop/logs/` → "No logs available" message
- No `.claudeloop/archive/` → "No past runs" empty state
- No `Depends on:` lines → flat list (no graph edges), dependency graph falls back to vertical chain
- No git commits matching `Phase N:` → "No commits found for this phase" info notification
- Archive without `metadata.txt` → show directory name as label, "unknown" status

---

## Phase 0: ADR + Test Fixtures Foundation

Create ADR for webview rendering and shared test fixtures for v0.2.

**`docs/adr/0002-webview-dag-rendering.md`** — Decision: inline SVG generation.
- Zero runtime deps constraint applies to extension bundle. Webview sandbox could load external JS (Mermaid), but inline SVG keeps the implementation fully testable as pure functions, avoids CSP complexity, and avoids version management of a bundled library.
- DAG is simple (~20 nodes max). Layout: topological sort → layers → center within layer. Cap at 20 phases; beyond that, fall back to vertical list.
- Trade-off acknowledged: more layout code to write, but zero external deps, deterministic output, fully unit-testable.

**`docs/adr/README.md`** — Add ADR 0002.

**`test/fixtures/mock-deps/`** — PROGRESS.md with fan-out dependencies:
- Phase 1 (completed, no deps)
- Phase 2 (completed, depends on Phase 1)
- Phase 3 (in_progress, depends on Phase 2)
- Phase 4 (pending, depends on Phase 2) — parallel with Phase 3
- Phase 5 (pending, depends on Phase 3 + Phase 4)
- Use exact `Depends on:` format from claudeloop `lib/progress.sh` including emoji.

**`test/fixtures/mock-archive/`** — 3 archive dirs:
- `20260324-103200/` — completed run, 7 phases
- `20260323-151500/` — failed at phase 4, 5 phases
- `20260322-090000/` — completed run, 4 phases
- Each with `metadata.txt` matching claudeloop format and minimal PROGRESS.md.

**`test/fixtures/mock-running/.claudeloop/logs/`** — Phase log files:
- `phase-1.log`, `phase-1.attempt-1.log`, `phase-2.verify.log`
- Use claudeloop log format: `=== EXECUTION START ===` / `=== EXECUTION END ===` headers.

**Verification:** `npm run lint && npm test`. No UI — docs and fixtures only.

---

## Phase 1: Parse Dependencies + Show in Phase Tree

Extend the PROGRESS.md parser and show dependency info in the existing phase tree.

### Changes

**`src/types.ts`** — Add structured dependency type:
```typescript
export interface PhaseDependency {
  phaseNumber: number | string;
  status: PhaseStatus | "unknown";
}
// Add to PhaseState:
dependencies?: PhaseDependency[];
```

The `dependencies` field is a structured adjacency list — Phase 4 (DAG webview) consumes it directly. Do not flatten to display string.

**`src/parsers/progress.ts`** — Parse `Depends on:` lines after existing field parsing. Regex: `/Phase\s+(\d+(?:\.\d+)?)\s*(✅|⏳|❌|🔄)?/g`. Map emoji → status: ✅→completed, ⏳→pending, ❌→failed, 🔄→in_progress, missing→unknown. If no `Depends on:` line found for a phase, `dependencies` remains `undefined`.

**`src/views/phaseTree.ts`** — Show dependency info in description: "depends on Phase 1, Phase 2" or combine with attempts: "3 attempts · depends on 2 phases".

### Tests
- `src/test/unit/parsers/progress.test.ts` — Dependency parsing: single dep, multiple deps, emoji→status mapping, no deps, unknown emoji, malformed line, decimal phase numbers in deps
- `src/test/unit/views/phaseTree.test.ts` — Dependency description rendering, combined with attempts

### Visual verification
Reference: `docs/mockups/v02-dependency-graph-webview.png` (shows dependency relationships between phases).
In EDH with `mock-deps` fixture copied to workspace `.claudeloop/`: verify phase tree items with dependencies show "depends on Phase X, Phase Y" in description. Phases without dependencies show only attempts or nothing.

---

## Phase 2: Click-to-Open Phase Logs

Right-click phase in tree → "View Log" opens `.claudeloop/logs/phase-N.log` in editor.

### Changes

**`src/views/phaseTree.ts`** — Add `contextValue: "phase"` and `phaseNumber` to tree items. Store phase number on tree item for command resolution.

**`package.json`** — Register `oxveil.viewLog` command. Add context menu contribution and command palette entry:
```json
{ "command": "oxveil.viewLog", "when": "view == oxveil.phases && viewItem == phase", "group": "navigation" }
```

**`src/commands.ts`** — Add `oxveil.viewLog` handler. Resolve phase number from tree item, call `findPhaseLogs`, open file or show QuickPick if multiple logs exist.

**`src/extension.ts`** — Register command, pass workspace root.

### New files
- `src/views/logViewer.ts` — Pure function `findPhaseLogs(deps, phaseNumber): Promise<string[]>`. Checks `phase-N.log`, `phase-N.attempt-M.log`, `phase-N.verify.log`, `phase-N.refactor.log`. Returns sorted paths. Handles missing `.claudeloop/logs/` gracefully (returns empty array).
- `src/test/unit/views/logViewer.test.ts`

### Tests
- `logViewer.test.ts`: Single log, multiple attempts, verify log, refactor log, no logs found, missing logs directory

### Visual verification
Reference: `docs/mockups/v02-click-to-open-phase-logs.png` (shows context menu with View Log/View Diff + log viewer panel with timestamps).
In EDH with mock log files: open command palette → "Oxveil: View Phase Log" (use command palette, not context menu — context menus are unreliable to screenshot via osascript). Verify log file opens in editor tab. Verify context menu contribution exists via `package.json` code review.

---

## Phase 3: Archive Browser Tree View

New "Past Runs" sidebar section showing `.claudeloop/archive/` entries with Replay and Restore buttons.

### Changes

**`package.json`** — Add `oxveil.archive` view under oxveil view container:
```json
{ "id": "oxveil.archive", "name": "Past Runs", "when": "config.oxveil.experimental" }
```
Register `oxveil.archiveReplay`, `oxveil.archiveRestore`, and `oxveil.archiveRefresh` commands. Add inline Replay and Restore buttons via `view/item/context` with `group: "inline"`.

**`src/extension.ts`** — Register archive tree provider. Wire refresh: on `state-changed` to `done`/`failed`, re-scan archive directory.

**`src/commands.ts`**:
- `oxveil.archiveReplay`: opens archive's `replay.html` in browser via `vscode.env.openExternal`.
- `oxveil.archiveRestore`: guards with lock check (if session running → show error "Stop the current session first"), then shows confirmation dialog ("Restore will overwrite current session state. Continue?"), then spawns `claudeloop --restore <archiveName>` via ProcessManager. After restore completes, re-detect state (watchers pick up restored files).
- `oxveil.archiveRefresh`: re-scans archive directory.

### New files
- `src/parsers/archive.ts` — `parseArchive(deps, archiveRoot): Promise<ArchiveEntry[]>`. Lists subdirectories, reads `metadata.txt` (key=value: `plan_file`, `archived_at`, `phase_count`, `completed`, `failed`, `pending`). Computes status from completed/failed/pending counts. Sorts descending by timestamp. Handles: no archive dir, empty dir, missing metadata.txt (falls back to dir name as label).
- `src/views/archiveTree.ts` — Tree provider: label = plan file name (sanitized), description = "Mar 24 · 7 phases · 24m · completed". Status icon via ThemeIcon (check/error/warning). Empty state: "No past runs".
- `src/test/unit/parsers/archive.test.ts`
- `src/test/unit/views/archiveTree.test.ts`

### Tests
- `archive.test.ts`: Parse metadata, missing fields, missing metadata.txt, sort order, empty archive dir, no archive dir
- `archiveTree.test.ts`: Item rendering, empty state message, status icon mapping
- `commands` (integration): Restore blocks when session running, restore confirmation dialog, restore invokes claudeloop CLI

### Visual verification
Reference: `docs/mockups/v02-archive-browser.png` (shows past runs list with status dots, plan names, metadata, Replay/Restore buttons).
In EDH with `mock-archive` fixtures copied to workspace `.claudeloop/archive/`: verify "Past Runs" section appears in sidebar below Phases. Verify 3 entries with correct labels, dates, phase counts, statuses. Verify Replay and Restore inline buttons visible.

---

## Phase 4a: DAG Layout Algorithm + SVG Generation

Pure functions only — no VS Code dependency. Compute layout positions and render SVG strings.

### New files
- `src/views/dagLayout.ts` — Pure function `layoutDag(progress: ProgressState): DagLayout`.
  - Build adjacency from `PhaseState.dependencies` (phase number → dependency phase numbers)
  - Topological sort to assign layers (phases with no deps → layer 0, others → max(dep layers) + 1)
  - Phases without any dependency data: fall back to linear vertical chain
  - Center nodes within each layer horizontally
  - Constants: node 160×80px, h-gap 40px, v-gap 60px
  - Cap: 20 phases max; beyond that fall back to linear
  - Output: `DagLayout { nodes: DagNode[], edges: DagEdge[], width, height }`
- `src/views/dagSvg.ts` — Pure function `renderDagSvg(layout: DagLayout): string`.
  - SVG with viewBox sized to layout dimensions
  - Rounded rect nodes with 2px border colored by status (completed=#4ec9b0, running=#007acc, failed=#f44747, pending=#555)
  - Running nodes get subtle filter-based glow
  - Text: phase number (bold), title, duration/status
  - Edge lines with simple straight paths (no bezier — unnecessary for near-linear DAGs)
  - Legend in top-right: colored dots with labels
  - Uses CSS variables from VS Code theme for background
- `src/test/unit/views/dagLayout.test.ts`
- `src/test/unit/views/dagSvg.test.ts`

### Tests
- `dagLayout.test.ts`: Linear chain (A→B→C), fan-out (A→B, A→C), fan-in (B→D, C→D), diamond, single node, no dependencies (linear fallback), disconnected nodes
- `dagSvg.test.ts`: SVG contains correct node count, edge count, status-specific CSS classes, legend present, viewBox dimensions match layout

### Verification
`npm test` — pure functions, no UI yet. Verify SVG output is well-formed and deterministic.

---

## Phase 4b: Webview Panel Scaffold

Create the webview panel that hosts the DAG SVG. Static rendering — no live updates yet.

### Changes

**`package.json`** — Register `oxveil.showDependencyGraph` command with `"when": "config.oxveil.experimental"`.

**`src/commands.ts`** — Add command handler to create/reveal webview panel.

**`src/extension.ts`** — Register command.

### New files
- `src/views/dependencyGraph.ts` — `DependencyGraphPanel` class.
  - Creates `vscode.WebviewPanel` with title "Dependency Graph"
  - `retainContextWhenHidden: true`
  - HTML template: minimal CSS + SVG container + inline script for message handling
  - CSP: `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-...'`
  - `update(progress)` method: calls `layoutDag` → `renderDagSvg` → sends SVG via `postMessage`
  - `dispose()` cleanup
  - Reads current `ProgressState` from session on creation for initial render

### Tests
- `dependencyGraph.test.ts`: Panel creation, update sends message, dispose cleanup

### Visual verification
Reference: `docs/mockups/v02-dependency-graph-webview.png` (DAG with completed/running/pending nodes, edges showing dependencies, color legend).
In EDH with `mock-deps` fixture: run "Oxveil: Show Dependency Graph" from command palette. Tier 1 criteria: 5 nodes visible, correct phase labels, correct status colors (green/blue/gray), legend present.

---

## Phase 4c: Dependency Graph — Live Updates + Click Interaction

Wire the webview to live session events and add click-to-open-log on graph nodes.

### Changes

**`src/sessionWiring.ts`** — Add optional `dependencyGraph` to `SessionWiringDeps`. On `phases-changed`, if graph panel exists, call `graph.update(progress)`.

**`src/views/dependencyGraph.ts`** — Add message handling:
- Webview JS: on node click, `postMessage({ type: 'openLog', phaseNumber })` to extension host
- Extension host: on `openLog` message, execute `oxveil.viewLog` command with phase number
- Webview JS uses `acquireVsCodeApi()` for communication

**`src/views/dagSvg.ts`** — Add `data-phase` attributes to node SVG elements + `cursor: pointer` style on completed/failed nodes.

### Tests
- `dependencyGraph.test.ts`: Update calls re-render SVG, message handling for node clicks, click on pending node is no-op

### Visual verification
Reference: `docs/mockups/v02-dependency-graph-webview.png` (same mockup — verify live color transitions and click behavior).
In EDH: open dependency graph, then modify mock PROGRESS.md to transition a phase (e.g., in_progress → completed). Verify the graph updates: node color changes from blue to green. Verify clicking a completed node opens its log.

---

## Phase 5: Smart Failure Notifications

Enhance failure notifications with attempt count and "View Log" action button.

### Changes

**`src/views/notifications.ts`** — When phase transitions to `failed`:
- Message: `Phase N failed — {title} (attempt M)` (include attempt count if > 1)
- Buttons: "View Log", "Show Output", "Dismiss"
- "View Log" triggers `onViewLog(phaseNumber)` callback (reuses Phase 2's `oxveil.viewLog`)

Add to `NotificationDeps`:
```typescript
onViewLog?: (phaseNumber: number | string) => void;
```

**`src/extension.ts`** — Wire `onViewLog` callback to execute `oxveil.viewLog` command.

### Tests
- `notifications.test.ts`: Failure includes attempt count in message, "View Log" triggers callback with correct phase number, backward compat with "Show Output", single-attempt failure omits "(attempt 1)"

### Visual verification
Two-step mock sequence:
1. Launch EDH with mock PROGRESS.md showing Phase 3 as `in_progress` with `Attempts: 3`
2. Overwrite PROGRESS.md to show Phase 3 as `failed`
3. Wait 2s for watcher debounce + notification
4. Screenshot — error notification persists (does not auto-dismiss). Verify message includes "attempt 3". Verify "View Log" button visible.

---

## Phase 6: Phase-Specific Git Diffs

Right-click completed phase → "View Diff" shows git changes made during that phase.

### Changes

**`src/views/phaseTree.ts`** — Set `contextValue` to `"phase-completed"` for completed phases, `"phase-running"` for in_progress, `"phase"` for others. "View Diff" only available on completed phases.

**`package.json`** — Register `oxveil.viewDiff` command. Context menu:
```json
{ "command": "oxveil.viewDiff", "when": "view == oxveil.phases && viewItem == phase-completed", "group": "navigation" }
```

**`src/commands.ts`** — `oxveil.viewDiff` handler: call `findPhaseCommits`, if found open diff provider, if not show "No commits found for Phase N".

**`src/extension.ts`** — Register command and `TextDocumentContentProvider`.

### New files
- `src/core/gitIntegration.ts` — Pure functions with injected `exec` dep:
  - `findPhaseCommits(deps, phaseNumber)`: runs `git log --all --grep="^Phase N:" --format="%H" --reverse`. Returns `{ firstCommit, lastCommit, commitCount } | null`.
  - `getPhaseUnifiedDiff(deps, range)`: runs `git diff {firstCommit}~1..{lastCommit} -- ':!.claudeloop/'` (excludes .claudeloop/ from diff). Returns unified diff string.
  - Handles: no commits found (returns null), single commit (firstCommit === lastCommit, diff against parent), not a git repo (returns null).
- `src/views/diffProvider.ts` — `TextDocumentContentProvider` for `oxveil-diff:` URI scheme. Encodes phase number in URI, calls `getPhaseUnifiedDiff` on `provideTextDocumentContent`. Opened as read-only with diff syntax highlighting.
- `src/test/unit/core/gitIntegration.test.ts`

### Tests
- `gitIntegration.test.ts`: Mock exec → multiple commits (range), single commit (diff parent), no commits (null), non-git workspace (null). Verify `.claudeloop/` exclusion in diff command.

### Visual verification
Setup requires scripted temp git repo (not static fixtures):
1. Create temp dir with `git init`
2. Make initial commit with sample files
3. Make 2 commits with messages `Phase 1: Setup` and `Phase 1: Add config`
4. Make 1 commit with message `Phase 2: Implement feature`
5. Create `.claudeloop/PROGRESS.md` with Phase 1 (completed) and Phase 2 (completed)
6. Launch EDH with temp dir as workspace
7. Right-click Phase 1 → verify "View Diff" appears. Click → verify diff view opens showing combined changes from both Phase 1 commits.
8. Verify "View Diff" does NOT appear on pending phases.

Reference: `docs/mockups/v02-phase-git-diffs.png` (shows phase tree click → VS Code diff editor with +/- lines and phase label in header).

---

## Phase 7: Documentation + Final Polish

Update documentation to reflect v0.2 features.

### Changes

**`ARCHITECTURE.md`** — Add new components: archive parser, DAG layout, webview provider, git integration, log viewer, diff provider. Update architecture diagram. Update file structure section. Update roadmap (v0.2 marked complete).

**`README.md`** — Add v0.2 features to feature list: dependency graph, archive browser, phase logs, git diffs, enhanced notifications.

### Verification
`npm run lint && npm test` to verify no regressions. No UI — docs only.

---

## Cross-Repo Coordination

No blocking changes needed in claudeloop for v0.2. All data sources exist. However, recommend these follow-up items (can be separate PRs):
- Document IPC contract formally in claudeloop (`docs/ipc-contract.md`)
- Mark git commit message format `Phase N: <label>` as a contract in claudeloop docs
- Add IPC version field to `.claudeloop/` (noted in ARCHITECTURE.md as planned)

---

## Critical Files

| File | Role |
|------|------|
| `src/types.ts` | Type definitions — extend with PhaseDependency |
| `src/parsers/progress.ts` | PROGRESS.md parser — add dependency extraction |
| `src/views/phaseTree.ts` | Phase tree — context menus, dependency descriptions, contextValue |
| `src/extension.ts` | Main wiring — register all new views, commands, providers |
| `src/sessionWiring.ts` | Event routing — add graph updates |
| `src/views/notifications.ts` | Notifications — enhance failure actions |
| `package.json` | Extension manifest — commands, views, menus |
| `src/core/sessionState.ts` | State machine — no changes needed, events sufficient |

## Scope Exclusions

- **Retry Phase**: Mockup shows "Retry Phase" in context menu, but claudeloop has no `--retry-from-phase` CLI flag. Retries are internal. Deferred to v0.4 (deep integration) with a cross-repo CLI change.

## Commit Strategy

One conventional commit per phase on `main`:
- `docs: add ADR 0002 and v0.2 test fixtures`
- `feat: parse phase dependencies and show in tree view`
- `feat: add click-to-open phase logs from tree context menu`
- `feat: add archive browser with replay and restore`
- `feat: add DAG layout algorithm and SVG generation`
- `feat: add dependency graph webview panel`
- `feat: add live updates and click interaction to dependency graph`
- `feat: enhance failure notifications with attempt count and view log`
- `feat: add phase-specific git diff viewing`
- `docs: update architecture and readme for v0.2`
