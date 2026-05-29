#!/bin/sh
# PreToolUse: Block mutations until goal selected
set -eu

if [ "${OXVEIL_SKIP_GATES:-0}" = "1" ]; then cat > /dev/null; exit 0; fi

input=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$SCRIPT_DIR/../workflow-state"
GOALS_DIR="$STATE_DIR/goals"
GATE_FILE="$STATE_DIR/goal-gate-passed"

# Allow writes to workflow-state and plans (gate file + plan mode)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || file_path=""
case "$file_path" in */.claude/workflow-state/*|*/.claude/plans/*) exit 0 ;; esac

# Bash commands targeting workflow-state/plans (e.g. writing the gate file itself)
command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || command=""
case "$command" in *workflow-state*|*/.claude/plans/*) exit 0 ;; esac

# Allow Agent tool (subagents need to run for critic reviews)
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null) || tool_name=""
[ "$tool_name" = "Agent" ] && exit 0

# No goals = allow
[ ! -d "$GOALS_DIR" ] && exit 0
[ -z "$(ls -A "$GOALS_DIR" 2>/dev/null)" ] && exit 0

# Gate passed = allow
if [ -f "$GATE_FILE" ]; then
    gate_goal=$(cut -d: -f2 "$GATE_FILE" 2>/dev/null || echo "")
    if [ -z "$gate_goal" ] || [ -f "$GOALS_DIR/$gate_goal.md" ]; then
        exit 0
    fi
    # Goal file deleted — clear stale gate
    rm -f "$GATE_FILE"
fi

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Select a goal first. Claude will ask you which goal to work on."
  }
}
EOF
exit 0
