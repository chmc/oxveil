# Oxveil Comprehensive QA Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comprehensive quality verification of Oxveil extension covering state management, UX, documentation, and test coverage.

**Architecture:** Sequential 9-phase verification pipeline. Each phase produces artifacts consumed by later phases. Visual verification uses MCP bridge for real DOM clicks. Videos/screenshots captured for evidence. Findings triaged by severity for GitHub issues.

**Tech Stack:** VS Code Extension Development Host, vitest, MCP bridge, macOS screencapture, Claude API (haiku model)

**Spec:** `docs/superpowers/specs/2026-04-23-qa-verification-design.md`

---

## File Structure

**Session Artifacts:**
```
docs/qa-sessions/2026-04-23-comprehensive/
├── baseline.md              # Phase 1 output
├── screenshots/             # gitignored
├── videos/                  # gitignored
├── findings.md              # Phase 8 output
└── ideas-and-improvements.md
```

**Documents to Update:**
- `docs/workflow/user-stories.md` — add missing stories (Phase 2)
- `docs/workflow/states.md` — fix drift if found (Phase 6)
- `README.md`, `ARCHITECTURE.md` — update if stale (Phase 6)

**New Files:**
- `docs/qa-verification-checklist.md` — reusable recipe (Phase 9)
- `src/test/` — new tests for gaps (Phase 5)

**Config:**
- `.gitignore` — add `docs/qa-sessions/*/videos/` and `docs/qa-sessions/*/screenshots/`

---

## Task 1: Setup Session Folder

**Files:**
- Create: `docs/qa-sessions/2026-04-23-comprehensive/`
- Modify: `.gitignore`

- [ ] **Step 1: Create session folder structure**

```bash
mkdir -p docs/qa-sessions/2026-04-23-comprehensive/{screenshots,videos}
```

- [ ] **Step 2: Update .gitignore**

Add to `.gitignore`:
```
# QA session media (large files, evidence only)
docs/qa-sessions/*/videos/
docs/qa-sessions/*/screenshots/
```

- [ ] **Step 3: Commit setup**

```bash
git add docs/qa-sessions/.gitkeep .gitignore
git commit -m "chore: setup QA verification session folder"
```

---

## Task 2: Phase 1 - Baseline

**Files:**
- Create: `docs/qa-sessions/2026-04-23-comprehensive/baseline.md`

- [ ] **Step 1: Run lint and capture output**

```bash
npm run lint 2>&1 | tee /tmp/lint-output.txt
```

Record: clean or error count

- [ ] **Step 2: Run tests and capture output**

```bash
npm test 2>&1 | tee /tmp/test-output.txt
```

Record: X passed, Y failed, Z skipped

- [ ] **Step 3: Write baseline.md**

Create `docs/qa-sessions/2026-04-23-comprehensive/baseline.md`:
```markdown
# QA Verification Baseline

**Date:** 2026-04-23
**Commit:** [current HEAD]

## Lint
- Status: [clean/errors]
- Error count: [N]

## Tests
- Passed: [X]
- Failed: [Y]
- Skipped: [Z]

## Pre-existing Issues
[List any failures]
```

- [ ] **Step 4: Commit baseline**

```bash
git add docs/qa-sessions/2026-04-23-comprehensive/baseline.md
git commit -m "docs: add QA baseline for 2026-04-23 session"
```

---

## Task 3: Phase 2 - Map Interactive Elements

**Files:**
- Create: `docs/qa-sessions/2026-04-23-comprehensive/interactive-elements.md`

- [ ] **Step 1: Read sidebar HTML generator**

Read `src/views/sidebarHtml.ts` and `src/views/sidebarRenderers.ts`

- [ ] **Step 2: List all sidebar buttons/links**

Document every `onclick`, button, link with:
- Element ID/class
- Action it triggers
- Expected state change

- [ ] **Step 3: Read panel HTML generators**

Read Live Run, Plan Preview, Config Wizard, etc. HTML files

- [ ] **Step 4: List all panel interactive elements**

- [ ] **Step 5: Document status bar interactions**

Read `src/views/statusBar.ts`

- [ ] **Step 6: Document notification actions**

Read `src/views/notifications.ts`

- [ ] **Step 7: Write interactive-elements.md**

Create comprehensive inventory of all clickable elements

- [ ] **Step 8: Commit element inventory**

```bash
git add docs/qa-sessions/2026-04-23-comprehensive/interactive-elements.md
git commit -m "docs: add interactive element inventory for QA"
```

---

## Task 4: Phase 2 - Map User Journeys

