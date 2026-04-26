# Fix: Self-improvement session not appearing (Issue #77)

## Context

User reported that after completing a plan implementation via the sidebar start button, the self-improvement session UI never appeared. However, a valid `lessons.md` file was found in the archive (`/Users/aleksi/source/oxveil/.claudeloop/archive/20260426-094230/lessons.md`).

**User's question:** "Does sessions learning really work or not?"

## Root Cause

The `oxveil.selfImprovement` config **defaults to `false`** (package.json line 419). The self-improvement trigger in `sessionWiring.ts:162-163` checks this config first:

```typescript
const selfImprovementEnabled = deps.getConfig?.("selfImprovement") ?? false;
if (selfImprovementEnabled && view === "completed") {
  // ... trigger self-improvement
}
```

If the user hasn't explicitly enabled the config, the entire self-improvement flow is skipped even though:
- lessons.md is created by claudeloop (always happens)
- All phases completed successfully
- The lessons.md format is valid and parseable

**This behavior is intentional** (self-improvement spawns Claude CLI with API cost), but the feature is not discoverable.

## Recommended Fix: Self-Improvement Status in Sidebar

Add two UI elements to the sidebar:
1. **Always visible:** Self-improvement on/off status indicator (toggle or badge)
2. **Only when enabled:** Lessons status ("Lessons captured" or "No lessons available")

**Why this approach:**
- Clear visibility of feature status at all times
- Lessons details only shown when relevant (feature enabled)
- Non-intrusive - no popup interruption
- Discoverable - users see the setting exists

## Implementation

### Phase 1: Add selfImprovementEnabled and lessonsAvailable to SidebarState

**File:** `src/views/sidebarState.ts`

Add to `SidebarState` interface:
```typescript
selfImprovement?: {
  enabled: boolean;           // mirrors config setting
  lessonsAvailable?: boolean; // only relevant when enabled
};
```

### Phase 2: Pass config state to sidebar builder

**File:** `src/activateSidebar.ts`

When building sidebar state:
- Read `oxveil.selfImprovement` config
- If enabled, check for lessons via `findLessonsContent()`
- Set `selfImprovement: { enabled, lessonsAvailable }`

### Phase 3: Render self-improvement status in sidebar

**File:** `src/views/sidebarRenderers.ts`

Add to completed/ready views - self-improvement status section:
```html
<div class="self-improvement-status">
  <span class="label">Self-improvement:</span>
  ${state.selfImprovement?.enabled ? `
    <span class="badge on">On</span>
    <div class="lessons-info">
      ${state.selfImprovement.lessonsAvailable 
        ? '💡 Lessons captured' 
        : '📝 No lessons available'}
    </div>
  ` : `
    <span class="badge off">Off</span>
    <a href="command:workbench.action.openSettings?%5B%22oxveil.selfImprovement%22%5D">Enable</a>
  `}
</div>
```

### Phase 4: Add CSS for self-improvement status

**File:** `src/views/sidebarStyles.ts`

Add styling for:
- `.self-improvement-status` - container
- `.badge.on` / `.badge.off` - status indicator
- `.lessons-info` - secondary text when enabled

### Phase 5: Export findLessonsContent

**File:** `src/sessionWiring.ts`

Export `findLessonsContent` function for reuse in sidebar state builder.

### Phase 6: Tests

**File:** `src/test/unit/views/sidebarRenderers.test.ts`

Add tests:
- Shows "Self-improvement: Off" with Enable link when disabled
- Shows "Self-improvement: On" with lessons status when enabled
- Shows "Lessons captured" when enabled + lessons exist
- Shows "No lessons available" when enabled + no lessons

## Files to Modify

1. `src/views/sidebarState.ts` - Add `selfImprovement` to SidebarState
2. `src/sessionWiring.ts` - Export `findLessonsContent` function
3. `src/activateSidebar.ts` - Build selfImprovement state from config + lessons check
4. `src/views/sidebarRenderers.ts` - Render self-improvement status section
5. `src/views/sidebarStyles.ts` - Add status styling
6. `src/test/unit/views/sidebarRenderers.test.ts` - Test coverage
7. `docs/workflow/states.md` - Document new sidebar section

## Verification

1. Run `npm run lint` - fix all issues
2. Run `npm test` - all tests pass
3. `/visual-verification` with acceptance criteria:
   - With `oxveil.selfImprovement` OFF:
     - Sidebar shows "Self-improvement: Off" with Enable link
     - No lessons info shown
   - Click Enable link - opens settings
   - With `oxveil.selfImprovement` ON:
     - Sidebar shows "Self-improvement: On"
     - Shows "Lessons captured" or "No lessons available" based on archive
   - Run a plan to completion with self-improvement ON
     - Self-improvement panel appears (existing behavior)
