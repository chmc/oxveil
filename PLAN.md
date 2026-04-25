# Plan: Self-Improvement Mode (Issue #73)

## Context

When implementation runs via Oxveil/claudeloop, the learning loop is lost. In traditional Claude Code sessions, users give feedback and Claude updates CLAUDE.md. With Oxveil, implementation context is in claudeloop logs — expensive to process post-hoc.

This feature adds optional self-improvement mode that captures behavioral lessons during implementation and proposes updates to instruction files after session completion.

**Cross-repo:** claudeloop (capture) + oxveil (trigger/UI)

---

## Implementation Strategy: MVP First

The issue describes a comprehensive feature set. We'll implement in phases, with MVP delivering end-to-end value first.

**MVP scope:**
- Config option to enable self-improvement
- Token-free metrics capture in claudeloop (retries, duration, exit)
- Self-improvement tab opens after session completion
- Tab displays lessons, spawns Claude to propose updates
- User approval before any changes

**Deferred to future iterations:**
- Trigger-based Claude explanations (slow, retry, deviation)
- In-tab chat interface (use terminal for MVP)
- Dismissal learning
- Positive reinforcement tracking
- Skill promotion suggestions
- Token cost visibility in UI (requires API call tracking)

---

## Critical Files

**Oxveil:**
- `src/types.ts:3` - SessionStatus enum
- `src/sessionWiring.ts:96-115` - state-changed to "done" hook
- `src/views/sidebarState.ts:10-19` - SidebarView enum, `deriveViewState()` at line 87
- `src/views/sidebarRenderers.ts` - view rendering functions
- `src/views/replayViewer.ts` - pattern for simple webview panel
- `src/core/planChatSession.ts` - pattern for spawning Claude CLI in terminal
- `package.json:334-400` - configuration schema

**Claudeloop:**
- `lib/execution.sh:268-354` - `evaluate_phase_result()` where metrics available
- `lib/execution.sh:250-266` - `_complete_phase()` where success logged
- `lib/archive.sh` - archive session files

---

## Phases

### Phase 1: Configuration & Types (Oxveil) ✅

**Goal:** Add config option and type definitions.

**Files:**
- `package.json` - Add `oxveil.selfImprovement` boolean config (default: false)
- `src/types.ts` - Add `Lesson` interface
- `src/views/sidebarState.ts` - Add `"self-improvement"` to `SidebarView` union (type only, no logic change yet)
- `src/activateSidebar.ts` - Add `selfImprovementActive: boolean` to `SidebarMutableState` interface

**Types to add:**
```typescript
// src/types.ts
export interface Lesson {
  phase: number | string;
  title: string;
  retries: number;
  duration: number;  // seconds
  exit: "success" | "error";
}
```

**Tests:** Type-checking only (no runtime tests needed for type definitions).

**Mock site updates:** None yet (signature changes come in Phase 5).

---

### Phase 2: Lessons Capture (Claudeloop) ✅

**Goal:** Write token-free metrics to `.claudeloop/lessons.md` after each phase.

**Files:**
- `lib/lessons.sh` (new) - Functions to write lessons
- `lib/execution.sh` - Call lessons capture in `_complete_phase()` and on failure
- `lib/archive.sh` - Include lessons.md in archive

**lessons.md format:**
```markdown
## Phase 1: <title>
- retries: 0
- duration: 45s
- exit: success

## Phase 2: <title>
- retries: 2
- duration: 312s (expected: 180s)
- exit: error
```

**Implementation:**
1. Create `lib/lessons.sh` with:
   - `lessons_init()` - create/clear lessons.md
   - `lessons_write_phase()` - append phase metrics
2. Call `lessons_init()` at session start (in `claudeloop` main)
3. Call `lessons_write_phase()` in `_complete_phase()` and after `update_phase_status "failed"`
4. Add `lessons.md` to archive file list in `lib/archive.sh`

**Tests:** Shell unit test for lessons.sh functions.

---

### Phase 3: Lessons Parser (Oxveil) ✅

**Goal:** Parse `.claudeloop/lessons.md` into structured data.

**Files:**
- `src/parsers/lessons.ts` (new) - Parse lessons.md format
- `src/parsers/lessons.test.ts` (new) - Unit tests

**Implementation:**
```typescript
export function parseLessons(content: string): Lesson[] {
  // Parse markdown format into Lesson[]
}
```

