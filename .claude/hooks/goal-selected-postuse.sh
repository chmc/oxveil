#!/bin/sh
# PostToolUse(AskUserQuestion): auto-write goal-gate-passed when user picks a goal
set -eu

input=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$SCRIPT_DIR/../workflow-state"
GOALS_DIR="$STATE_DIR/goals"
GATE_FILE="$STATE_DIR/goal-gate-passed"

[ ! -d "$GOALS_DIR" ] && exit 0
[ -z "$(ls -A "$GOALS_DIR" 2>/dev/null)" ] && exit 0

# Extract all answer values from tool_response.answers
answers=$(printf '%s' "$input" | jq -r '.tool_response.answers | to_entries[] | .value' 2>/dev/null) || exit 0
[ -z "$answers" ] && exit 0

while IFS= read -r answer; do
    [ -z "$answer" ] && continue

    case "$answer" in
        "Do something else")
            echo "$(date +%s):do-something-else" > "$GATE_FILE"
            exit 0
            ;;
    esac

    # Direct match: answer is a goal filename (without .md)
    if [ -f "$GOALS_DIR/$answer.md" ]; then
        echo "$(date +%s):$answer" > "$GATE_FILE"
        exit 0
    fi

    # Fuzzy match for typed "Other" text: normalize and compare to goal names and titles
    normalized=$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9._-]/-/g')
    for goal_file in "$GOALS_DIR"/*.md; do
        [ -f "$goal_file" ] || continue
        goal_name=$(basename "$goal_file" .md)
        if [ "$normalized" = "$goal_name" ]; then
            echo "$(date +%s):$goal_name" > "$GATE_FILE"
            exit 0
        fi
        goal_title=$(grep -m1 '^# ' "$goal_file" 2>/dev/null | sed 's/^# //')
        normalized_title=$(printf '%s' "$goal_title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9._-]/-/g')
        if [ "$normalized" = "$normalized_title" ]; then
            echo "$(date +%s):$goal_name" > "$GATE_FILE"
            exit 0
        fi
    done
done <<EOF
$answers
EOF

exit 0
