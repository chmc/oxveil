#!/bin/sh
# Tests for Root Cause Evidence (B), VV anchor whitelist (C), and Harness Requirements (D)
set -eu

PASS=0; FAIL=0
pass() { printf "PASS: %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

HOOK="$(cd "$(dirname "$0")/.." && pwd)/hooks/planning-checklist.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Minimal valid plan skeleton (all 15 sections)
make_plan() {
    local rce="$1" hr="$2" vv_items="$3"
    cat <<EOF
# Test Plan

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
Added tests

## README
N/A - internal

## Task Tracking
1. do something
2. Add row to docs/FEATURES.md

## Acceptance Criteria
- [ ] something happens with \`log line\`

## Side-Effects
N/A - typo fix

## Flow Visualization
\`\`\`
BEFORE  AFTER
──────  ─────
old  →  new
\`\`\`

## Root Cause Evidence
$rce

## Harness Requirements
$hr

$vv_items
EOF
}

run_hook() {
    plan="$1"
    PLAN_FILE="$plan" CLAUDE_PROJECT_DIR="$TMP" OXVEIL_SKIP_GATES=0 \
        sh "$HOOK" 2>/dev/null || true
}

FEATURES="$TMP/docs"
mkdir -p "$FEATURES"
printf "| test feature |\n" > "$FEATURES/FEATURES.md"
mkdir -p "$TMP/.claude/workflow-state/goals"

# ── Root Cause Evidence ────────────────────────────────────────────────────────

# B1: valid [failing-test] tag passes
p="$TMP/plan-b1.md"; make_plan "[failing-test] src/test/formPlan.test.ts" "[N/A-no-workspace-interaction]" "" > "$p"
out=$(run_hook "$p")
echo "$out" | grep -q "Root Cause Evidence" && fail "B1: [failing-test] should pass" || pass "B1: [failing-test] passes"

# B2: valid [runtime-observation] tag passes
p="$TMP/plan-b2.md"; make_plan "[runtime-observation] log line xyz at formPlan:234" "[N/A-no-workspace-interaction]" "" > "$p"
out=$(run_hook "$p")
echo "$out" | grep -q "Root Cause Evidence" && fail "B2: [runtime-observation] should pass" || pass "B2: [runtime-observation] passes"

# B3: valid [debugger-snapshot] tag passes
p="$TMP/plan-b3.md"; make_plan "[debugger-snapshot] mcp GET /state shows sessions=0" "[N/A-no-workspace-interaction]" "" > "$p"
out=$(run_hook "$p")
echo "$out" | grep -q "Root Cause Evidence" && fail "B3: [debugger-snapshot] should pass" || pass "B3: [debugger-snapshot] passes"

# B4: missing section denied
p="$TMP/plan-b4.md"
cat <<'EOF' > "$p"
# Test Plan

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
Added tests

## README
N/A - internal

## Task Tracking
1. do something

## Acceptance Criteria
- [ ] something happens with `log line`

## Side-Effects
N/A - typo fix

## Flow Visualization
```
BEFORE  AFTER
──────  ─────
old  →  new
```

## Harness Requirements
[N/A-no-workspace-interaction]
EOF
out=$(run_hook "$p")
echo "$out" | grep -q "Root Cause Evidence" && pass "B4: missing Root Cause Evidence denied" || fail "B4: missing Root Cause Evidence should be denied"

# B5: N/A with valid category passes
p="$TMP/plan-b5.md"; make_plan "N/A - docs only" "[N/A-no-workspace-interaction]" "" > "$p"
out=$(run_hook "$p")
echo "$out" | grep -q "Root Cause Evidence" && fail "B5: N/A docs only should pass" || pass "B5: N/A with approved category passes"

# B6: N/A without category denied
p="$TMP/plan-b6.md"; make_plan "N/A - just because" "[N/A-no-workspace-interaction]" "" > "$p"
out=$(run_hook "$p")
echo "$out" | grep -q "Root Cause Evidence" && pass "B6: N/A without approved category denied" || fail "B6: N/A without category should be denied"

# B7: bare text (no tag) denied
p="$TMP/plan-b7.md"; make_plan "I read the code and it looked null" "[N/A-no-workspace-interaction]" "" > "$p"
out=$(run_hook "$p")
echo "$out" | grep -q "Root Cause Evidence" && pass "B7: bare text without tag denied" || fail "B7: bare text without tag should be denied"

# ── Harness Requirements ───────────────────────────────────────────────────────

# D1: [needs-real-session] passes
p="$TMP/plan-d1.md"; make_plan "[runtime-observation] log at line 234" "[needs-real-session]" "" > "$p"
out=$(run_hook "$p")
echo "$out" | grep -q "Harness Requirements" && fail "D1: [needs-real-session] should pass" || pass "D1: [needs-real-session] passes"

# D2: [empty-harness-ok] passes
p="$TMP/plan-d2.md"; make_plan "[runtime-observation] log at line 234" "[empty-harness-ok]" "" > "$p"
out=$(run_hook "$p")
echo "$out" | grep -q "Harness Requirements" && fail "D2: [empty-harness-ok] should pass" || pass "D2: [empty-harness-ok] passes"

# D3: invalid tag denied
p="$TMP/plan-d3.md"; make_plan "[runtime-observation] log at line 234" "not a valid tag" "" > "$p"
out=$(run_hook "$p")
echo "$out" | grep -q "Harness Requirements" && pass "D3: invalid harness tag denied" || fail "D3: invalid harness tag should be denied"

# D4: missing section denied
p="$TMP/plan-d4.md"
cat <<'EOF' > "$p"
# Test Plan

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
Added tests

## README
N/A - internal

## Task Tracking
1. do something

## Acceptance Criteria
- [ ] something happens with `log line`

## Side-Effects
N/A - typo fix

## Flow Visualization
```
BEFORE  AFTER
──────  ─────
old  →  new
```

## Root Cause Evidence
[runtime-observation] log at line 234
EOF
out=$(run_hook "$p")
echo "$out" | grep -q "Harness Requirements" && pass "D4: missing Harness Requirements denied" || fail "D4: missing Harness Requirements should be denied"

# ── VV anchor whitelist (C) ────────────────────────────────────────────────────

VV_VALID='
## Visual Verification

- [ ] Extension host log contains `formPlan adapter: proceeding`
- [ ] MCP GET /state shows view=ready after sentinel write
- [ ] .claudeloop/PLAN.md exists with unique phrase screenshot: verified
'

VV_BARE_ABSENCE='
## Visual Verification

- [ ] No error notification appears after sentinel write
- [ ] Extension does not crash when plan file missing
'

VV_PAIRED_ABSENCE='
## Visual Verification

- [ ] No duplicate goal created AND `.claude/workflow-state/goals/` has exactly one file
- [ ] No error notification AND MCP GET /state view=ready
'

# C1: valid anchored criteria pass
p="$TMP/plan-c1.md"; make_plan "[runtime-observation] log at line 234" "[empty-harness-ok]" "$VV_VALID" > "$p"
out=$(run_hook "$p")
echo "$out" | grep -q "anchor" && fail "C1: valid anchored criteria should pass" || pass "C1: valid anchored criteria pass"

# C2: bare absence criteria denied
p="$TMP/plan-c2.md"; make_plan "[runtime-observation] log at line 234" "[empty-harness-ok]" "$VV_BARE_ABSENCE" > "$p"
out=$(run_hook "$p")
echo "$out" | grep -q "anchor" && pass "C2: bare absence criteria denied" || fail "C2: bare absence criteria should be denied"

# C3: paired absence + anchor passes
p="$TMP/plan-c3.md"; make_plan "[runtime-observation] log at line 234" "[empty-harness-ok]" "$VV_PAIRED_ABSENCE" > "$p"
out=$(run_hook "$p")
echo "$out" | grep -q "anchor" && fail "C3: paired absence+anchor should pass" || pass "C3: paired absence+anchor passes"

# ── D advisory warning (gate passes; advisory is non-blocking) ─────────────────

# D5: [empty-harness-ok] is not denied — advisory only emits, never blocks
p="$TMP/plan-d5.md"; make_plan "[runtime-observation] log at line 234" "[empty-harness-ok]" "" > "$p"
out=$(run_hook "$p")
echo "$out" | grep -q '"permissionDecision": "deny"' && fail "D5: [empty-harness-ok] plan should not be denied" || pass "D5: [empty-harness-ok] plan passes gate (advisory non-blocking)"

# ── Summary ────────────────────────────────────────────────────────────────────
printf "\nResults: %d passed, %d failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
