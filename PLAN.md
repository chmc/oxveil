# Fix Stale Sidebar During Planning (Issue #55)

## Context

**Problem:** When user clicks "Let's Go" to start planning, the sidebar renders blank instead of showing a planning-in-progress view.

**Investigation findings:** The issue description is outdated — most proposed work is already done:
- `"planning"` exists in `SidebarView` and `PlanUserChoice` types
- `deriveViewState()` returns `"planning"` when `planUserChoice === "planning" && sessionStatus === "idle"` (line 86)
- `onPlanChatStarted()` and `onPlanChatEnded()` callbacks are implemented and wired in `extension.ts`
- Tests cover the state transitions
- Documentation in `docs/workflow/states.md` is correct

**Actual root cause:** `renderPlanning()` function does NOT exist. The `renderBody()` switch (line 335-354) has no `case "planning":` — falls through to `default: return ""`, causing blank sidebar.

**Evidence:**
```typescript
// src/views/sidebarRenderers.ts:335-354
switch (state.view) {
  case "not-found": return renderNotFound(state);
  case "empty":     return renderEmpty(state);
  case "ready":     return renderReady(state);
  case "stale":     return renderStale(state);
  case "running":   return renderRunning(state);
  case "stopped":   return renderStopped(state);
  case "failed":    return renderFailed(state);
  case "completed": return renderCompleted(state);
  default:          return "";  // ← "planning" falls through here
}
```

---

## Phase 1: Implement `renderPlanning()` renderer

**File:** `src/views/sidebarRenderers.ts`

1.1 Add `renderPlanning(state: SidebarState): string` function following existing renderer pattern:
- Centered layout with sync/spinner icon
- Title: "Shaping Your Plan"
- Description explaining plan chat is active
- Info bar showing "Plan chat active"
- Action bar with "Form Plan" button (primary) — matches existing label in `renderEmpty()`
- Link actions: "Focus Chat", "Show Plan Preview"
- Archives section at bottom

1.2 Add `case "planning":` to `renderBody()` switch returning `renderPlanning(state)`

---

## Phase 2: Add command mappings

**File:** `src/views/sidebarMessages.ts`

2.1 Add `focusPlanChat` to `SidebarCommand` type union
2.2 Add `showPlanPreview` to `SidebarCommand` type union (if not already present)
2.3 Add mappings to `COMMAND_MAP`:
- `focusPlanChat` → `oxveil.focusPlanChat`
- `showPlanPreview` → `oxveil.showPlanPreview`

**File:** `src/commands.ts`

2.4 Register `oxveil.focusPlanChat` command that focuses the active plan chat terminal

---

## Phase 3: Tests

**File:** `src/test/unit/views/sidebarRenderers.test.ts`

3.1 Add test for `renderPlanning()` verifying:
- Contains "Shaping Your Plan" title
- Contains "Form Plan" button
- Contains "Focus Chat" and "Show Plan Preview" links
- Contains archives section when archives exist

**File:** `src/test/unit/views/sidebarHtml.test.ts`

3.2 Add test case for `planning` view in the view rendering tests

---

## Phase 4: Visual Verification

Run `/visual-verification` with acceptance criteria:
1. Start VS Code with extension loaded
2. Click "Let's Go" button in sidebar
3. Verify sidebar shows "Shaping Your Plan" view with spinner
4. Verify "Form Claudeloop Plan" button is visible and works
5. Verify "Focus Chat" link focuses terminal
6. Verify "Show Plan Preview" link reveals plan preview panel
7. Close plan chat terminal
8. Verify sidebar transitions back (empty if no PLAN.md, stale if PLAN.md exists)

---

## Critical Files

- `src/views/sidebarRenderers.ts` — add renderer
- `src/views/sidebarMessages.ts` — add command mappings
- `src/commands.ts` — add focusPlanChat command
- `src/test/unit/views/sidebarRenderers.test.ts` — add renderer tests
- `src/test/unit/views/sidebarHtml.test.ts` — add view rendering test

---

## Verification

```bash
npm run lint
npm test
```

Then `/visual-verification` for UI testing.
