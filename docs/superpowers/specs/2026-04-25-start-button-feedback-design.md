# Start Button Click Indication

**Issue:** [chmc/oxveil#65](https://github.com/chmc/oxveil/issues/65)  
**Date:** 2026-04-25  
**Status:** Approved

## Problem

When user clicks the Start button in the sidebar, there's no immediate visual feedback that the action is processing. The button is disabled for 2 seconds (double-click prevention), but if the state transition takes longer, the button re-enables and the user doesn't know if their click registered.

## Solution

Client-side optimistic UI update. When Start is clicked, immediately transform the button to show "Starting..." with a spinner icon via JavaScript. No state management changes required.

## Implementation

**File:** `src/views/sidebarScript.ts`

### Current Behavior (lines 19-22)
```javascript
if (btn.tagName === "BUTTON") {
  btn.setAttribute("disabled", "true");
  setTimeout(function() { btn.removeAttribute("disabled"); }, 2000);
}
```

### New Behavior
```javascript
if (btn.tagName === "BUTTON") {
  btn.setAttribute("disabled", "true");
  if (msg.command === "start") {
    btn.innerHTML = '<span class="codicon codicon-sync spin"></span> Starting...';
  } else {
    setTimeout(function() { btn.removeAttribute("disabled"); }, 2000);
  }
}
```

## Why This Works

- **Instant feedback:** JavaScript executes immediately, no async wait
- **Self-cleaning:** When running state arrives, entire view re-renders with Stop button
- **No race conditions:** Button stays disabled throughout transition
- **Minimal change:** Single file, ~5 lines modified

## User Experience

```
BEFORE CLICK:
┌─────────────────┐
│     Start       │  (primary button)
└─────────────────┘

AFTER CLICK:
┌─────────────────┐
│ ◐ Starting...   │  (disabled, spinner)
└─────────────────┘

WHEN RUNNING:
┌─────────────────┐
│      Stop       │  (normal re-render)
└─────────────────┘
```

## Testing

1. Visual verification: Click Start, observe "Starting..." with spinner
2. Verify button stays disabled until Stop button appears
3. Verify normal operation after state transition completes

## Alternatives Considered

1. **Add "starting" view state:** Would require changes to sidebarState.ts, sidebarRenderers.ts, sessionWiring.ts, activateSidebar.ts. Adds complexity and potential race conditions for a visual-only feedback need.

2. **Add isStarting flag to SidebarState:** Similar complexity, overkill for the use case.

The client-side approach was chosen for its simplicity and immediate feedback without state management overhead.
