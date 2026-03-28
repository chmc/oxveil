# Oxveil v0.4 — Deep Integration

## Context

v0.1-v0.3 are complete (monitoring, config wizard, plan editing, CodeLens, replay). v0.4 adds power-user features: execution timeline, welcome walkthrough, and multi-root workspace support. Retry strategy picker and prompt template editor are deferred — they require claudeloop CLI changes that don't exist yet (`--retry-strategy` flag, template variable engine). GitHub issues will track them.

**Ordering rationale:** Ship low-risk, self-contained features first (walkthrough, timeline), then tackle multi-root workspace (high-risk core refactoring) last. This way walkthrough and timeline are shippable even if multi-root hits blockers.

## Scope

**In scope (from mockups):**
- Welcome Walkthrough — VS Code walkthrough API onboarding (mockup: `docs/mockups/v04-deep-integration.html` "Welcome Walkthrough" section)
- Execution Timeline — Gantt-style webview (mockup: same file, "Execution Timeline" section)
- Multi-root Workspace — folder-scoped sessions (mockup: `docs/mockups/v04-multi-root.html`)

**Deferred (create GH issues):**
- Retry Strategy Picker — needs claudeloop `--retry-strategy` CLI flag
- Prompt Template Editor — needs claudeloop template variable engine

**Documentation:**
- ARCHITECTURE.md updates throughout
- ADRs for architectural decisions
- World-class README as final task

## Key Files

- `src/extension.ts` — activation, wiring (line 278: `workspaceFolders?.[0]` = single-root hardcode)
- `src/sessionWiring.ts` — connects session events to views (`SessionWiringDeps` interface)
- `src/types.ts` — PhaseState has `started`/`completed` timestamps (format: `YYYY-MM-DD HH:MM:SS`, local time)
- `src/views/dependencyGraph.ts` — reference pattern for webview panels (Deps interface, `reveal()`, `update()`)
- `src/parsers/progress.ts` — parses PROGRESS.md → ProgressState
- `src/core/processManager.ts` — spawns claudeloop with args
- `src/workspaceInit.ts` — file watcher setup (also hardcoded `workspaceFolders[0]`)
- `src/commands.ts` — command registration (`CommandDeps` interface with 11 fields)
- `package.json` — contributes section for commands, views, walkthroughs, menus
- `test/fixtures/mock-running/PROGRESS.md` — sample with timestamps and attempt strategies

## Reusable Patterns

- **Webview panel:** `DependencyGraphPanel` at `src/views/dependencyGraph.ts` — Deps interface, `reveal()`, `update()`, `dispose()`, `onDidReceiveMessage` for interactions
- **Pure parser:** Input string → typed output, crash-proof try-catch, no VS Code deps (see `parsers/progress.ts`)
- **Tree adapter:** `createTreeAdapter()` at `src/views/treeAdapter.ts` wraps tree providers
- **Session wiring:** `wireSessionEvents()` at `src/sessionWiring.ts` subscribes views to SessionState events
- **Elapsed timer:** `ElapsedTimer` at `src/views/elapsedTimer.ts` for interval-based UI updates

## Research Findings

