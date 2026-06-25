#!/bin/sh
# Tests for session-start.sh SessionStart hook
set -eu

PASS=0
FAIL=0
pass() { printf "PASS: %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

REAL_HOOK="$(cd "$(dirname "$0")/.." && pwd)/hooks/session-start.sh"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/hooks" "$TMP/workflow-state/goals"
ln -s "$REAL_HOOK" "$TMP/hooks/session-start.sh"

GOALS_DIR="$TMP/workflow-state/goals"
GATE_FILE="$TMP/workflow-state/goal-gate-passed"

echo "# Goal Alpha" > "$GOALS_DIR/260101-0000-goal-alpha.md"

now=$(date +%s)
fresh_gate="${now}:260101-0000-goal-alpha"

run_hook() {
    src="$1"
    if [ -n "$src" ]; then
        printf '{"hook_event_name":"SessionStart","source":"%s"}' "$src" \
            | sh "$TMP/hooks/session-start.sh"
    else
        printf '' | sh "$TMP/hooks/session-start.sh"
    fi
}

# 1: compact + fresh gate + existing goal → short-circuit
echo "$fresh_gate" > "$GATE_FILE"
out=$(run_hook "compact")
if echo "$out" | grep -q "Continuing active goal" && ! echo "$out" | grep -q "STOP. Active goals"; then
    pass "compact + fresh gate: short-circuit fires"
else
    fail "compact + fresh gate: expected short-circuit, got: $out"
fi

# 2: resume + fresh gate + existing goal → short-circuit
echo "$fresh_gate" > "$GATE_FILE"
out=$(run_hook "resume")
if echo "$out" | grep -q "Continuing active goal" && ! echo "$out" | grep -q "STOP. Active goals"; then
    pass "resume + fresh gate: short-circuit fires"
else
    fail "resume + fresh gate: expected short-circuit, got: $out"
fi

# 3: compact + no gate → prompt
rm -f "$GATE_FILE"
out=$(run_hook "compact")
if echo "$out" | grep -q "STOP. Active goals"; then
    pass "compact + no gate: prompt shown"
else
    fail "compact + no gate: expected prompt, got: $out"
fi

# 4: compact + stale gate (>4h) → cleanup + prompt
stale_epoch=$(( now - 18000 ))
echo "${stale_epoch}:260101-0000-goal-alpha" > "$GATE_FILE"
out=$(run_hook "compact")
if echo "$out" | grep -q "STOP. Active goals" && [ ! -f "$GATE_FILE" ]; then
    pass "compact + stale gate: cleanup runs, prompt shown"
else
    fail "compact + stale gate: expected cleanup+prompt (gate present=$([ -f "$GATE_FILE" ] && echo yes || echo no)), got: $out"
fi

# 5: compact + gate references deleted goal → cleanup + prompt
echo "${now}:260101-9999-deleted.md" > "$GATE_FILE"
out=$(run_hook "compact")
if echo "$out" | grep -q "STOP. Active goals" && [ ! -f "$GATE_FILE" ]; then
    pass "compact + deleted-goal gate: cleanup runs, prompt shown"
else
    fail "compact + deleted-goal gate: (gate present=$([ -f "$GATE_FILE" ] && echo yes || echo no)), got: $out"
fi

# 6: compact + do-something-else sentinel → prompt (no goal file to continue)
echo "${now}:do-something-else" > "$GATE_FILE"
out=$(run_hook "compact")
if echo "$out" | grep -q "STOP. Active goals"; then
    pass "compact + do-something-else sentinel: prompt shown"
else
    fail "compact + do-something-else sentinel: expected prompt, got: $out"
fi

# 7: compact + gate present but GOALS_DIR empty → prompt
rm -f "$GOALS_DIR"/*.md 2>/dev/null || true
echo "$fresh_gate" > "$GATE_FILE"
out=$(run_hook "compact")
if ! echo "$out" | grep -q "Continuing active goal"; then
    pass "compact + GOALS_DIR empty: no short-circuit"
else
    fail "compact + GOALS_DIR empty: unexpected short-circuit, got: $out"
fi
echo "# Goal Alpha" > "$GOALS_DIR/260101-0000-goal-alpha.md"  # restore

# 8: compact + malformed gate (no colon) → prompt, no crash
echo "notanepoch" > "$GATE_FILE"
out=$(run_hook "compact" 2>&1)
if echo "$out" | grep -q "STOP. Active goals"; then
    pass "compact + malformed gate: prompt shown, no crash"
else
    fail "compact + malformed gate: unexpected output: $out"
fi

# 9: startup + fresh gate → prompt (scope is compact/resume only)
echo "$fresh_gate" > "$GATE_FILE"
out=$(run_hook "startup")
if echo "$out" | grep -q "STOP. Active goals"; then
    pass "startup + fresh gate: prompt shown (not short-circuited)"
else
    fail "startup + fresh gate: expected prompt, got: $out"
fi

# 10: clear + fresh gate → prompt
echo "$fresh_gate" > "$GATE_FILE"
out=$(run_hook "clear")
if echo "$out" | grep -q "STOP. Active goals"; then
    pass "clear + fresh gate: prompt shown"
else
    fail "clear + fresh gate: expected prompt, got: $out"
fi

# 11: empty stdin → prompt (fail-safe)
echo "$fresh_gate" > "$GATE_FILE"
out=$(printf '' | sh "$TMP/hooks/session-start.sh")
if echo "$out" | grep -q "STOP. Active goals"; then
    pass "empty stdin: prompt shown (fail-safe)"
else
    fail "empty stdin: expected prompt, got: $out"
fi

# 12: regression — GOALS_DIR ordering fix: fresh gate with existing goal must NOT be deleted
echo "$fresh_gate" > "$GATE_FILE"
run_hook "startup" > /dev/null 2>&1 || true
if [ -f "$GATE_FILE" ]; then
    pass "GOALS_DIR ordering fix: fresh gate not deleted by stale-cleanup"
else
    fail "GOALS_DIR ordering fix: fresh gate was wrongly deleted (regression)"
fi

printf "\nResults: %d passed, %d failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
