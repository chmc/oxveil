# Enforced Workflow System

This project uses Claude Code hooks to enforce a development workflow. These hooks create hard gates that block progress until workflow steps are completed.

## Workflow Overview

Claudeloop check → Branch confirm → Plan (9 sections) → Tasks → TDD → Updates → Simplify → Review → Verify

## Gates

| # | Gate | Trigger | Purpose |
|---|------|---------|---------|
| 0 | Claudeloop awareness | First Edit/Write | Block if claudeloop FEATURES.md changed |
| 1 | Branch awareness | First Edit/Write | Confirm branch before work |
| 2 | Planning checklist | ExitPlanMode | 9 sections required |
| 3 | Plan-to-tasks | Edit/Write (post-plan) | Tasks must exist |
| 4 | TDD | Edit (impl files) | Test file edited first |
| 5 | State sync | Edit (state files) | docs/workflow/states.md edited first |
| 5b | Test gate | TaskUpdate (complete) | Run vitest related on changed files (~500ms) |
| 6 | Documentation | TaskUpdate (complete) | Update if plan indicated |
| 7 | ADR | TaskUpdate (complete) | Create ADR if indicated |
| 8 | package.json / changelog / README | TaskUpdate (complete) | Update if plan indicated |
| 9 | Simplify | TaskUpdate (complete) | Run /simplify for impl tasks |
| 10 | Code review | TaskUpdate (complete) | Review before task closes |
| 11 | Visual verification | TaskUpdate (complete) | Verify UI changes or justify skip |

## Planning Checklist (Gate 2)

Every plan must address these 9 sections (use "N/A - reason" if not applicable):

1. **Feature** - Which feature(s) does this affect? (must exist in docs/FEATURES.md)
2. **Architecture Impact** - How does this affect extension architecture?
3. **ADR** - Does this need an Architectural Decision Record?
4. **State Machine / Sync** - Any changes to SessionState, sidebar, status bar, plan preview?
5. **Tests** - What tests are needed?
6. **Documentation** - What docs need updating?
7. **package.json / contributes** - Settings, commands, views, keybindings changes?
8. **CHANGELOG** - Release notes entry needed?
9. **README** - README updates needed?

## TDD File Patterns (Gate 4)

| Implementation | Test |
|----------------|------|
| `src/core/foo.ts` | `src/test/unit/core/foo.test.ts` |
| `src/views/foo.ts` | `src/test/unit/views/foo.test.ts` |
| `src/parsers/foo.ts` | `src/test/unit/parsers/foo.test.ts` |
| `src/foo.ts` | `src/test/unit/foo.test.ts` |

## State Files (Gate 5)

Editing any of these requires `docs/workflow/states.md` to be edited first:

```
src/core/sessionState.ts, src/views/sidebarState.ts, src/views/statusBar.ts,
src/views/planPreviewPanel.ts, src/views/planPreviewHtml.ts, src/types.ts,
src/sessionWiring.ts, src/views/sidebarMessages.ts, src/views/sidebarRenderers.ts,
src/activateSidebar.ts, src/activateDetection.ts, src/extension.ts, src/commands/formPlan.ts
```

## Workflow State Files

Located in `.claude/workflow-state/` (gitignored):

| File | Purpose | Set by |
|------|---------|--------|
| `claudeloop-features-hash` | SHA256 of last reviewed claudeloop FEATURES.md | claudeloop-awareness.sh |
| `claudeloop-confirmed` | Session acknowledgment of changed FEATURES.md | Manual touch |
| `branch-confirmed` | Branch acknowledged | User confirmation |
| `plan-exited` | ExitPlanMode called | Gate 2 |
| `plan-requirements.json` | Which sections need updates | Gate 2 |
| `tasks-created` | Tasks exist from plan | tasks-created.sh |
| `edit-order` | Tracks file edit sequence (cleared on session start) | Gates 1, 4, 5 |
| `docs-complete` | Documentation updated | Manual touch |
| `adr-complete` | ADR created | Manual touch |
| `package-json-complete` | package.json updated | Manual touch |
| `changelog-complete` | CHANGELOG updated | Manual touch |
| `readme-complete` | README updated | Manual touch |
| `simplify-complete` | /simplify was run | /simplify skill |
| `review-complete` | Code review done | Code review |
| `visual-verified` | Visual verification done | /visual-verification skill |
| `visual-skip-reason` | Skip justification | Manual |

## Modifying the Workflow

| To change... | Edit... |
|---|---|
| Planning checklist sections | `.claude/hooks/planning-checklist.sh` |
| TDD file patterns | `.claude/hooks/tdd-enforcement.sh` |
| State sync file list | `.claude/hooks/state-sync-enforcement.sh` |
| Completion checks | `.claude/hooks/completion-bundle.sh` |
| Add new gate | `.claude/settings.json` + new hook |
| Disable gate temporarily | Comment out in `.claude/settings.json` |

## Bypass

```bash
export OXVEIL_SKIP_GATES=1      # Disable all gates
export OXVEIL_SKIP_TDD=1        # Skip Gate 4 only
export OXVEIL_SKIP_STATE_SYNC=1 # Skip Gate 5 only
```

Or add `"disableAllHooks": true` to `.claude/settings.json`.

Requires post-hoc review when bypassed.

## Troubleshooting

### Reset all state
```bash
rm -rf .claude/workflow-state/*
touch .claude/workflow-state/.gitkeep
```

### Check current state
```bash
ls .claude/workflow-state/
```
