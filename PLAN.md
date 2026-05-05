# Refresh Button for Oxveil Sidebar

## Context

Users report Oxveil sometimes shows stale state — missed transitions, outdated phases, or lock file mismatch. A manual refresh button lets users force a state re-read when they suspect staleness, with smart detection to trigger full re-init only when needed.

## Approach

Add refresh button to sidebar title bar. Quick refresh first (re-read disk state), full re-init if inconsistencies detected.

## Changes

### 1. package.json — Command and Menu

Add command (after line 185):
```json
{
  "command": "oxveil.refreshSidebar",
  "title": "Oxveil: Refresh",
  "icon": "$(refresh)"
}
```

Add to `view/title` menu (after line 304):
```json
{
  "command": "oxveil.refreshSidebar",
  "when": "view == oxveil.sidebar && oxveil.detected",
  "group": "navigation@3"
}
```

Add to `commandPalette` (after line 292):
```json
{
  "command": "oxveil.refreshSidebar",
  "when": "oxveil.detected"
}
```

### 2. src/activateSidebar.ts — Refresh Logic

Add to `SidebarActivationResult` interface:
```typescript
/** Manual refresh — quick re-read, full re-init if inconsistent */
refreshSidebar: () => Promise<void>;
```

Implement after `refreshLessonsAvailable()`:
```typescript
async function refreshSidebar(): Promise<void> {
  if (!deps.workspaceRoot) {
    vscode.window.showWarningMessage("Oxveil: No workspace folder");
    return;
  }

  const inconsistent = await detectInconsistencies();
  
  if (inconsistent) {
    await fullReInit();
    vscode.window.showInformationMessage("Oxveil: Full refresh completed");
  } else {
    await loadPlanPhases();
    await refreshLessonsAvailable();
    sidebarPanel.updateState(buildFullState());
    vscode.window.showInformationMessage("Oxveil: Refreshed");
  }
}

async function detectInconsistencies(): Promise<boolean> {
  const session = manager.getActiveSession();
  const workspaceRoot = deps.workspaceRoot!;
  const claudeloopDir = path.join(workspaceRoot, ".claudeloop");
  const sessionState = session?.sessionState;

  // 1. Lock file vs session status (SessionState.status)
  const lockPath = path.join(claudeloopDir, "lock");
  let lockExists = false;
  try {
    await fs.access(lockPath);
    lockExists = true;
  } catch { /* no lock */ }

  const isRunning = sessionState?.status === "running";
  if (isRunning !== lockExists) return true;

  // 2. planDetected vs PLAN.md existence
  const planMdPath = path.join(workspaceRoot, "PLAN.md");
  let planMdExists = false;
  try {
    await fs.access(planMdPath);
    planMdExists = true;
  } catch { /* no PLAN.md */ }
  if (state.planDetected !== planMdExists) return true;

  // 3. cachedPlanPhases count vs ai-parsed-plan.md
  const parsedPlanPath = path.join(claudeloopDir, "ai-parsed-plan.md");
  try {
    const content = await fs.readFile(parsedPlanPath, "utf-8");
    const parsed = parsePlan(content);
    if (state.cachedPlanPhases.length !== parsed.phases.length) return true;
  } catch { /* no parsed plan */ }

  // 4. progress phases vs PROGRESS.md on disk
  const progressPath = path.join(claudeloopDir, "PROGRESS.md");
  try {
    const content = await fs.readFile(progressPath, "utf-8");
    const diskProgress = parseProgress(content);
    const memProgress = sessionState?.progress;
    if (diskProgress.phases.length !== (memProgress?.phases.length ?? 0)) return true;
    // Check phase statuses match
    for (let i = 0; i < diskProgress.phases.length; i++) {
      if (diskProgress.phases[i].status !== memProgress?.phases[i]?.status) return true;
    }
  } catch { /* no progress file */ }

  // 5. aiParsing stuck (flag true but no parse running)
  if (state.aiParsing && !isRunning) return true;

  // 6. planUserChoice stuck at "planning" with no terminal
  // (Would need terminal tracking — skip for MVP, rely on full re-init to clear)

  // 7. selfImprovementActive stuck (true but no terminal)
  // (Would need terminal tracking — skip for MVP, rely on full re-init to clear)

  // 8. Archive count mismatch
  const archiveDir = path.join(claudeloopDir, "archive");
  try {
    const entries = await fs.readdir(archiveDir);
    const archiveDirs = entries.filter(e => e.startsWith("run-"));
    if (archiveDirs.length !== archiveTree.getArchiveCount()) return true;
  } catch { /* no archive dir */ }

  // 9. Elapsed timer running but session not running (or vice versa)
  if (elapsedTimer.isRunning() !== isRunning) return true;

  return false;
}

async function fullReInit(): Promise<void> {
  const session = manager.getActiveSession();
  const workspaceRoot = deps.workspaceRoot!;
  
  // 1. Reset session state if not running
  if (session && session.sessionState.status !== "running") {
    session.sessionState.reset();
  }

  // 2. Reset mutable state
  state.cost = 0;
  state.todoDone = 0;
  state.todoTotal = 0;
  state.aiParsing = false;
  state.selfImprovementActive = false;
  state.planUserChoice = "none";

  // 3. Re-detect plan
  const planMdPath = path.join(workspaceRoot, "PLAN.md");
  try {
    await fs.access(planMdPath);
    state.planDetected = true;
  } catch {
    state.planDetected = false;
  }

  // 4. Reload cached state from disk
  await loadPlanPhases();
  await refreshLessonsAvailable();
  archiveTree.refresh();

  // 5. Restart watchers (kills stale, starts fresh)
  if (session?.watchers) {
    session.watchers.stop();
    session.watchers.start();
  }

  // 6. Sync elapsed timer with session state
  const isRunning = session?.sessionState.status === "running";
  if (isRunning && !elapsedTimer.isRunning()) {
    elapsedTimer.start();
  } else if (!isRunning && elapsedTimer.isRunning()) {
    elapsedTimer.stop();
  }

  // 7. Update context keys
  await vscode.commands.executeCommand("setContext", "oxveil.processRunning", isRunning);
  await vscode.commands.executeCommand("setContext", "oxveil.walkthrough.hasPlan", state.planDetected);

  // 8. Refresh Plan Preview Panel if visible
  if (deps.planPreviewPanel?.visible) {
    deps.planPreviewPanel.refresh();
  }

  // 9. Update sidebar and status bar
  sidebarPanel.updateState(buildFullState());
  // Status bar derives from sidebar via deriveStatusBarFromView() — updated automatically
}
```