**Tests:** Unit tests with fixture data covering success/failure/multi-phase.

---

### Phase 4: Self-Improvement Panel (Oxveil) ✅

**Goal:** Create webview panel to display lessons and trigger improvement session.

**Files:**
- `src/views/selfImprovementPanel.ts` (new) - Webview panel class
- `src/views/selfImprovementHtml.ts` (new) - HTML rendering
- `src/activateViews.ts` - Instantiate panel

**Pattern:** Follow `replayViewer.ts` structure.

**Panel UI:**
- Header: "Self-Improvement"
- Lessons summary table (phase, retries, duration, status)
- "Start Improvement Session" button
- "Skip" button

**Tests:** Unit test for HTML rendering.

Action: `/visual-verification` after implementation.

---

### Phase 5: Sidebar Self-Improvement View (Oxveil) ✅

**Goal:** Add sidebar state and renderer for self-improvement.

**Files:**
- `src/views/sidebarState.ts` - Add `selfImprovementActive` param to `deriveViewState()`, extend logic
- `src/views/sidebarRenderers.ts` - Add `renderSelfImprovement()` function

**Logic in deriveViewState():**
```typescript
// New parameter: selfImprovementActive?: boolean
// After completed check (before return "completed"):
if (sessionStatus === "done" && selfImprovementActive) return "self-improvement";
```

**Sidebar UI:**
- Badge: "Learning"
- Summary: "N lessons captured"
- Button: "Focus Session" (reveals panel)
- Link: "Skip" → calls `oxveil.selfImprovement.skip` command, sets `selfImprovementActive=false`, returns to idle

**Mock site updates (41 occurrences across 5 files):**
- `src/test/unit/views/sidebarState.test.ts` - 23 calls need new param (default undefined)
- `src/test/integration/stateSync.test.ts` - 10 calls
- `src/test/unit/core/lockPollWiring.test.ts` - 5 calls
- `src/test/integration/sessionWiring.test.ts` - 2 calls + `makeMutableState()` needs `selfImprovementActive`
- `src/test/integration/activateSidebar.test.ts` - 1 call

**Tests:** 
- Update existing `sidebarState.test.ts` tests for new param
- Add new tests for self-improvement view derivation

Action: `/visual-verification` after implementation.

---

### Phase 6: Session Wiring (Oxveil) ✅

**Goal:** Trigger self-improvement panel on session completion.

**Files:**
- `src/sessionWiring.ts` - Add hook in "done" case block (inside existing switch case, not new if)
- `src/sessionWiring.ts` - Add `selfImprovementPanel` to `SessionWiringDeps` interface

**Implementation in sessionWiring.ts (inside case "done", after line 113):**
```typescript
// Inside case "done":
const selfImprovementEnabled = deps.getConfig?.("selfImprovement") ?? false;
if (selfImprovementEnabled && view === "completed") {
  // Read and parse lessons.md
  const lessonsPath = path.join(deps.folderUri, ".claudeloop", "lessons.md");
  const lessonsContent = await fs.readFile(lessonsPath, "utf-8").catch(() => "");
  const lessons = parseLessons(lessonsContent);
  if (lessons.length > 0) {
    deps.selfImprovementPanel?.reveal(lessons);
    if (ms) ms.selfImprovementActive = true;
  }
}
```

**Note:** `selfImprovementActive` field added to `SidebarMutableState` in Phase 1. `deriveViewState()` updated in Phase 5.

**Tests:** 
- Integration test for state transition
- Test for empty lessons.md (no panel reveal)
- Test for config disabled (no action)

Action: `/visual-verification` - verify sidebar shows "Learning" badge after completion.

---

### Phase 7: Improvement Session (Oxveil) [COMPLETED]

**Goal:** Spawn Claude CLI with lessons context to propose CLAUDE.md updates.

**Files:**
- `src/core/selfImprovementSession.ts` (new) - Terminal session manager
- `src/commands/selfImprovement.ts` (new) - Register commands
- `package.json` - Register commands in contributes.commands

**Pattern:** Follow `planChatSession.ts` structure.

**System prompt:**
```
You are reviewing a completed implementation session. Based on the lessons captured, propose updates to CLAUDE.md that would prevent similar issues in future sessions.

Lessons:
<lessons content>

Focus on actionable rules. Be concise. Output a diff.
```

