#!/bin/sh
set -eu

if [ "${OXVEIL_SKIP_GATES:-0}" = "1" ]; then cat > /dev/null; exit 0; fi

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"
input=$(cat)

taskId=$(printf '%s' "$input" | jq -r '.tool_input.taskId // empty' 2>/dev/null) || taskId=""
[ -n "$taskId" ] && rm -f "$STATE_DIR/pending-taskupdate-$taskId"
exit 0
