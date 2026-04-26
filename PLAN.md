# Fix: Self-Improvement Chat Tab Not Appearing (Issue #81)

## Context

After a session completes with all phases successful, the self-improvement chat tab should appear. User has `oxveil.selfImprovement` enabled in settings, but the sidebar stays on the "completed" view and no self-improvement UI appears.

**Issue**: https://github.com/chmc/oxveil/issues/81
**Archived session**: `/Users/aleksi/source/oxveil/.claudeloop/archive/20260426-213041`

## Root Cause Analysis

### Missing Sidebar Refresh (Bug)
In `src/sessionWiring.ts` lines 161-173, the "done" handler:
1. Derives view state while `selfImprovementActive = false`
2. Runs self-improvement trigger asynchronously
3. Sets `ms.selfImprovementActive = true` (line 170)
4. **BUG**: Never refreshes sidebar with new state

The `buildAndSendSidebarState()` helper exists (lines 91-94) but is only called at line 206, which runs synchronously before the async self-improvement trigger completes.

## Implementation Plan

### Phase 1: Add Sidebar Refresh After Flag Set

**File**: `src/sessionWiring.ts`

**Current code** (lines 168-172):
```typescript
if (lessons.length > 0 && session.status === "done") {
  vscode.commands.executeCommand("oxveil.selfImprovement.start", lessons);
  if (ms) ms.selfImprovementActive = true;
}
```

**Fixed code**:
```typescript
if (lessons.length > 0 && session.status === "done") {
  vscode.commands.executeCommand("oxveil.selfImprovement.start", lessons);
  if (ms) {
    ms.selfImprovementActive = true;
    buildAndSendSidebarState();
  }
}
```

### Phase 2: Add Test Coverage

**File**: `src/test/integration/sessionWiring.test.ts`

The existing test "triggers self-improvement panel when config enabled and lessons exist" (line ~363) verifies the flag is set but does NOT verify sidebar refresh.

**Add to existing test deps**:
```typescript
const sidebarPanel = { updateState: vi.fn(), sendProgressUpdate: vi.fn() } as any;
// Include in deps object:
sidebarPanel,
```

**Add assertion**:
```typescript
expect(sidebarPanel.updateState).toHaveBeenCalledWith(
  expect.objectContaining({ view: "self-improvement" })
);
```

## Verification

1. `npm run lint` - no errors
2. `npm test` - all tests pass including new assertion
3. `/visual-verification`:
   - Run a session with multiple phases that all complete
   - Verify sidebar shows "self-improvement" view (lightbulb badge, "Learning")
   - Verify webview panel "Self-Improvement" appears with lessons table + Start/Skip buttons
   - Click Start → verify terminal opens with Claude CLI

## Critical Files

- `/Users/aleksi/source/oxveil/src/sessionWiring.ts` (fix location: line 170)
- `/Users/aleksi/source/oxveil/src/test/integration/sessionWiring.test.ts` (test update)
- `/Users/aleksi/source/oxveil/src/views/sidebarState.ts` (reference: `deriveViewState`)

## Notes

- The fix is a single-line addition calling an existing helper function.
- If webview panel still doesn't appear after fix, investigate `selfImprovement.ts` command handler (panel.reveal may be failing silently).
- No architectural changes needed.
