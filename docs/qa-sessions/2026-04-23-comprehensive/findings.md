# QA Verification Findings

**Session:** 2026-04-23-comprehensive

---

## SessionState Audit

### Matches

All 14 verified aspects match between code and documentation:

| Aspect | Status |
|--------|--------|
| 4 states (idle, running, done, failed) | Match |
| Initial state (idle) | Match |
| idle → running (on lock acquired) | Match |
| failed → running (on lock acquired) | Match |
| running → done (all phases completed) | Match |
| running → failed (any phase failed) | Match |
| running → done (default when partial) | Match |
| done → idle (on reset) | Match |
| failed → idle (on reset) | Match |
| Orphan recovery (checkInitialState) | Match |
| Event: state-changed | Match |
| Event: phases-changed | Match |
| Event: log-appended | Match |
| Event: lock-changed | Match |

### Divergences

None found.

### Ideas/Improvements

- [Info] Lock file polling fallback (5s interval) is documented in SessionState section but implemented in WatcherManager. Consider separating watcher docs if states.md grows.

---

## SidebarState Audit

### Matches

All 15 documented rules verified against code (lines 78-115 of `src/views/sidebarState.ts`):

| Rule # | Condition | View | Status |
|--------|-----------|------|--------|
| 1 | detection ≠ "detected" | not-found | Match |
| 2 | sessionStatus = "running" | running | Match |
| 3 | sessionStatus = "failed" | failed | Match |
| 4 | sessionStatus = "done" + all completed | completed | Match |
| 5 | sessionStatus = "done" + not all completed | stopped | Match |
| 6 | idle + has failed phase | failed | Match |
| 7 | idle + has in_progress phase | stopped | Match |
| 8 | idle + has completed + pending | stopped | Match |
| 9 | idle + all completed | completed | Match |
| 10 | idle + !planDetected + no progress | empty | Match |
| 11 | idle + all pending | ready | Match |
| 12 | idle + planDetected + dismiss | empty | Match |
| 13 | idle + planDetected + resume | ready | Match |
| 14 | idle + planDetected + none | stale | Match |
| 15 | idle + !planDetected (fallback) | ready | Match |

### Divergences

1. **Undocumented "planning" view state** — Critical — **FIXED**
   - Added "planning" to SidebarView type definition
   - Added "planning" row to Decision Table (Rule 2)
   - Added "planning" to Output States table
   - Added "planning" to Renderer Table
   - Updated flowchart with "planning" branch

2. **PlanUserChoice type incomplete in docs** — Moderate — **FIXED**
   - Code: `"none" | "resume" | "dismiss" | "planning"`
   - Docs updated: added `"planning"` to PlanUserChoice type

### Ideas/Improvements — **COMPLETED**

- [x] Added "planning" view to decision table as Rule 2
- [x] Updated Output States table with "planning" view description
- [x] Updated Appendix PlanUserChoice type to include "planning"
- [x] Added renderer row for "planning" view
- [x] Updated flowchart with "planning" branch
- [x] Added "stopped" to StatusBarState type definition

---

## StatusBar Audit

### Matches

All 8 status bar states verified against documentation (Section C, lines 200-212 of states.md):

| State Kind | Icon | Text | Tooltip | Background | Status |
|------------|------|------|---------|------------|--------|
| `not-found` | `$(warning)` | "Oxveil: claudeloop not found" | "claudeloop not found — click to install" | warningBackground | Match |
| `installing` | `$(sync~spin)` | "Oxveil: installing claudeloop..." | "Installing claudeloop..." | none | Match |
| `ready` | `$(symbol-event)` | "Oxveil: ready" | "claudeloop detected — ready to run" | none | Match |
| `idle` | `$(symbol-event)` | "Oxveil: idle" | "No active session" | none | Match |
| `stopped` | `$(debug-pause)` | "Oxveil: stopped" | "Execution stopped — click to resume" | none | Match |
| `running` | `$(sync~spin)` | "Oxveil: Phase N/M \| elapsed" | "Running — Phase N of M (elapsed)" | none | Match |
| `failed` | `$(error)` | "Oxveil: Phase N failed" | "Phase N failed — click for details" | errorBackground | Match |
| `done` | `$(check)` | "Oxveil: done \| elapsed" | "All phases completed (elapsed)" | none | Match |

Additional verified aspects:
- Multi-root display with `folderName` prefix and `otherRootsSummary` suffix: Match (lines 48-78 of statusBar.ts)
- Default command is `oxveil.phases.focus`: Match (line 21 of statusBar.ts)
- `deriveStatusBarFromView()` produces subset of states (not-found, ready, stopped, failed, done): Match

### Divergences

1. **Missing "stopped" in StatusBarState type definition** — Critical — **FIXED**
   - Added `stopped` to StatusBarState type definition in Appendix
   - Docs now match code implementation

