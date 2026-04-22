# Analysis: Fix Stale Sidebar During Planning (Issue #55)

## Context

**Problem:** When user clicks "Let's Go" to start planning, the sidebar remains stuck showing "From Idea to Reality" + "Let's Go" button. Plan Chat terminal opens, Plan Preview shows activity, but sidebar shows wrong state.

**User expectation:** Sidebar should indicate planning is active and provide relevant actions (focus chat, show preview).

## Root Cause Analysis

**Confirmed by code review:**

1. `onPlanChatSessionCreated` (extension.ts:336) calls `sidebar.onPlanReset()`
2. `onPlanReset()` (activateSidebar.ts:194) sets `planUserChoice = "dismiss"`
3. `deriveViewState()` (sidebarState.ts:108) returns `"empty"` when `planUserChoice === "dismiss"`
4. Sidebar renders empty state while Plan Chat is active

**Asymmetry:** Plan Preview has `setSessionActive(true/false)` mechanism. Sidebar has no equivalent.

## Proposed Solution (from issue)

Add `"planning"` to `PlanUserChoice` type and wire plan chat lifecycle callbacks.

## Critic Review Findings

### 1. Root Cause: CORRECT
- The issue's diagnosis is accurate
- `planUserChoice = "dismiss"` is the direct cause of stuck state

### 2. Missing Steps Identified

| Gap | Location | Required Fix |
|-----|----------|--------------|
| File watcher guard | `activateSidebar.ts:136` | Add `"planning"` to guard: `if (state.planUserChoice !== "resume" && state.planUserChoice !== "dismiss" && state.planUserChoice !== "planning")` |
| Status bar derivation | `deriveStatusBar.ts` | Verify `"planning"` falls through to `idle` is acceptable (no explicit case needed) |
| workflowStatesSync test | `workflowStatesSync.test.ts:73-82` | Add `"planning"` to `SOURCE_SIDEBAR_VIEW` array |
| Renderer switch | `sidebarRenderers.ts` | Add `case "planning":` before default |
| Command mappings | `sidebarMessages.ts` | Add `focusPlanChat`, `showPlanPreview` to `COMMAND_MAP` |

### 3. UX Concerns

| Issue | Current Design | Suggested Fix |
|-------|----------------|---------------|
| Wrong affordance | Spinner icon | Use chat/conversation icon (planning is user-driven, not loading) |
| Premature CTA | "Form Claudeloop Plan" as primary | Make "Focus Chat" primary (user should interact with terminal first) |
| Copy mismatch | "Shaping Your Plan" | Consider "Plan Chat Active" or imperative "Shape Your Plan" |

### 4. Alternative Approach Considered

**Simpler fix:** Replace `onPlanReset()` call with purpose-built `onPlanChatStarted()` that doesn't set `planUserChoice = "dismiss"`.

**Why the proposed approach is better:**
- Explicit `"planning"` state enables future extensibility
- Clear sidebar view for planning phase matches mental model
- Consistent with Plan Preview's `setSessionActive()` pattern

## Recommendation

The issue's proposed plan is sound with the following additions:

1. **Add file watcher guard update** (Phase 2.2 addition)
2. **Verify status bar fallthrough** (Phase 1 addition)
3. **Consider UX refinements:**
   - Swap spinner for chat icon (codicon `comment-discussion` or `comment`)
   - Make "Focus Chat" primary, "Form Plan" secondary
   - Update copy to "Plan Chat Active" or similar

## Design Decision

**Chosen: Refined design**
- Icon: `codicon-comment-discussion` (chat icon, not spinner)
- Title: "Plan Chat Active"
- Description: "Discuss your idea with AI. When ready, form it into an executable plan."
- Primary CTA: "Focus Chat" (focuses plan chat terminal)
- Secondary CTA: "Form Claudeloop Plan"
- Links: "Show Plan Preview"

---

## Implementation Plan

### Phase 1: Core State Changes
**Files:** `src/views/sidebarState.ts`

1. Add `"planning"` to `SidebarView` type union (line 9-17)
2. Add `"planning"` to `PlanUserChoice` type (line 19)
3. Update `deriveViewState()` — add early check after line 82:
   ```typescript
   if (planUserChoice === "planning" && sessionStatus === "idle") return "planning";
   ```

### Phase 2: Sidebar Activation Changes
**Files:** `src/activateSidebar.ts`

