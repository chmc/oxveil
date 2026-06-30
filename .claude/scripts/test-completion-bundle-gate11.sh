#!/bin/sh
# Tests for completion-bundle.sh Gate 11: visual verification marker integrity
# Covers: (1) new-format marker parser correctness, (2) ## Transcript enforcement
# regardless of has_view_files() (both .claude/-only and src/views/ edit-orders).
set -eu

PASS=0; FAIL=0
pass() { printf "PASS: %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

HOOK="$(cd "$(dirname "$0")/.." && pwd)/hooks/completion-bundle.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

STATE="$TMP/.claude/workflow-state"
SESSION="$TMP/vv-session"
mkdir -p "$STATE/goals" "$SESSION"

# Minimal TaskUpdate→completed JSON input
task_input() {
    printf '{"tool_name":"TaskUpdate","tool_input":{"taskId":"1","status":"completed"}}'
}

# Write a SESSION.md with ## Transcript section (non-empty)
session_with_transcript() {
    cat > "$SESSION/SESSION.md" <<'EOF'
## Acceptance Criteria
- [x] something

## Per-AC Records

### AC: something
Status: PASS [real-harness]
Observation: saw it

## Transcript

I opened the panel. The deny appeared immediately. The message was visible.
EOF
}

# Write a SESSION.md without ## Transcript section
session_no_transcript() {
    cat > "$SESSION/SESSION.md" <<'EOF'
## Acceptance Criteria
- [x] something

## Per-AC Records

### AC: something
Status: PASS [real-harness]
Observation: saw it
EOF
}

# Write a SESSION.md with empty ## Transcript section
session_empty_transcript() {
    cat > "$SESSION/SESSION.md" <<'EOF'
## Acceptance Criteria
- [x] something

## Transcript

EOF
}

# Stub npx so vitest calls from Gate 5b exit 0 (don't call add_missing before it's defined).
# The real vitest gate is covered by npm test; here we test Gate 11 behavior only.
mkdir -p "$TMP/node_modules/.bin"
printf '#!/bin/sh\nexit 0\n' > "$TMP/node_modules/.bin/npx"
chmod +x "$TMP/node_modules/.bin/npx"
_orig_path="$PATH"
PATH="$TMP/node_modules/.bin:$PATH"

# Run hook with given edit-order content (or empty for no file)
# IMPORTANT: env vars must apply to sh, not printf — so they go after the pipe
run_hook() {
    _edit_order="${1:-}"
    if [ -n "$_edit_order" ]; then
        printf '%s\n' "$_edit_order" > "$STATE/edit-order"
    else
        rm -f "$STATE/edit-order"
    fi
    task_input | CLAUDE_PROJECT_DIR="$TMP" OXVEIL_SKIP_GATES=0 sh "$HOOK" 2>/dev/null || true
}

deny_reason() {
    run_hook "${1:-}" | jq -r '.hookSpecificOutput.permissionDecisionReason // empty' 2>/dev/null || true
}

# ── Test 1: new-format marker parses correctly (status=pass session=<path>) ──
# Parser bug: tr -d '[:space:]' collapsed "status=pass session=<path>" to "status=passsession=<path>".
# Fixed: normalize whitespace, keep inter-field space.
# Use .claude/-only edit-order to avoid Gate 9/10 (simplify/review) denies masking Gate 11 result.
session_with_transcript
printf 'status=pass session=%s\n' "$SESSION" > "$STATE/visual-verified"
_reason=$(deny_reason ".claude/hooks/completion-bundle.sh")
if [ -z "$_reason" ]; then
    pass "T1: new-format marker status=pass session=<path> parsed correctly (no deny)"
else
    fail "T1: new-format marker incorrectly denied: $_reason"
fi
rm -f "$STATE/edit-order"

# ── Test 2: .claude/-only edit-order + status=pass + missing ## Transcript → deny ──
# Improvement #2: Gate 11a fires even when has_view_files() returns false.
session_no_transcript
printf 'status=pass session=%s\n' "$SESSION" > "$STATE/visual-verified"
_reason=$(deny_reason ".claude/hooks/completion-bundle.sh")
case "$_reason" in
    *"missing ## Transcript section"*)
        pass "T2: .claude/-only edit-order + missing ## Transcript → denied";;
    *)
        fail "T2: expected deny 'missing ## Transcript section', got: '$_reason'";;
