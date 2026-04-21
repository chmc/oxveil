---
name: qa-full-workflow
description: End-to-end QA pass exercising all Oxveil features in a real VS Code EDH instance. Run before releases or after major changes. Produces structured pass/fail report.
---

# Full Workflow QA

## Constraints

- macOS only. Inherits visual-verification constraints.
- Uses a temporary branch — do not run during active development.
- Do not mock `.claudeloop/` if a real session is running (check lock file).
- All code paths must reach Phase 7 (Cleanup).
- Recipes: `visual-verification/references/visual-verification-recipes.md`.

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

- `git checkout -b qa/full-workflow-YYYYMMDD`.
- `npm run build && npm run lint && npm test`. Abort on failure.
- Set up fake CLI (see recipes: claudeloop Fake CLI > Setup).
- Clean workspace: `rm -f PLAN.md`, verify no lock file, no `.claudeloop/.MOCK_SESSION`.
- Launch EDH, poll for window + `.oxveil-mcp` (15s each). Parse PORT/TOKEN.
- Maximize viewport via MCP bridge `/command` (not osascript).

### 2. State Matrix

For each row: set up state → `GET /state` → assert → screenshot → log PASS/FAIL.

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
| Live Run | `oxveil.showLiveRun` | Opens. Log non-empty during running. |
| Dependency Graph | `oxveil.showDependencyGraph` | Opens. Node count = phase count. |
| Execution Timeline | `oxveil.showTimeline` | Opens. Content rendered. |
| Config Wizard | `/click configure` | Opens. Form fields + preview. |
| Replay Viewer | `oxveil.openReplayViewer` | Opens. Content (if replay.html exists). |
| Plan Preview | `/click createPlan` | Opens. Phase cards or empty state. |
| Walkthrough | `oxveil.welcome` | Opens. 4 steps visible. |

- Test during running state (Live Run, Graph, Timeline) and idle (others). Close after each.

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

- State matrix / Panels: log FAIL, continue (independent).
- Transitions: log FAIL, skip dependents (mark SKIP).
- Real integration: skip on 120s timeout, log SKIP.
- 3 consecutive failures in same phase → stop phase, continue to next. Always reach Phase 7.