1. Add `onPlanChatStarted(): void` and `onPlanChatEnded(): void` to `SidebarActivationResult` interface
2. Implement callbacks:
   ```typescript
   function onPlanChatStarted(): void {
     state.planUserChoice = "planning";
     sidebarPanel.updateState(buildFullState());
   }
   
   function onPlanChatEnded(): void {
     state.planUserChoice = "none";
     sidebarPanel.updateState(buildFullState());
   }
   ```
3. Return both in result object
4. Update file watcher guard (line 136) to include `"planning"`:
   ```typescript
   if (state.planUserChoice !== "resume" && state.planUserChoice !== "dismiss" && state.planUserChoice !== "planning")
   ```

### Phase 3: Extension Wiring
**Files:** `src/extension.ts`

1. In `onPlanChatSessionCreated` (around line 334):
   - Replace `sidebar.onPlanReset()` with `sidebar.onPlanChatStarted()`
2. In `onDidCloseTerminal` handler (around line 306):
   - Add `sidebar.onPlanChatEnded()` call

### Phase 4: Sidebar Renderer
**Files:** `src/views/sidebarRenderers.ts`, `src/views/sidebarMessages.ts`

1. Add `renderPlanning()` function:
   ```typescript
   function renderPlanning(state: SidebarState): string {
     const archivesHtml = renderArchives(state.archives);
     return `<div class="centered-layout">
     <div class="state-icon"><span class="codicon codicon-comment-discussion"></span></div>
     <h2 class="state-title">Plan Chat Active</h2>
     <p class="state-desc">Discuss your idea with AI. When ready, form it into an executable plan.</p>
     ${renderActionBar([
       { label: "Focus Chat", command: "focusPlanChat", primary: true },
       { label: "Form Claudeloop Plan", command: "formPlan" },
     ])}
     <div class="link-actions">
       <a class="link-action" data-command="showPlanPreview">Show Plan Preview</a>
     </div>
   </div>
   ${archivesHtml}`;
   }
   ```
2. Add `case "planning":` in `renderBody()` switch
3. Add command mappings in `sidebarMessages.ts`:
   - `focusPlanChat` → focus the plan chat terminal
   - `showPlanPreview` → reveal Plan Preview panel

### Phase 5: Documentation
**Files:** `docs/workflow/states.md`

1. Add `"planning"` to `SidebarView` type in Appendix
2. Add row to Decision Table (after row 1)
3. Update flowchart
4. Add `planning` row to Renderer Table
5. Update `PlanUserChoice` type definition

### Phase 6: Tests
**Files:** Multiple test files

1. `sidebarState.test.ts` — add tests for `planUserChoice === "planning"`
2. `activateSidebar.test.ts` — add tests for `onPlanChatStarted`/`onPlanChatEnded`
3. `workflowStatesSync.test.ts` — add `"planning"` to `SOURCE_SIDEBAR_VIEW` array
4. `sidebarRenderers.test.ts` — add test for `renderPlanning()` output

### Phase 7: Visual Verification
Run `/visual-verification` with acceptance criteria:
1. Start VS Code with extension loaded
2. Click "Let's Go" button in sidebar
3. Verify sidebar transitions to "Plan Chat Active" view with chat icon
4. Verify "Focus Chat" button focuses the terminal
5. Verify "Show Plan Preview" link works
6. Close plan chat terminal
7. Verify sidebar transitions back (empty if no PLAN.md, stale if PLAN.md exists)

---

## Files to Modify

**Core:**
- `src/views/sidebarState.ts`
- `src/activateSidebar.ts`
- `src/extension.ts`
- `src/views/sidebarRenderers.ts`
- `src/views/sidebarMessages.ts`

**Docs:**
- `docs/workflow/states.md`

**Tests:**
- `src/test/unit/views/sidebarState.test.ts`
- `src/test/unit/views/sidebarRenderers.test.ts`
- `src/test/unit/docs/workflowStatesSync.test.ts`
- `src/test/integration/activateSidebar.test.ts`
- `src/test/unit/activateSidebar.test.ts`
- `src/test/unit/commands/formPlan.test.ts` (verify — uses `onPlanFormed` mock)

---

## Verification

1. `npm run lint` — no errors
2. `npm test` — all tests pass (including new planning state tests)
3. `/visual-verification` — sidebar transitions correctly through planning lifecycle
4. Manual test: close terminal mid-planning, verify sidebar resets to correct state
