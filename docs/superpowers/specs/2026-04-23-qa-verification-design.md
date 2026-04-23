# Oxveil Comprehensive QA Verification Design

**Date:** 2026-04-23  
**Status:** Draft  
**Author:** Claude + Aleksi

## Context

Oxveil is a VS Code extension for managing claudeloop AI coding workflows. Before further development, a comprehensive quality verification is needed to:

- Audit state management (4 state machines)
- Establish full coverage baseline
- Verify UX polish and UI behavior
- Update documentation to match implementation
- Create reusable QA recipe for future verification runs

## Goals

1. **State management audit** — Verify SessionState, SidebarState, StatusBar, PlanPreview state machines
2. **Full coverage baseline** — Document everything (working + broken)
3. **UX polish** — Verify user-facing experience, visual consistency, interaction behavior

## Non-Goals

- Release readiness blocking (informational, not blocking)
- Performance benchmarking
- Security audit

## Primary UI (Top Priority)

Components verified via actual DOM clicks with video capture:

- **Sidebar** — main visual hub, 8 view states
- **Tabs/Panels** — Live Run, Plan Preview, Dependency Graph, Timeline, Config Wizard, Replay Viewer, Archive Timeline
- **Status Bar** — always-visible session state indicator, click to focus
- **Notifications** — phase failure alerts, AI parse completion, input needed

## Secondary UI (Supporting)

- Command palette (alternative access)
- CodeLens (contextual actions on PLAN.md)

---

## Phase 1: Baseline

**Purpose:** Establish current state before making changes

**Actions:**
1. Run `npm run lint` — capture any existing errors
2. Run `npm test` — capture pass/fail for all 67 test files
3. Save baseline report to `docs/qa-sessions/YYYY-MM-DD-<session>/baseline.md`

**Outputs:**
- Lint status (clean/errors)
- Test results (X passed, Y failed, Z skipped)
- List of any pre-existing failures

---

## Phase 2: Usage Analysis

**Purpose:** Understand how users actually use Oxveil, update user stories accordingly

**DOM Interaction Verification (critical):**

Every button, link, and interactive element in primary UI must be clicked and verified:
- **Sidebar buttons:** Start, Stop, Reset, Create Plan, Let's Go, View Log, View Diff, Run Phase, archive items, folder switches
- **Tab buttons:** Close, refresh, navigation, form inputs, submit actions
- **Status bar:** Click action → sidebar reveal
- **Notifications:** Action buttons (View Log, Retry, Dismiss)

**Capture Methods:**
- **Screenshots:** Before/after each interaction (state proof)
- **Videos:** Record full workflow sequences using `screencapture -v` (macOS)
  - One video per user journey
  - Stored in `docs/qa-sessions/YYYY-MM-DD-<session>/videos/`
  - Analyze: timing, transitions, animations, edge case behaviors

**Actions:**
1. Map all interactive elements per primary UI component
2. Map sidebar-centric user journeys:
   - Sidebar empty → create plan via chat → form plan → start session → monitor in Live Run → completion
   - Sidebar stale → resume/dismiss choice → execution
   - Sidebar failed → view log → retry/reset
   - Archive browse → replay/restore
3. Map tab interactions (Live Run, Plan Preview, Config Wizard, etc.)
4. Map status bar + notification flows
5. Identify gaps in existing user stories
6. Update `docs/workflow/user-stories.md` with primary UI structure + interaction inventory

**Outputs:**
- Updated `docs/workflow/user-stories.md` with sidebar-first structure
- Interactive element inventory (all clickable elements per component)
- Video recordings of each user journey
- List of newly documented workflows

---

## Phase 3: State Audit

**Purpose:** Verify the 4 state machines match documentation and behave correctly

**State Machines to Audit:**

1. **SessionState** (`src/core/sessionState.ts`)
   - States: `idle` → `running` → `done|failed`
   - Triggers: lock file presence, phase completion/failure
   - Verify against `docs/workflow/states.md` statechart

2. **SidebarState** (`src/views/sidebarState.ts`)
   - 8 views: `not-found`, `empty`, `ready`, `stale`, `running`, `stopped`, `failed`, `completed`
   - Pure function `deriveViewState()` with 15-rule decision table
   - Verify all 15 rules produce correct view

3. **StatusBar** (`src/views/deriveStatusBar.ts`)
   - States: `not-found`, `installing`, `ready`, `idle`, `running`, `stopped`, `failed`, `done`
   - Verify icon, text, tooltip for each state

4. **PlanPreview** (`src/views/planPreviewPanel.ts`)
   - States: `empty`, `loading`, `ready`, `error`
   - Tab management, file watching

