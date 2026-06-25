#!/bin/sh
# SessionStart: clear stale edit-order, list active goals
# $CLAUDE_PROJECT_DIR may be unset in SessionStart - use script-relative path
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$SCRIPT_DIR/../workflow-state"
GOALS_DIR="$STATE_DIR/goals"
GATE_FILE="$STATE_DIR/goal-gate-passed"

rm -f "$STATE_DIR/edit-order"

# Read SessionStart source (compact, resume, startup, clear)
input=$(cat)
src=$(printf '%s' "$input" | jq -r '.source // empty' 2>/dev/null) || src=""

# Smart gate clearing: only clear if >4h old or referenced goal deleted
if [ -f "$GATE_FILE" ]; then
    gate_epoch=$(cut -d: -f1 "$GATE_FILE" 2>/dev/null || echo "0")
    gate_goal=$(cut -d: -f2 "$GATE_FILE" 2>/dev/null || echo "")
    now=$(date +%s)
    age=$(( now - gate_epoch ))
    if [ "$age" -gt 14400 ] || { [ -n "$gate_goal" ] && [ ! -f "$GOALS_DIR/$gate_goal.md" ]; }; then
        rm -f "$GATE_FILE"
    fi
fi

# On compact/resume: skip prompt if a fresh valid gate exists
case "$src" in compact|resume)
    if [ -f "$GATE_FILE" ]; then
        gate_goal=$(cut -d: -f2 "$GATE_FILE" 2>/dev/null || echo "")
        if [ -n "$gate_goal" ] && [ "$gate_goal" != "do-something-else" ] \
           && [ -f "$GOALS_DIR/$gate_goal.md" ]; then
            title=$(grep -m1 '^# ' "$GOALS_DIR/$gate_goal.md" 2>/dev/null | sed 's/^# //')
            echo "Continuing active goal: ${title} (${gate_goal}). User can say 'switch goal' to change."
            exit 0
        fi
    fi
    ;;
esac

# List active goals if any exist
if [ -d "$GOALS_DIR" ] && [ "$(ls -A "$GOALS_DIR" 2>/dev/null)" ]; then
    goal_count=$(ls "$GOALS_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
    echo "STOP. Active goals found — use AskUserQuestion to ask which goal to continue, close, or 'Do something else' BEFORE responding to user."
    echo ""
    echo "AskUserQuestion format:"
    if [ "$goal_count" -gt 3 ]; then
        echo "  question: Copy the numbered ACTIVE GOALS list below verbatim into the question field (one goal per line)"
        echo "  options (EXACTLY 3 goals + 'Do something else' — hard 4-option max):"
        echo "    - The 3 newest goals as selectable options"
        echo "    - 'Do something else'"
        echo "  Option label: goal filename without .md"
        echo "  Option description: 'DD.MM, Xh - <title>'"
        echo "  NOTE: User can select 'Other' and type/paste any goal name from the question text to pick a goal not in the list"
        echo "  When user types a goal name via Other: match to goals list and write gate file"
    else
        echo "  - One option per goal, plus 'Do something else'"
        echo "  - Option label: goal filename without .md"
        echo "  - Option description: 'DD.MM, Xh - <title>'"
        echo "  - Order: newest first (as listed below)"
    fi
    echo ""
    echo "=== ACTIVE GOALS ==="
    for g in $(ls -t "$GOALS_DIR"/*.md 2>/dev/null); do
        [ -f "$g" ] || continue
        name=$(basename "$g" .md)
        title=$(grep -m1 '^# ' "$g" 2>/dev/null | sed 's/^# //' || echo "$name")
        created=$(grep '^created:' "$g" 2>/dev/null | sed 's/^created: //' || echo "")
        created_short=$(echo "$created" | sed 's/\([0-9]*\)\.\([0-9]*\)\.[0-9]* \([0-9]*:[0-9]*\)/\1.\2 \3/' | sed 's/\([0-9]*\)\.\([0-9]*\)\.[0-9]*/\1.\2/')
        if [ "$(uname)" = "Darwin" ]; then
            mod_epoch=$(stat -f '%m' "$g" 2>/dev/null || echo "0")
        else
            mod_epoch=$(stat -c '%Y' "$g" 2>/dev/null || echo "0")
        fi
        now=$(date +%s)
        age_min=$(( (now - mod_epoch) / 60 ))
        if [ "$age_min" -lt 60 ]; then age="${age_min}min"
        elif [ "$age_min" -lt 1440 ]; then age="$(( age_min / 60 ))h"
        else age="$(( age_min / 1440 ))d"
        fi
        echo "- $name: $created_short, ${age} - $title"
    done
fi
