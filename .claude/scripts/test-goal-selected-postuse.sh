#!/bin/sh
# Tests for goal-selected-postuse.sh PostToolUse(AskUserQuestion) hook
set -eu

PASS=0
FAIL=0
pass() { printf "PASS: %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

REAL_HOOK="$(cd "$(dirname "$0")/.." && pwd)/hooks/goal-selected-postuse.sh"

# Mirror the real layout so SCRIPT_DIR/../workflow-state resolves correctly
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/hooks" "$TMP/workflow-state/goals"
ln -s "$REAL_HOOK" "$TMP/hooks/goal-selected-postuse.sh"

GOALS_DIR="$TMP/workflow-state/goals"
GATE_FILE="$TMP/workflow-state/goal-gate-passed"

echo "# Goal Alpha" > "$GOALS_DIR/260101-0000-goal-alpha.md"
echo "# Goal Beta"  > "$GOALS_DIR/260101-0001-goal-beta.md"

run_hook() {
    answers_json="$1"
    printf '{"hook_event_name":"PostToolUse","tool_name":"AskUserQuestion","tool_response":{"answers":%s},"tool_input":{}}' "$answers_json" \
        | sh "$TMP/hooks/goal-selected-postuse.sh"
}

# 1: direct match
rm -f "$GATE_FILE"
run_hook '{"Which goal?":"260101-0000-goal-alpha"}'
if [ -f "$GATE_FILE" ] && grep -q ":260101-0000-goal-alpha$" "$GATE_FILE"; then
    pass "direct match: gate written for selected goal"
else
    fail "direct match: gate not written (got: $(cat "$GATE_FILE" 2>/dev/null || echo missing))"
fi

# 2: "Do something else"
rm -f "$GATE_FILE"
run_hook '{"Which goal?":"Do something else"}'
if [ -f "$GATE_FILE" ] && grep -q ":do-something-else$" "$GATE_FILE"; then
    pass "do-something-else: sentinel written"
else
    fail "do-something-else: (got: $(cat "$GATE_FILE" 2>/dev/null || echo missing))"
fi

# 3: Other/typed unmatched
rm -f "$GATE_FILE"
run_hook '{"Which goal?":"some random gibberish text"}'
if [ ! -f "$GATE_FILE" ]; then
    pass "other/unmatched: no gate written"
else
    fail "other/unmatched: spurious gate (got: $(cat "$GATE_FILE"))"
fi

# 4: Other/typed fuzzy match by filename
rm -f "$GATE_FILE"
run_hook '{"Which goal?":"260101-0001-goal-beta"}'
if [ -f "$GATE_FILE" ] && grep -q ":260101-0001-goal-beta$" "$GATE_FILE"; then
    pass "other/typed name match: gate written"
else
    fail "other/typed name match: (got: $(cat "$GATE_FILE" 2>/dev/null || echo missing))"
fi

# 5: cross-contamination — select alpha only, gate must be for alpha
rm -f "$GATE_FILE"
run_hook '{"Which goal?":"260101-0000-goal-alpha"}'
goal_in_gate=$(cut -d: -f2 "$GATE_FILE" 2>/dev/null || echo "")
if [ "$goal_in_gate" = "260101-0000-goal-alpha" ]; then
    pass "cross-contamination: gate for alpha, not beta"
else
    fail "cross-contamination: expected alpha, got '$goal_in_gate'"
fi

# 6: deleted goal — no .md exists
rm -f "$GATE_FILE"
run_hook '{"Which goal?":"260101-9999-deleted-goal"}'
if [ ! -f "$GATE_FILE" ]; then
    pass "deleted goal: no gate written"
else
    fail "deleted goal: spurious gate (got: $(cat "$GATE_FILE"))"
fi

printf "\nResults: %d passed, %d failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
