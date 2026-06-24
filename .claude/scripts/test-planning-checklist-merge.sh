#!/bin/sh
# Tests for goal creation/merge logic in planning-checklist.sh
# Cases: issue-# merge, Jaccard merge, Jaccard regression guard, issue-# mismatch,
#        sentinel+#N merge, sentinel+unrelated new goal, multi-match mtime tiebreak.
set -eu

PASS=0
FAIL=0
pass() { printf "PASS: %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GOAL_MATCH="$SCRIPT_DIR/hooks/planning-checklist-goal-match.sh"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
GOALS_DIR="$TMP/goals"
GATE_FILE="$TMP/goal-gate-passed"
mkdir -p "$GOALS_DIR"

# run_match <GOALS_DIR> <plan_title>
run_match() {
    _g="$1"; _t="$2"
    sh -c "GOALS_DIR='$_g'; . '$GOAL_MATCH'; find_matching_goal '$_t'"
}

# sim_gate_selection <gate_file> <plan_title>
# Replicates the goal_name determination block from planning-checklist.sh:
# reads gate file, falls through to find_matching_goal when selected_goal has no .md
sim_gate_selection() {
    _gf="$1"; _t="$2"
    sh -c "
        GOALS_DIR='$GOALS_DIR'
        GATE_FILE='$_gf'
        . '$GOAL_MATCH'
        goal_name=''
        selected_goal=''
        if [ -f \"\$GATE_FILE\" ]; then
            selected_goal=\$(cut -d: -f2 \"\$GATE_FILE\")
            if [ -n \"\$selected_goal\" ] && [ -f \"\$GOALS_DIR/\${selected_goal}.md\" ]; then
                goal_name=\"\$selected_goal\"
            fi
        fi
        [ -z \"\$goal_name\" ] && goal_name=\$(find_matching_goal '$_t' || true)
        printf '%s' \"\$goal_name\"
    "
}

# ── Case 1: issue number match → appends, one goal file ──────────────────────
echo "# Fix duplicate goal creation #104" > "$GOALS_DIR/260624-0000-issue-104.md"

result=$(run_match "$GOALS_DIR" "Fix duplicate goal creation #104")
[ "$result" = "260624-0000-issue-104" ] \
    && pass "1: #104 plan matches existing #104 goal (appends, one file)" \
    || fail "1: expected 260624-0000-issue-104, got '$result'"

# ── Case 2: Jaccard ≥ 0.5, no issue # → appends ──────────────────────────────
echo "# Improve caching subsystem performance" > "$GOALS_DIR/260624-0001-caching.md"

result=$(run_match "$GOALS_DIR" "Improve caching subsystem performance")
[ "$result" = "260624-0001-caching" ] \
    && pass "2: Jaccard=1.0 (no issue #) → match (appends)" \
    || fail "2: expected 260624-0001-caching, got '$result'"

# ── Case 3: regression guard — Jaccard < 0.5 → two goals ─────────────────────
# "Fix flaky test in parser with alpha config retry"  tokens: {alpha, config, flaky, parser, retry}
# "Fix flaky test in parser with beta config timeout" tokens: {beta, config, flaky, parser, timeout}
# intersection={config,flaky,parser}=3, union=7, Jaccard=3/7≈0.43 < 0.5 → no match
echo "# Fix flaky test in parser with alpha config retry" > "$GOALS_DIR/260624-0002-plan-a.md"

result=$(run_match "$GOALS_DIR" "Fix flaky test in parser with beta config timeout")
[ -z "$result" ] \
    && pass "3: Jaccard=3/7≈0.43 < 0.5 → no match (two goals, regression guard)" \
    || fail "3: expected no match (two goals), got '$result'"

# ── Case 4: issue # mismatch → two goals ─────────────────────────────────────
# "fix" and "issue" are stop words; #210 and #104 tokens don't intersect → no match
echo "# Fix issue #104" > "$GOALS_DIR/260624-0003-issue-104b.md"

result=$(run_match "$GOALS_DIR" "Fix issue #210")
[ -z "$result" ] \
    && pass "4: #210 plan vs #104 goal, stop-word overlap only → no match (two goals)" \
    || fail "4: expected no match (two goals), got '$result'"

# ── Case 5: sentinel + #N → find_matching_goal still called, merges ──────────
echo "# Fix auth crash #42" > "$GOALS_DIR/260624-0004-issue-42.md"
echo "$(date +%s):do-something-else" > "$GATE_FILE"

result=$(sim_gate_selection "$GATE_FILE" "Fix auth crash #42")
[ "$result" = "260624-0004-issue-42" ] \
    && pass "5: sentinel in gate + #42 plan → find_matching_goal bypasses sentinel, merges" \
    || fail "5: expected 260624-0004-issue-42, got '$result'"

# ── Case 6: sentinel + unrelated plan → no match (new goal created) ──────────
echo "$(date +%s):do-something-else" > "$GATE_FILE"

result=$(sim_gate_selection "$GATE_FILE" "Quantum flux capacitor unrelated task")
[ -z "$result" ] \
    && pass "6: sentinel + unrelated plan → no match (new goal would be created)" \
    || fail "6: expected no match (new goal), got '$result'"

# ── Case 7: multiple equal-Jaccard matches → picks most-recently-modified ────
rm -f "$GOALS_DIR"/*.md
# Set older goal to a fixed past timestamp; newer goal keeps current timestamp
echo "# Modernize backend caching layer" > "$GOALS_DIR/260624-0010-older.md"
touch -t "202601010000" "$GOALS_DIR/260624-0010-older.md"
echo "# Modernize backend caching layer" > "$GOALS_DIR/260624-0011-newer.md"

result=$(run_match "$GOALS_DIR" "Modernize backend caching layer")
[ "$result" = "260624-0011-newer" ] \
    && pass "7: multiple equal-Jaccard matches → picks most-recently-modified" \
    || fail "7: expected 260624-0011-newer (newest mtime), got '$result'"

# Summary
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
