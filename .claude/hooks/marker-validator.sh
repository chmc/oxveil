#!/bin/sh
# PostToolUse: Write|Edit|Bash — validates VV marker before allowing status=pass/blocked
# Denies if SESSION.md has unchecked ACs with pass, or fixable blocker patterns with blocked.
set -eu

if [ "${OXVEIL_SKIP_GATES:-0}" = "1" ]; then cat > /dev/null; exit 0; fi

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"
MARKER="$STATE_DIR/visual-verified"

input=$(cat)

# Only validate when the tool touched the marker file
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null) || tool_name=""
case "$tool_name" in
  Write|Edit)
    fp=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || fp=""
    case "$fp" in
      *workflow-state/visual-verified) ;;  # matches
      *) exit 0 ;;
    esac
    ;;
  Bash)
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || cmd=""
    case "$cmd" in
      *workflow-state/visual-verified*) ;;  # matches
      *) exit 0 ;;
    esac
    ;;
  *) exit 0 ;;
esac

# Marker must exist and have content
[ -f "$MARKER" ] || exit 0
marker_content=$(cat "$MARKER")
[ -n "$marker_content" ] || exit 0

# Parse status (format: "status=pass session=<path>" on one line)
echo "$marker_content" | grep -q "status=" || exit 0
vv_status=$(echo "$marker_content" | grep -o 'status=[^ ]*' | head -1 | cut -d= -f2)
session_path=$(echo "$marker_content" | grep -o 'session=.*' | head -1 | cut -d= -f2- | sed -E 's/^[[:space:]]+|[[:space:]]+$//')

# Find SESSION.md — no fallback: a missing session_path is evidence corruption, not a recoverable state
session_md=""
if [ -n "$session_path" ] && [ -d "$session_path" ] && [ -f "$session_path/SESSION.md" ]; then
  session_md="$session_path/SESSION.md"
fi

[ -n "$session_md" ] || [ -n "$session_path" ] || exit 0

deny() {
  reason="$1"
  jq -n --arg r "$reason" '{
    "hookSpecificOutput": {
      "hookEventName": "PostToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": $r,
      "additionalContext": "Fix the SESSION.md issue, then re-write the marker. See VV SKILL.md Per-AC Decision Rubric."
    }
  }'
  exit 0
}

# Ghost-session guard: if session_path is set but directory is gone, deny loudly
if [ -n "$session_path" ] && [ ! -d "$session_path" ]; then
  deny "Marker references session_path that no longer exists: $session_path — re-run VV or update the marker."
fi

[ -n "$session_md" ] && [ -f "$session_md" ] || exit 0

if [ "$vv_status" = "pass" ]; then
  # Deny if SESSION.md has duplicate ## Acceptance Criteria headings (evidence corruption)
  ac_count=$(grep -cE '^## Acceptance Criteria[[:space:]]*$' "$session_md") || ac_count=0
  if [ "$ac_count" -gt 1 ]; then
    deny "SESSION.md has $ac_count '## Acceptance Criteria' headings — deduplicate to one before setting status=pass: $session_md"
  fi

  # Deny if any unchecked AC checkbox exists
  unchecked=$(grep -n '^\- \[ \]' "$session_md" | head -3) || unchecked=""
  if [ -n "$unchecked" ]; then
    deny "status=pass but SESSION.md has unchecked AC(s): $(echo "$unchecked" | head -1 | sed 's/^[0-9]*://')"
  fi

  # Deny if any Per-AC block has Status: BLOCKED or Status: FAILED
  bad_ac=$(grep -n '^Status: BLOCKED\|^Status: FAILED' "$session_md" | head -1) || bad_ac=""
  if [ -n "$bad_ac" ]; then
    deny "status=pass but SESSION.md contains $(echo "$bad_ac" | sed 's/^[0-9]*://' | tr -d '\n'). Fix or change marker to status=blocked."
  fi

  # Deny if plan declares [needs-real-session] but SESSION.md has bare Status: PASS without evidence tag
  # Evidence tags: [real-harness], [synthetic, wiring-adjacent] — required to distinguish wiring vs branch verification
  _plans_dir="${CLAUDE_PROJECT_DIR:-.}/.claude/plans"
  _plan_file="${PLAN_FILE:-}"
  [ -z "$_plan_file" ] && _plan_file=$(ls -t "$_plans_dir"/*.md 2>/dev/null | head -1) || true
  if [ -n "$_plan_file" ] && [ -f "$_plan_file" ] && grep -qi '\[needs-real-session\]' "$_plan_file"; then
    # Match "Status: PASS" with no [...] tag — allow [real-harness], [synthetic, wiring-adjacent], [discovery-flow], etc.
    bare_pass=$(grep -nE '^Status: PASS[[:space:]]*$' "$session_md" | head -1) || bare_pass=""
    if [ -n "$bare_pass" ]; then
      _line=$(echo "$bare_pass" | cut -d: -f1)
      deny "plan declares [needs-real-session] but SESSION.md line $_line has bare 'Status: PASS' without evidence tag. Add [real-harness] or [synthetic, wiring-adjacent] per SKILL.md Per-AC Record schema."
    fi
  fi

elif [ "$vv_status" = "blocked" ]; then
  # Deny if blocker text matches fixable-harness patterns without [harness-unfixable] escape
  if grep -q '\[harness-unfixable\]' "$session_md" 2>/dev/null; then
    exit 0  # explicit escape hatch — allow
  fi

  # Check for fixable patterns in Per-AC Blocker lines
  fixable=$(grep -i 'processManager null\|claudeloop not detected\|wrong flow\|env var.*propag\|sentinel.*path\|env.*not.*inherit' "$session_md" | head -1) || fixable=""
  if [ -n "$fixable" ]; then
    deny "status=blocked with fixable harness pattern: \"$(echo "$fixable" | head -1 | cut -c1-120)\". Fix the harness and re-run, or add [harness-unfixable] issue=#N to SESSION.md."
  fi
fi

exit 0
