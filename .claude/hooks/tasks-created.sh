#!/bin/sh
# PostToolUse: marks tasks-created after TaskCreate
set -eu

cat > /dev/null

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"

if [ -f "$STATE_DIR/plan-exited" ]; then
    mkdir -p "$STATE_DIR"
    touch "$STATE_DIR/tasks-created"
fi

exit 0
