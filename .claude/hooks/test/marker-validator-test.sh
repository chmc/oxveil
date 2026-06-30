#!/bin/bash
# Shell unit tests for marker-validator.sh
# Run: bash .claude/hooks/test/marker-validator-test.sh
set -euo pipefail

HOOK="$(cd "$(dirname "$0")/.." && pwd)/marker-validator.sh"
PASS=0; FAIL=0

assert_allow() {
  local label="$1"; shift
  local result; result=$(echo "$1" | CLAUDE_PROJECT_DIR="$TMPDIR" bash "$HOOK" 2>&1) || true
  if echo "$result" | grep -q '"permissionDecision"'; then
    echo "FAIL [$label]: expected allow, got deny: $result"; FAIL=$((FAIL+1))
  else
    echo "PASS [$label]"; PASS=$((PASS+1))
  fi
}

assert_deny() {
  local label="$1"; shift
  local result; result=$(echo "$1" | CLAUDE_PROJECT_DIR="$TMPDIR" bash "$HOOK" 2>&1) || true
  if echo "$result" | grep -q '"permissionDecision"'; then
    echo "PASS [$label]"; PASS=$((PASS+1))
  else
    echo "FAIL [$label]: expected deny, got: $result"; FAIL=$((FAIL+1))
  fi
}

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

MARKER="$TMPDIR/.claude/workflow-state/visual-verified"
SESSION="$TMPDIR/verification-sessions/test-session"
SESSION_MD="$SESSION/SESSION.md"
mkdir -p "$TMPDIR/.claude/workflow-state" "$SESSION"

write_marker() { echo "$1" > "$MARKER"; }

write_session() {
  cat > "$SESSION_MD" <<EOF
## Acceptance Criteria
$1

## Per-AC Records

### AC: Test AC
$2
Observation: something visible
EOF
}

BASH_WRITE_MARKER_INPUT=$(jq -n --arg p "$MARKER" '{tool_name:"Bash",tool_input:{command:("echo status=pass > " + $p)}}')

# AC1a: status=pass + all ACs checked + PASS records → allow
write_marker "status=pass session=$SESSION"
write_session "- [x] Do the thing" "Status: PASS"
assert_allow "pass-all-checked" "$BASH_WRITE_MARKER_INPUT"

# AC1b: status=pass + unchecked AC → deny
write_marker "status=pass session=$SESSION"
write_session "- [ ] Unchecked thing" "Status: PASS"
assert_deny "pass-unchecked-ac" "$BASH_WRITE_MARKER_INPUT"

# AC1c: status=pass + Per-AC BLOCKED → deny
write_marker "status=pass session=$SESSION"
write_session "- [x] Checked thing" "Status: BLOCKED"
assert_deny "pass-blocked-per-ac" "$BASH_WRITE_MARKER_INPUT"

# AC2a: status=blocked + fixable pattern, no escape → deny
write_marker "status=blocked session=$SESSION"
cat > "$SESSION_MD" <<EOF
## Acceptance Criteria
- [x] A thing
## Per-AC Records
### AC: A thing
Status: BLOCKED
Observation: form plan silently exited
Blocker: processManager null due to claudeloop not detected in worktree
EOF
assert_deny "blocked-fixable-no-escape" "$BASH_WRITE_MARKER_INPUT"

# AC2b: status=blocked + fixable pattern + [harness-unfixable] → allow
write_marker "status=blocked session=$SESSION"
cat > "$SESSION_MD" <<EOF
## Acceptance Criteria
- [x] A thing
## Per-AC Records
### AC: A thing
Status: BLOCKED
Observation: toast dismissed before capture
Blocker: toast auto-dismisses in <1s [harness-unfixable] issue=#42
EOF
assert_allow "blocked-fixable-with-escape" "$BASH_WRITE_MARKER_INPUT"

# AC1d: status=pass + ghost session_path (dir missing) → deny
write_marker "status=pass session=/tmp/vv-ghost-session-does-not-exist-$$"
write_session "- [x] Do the thing" "Status: PASS"
assert_deny "pass-ghost-session-path" "$BASH_WRITE_MARKER_INPUT"

# AC1e: status=pass + duplicate ## Acceptance Criteria headings → deny
write_marker "status=pass session=$SESSION"
cat > "$SESSION_MD" <<EOF
## Acceptance Criteria
- [ ] First copy (unchecked)

## Acceptance Criteria
- [x] Second copy (checked)

## Per-AC Records
### AC: Test AC
Status: PASS
Observation: something
EOF
assert_deny "pass-duplicate-ac-headings" "$BASH_WRITE_MARKER_INPUT"

# AC3: OXVEIL_SKIP_GATES=1 → always allow
write_marker "status=pass session=$SESSION"
write_session "- [ ] Unchecked" "Status: BLOCKED"
result=$(echo "$BASH_WRITE_MARKER_INPUT" | OXVEIL_SKIP_GATES=1 CLAUDE_PROJECT_DIR="$TMPDIR" bash "$HOOK" 2>&1) || true
if echo "$result" | grep -q '"permissionDecision"'; then
  echo "FAIL [skip-gates]: expected allow with OXVEIL_SKIP_GATES=1"; FAIL=$((FAIL+1))
else
  echo "PASS [skip-gates]"; PASS=$((PASS+1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
