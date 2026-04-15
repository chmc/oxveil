---
name: qa-full-workflow
description: End-to-end QA pass exercising all Oxveil features in a real VS Code EDH instance. Run before releases or after major changes. Produces structured pass/fail report.
---

# Full Workflow QA

## Constraints

- macOS only. Inherits visual-verification constraints (osascript, screencapture).
- Do not run during active development — uses a temporary branch.
- Do not mock `.claudeloop/` if a real session is running (check lock file first).
- All code paths must reach Phase 7 (Cleanup). No exceptions.
- This skill tests **functional correctness** (state transitions, data flow). For visual polish, use `visual-verification`.
- Reuse all shared recipes from `visual-verification/references/visual-verification-recipes.md`. Do not duplicate them here.

## When to Invoke

- Before releases.
- After major changes to state machines, file watchers, or session wiring.
- After fixing batches of QA-reported bugs.

## Phases

### 0. Pre-flight

- Run pre-flight checks from visual-verification recipes (platform, code CLI, accessibility, screen recording, MCP bridge setting, stale EDH cleanup).
- Create report file: `qa-reports/YYYYMMDD-HHMMSS.md` using the report template below.
- Abort on any pre-flight failure.

### 1. Setup

- Create branch: `git checkout -b qa/full-workflow-YYYYMMDD`.
- `npm run build`. Abort on failure.
- `npm run lint`. Abort on failure.
- `npm test`. Abort on failure.
- Set up fake CLI (see visual-verification recipes: claudeloop Fake CLI > Setup).
- Clean workspace: `rm -f PLAN.md`, verify no lock file, no `.claudeloop/.MOCK_SESSION`.
- Launch EDH: `code --extensionDevelopmentPath="$(pwd)"`.
- Poll for EDH window (15s timeout).
- Poll for `.oxveil-mcp` discovery file (15s timeout).
- Parse PORT and TOKEN from discovery file.
- Maximize viewport (use MCP bridge `/command` with `workbench.action.closePanel` and `workbench.action.closeSidebar` — do NOT use osascript menu toggles).

### 2. State Matrix

Test each sidebar view state. For each row:
1. Set up the state (method column).
2. `GET /state` via MCP bridge.
3. Assert expected fields.
4. Screenshot.
5. Log PASS/FAIL to report.

| State | Setup | Assert `view` | Assert `plan` | Assert `session` |
|-------|-------|---------------|---------------|-----------------|
| `empty` | No PLAN.md, no progress | `"empty"` | undefined or no phases | undefined |
| `stale` | Write PLAN.md with 3 `## Phase N:` headers | `"stale"` | `filename` set | undefined |
| `ready` | `/click resumePlan` | `"ready"` | `phases` non-empty, count=3 | undefined |
| `running` | `/click start` (fake CLI `success` scenario) | `"running"` | phases with `in_progress` | `elapsed` present |
| `stopped` | Close EDH. Mock: Phase 1 completed, Phases 2-3 pending, no lock. Relaunch. | `"stopped"` | completed + pending mix | undefined |
| `failed` | Close EDH. Mock: Phase 2 failed (attempts:3), no lock. Relaunch. | `"failed"` | phase with `failed` status | `errorSnippet` present or undefined |
| `completed` | Close EDH. Mock: all 3 phases completed, no lock. Relaunch. | `"completed"` | all phases `completed` | `elapsed` present |

- Skip `not-found` (requires uninstalling claudeloop).
- For mock states: use mock recipes from visual-verification references. Always set `.MOCK_SESSION` marker.
- After each EDH relaunch: re-parse `.oxveil-mcp`, update PORT/TOKEN.

### 3. Transitions

Test state transitions via MCP bridge `/click`. For each:
1. Start from the "from" state (reuse setup from Phase 2 or prior transition).
2. Execute the action.
3. `wait_for_view` with 10s timeout (45s for running→completed).
4. Assert the target view.
5. Log PASS/FAIL.

