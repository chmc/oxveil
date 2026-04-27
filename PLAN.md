# Plan: Form Plan Button State Management (Issue #83)

## Context

**Issue:** https://github.com/chmc/oxveil/issues/83

When user clicks "Form Plan" button, AI parsing starts but the button remains active (only 2s timeout), confusing users about whether the action started. After plan is confirmed, Plan Preview still shows an active "Form Claudeloop Plan" button while sidebar correctly shows "Start" — creating UX inconsistency.

**Root cause:** AI parse status (`LiveRunPanel._aiParseStatus`) is not exposed to sidebar or Plan Preview. Both panels render independently without awareness of parsing state or plan-formed state.

## Solution Overview

1. Add `aiParsing` flag to `SidebarMutableState` (activateSidebar.ts)
2. Add lifecycle callbacks `onAiParseStarted`/`onAiParseEnded` to propagate state
3. Update sidebar script to keep formPlan button disabled until state re-render (like "start" button)
4. Add `planFormed` flag to PlanPreviewPanel to hide button after plan is formed

---

## Phase 1: Add AI Parsing State to Sidebar

**Files:**
- `src/views/sidebarState.ts` — Add `aiParsing?: boolean` to `SidebarState` interface
- `src/activateSidebar.ts` — Add `aiParsing` to `SidebarMutableState`, add callbacks, include in `buildFullState()`

**Changes:**
1. `SidebarState` interface: add `aiParsing?: boolean`
2. `SidebarMutableState` interface: add `aiParsing: boolean`
3. Initialize `aiParsing: false` in state object
4. Add `onAiParseStarted`/`onAiParseEnded` to `SidebarActivationResult` interface
5. Implement callbacks that set `state.aiParsing` and call `sidebarPanel.updateState(buildFullState())`
6. Include `aiParsing: state.aiParsing` in `buildFullState()` return

**Acceptance:** `buildFullState()` returns state with `aiParsing` field reflecting current state.

---

## Phase 2: Update Sidebar Button Behavior

**Files:**
- `src/views/sidebarScript.ts` — Handle formPlan like "start" button (no timeout)
- `src/views/sidebarRenderers.ts` — Render disabled button with spinner when `aiParsing` is true

**Changes:**
1. `sidebarScript.ts`: In click handler, when `msg.command === "formPlan"`:
   - Set `btn.innerHTML = '<span class="codicon codicon-sync spin"></span> Forming...'`
   - Remove the 2s timeout (stays disabled until re-render)
2. `sidebarRenderers.ts`: In `renderPlanning()`, if `state.aiParsing`:
   - Render button as disabled with spinner/text

**Acceptance:** Clicking "Form Plan" disables button with "Forming..." spinner until state updates.

---

## Phase 3: Wire AI Parse Lifecycle in formPlan Command

**Files:**
- `src/commands/formPlan.ts` — Add and call lifecycle callbacks

**Changes:**
1. Add to `FormPlanCommandDeps` interface:
   ```typescript
   onAiParseStarted?: () => void;
   onAiParseEnded?: () => void;
   isAiParsing?: () => boolean;  // Guard against concurrent calls
   ```
2. At command start (after resolveFolder): early-return if `deps.isAiParsing?.()` returns true
3. Before `aiParseLoop()` call: `deps.onAiParseStarted?.()`
4. Use `try/finally` block:
   ```typescript
   deps.onAiParseStarted?.();
   try {
     const result = await aiParseLoop({ ... });
     // handle result
   } finally {
     deps.onAiParseEnded?.();
   }
   ```

**Acceptance:** Callbacks fire on every exit path (success, failure, abort, exception). Concurrent calls are blocked.

---

## Phase 4: Connect Callbacks in activateViews

**Files:**
- `src/activateViews.ts` — Wire sidebar callbacks to formPlan command

**Changes:**
1. Pass `onAiParseStarted` and `onAiParseEnded` from sidebar activation result to formPlan deps

**Acceptance:** Full end-to-end: click Form Plan → sidebar button disabled → parse completes → button re-enabled.

---

## Phase 5: Disable Plan Preview Button After Plan Formed

**Files:**
- `src/views/planPreviewPanel.ts` — Add `_planFormed` flag, disable button when true
- `src/views/planPreviewHtml.ts` — Update button rendering to support disabled state with tooltip
- `src/activateViews.ts` — Set flag on `onPlanFormed`

**Changes:**
1. Add private `_planFormed = false` field to `PlanPreviewPanel`
2. Add `setPlanFormed(formed: boolean)` method that sets flag and calls `_sendUpdate()`
3. Pass `planFormed` in options to `renderPhaseCardsHtml()`
4. In `planPreviewHtml.ts`: render button as disabled with tooltip when `planFormed`:
   ```html
   <button class="form-plan-btn" disabled title="Plan already formed. Start from sidebar.">Form Claudeloop Plan</button>
   ```
