# 16. Enforced Workflow System via Claude Code Hooks

**Date:** 2026-05-07
**Status:** Accepted

## Context

Oxveil has complex UI state (sidebar, status bar, plan preview) that must stay synchronized across multiple source files. A test suite (`workflowStatesSync.test.ts`) catches state drift after commit, but not at edit time — by then the change is already written and may be partially correct, making diagnosis harder.

Development discipline alone is insufficient: planning checklists get skipped under time pressure, TDD is bypassed when a change feels small, and state file edits happen without updating `docs/workflow/states.md`. The result is accumulating desync between implementation and documentation.

claudeloop already ships a hook-based enforcement system. Oxveil has different concerns: a 9-section planning checklist (vs. claudeloop's 8), a Gate 5 for state sync (no claudeloop equivalent), a feature registry (`docs/FEATURES.md`) that plans must reference, TypeScript TDD patterns (vs. shell), and a views-only scope for visual verification.

## Decision

Port claudeloop's hook enforcement to Oxveil with these adaptations:

- **9-section planning checklist** — adds Feature (Gate 2 section 1) and State Machine / Sync (section 4) to claudeloop's baseline
- **Gate 5: State sync** — blocks edits to state-related files unless `docs/workflow/states.md` is edited first
- **Feature registry** (`docs/FEATURES.md`) — plans declare which features they affect; registry is the single source of truth for feature status
- **TypeScript TDD patterns** — `src/core/foo.ts` → `src/test/unit/core/foo.test.ts` (views, parsers, root variants)
- **Visual verification scope** — limited to views; non-UI tasks may skip with a written justification in `visual-skip-reason`
- **SessionStart cleanup** — clears `edit-order` at session start to prevent stale TDD checks from previous sessions
- **Gate 5b: Test gate** — runs `vitest related` on changed files before task completion; blocks if tests fail (~500ms overhead)
- **Bypass env vars** — `OXVEIL_SKIP_GATES`, `OXVEIL_SKIP_TDD`, `OXVEIL_SKIP_STATE_SYNC` for emergency escapes; require post-hoc review

State is tracked in `.claude/workflow-state/` (gitignored). The `/workflow` skill surfaces current gate status on demand.

## Consequences

**Positive:**
- State desync is caught at edit time, not after commit
- Planning discipline is enforced structurally, not by convention
- Feature registry makes plan scope explicit and auditable
- Bypass paths exist but create a visible paper trail

**Negative:**
- Planning overhead for every task — mitigated by allowing "N/A - reason" for inapplicable sections
- ADR N/A requires approved category (bug fix|docs only|test only|config only|typo fix|dependency update|ci fix|build fix|lint fix|formatting only|version bump|no architectural change); generic reasons rejected
- Feature registry requires maintenance as features are added or retired
- Bypass discipline depends on team culture; hooks can be disabled via `disableAllHooks`

**ADR enforcement rules (added 2026-05-28):**
- N/A category validation: ADR N/A blocked unless reason matches approved categories
- Keyword detection: ADR N/A blocked when plan mentions architectural terms (new pattern, new module, new service, breaking change, security, authentication, authorization, encryption, new dependency, api change, schema change, database, migration, introduces, replaces, deprecates)
- Decision language cross-check: ADR N/A blocked when Architecture Impact section contains decision words (decided, chose, will use, option, alternative, selected, adopted)

**Alternatives considered:**

- *Test-only enforcement* — already exists (`workflowStatesSync.test.ts`); catches drift too late (post-commit)
- *CI checks* — no edit-time prevention; feedback loop is minutes, not seconds
- *Manual checklists* — not enforced; skipped under pressure
