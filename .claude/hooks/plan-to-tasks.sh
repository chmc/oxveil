#!/bin/sh
# Gate 3: Plan-to-Tasks
set -eu

if [ "${OXVEIL_SKIP_GATES:-0}" = "1" ]; then cat > /dev/null; exit 0; fi
input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || file_path=""
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null) || tool_name=""

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"

case "$file_path" in
    */plans/*.md|"$HOME/.claude/plans/"*.md)
        exit 0
        ;;
esac

# Allow read-only Bash commands before tasks are created
if [ "$tool_name" = "Bash" ]; then
    command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || command=""
    case "$command" in
        grep*|find*|ls*|cat*|head*|tail*|wc*|echo*|which*|type*|\
        git\ status*|git\ log*|git\ diff*|git\ branch*|git\ show*|\
        npm\ run\ lint*|npm\ test*|npx\ tsc*)
            exit 0
            ;;
    esac
fi

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
