# Fix: Sidebar refresh button error dialog (Issue #92)

## Context

When pressing the sidebar refresh button, users see a VS Code error dialog instead of a graceful error message. This happens because the `refreshSidebar` function lacks error handling — exceptions propagate to VS Code's generic error handler.

## Root Cause

**Primary:** `src/sidebarRefresh.ts:139-157` — `refreshSidebar()` has no try/catch. Unprotected calls:
- `detectInconsistencies()` — filesystem operations with partial error handling
- `fullReInit()` — calls `loadPlanPhases()`, `refreshLessonsAvailable()` unprotected
- `sidebarPanel.updateState(buildFullState())` — could throw

**Secondary:** `src/activateCommands.ts:120-128` — command handler uses try/finally without catch (defense-in-depth).

## Phase 1: Add error handling to sidebarRefresh.ts

**File:** `src/sidebarRefresh.ts`

Wrap the refresh logic in try/catch with context-aware error message:

```typescript
export async function refreshSidebar(ctx: SidebarRefreshContext): Promise<void> {
  const { deps, sidebarPanel, loadPlanPhases, refreshLessonsAvailable, buildFullState } = ctx;
  if (!deps.workspaceRoot) {
    vscode.window.showWarningMessage("Oxveil: No workspace folder");
    return;
  }

  try {
    const inconsistent = await detectInconsistencies(ctx);

    if (inconsistent) {
      await fullReInit(ctx);
      vscode.window.showInformationMessage("Oxveil: Full refresh completed");
    } else {
      await loadPlanPhases();
      await refreshLessonsAvailable();
      sidebarPanel.updateState(buildFullState());
      vscode.window.showInformationMessage("Oxveil: Refreshed");
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    vscode.window.showErrorMessage(`Oxveil: Failed to refresh — ${msg}`);
  }
}
```

## Phase 2: Add unit tests

**File:** `src/test/unit/activateSidebar.test.ts`

Add tests:
1. Error handling — verify `showErrorMessage` called when refresh throws
2. Error message format — matches "Oxveil: Failed to refresh — {msg}"

## Verification

1. `npm run lint`
2. `npm test`
3. `/visual-verification` — trigger refresh error, verify friendly error message appears in VS Code notification (not generic error dialog)

## Close Issue

```bash
gh issue close 92 --comment "Fixed — added error handling to refreshSidebar"
```