esac
rm -f "$STATE/edit-order"

# ── Test 3: src/views/ edit-order + status=pass + missing ## Transcript → deny (regression) ──
session_no_transcript
printf 'status=pass session=%s\n' "$SESSION" > "$STATE/visual-verified"
_reason=$(deny_reason "src/views/sidebarState.ts")
case "$_reason" in
    *"missing ## Transcript section"*)
        pass "T3: src/views/ edit-order + missing ## Transcript → denied (existing behavior preserved)";;
    *)
        fail "T3: expected deny 'missing ## Transcript section', got: '$_reason'";;
esac
rm -f "$STATE/edit-order"

# ── Test 4: status=pass + non-empty ## Transcript + .claude/-only edit-order → no deny ──
session_with_transcript
printf 'status=pass session=%s\n' "$SESSION" > "$STATE/visual-verified"
_reason=$(deny_reason ".claude/hooks/completion-bundle.sh")
if [ -z "$_reason" ]; then
    pass "T4: .claude/-only edit-order + real ## Transcript → no deny"
else
    fail "T4: unexpected deny: $_reason"
fi
rm -f "$STATE/edit-order"

# ── Test 5: status=pass + empty ## Transcript section → deny ──
session_empty_transcript
printf 'status=pass session=%s\n' "$SESSION" > "$STATE/visual-verified"
_reason=$(deny_reason ".claude/hooks/completion-bundle.sh")
case "$_reason" in
    *"## Transcript section is empty"*)
        pass "T5: empty ## Transcript section → denied";;
    *)
        fail "T5: expected deny '## Transcript section is empty', got: '$_reason'";;
esac
rm -f "$STATE/edit-order"

# ── Test 6: legacy path-only marker + real ## Transcript → no deny ──
session_with_transcript
printf '%s\n' "$SESSION" > "$STATE/visual-verified"
_reason=$(deny_reason ".claude/hooks/completion-bundle.sh")
if [ -z "$_reason" ]; then
    pass "T6: legacy path-only marker + real ## Transcript → no deny"
else
    fail "T6: legacy marker incorrectly denied: $_reason"
fi
rm -f "$STATE/edit-order"

# ── Test 7: no marker + src/views/ edit-order + no skip-reason → deny ──
rm -f "$STATE/visual-verified" "$STATE/visual-skip-reason"
_reason=$(deny_reason "src/views/sidebarState.ts")
case "$_reason" in
    *"visual verification not done"*)
        pass "T7: src/views/ edit-order + no marker → denied (Gate 11b)";;
    *)
        fail "T7: expected deny 'visual verification not done', got: '$_reason'";;
esac
rm -f "$STATE/edit-order"

# ── Test 8: no marker + .claude/-only edit-order → no deny (Gate 11b skips) ──
rm -f "$STATE/visual-verified" "$STATE/visual-skip-reason"
_reason=$(deny_reason ".claude/hooks/completion-bundle.sh")
if [ -z "$_reason" ]; then
    pass "T8: no marker + .claude/-only edit-order → no deny (Gate 11b skips)"
else
    # May still fail other gates — acceptable as long as reason is not about VV
    case "$_reason" in
        *"visual verification"*)
            fail "T8: unexpected VV deny for .claude/-only change with no marker: $_reason";;
        *)
            pass "T8: no VV deny for .claude/-only change with no marker (other gate: $_reason)";;
    esac
fi
rm -f "$STATE/edit-order"

printf "\nResults: %d passed, %d failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
