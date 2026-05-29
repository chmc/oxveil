#!/bin/sh
# Stop hook: warn if active goal Status was not updated this session
STATE_DIR="$(dirname "$0")/../workflow-state"

TASKS_MARKER="$STATE_DIR/tasks-created"
[ ! -f "$TASKS_MARKER" ] && exit 0

GATE_FILE="$STATE_DIR/goal-gate-passed"
[ ! -f "$GATE_FILE" ] && exit 0

gate_epoch=$(cut -d: -f1 "$GATE_FILE")
goal_id=$(cut -d: -f2 "$GATE_FILE")
goal_file="$STATE_DIR/goals/${goal_id}.md"
[ ! -f "$goal_file" ] && exit 0

goal_mtime=$(stat -f '%m' "$goal_file" 2>/dev/null || stat -c '%Y' "$goal_file")
[ "$goal_mtime" -gt "$gate_epoch" ] && exit 0

echo "Warning: Goal '$goal_id' ## Status was not updated this session."
