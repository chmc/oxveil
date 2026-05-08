#!/bin/sh
set -eu

if [ "${OXVEIL_SKIP_GATES:-0}" = "1" ]; then cat > /dev/null; exit 0; fi

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"
cat > /dev/null  # consume stdin

pending=$(ls "$STATE_DIR"/pending-taskupdate-* 2>/dev/null | sed 's/.*pending-taskupdate-//' | tr '\n' ',' | sed 's/,$//')
[ -z "$pending" ] && exit 0

cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"REMINDER: TaskUpdate was blocked for task(s): $pending. Retry TaskUpdate(status=completed) before proceeding."}}
EOF