**Files:**
- Read: `docs/workflow/user-stories.md`
- Modify: `docs/workflow/user-stories.md`

- [ ] **Step 1: Read existing user stories**

Read `docs/workflow/user-stories.md`

- [ ] **Step 2: Identify gaps**

Compare against capabilities:
- Archive browse/restore
- Multi-root workspace switching
- Config wizard flow
- Force unlock
- Plan chat with real Claude

- [ ] **Step 3: Draft new user stories**

For each gap, write:
- US-XX: [Title]
- As-is flow
- States touched
- Edge cases

- [ ] **Step 4: Update user-stories.md**

Add new stories, restructure around sidebar-first approach

- [ ] **Step 5: Commit updated stories**

```bash
git add docs/workflow/user-stories.md
git commit -m "docs: expand user stories with sidebar-first structure"
```

---

## Task 5: Phase 3 - Audit SessionState

**Files:**
- Read: `src/core/sessionState.ts`
- Read: `docs/workflow/states.md`

- [ ] **Step 1: Extract SessionState transitions from code**

Read `src/core/sessionState.ts`, document:
- All states
- All transition triggers
- Terminal conditions

- [ ] **Step 2: Extract SessionState spec from docs**

Read `docs/workflow/states.md`, extract statechart

- [ ] **Step 3: Compare code vs docs**

Flag divergences:
- State missing in docs
- Transition differs
- Edge case undocumented

- [ ] **Step 4: Log findings**

Add to `docs/qa-sessions/2026-04-23-comprehensive/findings.md`:
```markdown
## SessionState Audit

### Matches
- [list]

### Divergences
- [list with severity]
```

---

## Task 6: Phase 3 - Audit SidebarState

**Files:**
- Read: `src/views/sidebarState.ts`
- Read: `docs/workflow/states.md`

- [ ] **Step 1: Extract deriveViewState() decision table from code**

Read `src/views/sidebarState.ts`, document all 15 rules

- [ ] **Step 2: Extract decision table from docs**

Read `docs/workflow/states.md`

- [ ] **Step 3: Compare each rule**

For each of 15 rules:
- Does code match doc?
- Are inputs complete?
- Are edge cases handled?

- [ ] **Step 4: Log findings**

Add to findings.md

---

## Task 7: Phase 3 - Audit StatusBar and PlanPreview

**Files:**
- Read: `src/views/deriveStatusBar.ts`
- Read: `src/views/planPreviewPanel.ts`
- Read: `docs/workflow/states.md`

- [ ] **Step 1: Audit StatusBar states**

Extract from `deriveStatusBar.ts`:
- All 8 states
- Icon, text, tooltip per state
- Click behavior

- [ ] **Step 2: Compare against docs**

- [ ] **Step 3: Audit PlanPreview states**

Extract from `planPreviewPanel.ts`:
- States: empty, loading, ready, error
- Tab management
- File watching behavior

- [ ] **Step 4: Compare against docs**

- [ ] **Step 5: Log all findings**

---

## Task 8: Phase 3 - Test State Edge Cases

**Files:**
- Test via Extension Development Host

- [ ] **Step 1: Install extension in EDH**

```bash
npm run compile && code --extensionDevelopmentPath=$PWD
```

- [ ] **Step 2: Test rapid state changes**

Start video recording (30 second limit):
```bash
screencapture -V30 -v docs/qa-sessions/2026-04-23-comprehensive/videos/rapid-state-changes.mov
```

Execute: Start → Stop → Start → Stop rapidly
Observe: Does sidebar/status bar keep up?

Analyze video frame-by-frame: check for state lag, flickering, incorrect intermediate states

- [ ] **Step 3: Test orphan recovery**

1. Start a session
2. Kill EDH process: `pkill -9 -f "extensionDevelopmentPath"`
3. Reopen VS Code with EDH
4. Observe sidebar state (should show stale)

Capture screenshot, analyze: does stale state appear? Is resume/dismiss visible?

- [ ] **Step 4: Test multi-root folder switching**

1. Open multi-root workspace
2. Start session in folder A
3. Switch active folder to B
4. Observe sidebar, status bar
5. Switch back to A

Record video, document behavior

- [ ] **Step 5: Log edge case findings**

---

## Task 9: Phase 4 - Execute User Stories (US-01 to US-05)

**Files:**
- Videos in `docs/qa-sessions/2026-04-23-comprehensive/videos/`

- [ ] **Step 1: Execute US-01 (Extension loads)**

Start video, observe activation sequence, stop video
Screenshot sidebar initial state
Log: matches doc? Issues?

