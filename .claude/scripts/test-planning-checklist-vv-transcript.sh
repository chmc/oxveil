#!/bin/sh
# Tests for VV Transcript enforcement in planning-checklist.sh
# Rules: when VV section exists and is not N/A, plan must include:
#   1. ## VV Transcript section (non-empty, non-placeholder)
#   2. >= 1 Task Tracking line containing "transcript"
# VV N/A bypasses both checks.
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

printf "| existing feature |\n| test |\n" > "$TMP/docs/FEATURES.md"

make_plan_vv_no_transcript() {
    cat <<'EOF'
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
[runtime-observation] hook log confirms behavior

## Harness Requirements
[N/A-no-workspace-interaction]

## Visual Verification
- [ ] Something is visible in `.claude/hooks/planning-checklist.sh`
- [ ] Another thing shown in `SESSION.md` file
EOF
}

make_plan_vv_with_transcript() {
    cat <<'EOF'
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
2. Flow A — transcript: observe deny when section missing

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
[runtime-observation] hook log confirms behavior

## Harness Requirements
[N/A-no-workspace-interaction]

## Visual Verification
- [ ] Something is visible in `.claude/hooks/planning-checklist.sh`
- [ ] Another thing shown in `SESSION.md` file

## VV Transcript

### Flow A — observe deny
I open a new plan and call ExitPlanMode. The sidebar shows the deny banner.
EOF
}

make_plan_vv_na() {
    cat <<'EOF'
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
[runtime-observation] hook log confirms behavior

## Harness Requirements
[N/A-no-workspace-interaction]

## Visual Verification
N/A - hook/shell change with no UI surface, no state transition visible in sidebar
EOF
}

make_plan_vv_placeholder_transcript() {
    cat <<'EOF'
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
2. Flow A — transcript: observe deny

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
[runtime-observation] hook log confirms behavior

## Harness Requirements
[N/A-no-workspace-interaction]

## Visual Verification
- [ ] Something is visible in `.claude/hooks/planning-checklist.sh`
- [ ] Another thing shown in `SESSION.md` file

## VV Transcript

### Flow A
*(to be filled during VV)*
EOF
}

make_plan_vv_no_transcript_task() {
    cat <<'EOF'
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
2. run visual verification

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
[runtime-observation] hook log confirms behavior

## Harness Requirements
[N/A-no-workspace-interaction]

## Visual Verification
- [ ] Something is visible in `.claude/hooks/planning-checklist.sh`
- [ ] Another thing shown in `SESSION.md` file

## VV Transcript

### Flow A
I open a new plan and call ExitPlanMode. The sidebar shows the deny banner immediately.
EOF
}

run_hook() {
    PLAN_FILE="$1" CLAUDE_PROJECT_DIR="$TMP" \
        sh "$HOOK" 2>/dev/null || true
}

deny_contains() {
    echo "$1" | grep -q "permissionDecision.*deny"
}

PLAN="$TMP/.claude/plans/test.md"

# F1: VV present, no ## VV Transcript section → deny
make_plan_vv_no_transcript > "$PLAN"
result=$(run_hook "$PLAN")
if deny_contains "$result" && echo "$result" | grep -qi "transcript"; then
    pass "F1: VV present, no VV Transcript section → denied with 'transcript' in reason"
else
    fail "F1: expected deny mentioning transcript, got: $result"
fi

# F2: VV present, placeholder-only transcript → deny
make_plan_vv_placeholder_transcript > "$PLAN"
result=$(run_hook "$PLAN")
if deny_contains "$result" && echo "$result" | grep -qi "transcript"; then
    pass "F2: VV present, placeholder transcript → denied"
else
    fail "F2: expected deny for placeholder transcript, got: $result"
fi

# F3: VV present, no transcript task in Task Tracking → deny
make_plan_vv_no_transcript_task > "$PLAN"
result=$(run_hook "$PLAN")
if deny_contains "$result" && echo "$result" | grep -qi "transcript"; then
    pass "F3: VV present, no transcript task → denied with 'transcript' in reason"
else
    fail "F3: expected deny for missing transcript task, got: $result"
fi

# F4: VV N/A → approve (transcript checks bypassed)
make_plan_vv_na > "$PLAN"
result=$(run_hook "$PLAN")
if ! deny_contains "$result"; then
    pass "F4: VV N/A → approved (no transcript requirement)"
else
    fail "F4: VV N/A should approve but got deny: $result"
fi

# F5: VV present, full transcript + transcript task → approve
make_plan_vv_with_transcript > "$PLAN"
result=$(run_hook "$PLAN")
if ! deny_contains "$result"; then
    pass "F5: VV with full transcript + task → approved"
else
    fail "F5: valid plan denied, got: $result"
fi

printf "\nResults: %d passed, %d failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
