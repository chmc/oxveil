#!/bin/sh
# Tests for OXVEIL_VV_ACTIVE guard in planning-checklist.sh (#141)
# When set, the hook must skip the goal create/update block entirely.
set -eu

PASS=0; FAIL=0
pass() { printf "PASS: %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

HOOK="$(cd "$(dirname "$0")/.." && pwd)/hooks/planning-checklist.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

STATE="$TMP/.claude/workflow-state"
GOALS="$STATE/goals"
mkdir -p "$GOALS" "$TMP/docs" "$TMP/.claude/plans"

# Feature gate: Task Tracking mentions FEATURES.md, so the gate allows the plan through
# even without a matching row (line 504 of planning-checklist.sh)
printf "| existing feature |\n" > "$TMP/docs/FEATURES.md"

make_plan() {
    cat <<'EOF'
# VV Skip Test Plan

## Feature
test feature

## Architecture Impact
N/A - bug fix

## ADR
N/A - bug fix

## State Machine / Sync
N/A - bug fix

## Tests
unit tests

## Documentation
N/A - docs only

## package.json / contributes
N/A - no new commands

## CHANGELOG
Added something

## README
N/A - internal

## Task Tracking
1. do something
2. Add row to docs/FEATURES.md

## Acceptance Criteria
- [ ] Something happens with `log line`

## Side-Effects
N/A - typo fix

## Flow Visualization
```
BEFORE  AFTER
──────  ─────
old  →  new
```

## Root Cause Evidence
[runtime-observation] hook log confirms goal block not entered

## Harness Requirements
[N/A-no-workspace-interaction]
EOF
}

PLAN="$TMP/.claude/plans/test.md"
make_plan > "$PLAN"

# ── F1: env set, no existing goal → no goal file created, no gate file written ─

OXVEIL_VV_ACTIVE=1 PLAN_FILE="$PLAN" CLAUDE_PROJECT_DIR="$TMP" \
    sh "$HOOK" 2>/dev/null || true

goal_count=$(find "$GOALS" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
if [ "$goal_count" -eq 0 ]; then
    pass "F1: OXVEIL_VV_ACTIVE=1 — no goal file created"
else
    fail "F1: OXVEIL_VV_ACTIVE=1 — unexpected goal file created ($goal_count files)"
fi

if [ ! -f "$STATE/goal-gate-passed" ]; then
    pass "F1: OXVEIL_VV_ACTIVE=1 — no goal-gate-passed written"
else
    fail "F1: OXVEIL_VV_ACTIVE=1 — unexpected goal-gate-passed written"
fi

# plan-exited and plan-requirements.json must still fire (non-goal paths unchanged)
if [ -f "$STATE/plan-exited" ]; then
    pass "F1: OXVEIL_VV_ACTIVE=1 — plan-exited still written"
else
    fail "F1: OXVEIL_VV_ACTIVE=1 — plan-exited not written (non-goal paths broken)"
fi

# ── F2: env set, existing goal → goal file byte-identical ─────────────────────

GOAL_FILE="$GOALS/existing-goal.md"
cat > "$GOAL_FILE" <<'GOALEOF'
---
created: 01.01.2025 12:00
---
# Existing Goal

## Why
Some reason.

## Status
### 2025-01-01 10:00 - Old Plan
See plan file for details.
GOALEOF

# Capture exact content before the run
cp "$GOAL_FILE" "$TMP/goal-before.txt"
# Set gate so hook would normally append to this goal
echo "$(date +%s):existing-goal" > "$STATE/goal-gate-passed"

OXVEIL_VV_ACTIVE=1 PLAN_FILE="$PLAN" CLAUDE_PROJECT_DIR="$TMP" \
    sh "$HOOK" 2>/dev/null || true

if diff -q "$TMP/goal-before.txt" "$GOAL_FILE" >/dev/null 2>&1; then
    pass "F2: OXVEIL_VV_ACTIVE=1 — existing goal file unchanged"
else
    fail "F2: OXVEIL_VV_ACTIVE=1 — existing goal file was modified"
fi

# ── F3: env unset → new ### entry appended to existing goal ───────────────────

# Re-point gate to the same existing goal so the hook appends rather than creates
echo "$(date +%s):existing-goal" > "$STATE/goal-gate-passed"
entries_before=$(grep -c '^### ' "$GOAL_FILE" 2>/dev/null || echo 0)

PLAN_FILE="$PLAN" CLAUDE_PROJECT_DIR="$TMP" \
    sh "$HOOK" 2>/dev/null || true

entries_after=$(grep -c '^### ' "$GOAL_FILE" 2>/dev/null || echo 0)
if [ "$entries_after" -gt "$entries_before" ]; then
    pass "F3: env unset — new ### entry appended to existing goal"
else
    fail "F3: env unset — no new ### entry appended (before=$entries_before after=$entries_after)"
fi

# ── Summary ────────────────────────────────────────────────────────────────────
printf "\nResults: %d passed, %d failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