5. In activateViews, after `onPlanFormed` callback: call `planPreviewPanel.setPlanFormed(true)`
6. On `onPlanChatStarted`: call `planPreviewPanel.setPlanFormed(false)` to re-enable

**Acceptance:** After plan confirmed, Plan Preview shows disabled "Form Claudeloop Plan" button with tooltip. New plan chat re-enables it.

---

## Phase 6: Add Tests

**Files:**
- `src/test/unit/activateSidebar.test.ts` — Test AI parse state lifecycle
- `src/test/unit/views/sidebarScript.test.ts` — Test formPlan button behavior
- `src/test/unit/views/sidebarRenderers.test.ts` — Test disabled button when `aiParsing: true`
- `src/test/unit/commands/formPlan.test.ts` — Test callback invocation + early-return guard
- `src/test/unit/views/planPreviewPanel.basic.test.ts` — Test setPlanFormed

**Mock updates needed:**
- `activateSidebar.test.ts:makeDeps()` — add `aiParsing` to state
- `formPlan.test.ts:makeDeps()` — add `onAiParseStarted`, `onAiParseEnded`, `isAiParsing`

**Test cases:**
1. `onAiParseStarted` sets `aiParsing: true`
2. `onAiParseEnded` sets `aiParsing: false`
3. `buildFullState()` includes `aiParsing` field
4. formPlan button disables with "Forming..." text (no 2s timeout)
5. `renderPlanning()` renders disabled button when `aiParsing: true`
6. `onAiParseStarted` called before aiParseLoop
7. `onAiParseEnded` called in finally block (all exit paths including exceptions)
8. formPlan returns early if `isAiParsing()` returns true
9. `setPlanFormed(true)` disables form button with tooltip
10. `setPlanFormed(false)` enables form button

---

## Phase 7: Update Documentation

**Files:**
- `docs/workflow/states.md` — Document aiParsing state flow

**Changes:**
1. Add section on AI parsing state propagation to sidebar
2. Update sidebar view section to mention button state during parsing

---

## Verification

1. `npm run lint` — no errors
2. `npm test` — all pass including new tests
3. `/visual-verification` with acceptance criteria:
   - Click Form Plan → button shows "Forming..." and stays disabled
   - Parse completes → sidebar shows "Start", Plan Preview shows disabled "Form Claudeloop Plan" with tooltip
   - Hover disabled button → shows "Plan already formed. Start from sidebar."
   - New plan chat → Plan Preview re-enables form button
4. Edge case: close Plan Preview during parse, reopen → correct state shown
5. Edge case: rapid click Form Plan twice → second click is no-op (isAiParsing guard)

---

## Critical Files

| File | Purpose |
|------|---------|
| `src/activateSidebar.ts:44-57` | SidebarMutableState, add aiParsing |
| `src/views/sidebarState.ts:24-49` | SidebarState interface |
| `src/views/sidebarScript.ts:19-26` | Button click handler |
| `src/views/sidebarRenderers.ts:227-244` | renderPlanning() |
| `src/commands/formPlan.ts:11-19` | FormPlanCommandDeps |
| `src/views/planPreviewPanel.ts:278` | showFormButton logic |
| `src/views/planPreviewHtml.ts:114-116` | Button rendering |

---

## Out of Scope

- **Multi-root workspace per-folder aiParsing state**: Current implementation uses single `SidebarMutableState`. For multi-root, would need per-folder state in `WorkspaceSession`. Deferred to future issue if needed.
- **Cancel button during parsing**: LiveRunPanel already shows verify banners with abort option. Adding another cancel is feature creep.

---

## Phase 8: Create Follow-up Issue

**Action:** Create GitHub issue for "Re-enable Form Plan button when user edits plan after forming"

```bash
gh issue create --repo chmc/oxveil \
  --title "Feat: Re-enable Form Plan button when plan is edited after forming" \
  --body "## Context
After #83 is implemented, the Plan Preview 'Form Claudeloop Plan' button will be disabled after a plan is formed.

## Feature Request
When the user edits the plan file after forming (detected via file watcher), the button should re-enable to allow re-forming with the updated plan.

## Acceptance Criteria
- Plan Preview button re-enables when ai-parsed-plan.md or source plan file is modified
- Only triggers for edits, not for initial formation
- Sidebar 'Start' button remains active (user can still start without re-forming)

## Related
- Closes after #83 is merged"
```

**Acceptance:** Issue created and linked to #83.