**Actions:**
1. Read `docs/workflow/states.md` — extract expected transitions
2. Read each state machine source — extract actual transitions
3. Compare: flag any divergence (doc says X, code does Y)
4. Write targeted tests for untested transitions
5. Execute edge cases via DOM interaction:
   - Rapid state changes (start/stop/start)
   - Orphan recovery (stale progress from crash)
   - Multi-root folder switching mid-session

**Outputs:**
- State audit report: matches, divergences, edge case results
- New tests for uncovered transitions
- Updated `docs/workflow/states.md` if code is correct and docs are stale
- **Ideas & Improvements log:** UX friction, missing states, workflow simplification, feature ideas

---

## Phase 4: User Story Sweep

**Purpose:** Execute all user stories with real DOM interactions, verify behavior matches documentation

**Actions:**

1. For each user story in updated `user-stories.md`:
   - Start video recording
   - Execute the workflow via actual DOM clicks
   - Capture screenshots at key state transitions
   - Log actual behavior vs documented behavior
   - Stop video, save to session folder

2. User stories to execute:
   - US-01: Extension loads (activation sequence)
   - US-02: Initial view empty state
   - US-03: User clicks "Let's Go" (plan chat launch)
   - US-04: User converses plan in chat
   - US-05: User clicks "Form Plan" (AI parse → verify → confirm loop)
     - Parse plan file
     - Verification step (pass/fail)
     - If fail: feedback → retry
     - If pass: confirm → ready to start
   - US-06: User clicks "Start" (session launch, after US-05 confirms)
   - US-07: Session completes successfully
   - US-08: Session fails (phase error)
   - US-09: User stops session mid-run
   - US-10: Plan discovery (stale state)
   - *+ new stories from Phase 2 (archive, multi-root, config wizard, etc.)*

3. Per-story verification checklist:
   - [ ] All buttons respond to clicks
   - [ ] State transitions match docs
   - [ ] Status bar updates correctly
   - [ ] Notifications appear when expected
   - [ ] No console errors
   - [ ] No visual glitches

**Outputs:**
- Per-story pass/fail report with timestamps
- Video recordings of each story execution
- Screenshots at transition points
- Divergence log (expected vs actual)
- **Ideas & Improvements:** UX friction, confusing flows, missing feedback

---

## Phase 5: Test Gap Fill

**Purpose:** Write automated tests for gaps discovered in phases 2-4

**Test Categories:**

1. **State machine edge cases** (from Phase 3)
   - Untested transitions in SessionState, SidebarState, StatusBar
   - Rapid state changes
   - Orphan recovery scenarios

2. **User story gaps** (from Phase 4)
   - Flows that failed or behaved unexpectedly
   - Missing integration tests for critical paths

3. **Untested components** (from baseline - 20 identified)
   - Prioritize by severity of findings
   - Focus on: activation hooks, command handlers, view providers

4. **Plan chat & plan implementation** (real Claude, cheapest model)
   - Use real Claude instance, not mocks
   - Set `OXVEIL_CLAUDE_MODEL=haiku` for cost control
   - Verify actual AI parse flow with live API
   - Test feedback loop with real responses

**Actions:**
1. Triage test gaps by severity (Critical/Major first)
2. Write unit tests for isolated state logic
3. Write integration tests for cross-component flows
4. Run plan chat tests with `haiku` model (cheapest)
5. Run full test suite — ensure no regressions
6. Update test count baseline

**Test Patterns to Follow:**
- Use existing mock factories (`makeMockPanel()`, `makeDeps()`)
- Follow vitest conventions already in codebase
- Dependency injection over VS Code API mocking
- Real Claude for plan flows, mocks for everything else

**Outputs:**
- New test files added to `src/test/`
- Updated baseline: X tests → Y tests
- Coverage improvement report
- **Ideas & Improvements:** Testability issues, suggested refactors for better isolation

---

## Phase 6: Doc Sync

**Purpose:** Update stale documentation to match verified implementation

**Documents to Audit:**

1. **`docs/workflow/states.md`** — canonical state machine spec
2. **`docs/workflow/user-stories.md`** — user journey documentation
3. **`README.md`** — user-facing documentation
4. **`ARCHITECTURE.md`** — technical architecture
5. **`docs/adr/`** — architecture decision records

**Actions:**
1. Compare each doc against verified behavior from Phases 3-4
2. Flag divergences with severity (Critical: misleading, Minor: outdated detail)
3. Update docs to match implementation (code is source of truth)
4. Run `npm test` — verify `workflowStatesSync.test.ts` passes (doc/code sync check)