- [ ] **Step 2: Execute US-02 (Empty state)**

With no PLAN.md, verify sidebar shows empty state
Screenshot, document

- [ ] **Step 3: Execute US-03 (Let's Go click)**

Click "Let's Go" button via DOM
Verify plan chat launches
Screenshot, document

- [ ] **Step 4: Execute US-04 (Plan chat conversation)**

Use real Claude (haiku model):
```bash
export OXVEIL_CLAUDE_MODEL=haiku
```

Have brief conversation, verify plan preview updates
Record video

- [ ] **Step 5: Execute US-05 (Form Plan - AI parse flow)**

Click "Form Plan"
Observe: parse → verify → confirm loop
Record video, capture screenshots at each step

- [ ] **Step 6: Test AI parse feedback retry explicitly**

1. Create plan with intentionally invalid phase (missing dependency)
2. Click "Form Plan"
3. Wait for verification failure
4. Observe feedback UI in Live Run panel (verify-failed message)
5. Provide corrective feedback via input
6. Verify retry triggers
7. If still fails, test 3-retry limit behavior
Screenshot at each feedback cycle

---

## Task 10: Phase 4 - Execute User Stories (US-06 to US-10+)

- [ ] **Step 1: Execute US-06 (Start session)**

After US-05 confirms, click "Start"
Verify: sidebar → running, status bar updates, Live Run opens
Record video

- [ ] **Step 2: Execute US-07 (Session completes)**

Let session run to completion
Verify: sidebar → completed, status bar → done, completion banner
Screenshot final state

- [ ] **Step 3: Execute US-08 (Session fails)**

Trigger phase failure (invalid command in plan)
Verify: notification appears, sidebar → failed, action buttons work
Screenshot, test View Log action

- [ ] **Step 4: Execute US-09 (User stops session)**

Start session, click Stop mid-run
Verify: sidebar → stopped, status bar updates
Document behavior

- [ ] **Step 5: Execute US-10 (Stale plan discovery)**

With existing PROGRESS.md from previous session, open VS Code
Verify: sidebar → stale, resume/dismiss choice appears
Test both choices

- [ ] **Step 6: Execute archive browse story**

1. Create archived session (run and complete a session)
2. Open sidebar, locate archive section
3. Click archive entry
4. Verify replay viewer opens
5. Test step-through controls
6. Click "Restore" if available
Screenshot each step

- [ ] **Step 7: Execute config wizard story**

1. Open config wizard (command or sidebar)
2. Modify a setting (e.g., MAX_RETRIES)
3. Save
4. Verify .claudeloop.conf updated
5. Edit .claudeloop.conf externally
6. Verify wizard reflects external change
Screenshot wizard states

- [ ] **Step 8: Execute dependency graph story**

1. Create plan with phase dependencies
2. Open dependency graph panel
3. Verify DAG renders correctly
4. Click a phase node
5. Verify highlighting works
Screenshot

- [ ] **Step 9: Document all divergences**

Per-story pass/fail in findings.md
Verify keystrokes/clicks reached intended target (check for misrouted input)

---

## Task 11: Phase 5 - Identify Test Gaps

**Files:**
- Read: `src/test/`

- [ ] **Step 1: List untested components**

Cross-reference src/ against src/test/
Identify files with no corresponding test

- [ ] **Step 2: Prioritize by findings severity**

Components that showed issues in Phases 3-4 get priority

- [ ] **Step 3: Document test gaps**

Add to findings.md with severity

---

## Task 12: Phase 5 - Write Priority Tests

**Files:**
- Create: tests in `src/test/unit/` or `src/test/integration/`

- [ ] **Step 1: Write tests for Critical/Major findings**

Follow existing test patterns (vitest, mock factories)

Example for untested state transition:
```typescript
describe('SessionState edge cases', () => {
  it('handles rapid start/stop cycles', () => {
    // test implementation
  });
});
```

- [ ] **Step 2: Run new tests**

```bash
npm test -- --reporter=verbose
```

- [ ] **Step 3: Verify no regressions**

All tests pass

- [ ] **Step 4: Commit new tests**

```bash
git add src/test/
git commit -m "test: add tests for QA-discovered gaps"
```

---

## Task 13: Phase 5 - Test Plan Chat with Real Claude

**Files:**
- Test via Extension Development Host

- [ ] **Step 1: Set cost-controlled model**

```bash
export OXVEIL_CLAUDE_MODEL=haiku
```

- [ ] **Step 2: Launch plan chat**

Click "Let's Go", have real conversation

- [ ] **Step 3: Test AI parse feedback loop**

Provide plan that will fail verification
Observe feedback flow
Provide corrected plan
Verify passes

- [ ] **Step 4: Document behavior**

Log any issues to findings.md

---

## Task 14: Phase 6 - Doc Sync

**Files:**
- Modify: `docs/workflow/states.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: Fix states.md divergences**

Update any rules/statecharts that diverged from code

- [ ] **Step 2: Verify workflowStatesSync test passes**

```bash
npm test -- workflowStatesSync
```

- [ ] **Step 3: Check README.md accuracy**

Compare feature descriptions against actual behavior
Update stale sections

- [ ] **Step 4: Check ARCHITECTURE.md accuracy**

Verify component descriptions, file lists

- [ ] **Step 5: Commit doc updates**

```bash
git add docs/ README.md ARCHITECTURE.md
git commit -m "docs: sync documentation with verified implementation"
```

---

## Task 15: Phase 7 - Visual Verification: Sidebar States

**Files:**
- Screenshots in `docs/qa-sessions/2026-04-23-comprehensive/screenshots/`

- [ ] **Step 1: Capture not-found state**

Unset claudeloop path, capture sidebar
Analyze: correct message? Styling ok?

- [ ] **Step 2: Capture empty state**

Delete PLAN.md, capture sidebar

- [ ] **Step 3: Capture ready state**

Create valid PLAN.md, capture sidebar

- [ ] **Step 4: Capture stale state**

With old PROGRESS.md, capture sidebar

- [ ] **Step 5: Capture running state**

Start session, capture sidebar mid-run

- [ ] **Step 6: Capture stopped state**

Stop session, capture sidebar

- [ ] **Step 7: Capture failed state**

Trigger failure, capture sidebar

- [ ] **Step 8: Capture completed state**

Let session complete, capture sidebar

- [ ] **Step 9: Analyze all sidebar captures**

For each: describe what's visible, compare to expected, flag issues

---

## Task 16: Phase 7 - Visual Verification: Status Bar

**Files:**
- Screenshots in `docs/qa-sessions/2026-04-23-comprehensive/screenshots/`

- [ ] **Step 1: Capture not-found status bar**

Screenshot status bar when claudeloop not detected
Verify: correct icon, text, tooltip

- [ ] **Step 2: Capture installing status bar**

During install, screenshot status bar (if achievable)

- [ ] **Step 3: Capture ready/idle status bar**

With claudeloop detected, no session running
Screenshot, verify text/icon

- [ ] **Step 4: Capture running status bar**

During session, screenshot status bar
Verify: phase progress shown, elapsed time updating

- [ ] **Step 5: Capture stopped/failed/done status bar**

Screenshot each terminal state
Verify correct icon and text per state

- [ ] **Step 6: Test status bar click**

Click status bar item
Verify: sidebar reveals/focuses

- [ ] **Step 7: Analyze all status bar captures**

Compare icon, text, tooltip to `deriveStatusBar.ts` expected values

---

## Task 17: Phase 7 - Visual Verification: Panels

**Files:**
- Screenshots and videos

- [ ] **Step 1: Capture Live Run panel**

During session: log streaming, todo progress, cost
Screenshot, verify elements render correctly

- [ ] **Step 2: Capture Plan Preview panel**

With multi-file plan, capture tabs, markdown render

- [ ] **Step 3: Capture Config Wizard**

Open wizard, screenshot form, test save

- [ ] **Step 4: Capture Dependency Graph**

With plan having dependencies, screenshot DAG

- [ ] **Step 5: Capture Execution Timeline**

During/after session, screenshot Gantt chart

- [ ] **Step 6: Analyze all panel captures**

Flag visual issues

---

## Task 18: Phase 7 - Visual Verification: Notifications

**Files:**
- Screenshots in `docs/qa-sessions/2026-04-23-comprehensive/screenshots/`

- [ ] **Step 1: Capture phase failure notification**

Trigger phase failure
Screenshot notification with action buttons (View Log, Retry, Dismiss)
Test each action button

- [ ] **Step 2: Capture AI parse completion notification**

After successful AI parse
Screenshot notification

- [ ] **Step 3: Capture verification passed/failed notifications**

During AI parse flow, capture both states

- [ ] **Step 4: Capture "input needed" notification**

If feedback requested, screenshot

- [ ] **Step 5: Analyze notification captures**

Verify: correct message, action buttons present and functional, styling consistent

---

## Task 19: Phase 8 - Severity Triage

**Files:**
- Finalize: `docs/qa-sessions/2026-04-23-comprehensive/findings.md`

- [ ] **Step 1: Consolidate all findings**

Gather from:
- State audit (Tasks 5-8)
- User story sweep (Tasks 9-10)
- Test gaps (Task 11)
- Visual verification (Tasks 15-18)

- [ ] **Step 2: Assign severity to each**

| Tier | Definition |
|------|------------|
| Critical | Blocks core functionality |
| Major | Feature broken, workaround exists |
| Minor | Polish/UX issues |
| Info | Doc drift, test gaps, ideas |

- [ ] **Step 3: Create GitHub issue drafts**

For each finding:
```markdown
## [Severity] Component: Brief description

**Reproduction:**
1. Step
2. Step

**Expected:** X
**Actual:** Y

**Evidence:** [screenshot/video link]

**Suggested fix:** [category]
```

- [ ] **Step 4: Generate summary dashboard**

Counts by severity, counts by component

- [ ] **Step 5: Commit findings**

```bash
git add docs/qa-sessions/2026-04-23-comprehensive/
git commit -m "docs: complete QA findings with severity triage"
```

---

## Task 20: Phase 8 - Ideas and Improvements

**Files:**
- Create: `docs/qa-sessions/2026-04-23-comprehensive/ideas-and-improvements.md`

- [ ] **Step 1: Consolidate improvement ideas**

Gather from all phases:
- UX friction points
- Missing features suggested by edge cases
- Workflow simplifications
- Animation/polish suggestions

- [ ] **Step 2: Categorize by type**

- UX improvements
- New features
- Refactoring opportunities
- Documentation improvements

- [ ] **Step 3: Commit ideas doc**

```bash
git add docs/qa-sessions/2026-04-23-comprehensive/ideas-and-improvements.md
git commit -m "docs: add QA improvement ideas"
```

---

## Task 21: Phase 9 - Create QA Checklist

**Files:**
- Create: `docs/qa-verification-checklist.md`

- [ ] **Step 1: Write checklist from this session's structure**

Create `docs/qa-verification-checklist.md` with:
- Prerequisites
- Phase 1-8 checkboxes
- Artifacts location template

- [ ] **Step 2: Add reference to CLAUDE.md**

In CLAUDE.md quality gates section, add:
```markdown
- For comprehensive QA, follow `docs/qa-verification-checklist.md`
```

- [ ] **Step 3: Commit checklist**

```bash
git add docs/qa-verification-checklist.md CLAUDE.md
git commit -m "docs: add reusable QA verification checklist"
```

---

## Task 22: Create GitHub Issues

**Files:**
- Read: `docs/qa-sessions/2026-04-23-comprehensive/findings.md`

- [ ] **Step 1: Review findings with user**

Present summary: X Critical, Y Major, Z Minor, W Info

- [ ] **Step 2: Create issues for approved findings**

For each approved finding:
```bash
gh issue create --title "[Severity] Component: Brief" --body "..."
```

- [ ] **Step 3: Link issues to session**

Update findings.md with issue numbers

- [ ] **Step 4: Final commit**

```bash
git add docs/qa-sessions/2026-04-23-comprehensive/findings.md
git commit -m "docs: link QA findings to GitHub issues"
```

---

## Verification

After all tasks complete:

1. **Baseline comparison:** Run `npm run lint` and `npm test` again, compare to Task 2 baseline
2. **Artifact check:** All screenshots, videos, findings exist in session folder
3. **Doc sync test:** `npm test -- workflowStatesSync` passes
4. **GitHub issues:** All Critical/Major findings have corresponding issues
5. **Checklist usable:** `docs/qa-verification-checklist.md` is complete and reusable

---

## Summary

| Phase | Tasks | Key Output |
|-------|-------|------------|
| Setup | 1 | Session folder, .gitignore |
| Baseline | 2 | baseline.md |
| Usage Analysis | 3-4 | interactive-elements.md, updated user-stories.md |
| State Audit | 5-8 | State divergences in findings.md |
| User Story Sweep | 9-10 | Videos, screenshots, story pass/fail |
| Test Gap Fill | 11-13 | New tests, real Claude verification |
| Doc Sync | 14 | Updated docs |
| Visual Verification | 15-18 | Screenshot library with analysis (sidebar, status bar, panels, notifications) |
| Severity Triage | 19-20 | findings.md, ideas-and-improvements.md |
| QA Recipe | 21 | qa-verification-checklist.md |
| GitHub Issues | 22 | Issues created |