**Walkthrough API:**
- `contributes.walkthroughs` in package.json — declarative, steps have `completionEvents` array
- Completion events: `onContext:key`, `onCommand:id`, `onView:id`, `onLink:url`, `extensionInstalled:id`, `onSettingChanged:id`
- Media: `{ "markdown": "./media/file.md" }` or `{ "image": "./media/file.png", "altText": "..." }`. Paths relative to extension root.
- Action buttons in step descriptions via markdown links: `[Button Label](command:extension.commandId)`
- Gotcha: walkthroughs may not appear until VS Code reload (known issue #232425)

**Webview CSP for timeline scripts:**
- `DependencyGraphPanel` uses nonce-based CSP: `script-src 'nonce-${nonce}'` (line 72 of `dependencyGraph.ts`)
- `setInterval` works fine with nonce-based CSP — same pattern as existing webviews
- Inline script via `<script nonce="${nonce}">` block

**QuickPick for folder picker:**
- `QuickPickItem` fields: `label` (supports `$(icon)` theme icons), `description` (gray, same line), `detail` (second line below)
- For rich two-line layout: use `label` for folder name with icon, `detail` for session status
- Over 800 codicon theme icons available via `$(identifier)` syntax

**Multi-root singleton mapping** (from `extension.ts` line-by-line analysis):
- Singletons that become per-folder: `session` (L139), `processManager` (L277-287), `gitExec` (L293-309), `elapsedTimer` (L142-155), watcher manager (L236-245)
- Global singletons (shared): `statusBar` (L50), `phaseTree` (L81), `outputChannel` (L134), `installer` (L312), `dependencyGraph` (L174), `configWizard` (L181), `replayViewer` (L190)
- `workspaceInit.ts` hardcodes `[0]` at lines 23 and 41 — needs per-folder loop with folder-specific `RelativePattern`
- `sessionWiring.ts` wires one session to views — multi-root needs `isActiveSession()` guard so only active session drives UI

## Design Simplifications

- **Pending phases in timeline:** The mockup shows estimated durations ("~4m"). There is no data source for estimates — claudeloop doesn't emit them. Simplification: pending phases render as zero-width dashed markers at the timeline's right edge. Document this deviation.
- **Walkthrough media:** Use simple markdown content (not custom SVG illustrations) to avoid scope creep. VS Code walkthrough API supports markdown media.
- **Multi-root tree view:** Folder grouping only shown when `workspaceFolders.length > 1`. Single-root behavior must be identical to v0.3.

## Multi-root Design Decisions (finalized via brainstorming)

Mockup: `docs/mockups/v04-multi-root.html`

- **Tree view:** Folder grouping — collapsible folder nodes (with folder icon + name) as top-level items. Phases nested underneath. Each folder shows session status badge (e.g., `3/5`, `idle`, `done`, `failed`). Badge in header shows root count.
- **Status bar:** Folder name prefix + other-roots summary — `$(sync~spin) Oxveil: my-api — Phase 3/5 | 4m` with `+1 idle` suffix. Single-root: no folder name (unchanged).
- **Folder picker:** Rich quick pick with two-line items — folder name (bold) on first line, session status detail on second line (e.g., "Running — Phase 3/5 | 4m"). Status icon on right. Skipped for single-root and when folder is implicit from context.

---

## Phases (17 small tasks — each touches 1-3 files, easy to implement and verify)

### Phase 1: Welcome walkthrough — declaration + media

Register walkthrough in `package.json` under `contributes.walkthroughs`. Create walkthrough media.

**Implementation:**
- Add to `package.json` `contributes.walkthroughs` array:
  - ID: `oxveil.welcome`, title: "Get Started with Oxveil", description: "Set up and run your first AI coding workflow"
  - 4 steps with IDs: `detect`, `configure`, `createPlan`, `runSession`
  - Each step has: `id`, `title`, `description` (markdown with `[Button](command:id)` links), `media` (markdown file), `completionEvents`
  - Step 1: title "Detect claudeloop", description includes `[Install claudeloop](command:oxveil.install)`, completionEvents: `["onContext:oxveil.detected"]`
  - Step 2: title "Configure your workflow", description includes `[Open Configuration Wizard](command:oxveil.openConfigWizard)`, completionEvents: `["onCommand:oxveil.openConfigWizard"]`
  - Step 3: title "Create your first plan", description includes `[Create PLAN.md](command:oxveil.createPlan)` (new command — creates template PLAN.md), completionEvents: `["onContext:oxveil.walkthrough.hasPlan"]`
  - Step 4: title "Run your first session", description includes `[Start claudeloop](command:oxveil.start)`, completionEvents: `["onContext:oxveil.walkthrough.hasRun"]`
- Create `media/walkthrough/` directory with 4 markdown files (one per step's media panel). Keep content simple — explain what the step does and what to expect. VS Code renders these as HTML in the walkthrough panel.
- Register new command `oxveil.createPlan` that creates a template `PLAN.md` file in the workspace root (quick-start scaffold)
- **Gotcha:** Walkthrough media paths are relative to extension root. Use `"media": { "markdown": "./media/walkthrough/detect.md" }` format.
- **Gotcha:** Walkthroughs may not appear immediately after installation — requires VS Code reload. This is a known VS Code issue (#232425).

**Files:** `package.json`, `media/walkthrough/*.md` (4 new files)

**Action:** `/visual-verification` — launch Extension Development Host, open command palette → "Get Started", verify "Welcome to Oxveil" walkthrough appears with 4 steps. Compare against mockup walkthrough section.

---

### Phase 2: Welcome walkthrough — step completion logic

Wire walkthrough step completion events to extension state.

**Implementation:**
- Step 1 (Detect): Already covered — `oxveil.detected` context key is set in `extension.ts` line 62-66 on activation
- Step 2 (Configure): In the `oxveil.openConfigWizard` command handler in `commands.ts`, add `vscode.commands.executeCommand('setContext', 'oxveil.walkthrough.configured', true)` after revealing config wizard
- Step 3 (Create plan): Add a `FileSystemWatcher` for `**/PLAN.md` in `extension.ts`. On create, set context key `oxveil.walkthrough.hasPlan`. On activation, check if `PLAN.md` exists and set key accordingly
- Step 4 (Run session): In `sessionWiring.ts`, when session state transitions to `done`, set context key `oxveil.walkthrough.hasRun`
- Add unit tests verifying context keys are set at the right moments
- Read `package.json` `contributes.walkthroughs` (from Phase 1) to confirm step IDs and completion event names match

**Files:** `src/extension.ts`, `src/commands.ts`, `src/sessionWiring.ts`, `src/test/unit/views/walkthrough.test.ts` (new)

**Action:** `/visual-verification` — launch EDH, open walkthrough. Verify step 1 shows green check if claudeloop detected. Open config wizard → verify step 2 completes. Create a PLAN.md → verify step 3 completes. Progress bar updates correctly.

---

### Phase 3: Execution timeline — types + parser + unit tests

Create the timeline data model and computation logic. Test-verified phase (no webview yet).

**Implementation:**
1. **Types** in `src/types.ts`:
   ```
   TimelineBar { phase: number|string; title: string; status: PhaseStatus; startOffsetMs: number; durationMs: number; label: string }
   TimelineData { bars: TimelineBar[]; totalElapsedMs: number; nowOffsetMs: number; maxTimeMs: number }
   ```

2. **Parser** `src/parsers/timeline.ts`: Pure function `computeTimeline(progress: ProgressState, now: Date): TimelineData`
   - Parse `started`/`completed` timestamps (format: `YYYY-MM-DD HH:MM:SS`, treat as local time — no timezone in claudeloop output)
   - Compute each bar's `startOffsetMs` relative to earliest phase start
   - Completed phases: `durationMs` = completed - started
   - Running phases: `durationMs` = now - started
   - Failed phases: `durationMs` = completed - started (or now - started if no completed timestamp)
   - Pending phases: `startOffsetMs` = maxTimeMs, `durationMs` = 0 (zero-width marker)
   - `label`: format duration as `M:SS` for completed/failed, `"running..."` for in_progress, `"pending"` for pending
   - Handle edge cases: missing timestamps (treat as 0 offset), single phase, all pending

3. **Unit tests** `src/test/unit/parsers/timeline.test.ts`:
   - Use `test/fixtures/mock-running/PROGRESS.md` fixture data (has completed, running, failed, pending phases)
   - Test: bar positions, durations, NOW offset, label formatting
   - Test: empty progress state → empty timeline
   - Test: all-pending → valid but empty-looking timeline

**Files:** `src/types.ts`, `src/parsers/timeline.ts` (new), `src/test/unit/parsers/timeline.test.ts` (new)

**Demo:** `npm test` — new timeline parser tests pass. Inspect test output for correct bar positions.

**Action:** Run `npm test` and `npm run lint`. All tests pass including new timeline parser tests.

---

### Phase 4: Execution timeline — HTML renderer + tests

Create the Gantt chart HTML generator as a pure function.

**Implementation:**
- `src/views/timelineHtml.ts`: Pure function `renderTimelineHtml(data: TimelineData, nonce: string, cspSource: string): string`
- Match mockup layout: time axis with tick marks at regular intervals, phase label column (160px left), gantt tracks filling remaining width
- Bar CSS classes: `.complete` (background: `#2e7d32`), `.running` (`#0e639c` + box-shadow), `.failed` (`#c72e2e`), `.pending` (`#333` + dashed border)
- Header bar: codicon `graph-line` icon + "Execution Timeline" title + total elapsed time (right-aligned, green `#4ec9b0`)
- Time axis: compute tick positions dynamically based on `maxTimeMs` — show 5-7 ticks labeled as `Nm`
- Grid lines: vertical lines at each tick
- Pending phases: thin dashed markers at right edge
- Include `<style>` block with all CSS inline (VS Code webview CSP)
- NOW indicator: vertical blue line (`#007acc`, 2px wide) at `nowOffsetMs` position with "NOW Xm" label
- Pulse animation: running bars show `running...` text with CSS `@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`
- Add `<script nonce="${nonce}">` block: `setInterval` every 10s advances the NOW line position (no message roundtrip)
- Unit tests: verify HTML contains expected CSS classes, time axis ticks, bar elements, NOW line, pulse keyframes

**Files:** `src/views/timelineHtml.ts` (new), `src/test/unit/views/timelineHtml.test.ts` (new)

**Action:** Run `npm test` and `npm run lint`. All tests pass.

---

### Phase 5: Execution timeline — webview panel + command registration

Create the webview panel and register the command to open it.

**Implementation:**
- `src/views/executionTimeline.ts`: Follow `DependencyGraphPanel` pattern exactly
  - `ExecutionTimelineDeps { createWebviewPanel, executeCommand }`
  - `reveal(progress: ProgressState | undefined): void` — creates or shows panel, calls `renderTimelineHtml`
  - `update(progress: ProgressState): void` — re-renders HTML with new data
  - `dispose(): void`
  - CSP: nonce-based `script-src 'nonce-${nonce}'` (same as dependency graph, line 72)
  - On panel creation: `enableScripts: true`, `retainContextWhenHidden: true`
- Add `oxveil.showTimeline` to `package.json` `contributes.commands` (title: "Oxveil: Show Timeline")
- Add when-clause: `oxveil.detected` (same as `oxveil.showDependencyGraph`)
- Add command handler in `commands.ts` that calls `executionTimeline.reveal(session.progress)`
- Reference `oxveil.showDependencyGraph` menu entries in `package.json` — add matching entries for timeline
- Unit tests for webview panel (mock panel creation, verify reveal/update/dispose)

**Files:** `src/views/executionTimeline.ts` (new), `src/commands.ts`, `package.json`, `src/test/unit/views/executionTimeline.test.ts` (new)

**Action:** `/visual-verification` — launch EDH, run "Oxveil: Show Timeline" from command palette. Compare webview against mockup "Execution Timeline" section. Verify: phase bars with correct colors, labels on left, time axis with ticks, header with total time.

---

### Phase 6: Execution timeline — extension wiring + live updates

Wire timeline panel to extension lifecycle and live session events.

**Implementation:**
- `src/extension.ts`: Instantiate `ExecutionTimelinePanel` (same pattern as `DependencyGraphPanel` at lines 174-178). Add to disposables. Pass to `wireSessionEvents` and `registerCommands`.
- `src/sessionWiring.ts`: Add `executionTimeline?: ExecutionTimelinePanel` to `SessionWiringDeps` interface. In `phases-changed` handler, call `deps.executionTimeline?.update(newProgress)`.

**Files:** `src/extension.ts`, `src/sessionWiring.ts`

**Action:** `/visual-verification` — launch EDH with mock session data (copy `test/fixtures/mock-running/` to workspace `.claudeloop/`). Verify: timeline updates when phases change, NOW line visible and blue, running bars pulse.

---

### Phase 7: Multi-root — WorkspaceSession + Manager classes + tests

Create per-folder session infrastructure as standalone classes. No extension.ts changes — pure infrastructure.

**Implementation:**
1. **WorkspaceSession** (`src/core/workspaceSession.ts`): Bundles per-folder state: `folderUri`, `workspaceRoot`, `sessionState: SessionState`, `processManager: ProcessManager | undefined`, `gitExec: GitExecDeps | undefined`. Constructor creates `SessionState` instance. `dispose()` cleans up. No VS Code dependency.

2. **WorkspaceSessionManager** (`src/core/workspaceSessionManager.ts`): `Map<string, WorkspaceSession>` keyed by folder URI. Methods: `createSession()`, `getSession()`, `getActiveSession()` (based on injected resolver), `getAllSessions()`, `removeSession()`, `dispose()`. Event: `onDidChangeActiveSession`. Deps: `{ getActiveFolderUri(): string | undefined }`.

3. **Unit tests**: both classes fully tested. Verify single-folder case works identically.

**Files:** `src/core/workspaceSession.ts` (new), `src/core/workspaceSessionManager.ts` (new), `src/test/unit/core/workspaceSession.test.ts` (new), `src/test/unit/core/workspaceSessionManager.test.ts` (new)

**Action:** Run `npm test` and `npm run lint`. All tests pass (existing + new).

---

### Phase 8: Multi-root — extension.ts per-folder session + PM creation

Replace singleton session/processManager/gitExec in `extension.ts` with `WorkspaceSessionManager`.

**Pre-flight:** Run `npm test`. All existing tests must pass.

**Transformation blueprint — extension.ts line-by-line:**

Lines to **KEEP UNCHANGED** (global singletons):
- L39-41: config reading
- L43-50: statusBar creation
- L52-78: detection + context keys + status bar update
- L80-99: phaseTree + treeAdapter + treeView
- L101-116: archiveTree + treeAdapter + archiveView
- L133-136: outputChannel + outputManager
- L157-171: notifications
- L173-178: dependencyGraph
- L180-195: configWizard + replayViewer
- L197-205: planCodeLens
- L225-233: detection notifications
- L247-274: refreshDetection + configWatcher
- L311-319: installer

Lines to **REPLACE** (singleton → per-folder):

```
DELETE L139: const session = new SessionState();
REPLACE WITH:
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const manager = new WorkspaceSessionManager({
    getActiveFolderUri: () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return workspaceFolders?.[0]?.uri.toString();
      return vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.toString();
    },
  });

  // Create one session per folder
  if (workspaceFolders && result.status === "detected") {
    for (const folder of workspaceFolders) {
      const root = folder.uri.fsPath;
      const ws = manager.createSession(folder.uri.toString(), root, {});
      // PM per folder (moves L281-287 logic here)
      ws.processManager = createProcessManager({
        claudeloopPath, resolvedPath: result.path, workspaceRoot: root, platform: process.platform,
      });
      // GitExec per folder (moves L293-300 logic here)
      ws.gitExec = {
        exec: async (cmd, args, cwd) => { const { stdout } = await execFileAsync(cmd, args, { cwd }); return stdout; },
        cwd: root,
      };
    }
  }
```

```
DELETE L142-155: const elapsedTimer = new ElapsedTimer(...)
REPLACE WITH:
  const elapsedTimer = new ElapsedTimer((elapsed) => {
    const active = manager.getActiveSession();
    if (active?.sessionState.status === "running") {
      const p = active.sessionState.progress;
      const currentPhase = p?.currentPhaseIndex !== undefined
        ? (p.phases[p.currentPhaseIndex]?.number as number) ?? 1 : 1;
      statusBar.update({ kind: "running", currentPhase, totalPhases: p?.totalPhases ?? 0, elapsed });
    }
  });
```

```
DELETE L118-131: const refreshArchive = async () => { ... }
REPLACE WITH:
  const refreshArchive = async () => {
    const active = manager.getActiveSession();
    if (!active) return;
    const archiveRoot = path.join(active.workspaceRoot, ".claudeloop", "archive");
    // ... rest same but using active.workspaceRoot
  };
```

```
DELETE L207-223: wireSessionEvents() + session.on("state-changed") archive listener
REPLACE WITH:
  // Wire each session's events
  for (const ws of manager.getAllSessions()) {
    wireSessionEvents({
      session: ws.sessionState, statusBar, phaseTree, onDidChangeTreeData,
      outputManager, notifications, elapsedTimer, dependencyGraph,
    });
    ws.sessionState.on("state-changed", (_from, to) => {
      if (to === "done" || to === "failed") refreshArchive();
    });
  }
```

```
DELETE L236-245: initWorkspaceWatchers() with single session
(This moves to Phase 9 — keep a placeholder call that passes manager)
```

```
DELETE L277-289: processManager + workspaceRoot + _processManager
DELETE L292-309: gitExec + diffProvider
REPLACE WITH:
  // PM and gitExec already created per-folder above
  // DiffProvider needs active session's gitExec
  const diffProvider = new PhaseDiffProvider({
    gitExec: { get exec() { return manager.getActiveSession()?.gitExec?.exec ?? (async () => ""); },
               get cwd() { return manager.getActiveSession()?.workspaceRoot ?? ""; } },
  });
  disposables.push(vscode.workspace.registerTextDocumentContentProvider(DIFF_URI_SCHEME, diffProvider));

  _sessionManager = manager; // replaces _processManager
```

```
DELETE L322-338: registerCommands() with single PM/session/workspaceRoot
REPLACE WITH:
  const active = manager.getActiveSession();
  disposables.push(...registerCommands({
    processManager: active?.processManager,
    installer, session: active?.sessionState ?? new SessionState(),
    statusBar, workspaceRoot: active?.workspaceRoot,
    readdir: (dir) => fs.readdir(dir), onArchiveRefresh: refreshArchive,
    dependencyGraph, configWizard, replayViewer,
    gitExec: active?.gitExec, resolvePhaseItem, resolveArchiveItem,
  }));
```

```
DELETE L346-358: deactivate() + _processManager
REPLACE WITH:
  let _sessionManager: WorkspaceSessionManager | undefined;

  export async function deactivate(): Promise<void> {
    if (_sessionManager) {
      for (const ws of _sessionManager.getAllSessions()) {
        if (ws.processManager?.isRunning) await ws.processManager.deactivate();
      }
      _sessionManager.dispose();
    }
    for (const d of disposables) d.dispose();
  }
```

**Active folder tracking:**
```
  // Listen for active editor changes
  disposables.push(vscode.window.onDidChangeActiveTextEditor(() => {
    manager.checkActiveFolder(); // fires onDidChangeActiveSession if folder changed
  }));

  // Handle workspace folder add/remove
  disposables.push(vscode.workspace.onDidChangeWorkspaceFolders((e) => {
    for (const added of e.added) {
      const ws = manager.createSession(added.uri.toString(), added.uri.fsPath, {});
      // create PM + gitExec for new folder...
    }
    for (const removed of e.removed) {
      manager.removeSession(removed.uri.toString());
    }
  }));
```

**Files:** `src/extension.ts`

**Post-flight:** Run `npm test` and `npm run lint`. ALL existing tests must pass.

**Action:** `/visual-verification` — launch EDH with single-root workspace. Verify extension activates, basic features work (phase tree, status bar, start/stop). Then multi-root — verify no errors on activation.

---

### Phase 9: Multi-root — workspaceInit.ts per-folder watchers

Refactor watcher setup for per-folder routing.

**Concrete changes:**
- Line 23 (`workspaceFolders[0].uri.fsPath`): Loop through all folders.
- Line 41 (`RelativePattern(workspaceFolders[0], ".claudeloop/**")`): Per-folder `RelativePattern`.
- Lines 30, 34, 37 (`session.onLockChanged`, etc.): Route to folder-specific `WorkspaceSession.sessionState` using closure over folder URI.
- New signature: accept sessions from `WorkspaceSessionManager`, create one `WatcherManager` per folder.
- Lines 54-84 (initial state check): Replicate per folder.

**Files:** `src/workspaceInit.ts`

**Post-flight:** Run `npm test` and `npm run lint`.

**Action:** `/visual-verification` — launch EDH with mock `.claudeloop/` data. Verify watchers detect file changes and update session state.

---

### Phase 10: Multi-root — sessionWiring.ts active session guard

Update session event wiring so only the active session drives the UI.

**Concrete changes:**
- `SessionWiringDeps` interface (line 11): Add `folderName?: string` and `isActiveSession: () => boolean`.
- `session.on("state-changed")` (line 35): Only update `statusBar` and `elapsedTimer` if `isActiveSession()` returns true.
- `session.on("phases-changed")` (line 79): Only update `phaseTree` and `dependencyGraph` if active.
- `session.on("log-appended")` (line 100): Prefix output with `[folderName]` when multi-root.
- In `extension.ts`: call `wireSessionEvents` once per `WorkspaceSession`, passing `isActiveSession` check.

**Files:** `src/sessionWiring.ts`, `src/extension.ts`

**Post-flight:** Run `npm test` and `npm run lint`.

**Action:** `/visual-verification` — launch EDH with single-root, verify status bar and tree update normally. Multi-root: verify only active folder drives UI.

---

### Phase 11: Multi-root — commands.ts folder-aware handlers

Update command handlers to resolve workspace folder at runtime.

**Concrete changes:**
- `CommandDeps` interface (lines 18-32): Add `sessionManager: WorkspaceSessionManager`.
- Folder-scoped fields resolved at runtime: `processManager` (L19), `session` (L21), `workspaceRoot` (L23), `gitExec` (L29).
- Global fields unchanged: `installer` (L20), `statusBar` (L22), `readdir` (L24), webview panels (L26-28).
- Each command handler: `const active = deps.sessionManager.getActiveSession(); if (!active) return;` then extract `processManager`/`session`/`workspaceRoot` from it.
- Commands using `workspaceRoot` for path construction (lines 78, 129, 138, 250, 254, 266): resolve from active session.
- Update integration tests: `CommandDeps` now includes `sessionManager`.

**Regression checklist:** Phase tree, status bar, start/stop/reset, dependency graph, config wizard, archive, replay, CodeLens, diffs, logs, timeline, walkthrough — all must work in single-root.

**Files:** `src/commands.ts`, `src/test/integration/commands.test.ts`

**Post-flight:** Run `npm test` and `npm run lint`. ALL existing tests pass.

**Action:** `/visual-verification` — launch EDH single-root, run through regression checklist. Then multi-root: verify commands work.

---

### Phase 12: Multi-root — phaseTree.ts hierarchical tree view

Update phase tree to show folder grouping when multi-root.

**Concrete changes:**
- Replace `_deps: PhaseTreeDeps` (line 32) with `Map<string, { folderName: string; progress: ProgressState | null }>`.
- `getChildren(element?)`: No element AND multi-root → folder nodes (collapsible, `codicon-folder` icon, name label, status badge "3/5"/"idle"/"done"/"failed"). Element is folder URI → that folder's phase items. Single-root → flat list (unchanged).
- Add `getParent(element)` for tree navigation.
- New `update(folderUri, folderName, progress)` replaces old `update(deps)`.
- Folder node `contextValue`: `"oxveil-folder"`. Phase node `contextValue`: unchanged.

**Files:** `src/views/phaseTree.ts`, `src/test/unit/views/phaseTree.test.ts`

**Action:** `/visual-verification` — launch EDH multi-root. Verify folder grouping in tree. Compare against `docs/mockups/v04-multi-root.html` "Phase Tree" section. Single-root: flat list unchanged.

---

### Phase 13: Multi-root — statusBar.ts folder prefix + summary

Update status bar for multi-root folder context.

**Concrete changes:**
- `StatusBarState` in `src/types.ts`: Add `folderName?: string` and `otherRootsSummary?: string` to running/failed/done variants.
- `update()` in `src/views/statusBar.ts`: When `folderName` present, show `Oxveil: ${folderName} — Phase X/Y | Xm`. When `otherRootsSummary` present, show `+1 idle` etc. as tooltip or suffix.
- Single-root: `folderName` undefined → no prefix (unchanged).
- Update caller in `sessionWiring.ts`/`extension.ts` to pass folder name and compute other-roots summary from `manager.getAllSessions()`.

**Files:** `src/types.ts`, `src/views/statusBar.ts`, `src/test/unit/views/statusBar.test.ts`

**Action:** `/visual-verification` — launch EDH multi-root. Verify status bar shows `Oxveil: my-api — Phase 3/5 | 4m` with `+1 idle` suffix. Compare against mockup. Single-root: unchanged.

---

### Phase 14: Multi-root — folderPicker.ts utility + tests

Create the folder picker for multi-root command resolution.

**Implementation:**
- `pickWorkspaceFolder(manager: WorkspaceSessionManager, placeHolder?: string): Promise<WorkspaceSession | undefined>`
- Single-root: return only session immediately (no picker shown).
- Multi-root: `vscode.window.showQuickPick` with rich `QuickPickItem`:
  - `label`: `$(folder) folder-name` (theme icon)
  - `detail`: `Running — Phase 3/5 | 4m` or `Idle — No active session` or `Done — 7/7 phases | 18m`
- Unit tests: single-root returns without picker, multi-root calls showQuickPick.

**Files:** `src/views/folderPicker.ts` (new), `src/test/unit/views/folderPicker.test.ts` (new)

**Action:** Run `npm test` and `npm run lint`. All tests pass.

---

### Phase 15: Multi-root — webview panels folder scoping

Add folder context to each webview panel so they show the correct folder's data.

**Concrete changes:**
- Each panel (`executionTimeline.ts`, `dependencyGraph.ts`, `configWizard.ts`, `replayViewer.ts`): Add `currentFolderUri: string` field. Add `folderUri` parameter to `reveal()` method.
- In `commands.ts`: before opening a webview, resolve folder via tree context → active editor → folder picker. Pass `folderUri` to `reveal()`.
- On `onDidChangeActiveSession`: if panel is visible and folder changed, call `update()` with new folder's data.

**Files:** `src/views/executionTimeline.ts`, `src/views/dependencyGraph.ts`, `src/views/configWizard.ts`, `src/views/replayViewer.ts`, `src/commands.ts`

**Post-flight:** Run `npm test` and `npm run lint`.

**Action:** `/visual-verification` — launch EDH multi-root. Run "Oxveil: Start" → folder picker. Run "Oxveil: Show Timeline" → correct folder's data. Compare picker against `docs/mockups/v04-multi-root.html` "Folder Picker" section.

---

### Phase 16: Documentation — ARCHITECTURE.md + ADRs + GitHub issues

Update all documentation and create GitHub issues for deferred features.

**Implementation:**
1. **ARCHITECTURE.md** — add/update sections:
   - **ExecutionTimelinePanel**: webview component description, data flow (ProgressState → computeTimeline → renderTimelineHtml → webview)
   - **Welcome Walkthrough**: contributes.walkthroughs declaration, step completion events, context keys
   - **WorkspaceSessionManager**: multi-root architecture, WorkspaceSession class, folder-scoping pattern, active folder tracking
   - **FolderPicker**: utility for multi-root command resolution
   - Update architecture diagram: add timeline panel, walkthrough, session manager
   - Update file structure listing with all new files
   - Update commands table: add `oxveil.showTimeline`
   - Update roadmap: v0.4 complete, v0.5 preview (retry strategies, prompt template editor)

2. **ADRs** (next numbers after existing 0005):
   - `docs/adr/0006-execution-timeline-webview.md` — decision to create separate webview panel (vs extending dependency graph), inline SVG/HTML approach (consistent with DAG pattern), timestamp handling (local time assumption)
   - `docs/adr/0007-multi-root-workspace-sessions.md` — decision to use WorkspaceSessionManager pattern, per-folder session isolation, active folder tracking, backward compatibility with single-root

3. **Update `docs/adr/README.md`** index with new entries

4. **GitHub issues** (via `gh issue create` on `chmc/oxveil`):
   - **Retry Strategy Picker** — title: "v0.5: Retry strategy picker for failed phases". Body: reference mockup (`docs/mockups/v04-deep-integration.html` "Retry Strategy Picker" section), note prerequisite (claudeloop `--retry-strategy standard|stripped|targeted` CLI flag), describe 3 strategies, reference PROGRESS.md `Attempt N Strategy` fields, list Oxveil implementation scope (quick-pick UI, ProcessManager.retryWithStrategy, notification wiring)
   - **Prompt Template Editor** — title: "v0.5: Prompt template editor with live preview". Body: reference mockup section, note prerequisite (claudeloop template variable engine with `{{variable}}` syntax), describe side-by-side editor/preview webview, list Oxveil scope (template parser, HTML renderer, webview panel, bidirectional file sync)

**Files:** `ARCHITECTURE.md`, `docs/adr/0006-execution-timeline-webview.md` (new), `docs/adr/0007-multi-root-workspace-sessions.md` (new), `docs/adr/README.md`

**Action:** Read updated ARCHITECTURE.md — verify accuracy against implemented code. All new components documented. ADRs follow `docs/adr/TEMPLATE.md` format. Verify GitHub issues created with `gh issue list`.

---

### Phase 17: World-class README

Rewrite `README.md` to match the quality and structure of https://github.com/chmc/claudeloop README. The user must immediately understand what Oxveil does and why they want it.

**Implementation:**
Read the claudeloop README first (at https://github.com/chmc/claudeloop or via `gh repo view chmc/claudeloop --json description`) to understand its structure and tone.

Structure:
1. **Hero**: Extension name + one-line tagline + 3 key value proposition bullets
2. **Screenshot section**: Feature screenshots with captions — use `docs/screenshots/` for images. Create placeholder image references (`![Phase Tree](docs/screenshots/phase-tree.png)`) — actual screenshots will be captured during visual verification
3. **Quick start**: 3 steps — install extension, detect/install claudeloop, start first session. Include the walkthrough as the recommended onboarding path.
4. **Features** organized by category:
   - **Monitoring**: Phase tree, status bar, dependency graph, execution timeline, notifications
   - **Execution**: Start/stop/reset, run-from-phase, mark complete, archive/restore
   - **Configuration**: Config wizard (bidirectional `.claudeloop.conf` editor), VS Code settings
   - **Plan editing**: Syntax highlighting (TextMate grammar), CodeLens actions, AI Parse Plan
   - **Archive & replay**: Past runs browser, replay viewer, restore from archive
   - **Onboarding**: Welcome walkthrough (detect → configure → plan → run)
   - **Multi-root workspaces**: Per-folder sessions, folder-aware commands, folder picker
5. **Requirements**: VS Code ^1.100.0, claudeloop >= 0.22.0, Node.js >= 20
6. **Settings**: Table of all `oxveil.*` settings with types and defaults
7. **Commands**: Table of all `oxveil.*` commands with descriptions and when-clauses
8. **Architecture**: Brief overview + pointer to ARCHITECTURE.md
9. **Development**: Setup, build, test, release (concise — this is user-facing README, not contributor guide)
10. **License**

**Tone:** Clear, confident, user-focused. Explain what problems Oxveil solves (no more CLI juggling, visual monitoring, one-click execution). Match claudeloop README's directness.

**Files:** `README.md`

**Action:** `/visual-verification` — open README in VS Code markdown preview. Verify: renders cleanly, all sections present, links work, tables formatted correctly. Compare structure and polish against claudeloop README at https://github.com/chmc/claudeloop.

---

## Verification

After all phases complete:
1. `npm run build` — clean build, no errors
2. `npm run lint` — no type errors
3. `npm test` — all tests pass (existing + new)
4. Launch Extension Development Host — verify all features:
   - Welcome walkthrough visible in "Get Started" with correct step states
   - Execution timeline opens via "Oxveil: Show Timeline", renders Gantt chart
   - Multi-root workspace: folder grouping in tree, folder name in status bar, folder picker on commands
   - All v0.1-v0.3 features still work (regression check): phase tree, status bar, start/stop, dependency graph, config wizard, archive browser, replay viewer, CodeLens, plan syntax highlighting, View Diff, View Log
5. README renders well in VS Code preview and on GitHub
6. ARCHITECTURE.md accurate and complete
7. ADRs follow template format
8. GitHub issues for deferred features exist
