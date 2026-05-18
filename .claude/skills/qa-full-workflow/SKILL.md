---
name: qa-full-workflow
description: End-to-end QA pass exercising all Oxveil features in a real VS Code EDH instance. Run before releases or after major changes. Produces structured pass/fail report.
---

# Full Workflow QA

**Prerequisite:** Read `visual-verification/SKILL.md` first. This skill defines WHAT to test; visual-verification defines HOW.

## When to Invoke

- Before releases
- After major changes to state machines, file watchers, or session wiring

## Test Matrix

### State Matrix

For each: set up state → `GET /state` → assert → screenshot → log PASS/FAIL.

| State | Setup | Assert `view` |
|-------|-------|---------------|
| `empty` | No PLAN.md, no progress | `"empty"` |
| `stale` | Write PLAN.md with 3 `## Phase N:` headers | `"stale"` |
| `ready` | `/click resumePlan` | `"ready"` |
| `running` | `/click start` (fake CLI `success` scenario) | `"running"` |
| `stopped` | Mock: Phase 1 completed, Phases 2-3 pending, no lock | `"stopped"` |
| `failed` | Mock: Phase 2 failed (attempts:3), no lock | `"failed"` |
| `completed` | Mock: all 3 phases completed, no lock | `"completed"` |

### Transitions

| From | Action | To |
|------|--------|----|
| empty | Write PLAN.md | stale |
| stale | `/click resumePlan` | ready |
| stale | `/click dismissPlan` | empty |
| ready | `/click start` | running |
| running | wait 45s | completed |
| running | `/click stop` | stopped |
| stopped | `/click resume` | running |
| failed | `/click retry` | running |
| failed | `/click skip` | stopped/ready |
| completed | `/click createPlan` | empty/stale |

### Panels

| Panel | Command | Verify |
|-------|---------|--------|
| Live Run | `oxveil.showLiveRun` | Opens, log non-empty during running |
| Dependency Graph | `oxveil.showDependencyGraph` | Opens, node count = phase count |
| Execution Timeline | `oxveil.showTimeline` | Opens, content rendered |
| Config Wizard | `/click configure` | Opens, form fields + preview |
| Replay Viewer | `oxveil.openReplayViewer` | Opens |
| Plan Preview | `/click createPlan` | Opens, phase cards (resolver detects plan by mtime — wait 5s after file write before asserting) |
| Walkthrough | `oxveil.welcome` | Opens, 4 steps visible |

## Report Template

```markdown
# QA Report — {YYYY-MM-DD HH:MM}

## Summary
- State matrix: X/7 passed
- Transitions: X/10 passed
- Panels: X/7 passed

## State Matrix
| State | Result | Notes |
|-------|--------|-------|

## Transitions
| From → To | Result | Notes |
|-----------|--------|-------|

## Panels
| Panel | Result | Notes |
|-------|--------|-------|

## New Issues Found
- (list any new bugs discovered)
```

## Failure Handling

- State/Panels: log FAIL, continue (independent)
- Transitions: log FAIL, skip dependents (mark SKIP)
- 3 consecutive failures in same phase → stop phase, continue to next
