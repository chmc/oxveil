# Issue #62: Oxveil Sidebar Reset Button

## Context

**Issue:** chmc/oxveil#62 requests a reset button in the Oxveil sidebar that clears all state and returns to initial view.

**Problem:** Users cannot easily reset Oxveil to a clean slate. The "Restart" button only appears in the "Stopped" view and only resets claudeloop state (not PLAN.md).

**claudeloop's `--reset` behavior:**
- Clears `.claudeloop/` directory (logs, config, progress) except archives
- Does NOT delete PLAN.md
- Re-runs setup wizard (interactive prompts)

**Current Oxveil state:**
- `oxveil.reset` command exists - spawns `claudeloop --reset`
- "Restart" button only in `renderStopped()` view
- No reset accessible from: running, failed, completed, planning, ready, empty views
- SessionState.reset() only clears progress, transitions done/failed → idle

**User decision:**
- **Scope:** Full reset - delete PLAN.md + clear .claudeloop/ state, return to empty view
- **Placement:** Sidebar header menu (gear/overflow icon)

## Implementation

### Phase 1: Register fullReset command
**Files:** `src/commands.ts`, `src/activateSidebar.ts`, `src/extension.ts`, `package.json`

1. Add `oxveil.fullReset` command in `package.json`:
   - Command definition with title "Oxveil: Reset", icon `$(debug-restart)`
   - Add to `commandPalette` menu with `when: "oxveil.detected"`

2. Add `onFullReset` callback to `activateSidebar.ts`:
   - Reset all `SidebarMutableState` fields: cost=0, todoDone=0, todoTotal=0, cachedPlanPhases=[], planUserChoice="none", planDetected=false
   - Call `sessionState.reset()` on active session
   - Refresh sidebar via `sidebarPanel.updateState(buildFullState())`
   - Return this from `activateSidebar()` like `onPlanFormed`

3. Wire `onFullReset` in `extension.ts`:
   - Pass `sidebar.onFullReset` to `registerCommands` as part of `CommandDeps`

4. Register handler in `src/commands.ts`:
   - Add `onFullReset?: () => void` to `CommandDeps`
   - Show confirmation dialog (modal): "This will delete PLAN.md and clear all session state. This cannot be undone."
   - If confirmed:
     - Stop running process if any (`processManager.stop()`)
     - Delete `PLAN.md` via `fs.unlink()` (match existing pattern)
     - Delete `.claudeloop/ai-parsed-plan.md` if exists
     - Delete `.claudeloop/` contents except `archive/` directory (enumerate with `fs.readdir()` + filter)
     - Call `onFullReset()` callback

**Note:** The wiring layer handles stopping elapsed timer and clearing notifications when state transitions. File watcher on PLAN.md will also fire `onDidDelete` — harmless overlap.

### Phase 2: Add sidebar header menu
**Files:** `package.json`

Add `view/title` menu contribution for overflow menu:
```json
"view/title": [
  {
    "command": "oxveil.fullReset",
    "when": "view == oxveil.sidebar",
    "group": "navigation"
  }
]
```

### Phase 3: Wire sidebar message handler
**Files:** `src/views/sidebarMessages.ts`

Add `fullReset` to `COMMAND_MAP` → `oxveil.fullReset` for webview button support (future use).

### Phase 4: Add tests
**Files:** `src/test/commands.test.ts` (or new file)

- Unit test for `oxveil.fullReset` command handler
- Mock `fs.unlink`, `fs.readdir`, confirmation dialog
- Verify all state is cleared (SessionState, SidebarMutableState)
- Verify archives directory is preserved

### Phase 5: Update documentation
**Files:** `docs/workflow/states.md`

- Add `fullReset` command to Section F (Sidebar Commands)
- Document effect on SessionState transitions
- Add "reset flow" to Section E (Cross-Machine Wiring)

### Phase 6: Visual verification
Run `/visual-verification` with full test scenario:
1. Build and launch EDH with test workspace
2. Create PLAN.md with test content, verify sidebar shows "Ready" state
3. Click Reset icon in sidebar header, verify confirmation dialog appears
4. Confirm reset, verify sidebar returns to "empty" view
5. Verify PLAN.md deleted from filesystem
6. Verify .claudeloop/archive/ preserved if it existed
7. Existing "Restart" button in Stopped view still works (keeps plan) - test separately

## Verification
- `npm run lint && npm test`
- `/visual-verification` with acceptance criteria:
  1. Reset icon appears in sidebar header overflow menu
  2. Create a PLAN.md, verify sidebar shows "Ready" state
  3. Click Reset, confirm dialog appears with explicit message
  4. Confirm reset, verify sidebar returns to "empty" view
  5. Verify PLAN.md is deleted
  6. Verify archives directory is preserved