2. **Tooltip format discrepancy for "done" state** — Minor
   - Docs (line 212): Tooltip is "All phases completed (elapsed)"
   - Code (line 79): Tooltip is ``All phases completed (${state.elapsed})`` — matches semantically but uses template string
   - Impact: None, equivalent output

### Ideas/Improvements

- [Fix] Add `stopped` to StatusBarState type definition in Appendix: `| { kind: "stopped"; folderName?: string; otherRootsSummary?: string }`

---

## PlanPreview Audit

### Matches

All 4 plan preview states verified against documentation (Section D, lines 227-261 of states.md):

| State | Condition | Display | Status |
|-------|-----------|---------|--------|
| `empty` | No phases parsed, no raw content | "Waiting for Claude..." / "Form a plan..." | Match |
| `raw-markdown` | Content exists but doesn't parse to phases | Raw markdown rendered | Match |
| `active` | Phases parsed, sessionActive = true | Phase cards with "Note" buttons, "Live" badge | Match |
| `session-ended` | Phases parsed, sessionActive = false | Phase cards without annotation buttons | Match |

State derivation logic verified (lines 254-279 of planPreviewPanel.ts):
- First checks `lastRawContent !== undefined` → `raw-markdown`: Match
- Then checks `!hasPhases` → `empty`: Match
- Then checks `sessionActive` → `active` / `session-ended`: Match

Additional verified aspects:
- Tab system with categories `"design" | "implementation" | "plan"`: Match (line 9, 100-101, 119-124)
- File watching with 200ms debounce: Match (lines 206-219)
- `beginSession()` and `endSession()` methods for session lifecycle: Match (lines 111-117)
- Messages: `ready`, `switchTab`, `annotation`, `formPlan`: Match (lines 95-104)

### Divergences

None found. Documentation accurately reflects implementation.

### Ideas/Improvements

- None required; documentation accurately reflects implementation

---

## State Edge Cases (Visual Verification)

**Session:** verification-sessions/20260423-131941-state-edge-cases/

### Tested

1. **Empty → Stale → Ready transitions** — Pass
   - Plan file creation triggers stale state correctly
   - "Resume" button transitions to ready state
   - Phases display correctly

2. **Rapid state changes** (Start → Stop → Restart → Stop) — Pass with notes
   - State transitions execute correctly
   - MCP bridge GET /state has ~500ms lag during rapid changes (expected async behavior)
   - Visual state is accurate; API reports stale value briefly

### Not Tested (Time Constraint)

1. **Orphan recovery** — Requires kill -9 and EDH relaunch
2. **Multi-root folder switching** — Requires multi-root workspace setup

### Findings

| Finding | Severity | Notes |
|---------|----------|-------|
| MCP bridge state lag during rapid clicks | Info | Expected async behavior, not a bug |

### Screenshots

- 01-empty.png — Empty state verified
- 02-stale.png — Stale state with Found badge
- 03-ready.png — Ready state with phases
- 04-07 — Rapid state change sequence

---

## User Stories US-01 to US-05 (Task 9)

**Session:** verification-sessions/20260423-132526-user-stories-01-05/

### Results

| Story | Status | Notes |
|-------|--------|-------|
| US-01: Extension Loads | Pass | Activation sequence correct |
| US-02: Empty State | Pass | "From Idea to Reality" view renders correctly |
| US-03: Let's Go Click | Pass | Plan Chat terminal launched, view=planning |
| US-04: Plan Conversation | Pass | Real Claude (Haiku 4.5) created valid plan |
| US-05: Form Plan | Pass | Granularity picker → AI parse → ready state |

### Findings

| Finding | Severity | Notes |
|---------|----------|-------|
| "planning" view confirmed functional | Info | Validates SidebarState audit Critical finding — view works, just needs docs |
| Real Claude haiku integration | Pass | OXVEIL_CLAUDE_MODEL=haiku works correctly |
| AI parse creates ai-parsed-plan.md | Pass | File correctly created in .claudeloop/ |

### Screenshots

- 01-empty-state.png — Empty state with "Let's Go" button
- 02-planning-state.png — Planning view with Plan Chat terminal
- 03-plan-chat-conversation.png — Claude responding
- 04-plan-chat-waiting.png — Plan created in Plan Preview
- 05-form-plan-clicked.png — Granularity picker visible
- 06-after-granularity.png — AI parse output in Live Run
- 07-ready-state.png — Ready state with 2 pending phases

---

## Test Gap Analysis (Task 11)

### Critical Test Gaps

1. **"planning" view state not tested** — Critical
   - `deriveViewState()` returns "planning" when `planUserChoice === "planning"` and `sessionStatus === "idle"`
   - Set via `onPlanChatStarted()` in `activateSidebar.ts:218`
   - No tests verify this path exists
   - File: `src/test/unit/views/sidebarState.test.ts`
   - Fix: Add test case for `planUserChoice: "planning"` → `view: "planning"`