| # | From | Action | To | Notes |
|---|------|--------|----|-------|
| 1 | empty | Write PLAN.md | stale | File watcher must fire |
| 2 | stale | `/click resumePlan` | ready | |
| 3 | stale | `/click dismissPlan` | empty | Re-write PLAN.md first to get back to stale |
| 4 | ready | `/click start` | running | Fake CLI in PATH |
| 5 | running | `wait_for_completion 45` | completed | Requires fake CLI fix (claudeloop#28). Skip if fake CLI can't complete. |
| 6 | running | `/click stop` | stopped or failed | Stop mid-execution |
| 7 | stopped | `/click resume` with phase arg | running | |
| 8 | failed | `/click retry` with phase arg | running | |
| 9 | failed | `/click skip` with phase arg | stopped or ready | Phase marked complete |
| 10 | completed | `/click createPlan` | empty or stale | New plan flow |

- If a transition fails, skip transitions that depend on its target state.
- Log skipped transitions as SKIP (not FAIL).

### 4. Panels

Open each panel via `/command` and verify content. Screenshot each.

| Panel | Command | Verify |
|-------|---------|--------|
| Live Run | `oxveil.showLiveRun` | Panel opens. During running: log content non-empty. |
| Dependency Graph | `oxveil.showDependencyGraph` | Panel opens. Node count matches phase count. |
| Execution Timeline | `oxveil.showTimeline` | Panel opens. Content rendered. |
| Config Wizard | `/click configure` | Panel opens. Form fields present. Preview non-empty. |
| Replay Viewer | `oxveil.openReplayViewer` | Panel opens. Content rendered (if `.claudeloop/replay.html` exists). |
| Plan Preview | `/click createPlan` | Panel opens. Shows "No plan yet" or phase cards. |
| Walkthrough | `oxveil.welcome` | Panel opens. 4 steps visible. |

- Test panels during running state (for Live Run, Graph, Timeline) and idle state (for others).
- Close each panel after verification.

### 5. Commands & CodeLens

- Open PLAN.md in EDH editor (via command palette osascript: Quick Open → "PLAN.md").
- Wait 2s for CodeLens to render.
- Screenshot. Verify CodeLens text above each `## Phase N:` header.
- Test `oxveil.markPhaseComplete` via `/command` with phase 1.
- Verify phase 1 status changes in `/state`.

### 6. Real Integration (Optional)

- Skip if user did not request real integration test.
- Remove fake CLI from PATH.
- Write minimal 2-phase PLAN.md (simple file creation + verification).
- Resume → ready → start.
- `wait_for_completion 120`.
- Verify: `view=completed`, both phases completed, archive created.
- Check `session.cost` — log whether cost tracking works.
- Screenshot final state.

### 7. Cleanup

- Close all EDH windows (process-scoped menu click from visual-verification recipes).
- Remove mock `.claudeloop/` files (only those newer than `.MOCK_SESSION` — never delete directory).
- Remove fake CLI temp dirs.
- Remove test PLAN.md.
- Restore git state: `git checkout main && git branch -D qa/full-workflow-*`.
- Verify no orphan processes: `pgrep -f claudeloop`, `pgrep -f fake_claude`.
- Remove `.oxveil-mcp` if it persists.
- Write final result and timestamp to report file.
- Present report to user.

## Report Template

```markdown
# QA Report — {YYYY-MM-DD HH:MM}

## Summary
- State matrix: X/7 passed
- Transitions: X/10 passed
- Panels: X/7 passed
- Commands: X/N passed
- Real integration: PASS/FAIL/SKIP

## State Matrix
| State | Result | Notes |
|-------|--------|-------|

## Transitions
| From → To | Result | Notes |
|-----------|--------|-------|

## Panels
| Panel | Result | Notes |
|-------|--------|-------|

## Commands & CodeLens
| Check | Result | Notes |
|-------|--------|-------|

## New Issues Found
- (list any new bugs discovered, with severity)

## Screenshots
- (list screenshot filenames with descriptions)
```

## Failure Handling

- State matrix: log FAIL, continue to next state (states are independent).
- Transitions: log FAIL, skip dependent transitions (mark as SKIP).
- Panels: log FAIL, continue.
- Real integration: skip on timeout (120s), log SKIP.
- 3 consecutive failures in same phase → stop that phase, continue to next.
- Always reach Phase 7 (Cleanup).