**Commands:**
- `oxveil.selfImprovement.start` - Start improvement session (opens terminal with Claude CLI)
- `oxveil.selfImprovement.skip` - Skip and return to idle:
  1. Set `ms.selfImprovementActive = false`
  2. Close self-improvement panel
  3. Sidebar transitions to "completed" (then user can archive or start new)

**Skip behavior:** User can skip at any time. Lessons.md is preserved (archived with session). No changes applied.

**Tests:** Unit test for prompt construction, command registration.

---

### Phase 8: End-to-End Integration [COMPLETED]

**Goal:** Wire everything together and test full flow.

**Files:**
- `src/activateViews.ts` - Wire panel creation, pass to session wiring
- `src/views/sidebarMessages.ts` - Add message types for self-improvement actions
- `src/extension.ts` - Register commands

**Flow:**
1. Session completes (all phases done)
2. Config check: selfImprovement enabled?
3. Read `.claudeloop/lessons.md`
4. Parse into Lesson[]
5. If lessons.length > 0: set `selfImprovementActive = true`
6. Sidebar shows "self-improvement" view
7. Auto-open self-improvement panel
8. User clicks "Start Improvement Session" → terminal with Claude
9. User reviews/applies suggestions (manual copy/paste in MVP)
10. User clicks "Skip" or closes terminal → `selfImprovementActive = false` → idle

Action: `/visual-verification` - full flow per Verification section criteria.

---

### Phase 9: Documentation

**Files:**

**Oxveil:**
- `README.md` - Self-improvement feature section (config option, how to use)
- `ARCHITECTURE.md` - Self-improvement panel, sidebar state, terminal session
- `docs/workflow/states.md`:
  - Section B: Add `"self-improvement"` to SidebarView table
  - Section B: Add decision table row for self-improvement derivation
  - Section B: Add row to renderer mapping table
  - Section E: Document `selfImprovementActive` in SidebarMutableState
  - Section F: Document `oxveil.selfImprovement.start` and `skip` commands
- `docs/adr/NNNN-self-improvement.md` - Design rationale:
  - Decision: Token-free metrics only in MVP (defer Claude explanations)
  - Decision: Cross-repo architecture (claudeloop capture + oxveil UI)
  - Decision: Terminal-based improvement session (not in-panel chat)
  - Decision: lessons.md format specification
  - Consequences: Manual copy/paste of suggestions in MVP

**Claudeloop:**
- `README.md` - lessons.md capture, format, archive behavior

---

## Verification

Action: `/visual-verification` with these acceptance criteria:

**Setup:**
1. Enable `oxveil.selfImprovement` in VS Code settings
2. Create a test project with PLAN.md containing 2-3 phases

**Happy path:**
1. Run session → at least one phase should retry or fail then succeed
2. `.claudeloop/lessons.md` exists with correct format (phase headers, retries, duration, exit)
3. After completion: sidebar shows "Learning" badge, "N lessons captured"
4. Self-improvement panel auto-opens with lessons table
5. Click "Start Improvement Session" → terminal opens with Claude CLI
6. Terminal shows lessons in system prompt
7. Claude proposes CLAUDE.md changes

**Skip path:**
1. Click "Skip" in sidebar or panel
2. `selfImprovementActive` resets to false
3. Sidebar transitions to "completed" state (or idle if user archived)
4. Panel closes

**Edge cases:**
1. Config disabled → no self-improvement panel, no "Learning" badge
2. Empty lessons.md (0 phases) → no panel reveal
3. Session fails → self-improvement still triggers (lessons captured for failed phases)
4. Archive → lessons.md included in archive

**Multi-root:**
1. Self-improvement triggers only for the workspace folder that completed

---

## Future Iterations (Not MVP)

**Trigger-based explanations (Phase 1+):**
- `oxveil.selfImprovement.slowThreshold` config
- `oxveil.selfImprovement.minRetries` config
- Claudeloop injects explanation prompt when triggers fire
- `[claude]` sections in lessons.md

**In-tab chat interface (Phase 2+):**
- Replace terminal with webview chat
- Inline diff display
- Approve/dismiss individual proposals

**Dismissal learning (Phase 3+):**
- `.oxveil/dismissed-patterns.md`
- Stop proposing rejected patterns

**Positive reinforcement (Phase 4+):**
- Note when rules followed successfully
- Data for "what's working" insights

**Skill promotion (Phase 5+):**
- Suggest converting repeated patterns to dedicated skill files
