#!/bin/sh
# Block user prompts until goal selected when goals exist
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$SCRIPT_DIR/../workflow-state"
GOALS_DIR="$STATE_DIR/goals"
GATE_FILE="$STATE_DIR/goal-gate-passed"

# Read stdin JSON once
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')
MODE=$(echo "$INPUT" | jq -r '.permission_mode // empty')

# No goals = allow
[ ! -d "$GOALS_DIR" ] && exit 0
[ -z "$(ls -A "$GOALS_DIR" 2>/dev/null)" ] && exit 0

# Gate passed = allow
[ -f "$GATE_FILE" ] && exit 0

# Plan mode = allow (can't write gate file anyway)
[ "$MODE" = "plan" ] && exit 0

# Allow /goal command
echo "$PROMPT" | grep -q '^/goal' && exit 0

# Block with message
echo "Goals exist. Run /goal to select one first."
exit 2