**Outputs:**
- Updated documentation files
- Doc drift report (what was stale, what was fixed)
- New ADRs if needed
- **Ideas & Improvements:** Documentation structure improvements, missing docs

---

## Phase 7: Visual Verification

**Purpose:** Capture, analyze, and verify all UI states with screenshots and videos

**Primary UI Components to Verify:**

1. **Sidebar (8 view states):** not-found, empty, ready, stale, running, stopped, failed, completed
2. **Status Bar (8 states):** Each state: icon, text, tooltip, click behavior
3. **Tabs/Panels:** Live Run, Plan Preview, Config Wizard, Dependency Graph, Execution Timeline, Replay Viewer, Archive Timeline
4. **Notifications:** Phase failure with action buttons, AI parse completion, verification passed/failed

**Actions:**

1. **Capture:** For each UI state/workflow:
   - Trigger state via DOM interaction
   - Capture screenshot / record video
   - Store in session folder

2. **Analyze each capture:**
   - Read screenshot/video immediately after capture
   - Describe what is visible in concrete terms
   - Compare against expected state (from docs/user stories)
   - Flag discrepancies:
     - Wrong text/labels
     - Missing/broken icons
     - Layout issues (overflow, alignment)
     - State not reflecting correctly
     - Buttons not responding (visible in video)
     - Animations stuttering or missing
     - Console errors visible in dev tools

3. **Document findings:**
   - Per-capture analysis notes
   - Link finding to specific timestamp (video) or region (screenshot)
   - Severity classification

4. **Verify keystrokes/clicks reached target:**
   - Check typed text appears where expected
   - Check click resulted in expected state change
   - Flag any input that went to wrong target

**Outputs:**
- Screenshot library with analysis notes per image
- Video library with timestamped observations
- Visual issues log with severity + evidence links
- **Ideas & Improvements:** UI polish, accessibility, animation, layout suggestions

---

## Phase 8: Severity Triage

**Purpose:** Categorize all findings and prepare GitHub issues

**Severity Tiers:**

| Tier | Definition | Examples |
|------|------------|----------|
| **Critical** | Blocks core functionality, data loss risk | Session won't start, state machine deadlock, crashes |
| **Major** | Feature broken but workaround exists | Button doesn't respond (command palette works), wrong state shown |
| **Minor** | Polish/UX issues, non-blocking | Typo, alignment off, animation jank, tooltip missing |
| **Info** | Doc drift, test gaps, improvement ideas | Stale docs, missing test coverage, suggested enhancements |

**Actions:**

1. Consolidate all findings from Phases 2-7
2. Triage each finding: assign severity, link evidence, note reproduction steps, suggest fix category
3. Prepare GitHub issue drafts (user reviews before creation)
4. Generate summary report: counts by severity, counts by component, top 5 critical/major

**Outputs:**
- `findings.md` — full triaged list with evidence links
- GitHub issue drafts (not created yet — user reviews first)
- Summary dashboard (severity × component matrix)

---

## Phase 9: QA Recipe

**Purpose:** Create reusable QA checklist for future verification runs

**Location:** `docs/qa-verification-checklist.md`

**Artifacts Location:** `docs/qa-sessions/YYYY-MM-DD-<session>/`
- `baseline.md` — tracked in git
- `screenshots/` — gitignored
- `videos/` — gitignored
- `findings.md` — tracked in git
- `ideas-and-improvements.md` — tracked in git

**Outputs:**
- `docs/qa-verification-checklist.md` — the reusable recipe
- Updated `.gitignore` with `docs/qa-sessions/*/videos/` and `docs/qa-sessions/*/screenshots/`
- Link added to CLAUDE.md quality gates section

---

## Success Criteria

1. All 4 state machines verified against docs
2. All user stories executed with video evidence
3. Test gaps filled for discovered issues
4. Documentation updated to match implementation
5. All findings triaged with severity
6. GitHub issues drafted for review
7. Reusable QA checklist created

## Dependencies

- VS Code Extension Development Host
- claudeloop installed (or ability to test not-found state)
- `OXVEIL_CLAUDE_MODEL=haiku` for cost-controlled Claude testing
- macOS `screencapture -v` for video recording

## Risks

| Risk | Mitigation |
|------|------------|
| DOM clicks unreliable | Use MCP bridge with real clicks, retry on failure |
| Video capture misses state | Also capture screenshots at key moments |
| Claude API costs | Use haiku model, limit to plan chat/parse tests only |
| Large scope creep | Follow checklist strictly, defer improvements to issues |
