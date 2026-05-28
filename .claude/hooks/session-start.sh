#!/bin/sh
# SessionStart: clear stale edit-order, list active goals
# $CLAUDE_PROJECT_DIR may be unset in SessionStart - use script-relative path
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$SCRIPT_DIR/../workflow-state"
rm -f "$STATE_DIR/edit-order"
rm -f "$STATE_DIR/goal-gate-passed"

# List active goals if any exist
GOALS_DIR="$STATE_DIR/goals"
if [ -d "$GOALS_DIR" ] && [ "$(ls -A "$GOALS_DIR" 2>/dev/null)" ]; then
    echo "STOP. Active goals found — use AskUserQuestion to ask which goal to continue, close, or 'Do something else' BEFORE responding to user."
    echo ""
    echo "=== ACTIVE GOALS ==="
    for g in "$GOALS_DIR"/*.md; do
        [ -f "$g" ] || continue
        name=$(basename "$g" .md)
        title=$(grep -m1 '^# ' "$g" 2>/dev/null | sed 's/^# //' || echo "$name")
        created=$(grep '^created:' "$g" 2>/dev/null | cut -d' ' -f2- || echo "unknown")
        if [ "$(uname)" = "Darwin" ]; then
            mod_epoch=$(stat -f '%m' "$g" 2>/dev/null || echo "0")
        else
            mod_epoch=$(stat -c '%Y' "$g" 2>/dev/null || echo "0")
        fi
        now=$(date +%s)
        age_min=$(( (now - mod_epoch) / 60 ))
        if [ "$age_min" -lt 60 ]; then age="${age_min}min ago"
        elif [ "$age_min" -lt 1440 ]; then age="$(( age_min / 60 ))h ago"
        else age="$(( age_min / 1440 ))d ago"
        fi
        echo "- $name: $title (created $created, modified $age)"
    done
fi
