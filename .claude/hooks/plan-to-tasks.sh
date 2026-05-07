#!/bin/sh
# Gate 3: Plan-to-Tasks
set -eu

if [ "${OXVEIL_SKIP_GATES:-0}" = "1" ]; then cat > /dev/null; exit 0; fi
input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || file_path=""

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"

case "$file_path" in
    */plans/*.md|"$HOME/.claude/plans/"*.md)
        exit 0
        ;;
esac

if [ ! -f "$STATE_DIR/plan-exited" ]; then
    exit 0
fi

if [ -f "$STATE_DIR/tasks-created" ]; then
    exit 0
fi

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Create tasks from plan steps before implementation. Use TaskCreate for each implementation step, then this gate will allow edits.",
    "additionalContext": "The plan has been approved. Convert plan steps to tasks for tracking before writing code."
  }
}
EOF
exit 0