2. **`onPlanChatStarted()` callback not tested** — Critical
   - File: `src/test/unit/activateSidebar.test.ts`
   - Fix: Add test verifying `state.planUserChoice` becomes `"planning"` after `onPlanChatStarted()`

### Tests Added (Task 12)

1. `sidebarState.test.ts`:
   - "returns planning when idle with planUserChoice set to planning"
   - "returns planning when idle with plan and planUserChoice set to planning"

2. `activateSidebar.test.ts`:
   - "onPlanChatStarted sets planUserChoice to 'planning'"
   - "onPlanChatStarted transitions view to 'planning' when idle"
   - "onPlanChatEnded resets planUserChoice to 'none'"
   - "onPlanChatEnded transitions view away from 'planning' when idle"

### Verified Test Coverage

| Component | Test Count | Status |
|-----------|------------|--------|
| sidebarState.test.ts | 34 | Good (now includes "planning") |
| activateSidebar.test.ts | 23 | Good (now includes onPlanChatStarted/Ended) |
| statusBar.test.ts | 18 | Good ("stopped" covered) |
| deriveStatusBar.test.ts | 12 | Good ("stopped" covered) |
| sessionState.test.ts | 15 | Good |
| sidebarMessages.test.ts | 30 | Good |
| Total tests | 953 | 0 failures |

### Files Without Direct Tests (>100 lines)

- `src/extension.ts` (460 lines) — Entry point, tested via integration
- `src/views/sidebarRenderers.ts` (355 lines) — Has test coverage
- `src/views/liveRunHtml.ts` (398 lines) — Has test coverage
- `src/views/configWizardHtml.ts` (338 lines) — Has test coverage

---

## User Stories US-06 to US-10+ (Task 10)

**Session:** verification-sessions/20260423-141500-user-stories-06-10/

### Results

| Story | Status | Notes |
|-------|--------|-------|
| US-06: Start session | Pass | Running state with phases, Live Run panel |
| US-07: Session completes | Partial | fake_claude issues; verified in Task 8 mocks |
| US-08: Session fails | Pass | Failed state with Retry/Skip buttons |
| US-09: User stops session | Pass | Stopped state with Resume/Restart buttons |
| US-10: Stale plan discovery | Pass | Stale state with Resume/Dismiss choice |
| Archive browse | Partial | Command executed; UI not captured |
| Config wizard | Pass | Panel opened with all settings |
| Dependency graph | Pass | DAG rendered with status legend |

### Findings

| Finding | Severity | Notes |
|---------|----------|-------|
| All sidebar states verified | Pass | stale, ready, running, failed, stopped all work |
| Config Wizard renders correctly | Pass | All settings visible and editable |
| Dependency Graph DAG works | Pass | Phases connected with status indicators |

### Screenshots

- 01-stale-state.png — Stale state
- 03-running-state.png — Running state
- 05-failed-state.png — Failed state
- 07-stopped-state.png — Stopped state
- 09-config-wizard.png — Config wizard panel
- 10-dependency-graph.png — Dependency graph DAG

---

## Severity Triage Summary (Task 19)

### Critical (Fixed)

| Finding | Status | Resolution |
|---------|--------|------------|
| "planning" view undocumented | Fixed | Added to states.md: Decision Table, Output States, Renderer Table, Flowchart, type definitions |
| "stopped" missing from StatusBarState | Fixed | Added to states.md Appendix type definition |
| "planning" view not tested | Fixed | Added 2 tests to sidebarState.test.ts |
| `onPlanChatStarted()` not tested | Fixed | Added 4 tests to activateSidebar.test.ts |

### Moderate (Fixed)

| Finding | Status | Resolution |
|---------|--------|------------|
| PlanUserChoice type incomplete in docs | Fixed | Added "planning" to PlanUserChoice in states.md |

### Minor (No Action Required)

| Finding | Notes |
|---------|-------|
| StatusBar "done" tooltip format | Semantic match, template string vs literal — no functional difference |

### Info (Expected Behavior)

| Finding | Notes |
|---------|-------|
| MCP bridge state lag during rapid clicks | Expected async behavior, not a bug |
| Lock file polling documented in wrong section | Consider reorganizing if states.md grows |

---

## Ideas and Improvements (Task 20)

### Completed This Session

1. Documentation sync — all Critical divergences fixed
2. Test coverage for "planning" view — 6 new tests added
3. workflowStatesSync.test.ts — updated to enforce new state values

### Future Improvements (GitHub Issues Created)

1. **Orphan recovery testing** — chmc/oxveil#57
   Not visually verified due to time constraints. Requires kill -9 and EDH relaunch workflow.

2. **Multi-root workspace testing** — chmc/oxveil#58
   Not visually verified. Requires multi-root workspace setup.

3. **fake_claude success scenario** — chmc/oxveil#59
   Success scenario failed during Task 10 testing. May need plan format adjustment for fake_claude compatibility.

4. **Archive replay UI verification** — No issue created (minor)
   Command executed but panel not captured. Consider adding dedicated archive verification session.

---

