#!/bin/sh
# Tests for marker-validator.sh evidence-tag enforcement (improvement #4)
# When plan declares [needs-real-session], bare "Status: PASS" (no evidence tag) in
# Per-AC Records must be denied when writing status=pass to visual-verified.
set -eu

PASS=0; FAIL=0
pass() { printf "PASS: %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

HOOK="$(cd "$(dirname "$0")/.." && pwd)/hooks/marker-validator.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

STATE="$TMP/.claude/workflow-state"
SESSION="$TMP/vv-session"
PLANS="$TMP/.claude/plans"
mkdir -p "$STATE" "$SESSION" "$PLANS"

# Write visual-verified marker (new format)
write_marker() {
    printf 'status=pass session=%s\n' "$SESSION" > "$STATE/visual-verified"
}

# Write a plan declaring [needs-real-session]
plan_needs_real() {
    cat > "$PLANS/test-plan.md" <<'EOF'
## Harness Requirements
[needs-real-session]
EOF
}

# Write a plan declaring [empty-harness-ok] (no real-session requirement)
plan_empty_harness() {
    cat > "$PLANS/test-plan.md" <<'EOF'
## Harness Requirements
[empty-harness-ok]
EOF
}

# Write a minimal valid SESSION.md
write_session() {
    cat > "$SESSION/SESSION.md" <<EOF
## Acceptance Criteria
- [x] something

## Per-AC Records

$1
EOF
}

# Run hook for a Write tool touching visual-verified
run_hook() {
    printf '{"tool_name":"Write","tool_input":{"file_path":"%s/.claude/workflow-state/visual-verified"}}' "$TMP" \
        | CLAUDE_PROJECT_DIR="$TMP" sh "$HOOK" 2>/dev/null || true
}

deny_reason() {
    run_hook | jq -r '.hookSpecificOutput.permissionDecisionReason // empty' 2>/dev/null || true
}

# ── Test 1: bare Status: PASS + [needs-real-session] → deny ──
write_marker
plan_needs_real
write_session "### AC: something
Status: PASS
Observation: saw it"
_reason=$(deny_reason)
case "$_reason" in
    *"bare 'Status: PASS' without evidence tag"*)
        pass "T1: bare Status: PASS + [needs-real-session] plan → denied";;
    *)
        fail "T1: expected evidence-tag deny, got: '$_reason'";;
esac

# ── Test 2: Status: PASS [real-harness] → no deny ──
write_marker
plan_needs_real
write_session "### AC: something
Status: PASS [real-harness]
Observation: saw it in a screenshot"
_reason=$(deny_reason)
if [ -z "$_reason" ]; then
    pass "T2: Status: PASS [real-harness] + [needs-real-session] → no deny"
else
    fail "T2: unexpected deny: '$_reason'"
fi

# ── Test 3: Status: PASS [synthetic, wiring-adjacent] → no deny ──
write_marker
plan_needs_real
write_session "### AC: something
Status: PASS [synthetic, wiring-adjacent]
Observation: pre-validation confirmed branch; wiring proven by AC1"
_reason=$(deny_reason)
if [ -z "$_reason" ]; then
    pass "T3: Status: PASS [synthetic, wiring-adjacent] + [needs-real-session] → no deny"
else
    fail "T3: unexpected deny: '$_reason'"
fi

# ── Test 4: Status: PASS [real-harness] [discovery-flow] → no deny ──
write_marker
plan_needs_real
write_session "### AC: something
Status: PASS [real-harness] [discovery-flow]
Observation: deny visible in plan-chat terminal"
_reason=$(deny_reason)
if [ -z "$_reason" ]; then
    pass "T4: Status: PASS [real-harness] [discovery-flow] → no deny"
else
    fail "T4: unexpected deny: '$_reason'"
fi

# ── Test 5: bare Status: PASS + [empty-harness-ok] plan → no deny (enforcement scoped to [needs-real-session]) ──
write_marker
plan_empty_harness
write_session "### AC: something
Status: PASS
Observation: saw it"
_reason=$(deny_reason)
if [ -z "$_reason" ]; then
    pass "T5: bare Status: PASS + [empty-harness-ok] plan → no deny (enforcement only for [needs-real-session])"
else
    fail "T5: unexpected deny for non-real-session plan: '$_reason'"
fi

# ── Test 6: bare Status: PASS + no plan file → no deny (graceful fallback) ──
write_marker
rm -f "$PLANS/test-plan.md"
write_session "### AC: something
Status: PASS
Observation: saw it"
_reason=$(deny_reason)
if [ -z "$_reason" ]; then
    pass "T6: bare Status: PASS + no plan file → no deny (graceful fallback)"
else
    fail "T6: unexpected deny when no plan file: '$_reason'"
fi

# ── Test 7: mixed — one tagged, one bare → deny on bare ──
write_marker
plan_needs_real
write_session "### AC: first AC
Status: PASS [real-harness]
Observation: screenshot 01

### AC: second AC
Status: PASS
Observation: saw something"
_reason=$(deny_reason)
case "$_reason" in
    *"bare 'Status: PASS' without evidence tag"*)
        pass "T7: mixed tagged/bare Per-AC Records → denied on bare";;
    *)
        fail "T7: expected evidence-tag deny for mixed records, got: '$_reason'";;
esac

printf "\nResults: %d passed, %d failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
