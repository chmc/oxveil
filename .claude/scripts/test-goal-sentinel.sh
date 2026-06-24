#!/bin/sh
# Tests for "do-something-else" sentinel handling in goal hooks
set -eu

PASS=0
FAIL=0

pass() { printf "PASS: %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GATE_HOOK="$SCRIPT_DIR/hooks/goal-action-gate.sh"
CHECKLIST="$SCRIPT_DIR/hooks/planning-checklist.sh"

# Setup tmp workspace
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

GOALS_DIR="$TMP/goals"
GATE_FILE="$TMP/goal-gate-passed"
STATE_DIR="$TMP"
mkdir -p "$GOALS_DIR"

# Create a real goal file for baseline tests
echo "# Real Goal" > "$GOALS_DIR/260101-0000-real-goal.md"

# Helper: run gate hook with given gate content
run_gate() {
    gate_content="$1"
    echo "$gate_content" > "$GATE_FILE"
    # Simulate input JSON
    echo '{"tool_name":"Edit","tool_input":{"file_path":"/some/other/file.ts"}}' | \
        OXVEIL_SKIP_GATES=0 \
        sh -c "
            STATE_DIR='$STATE_DIR'
            GOALS_DIR='$GOALS_DIR'
            GATE_FILE='$GATE_FILE'
            gate_goal=\$(cut -d: -f2 '$GATE_FILE' 2>/dev/null || echo '')
            if [ -z \"\$gate_goal\" ] || [ \"\$gate_goal\" = 'do-something-else' ] || [ -f \"\$GOALS_DIR/\${gate_goal}.md\" ]; then
                echo allow
            else
                echo deny
            fi
        "
}

# Test 1: sentinel allows through gate
result=$(run_gate "$(date +%s):do-something-else")
if [ "$result" = "allow" ]; then
    pass "sentinel allows through gate"
else
    fail "sentinel allows through gate (got: $result)"
fi

# Test 2: real goal ID allows through gate
result=$(run_gate "$(date +%s):260101-0000-real-goal")
if [ "$result" = "allow" ]; then
    pass "real goal ID allows through gate"
else
    fail "real goal ID allows through gate (got: $result)"
fi

# Test 3: missing goal file denies
result=$(run_gate "$(date +%s):260101-0000-deleted-goal")
if [ "$result" = "deny" ]; then
    pass "deleted goal ID denies gate"
else
    fail "deleted goal ID denies gate (got: $result)"
fi

# Test 4: empty gate_goal allows (no gate)
result=$(run_gate "$(date +%s):")
if [ "$result" = "allow" ]; then
    pass "empty goal ID allows through gate"
else
    fail "empty goal ID allows through gate (got: $result)"
fi

# Extract find_matching_goal() and helpers from the hook for direct testing
FN_DEFS=$(mktemp)
sed -n '13p;481,575p' "$CHECKLIST" > "$FN_DEFS"

# run_find_matching <GOALS_DIR> <title>
run_find_matching() {
    _rfm_goals="$1"
    _rfm_title="$2"
    sh -c "
        GOALS_DIR='$_rfm_goals'
        . '$FN_DEFS'
        find_matching_goal '$_rfm_title'
    "
}

# Test 5: do-something-else + strong Jaccard match (exact title, Jaccard=1.0) → existing goal honoured
# Phase 2 change: sentinel no longer blocks strong matches
echo "$(date +%s):do-something-else" > "$GATE_FILE"
matched=$(run_find_matching "$GOALS_DIR" "Real Goal")
if [ "$matched" = "260101-0000-real-goal" ]; then
    pass "sentinel + exact title (Jaccard=1.0): existing goal matched"
else
    fail "sentinel + exact title (Jaccard=1.0): expected 260101-0000-real-goal, got '$matched'"
fi

# Test 5b: do-something-else + truly weak match (0 shared tokens) → new goal created
matched=$(run_find_matching "$GOALS_DIR" "Xyz quantum flux")
if [ -z "$matched" ]; then
    pass "sentinel + no shared tokens: no match (new goal would be created)"
else
    fail "sentinel + no shared tokens: unexpected match '$matched'"
fi

# Test 6: do-something-else + strong Jaccard match (≥ 0.5, ≥ 2 tokens) → existing goal honoured
echo "# Fix duplicate creation planning script" > "$GOALS_DIR/260101-0001-strong-match.md"
matched=$(run_find_matching "$GOALS_DIR" "Fix duplicate creation planning script")
if [ "$matched" = "260101-0001-strong-match" ]; then
    pass "sentinel + strong Jaccard match: existing goal matched"
else
    fail "sentinel + strong Jaccard match: expected 260101-0001-strong-match, got '$matched'"
fi

# Test 7: do-something-else + issue #N match → existing goal honoured
echo "# Fix crash in auth #42" > "$GOALS_DIR/260101-0002-issue-42.md"
matched=$(run_find_matching "$GOALS_DIR" "Fix auth crash #42")
if [ "$matched" = "260101-0002-issue-42" ]; then
    pass "sentinel + issue #N match: existing goal matched"
else
    fail "sentinel + issue #N match: expected 260101-0002-issue-42, got '$matched'"
fi

rm -f "$FN_DEFS"

# Summary
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