Add to return object:
```typescript
refreshSidebar,
```

### 3. src/activateCommands.ts — Command Registration

Add to deps interface:
```typescript
refreshSidebar: () => Promise<void>;
```

Add command registration with debounce guard:
```typescript
let refreshInFlight = false;
vscode.commands.registerCommand("oxveil.refreshSidebar", async () => {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    await deps.refreshSidebar();
  } finally {
    refreshInFlight = false;
  }
});
```

### 4. src/extension.ts — Wiring

Pass `refreshSidebar` to `activateCommands`:
```typescript
refreshSidebar: sidebar.refreshSidebar,
```

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add command, menu entry, palette entry |
| `src/activateSidebar.ts` | Add `refreshSidebar()`, `detectInconsistencies()`, `fullReInit()`, import `parseProgress` |
| `src/activateCommands.ts` | Register command with debounce |
| `src/extension.ts` | Wire sidebar.refreshSidebar to commands |
| `src/views/archiveTree.ts` | Add `getArchiveCount(): number` → `return this._entries.length` |
| `src/views/elapsedTimer.ts` | Add `isRunning(): boolean` → `return this._intervalId !== undefined` |
| `src/views/planPreviewPanel.ts` | Add `refresh(): void` → re-send `_sendUpdate()` |

### Existing Methods (no changes needed)

| Class | Method | Status |
|-------|--------|--------|
| `WatcherManager` | `start()`, `stop()` | Already exist |
| `ArchiveTreeProvider` | `getEntries()` | Already exists |
| `ElapsedTimer` | `start()`, `stop()` | Already exist |

### Additional Dependencies for activateSidebar

`SidebarActivationDeps` needs:
```typescript
planPreviewPanel?: PlanPreviewPanel;  // For refresh on fullReInit
```

`detectInconsistencies()` and `fullReInit()` need access to:
- `archiveTree` — already in deps
- `elapsedTimer` — already in deps
- `session.watchers` — via `manager.getActiveSession()`

## State Coverage

Per `docs/workflow/states.md` Section B, `deriveViewState()` has 7 inputs. Refresh checks:

| Input | Check | Covered |
|-------|-------|---------|
| `detection` | Skip — unlikely to go stale mid-session | N/A |
| `sessionStatus` | Lock file existence vs `SessionState.status` | Yes |
| `planDetected` | PLAN.md existence vs `state.planDetected` | Yes |
| `progress` | PROGRESS.md phases vs `SessionState.progress` | Yes |
| `planUserChoice` | Reset to "none" in fullReInit | Yes |
| `selfImprovementActive` | Reset to false in fullReInit | Yes |
| `cachedPlanPhases` | ai-parsed-plan.md phase count | Yes |
| `aiParsing` | Flag stuck true when not running | Yes |
| `archiveCount` | Archive dirs vs archiveTree count | Yes |
| `elapsedTimer` | Timer running vs session running | Yes |

### Additional Systems Refreshed

| System | Action in fullReInit |
|--------|---------------------|
| Watchers | `stop()` + `start()` — kills stale, starts fresh |
| Context keys | Re-set `oxveil.processRunning`, `oxveil.walkthrough.hasPlan` |
| Plan Preview | `refresh()` if visible |
| Status bar | Derives from sidebar — auto-updated |
| Elapsed timer | Sync with session state |

## Verification

1. `npm run lint` — fix all
2. `npm test` — fix all
3. Add unit test: `activateSidebar.test.ts` — verify `refreshSidebar()` calls `updateState()`, test `detectInconsistencies()` returns true/false correctly
4. `/visual-verification` with acceptance criteria:
   - Refresh button visible in sidebar header (right of trash icon)
   - Button has $(refresh) icon
   - Click triggers UI update (phases re-render)
   - Info message "Oxveil: Refreshed" or "Oxveil: Full refresh completed" appears
   - Button visible in states: empty, ready, running, completed, failed, stopped
   - Button hidden when `oxveil.detected` is false (no .claudeloop)
5. `/visual-verification` edge case: simulate stale state
   - Start session, let it complete
   - Manually delete PROGRESS.md while sidebar shows completed
   - Click refresh → should trigger full re-init, sidebar updates to empty/ready
