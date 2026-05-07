#!/bin/sh
# Stop hook: Block if tasks left in_progress
# Parses transcript JSONL for TaskUpdate calls to find orphaned tasks

set -eu

if [ "${OXVEIL_SKIP_GATES:-0}" = "1" ]; then cat > /dev/null; exit 0; fi

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"

# Only check if tasks were created this session
[ -f "$STATE_DIR/tasks-created" ] || { cat > /dev/null; exit 0; }

input=$(cat)
transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null) || transcript=""

[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

# Extract TaskUpdate calls: parse lines containing TaskUpdate tool_use
# Each transcript line is a JSON object; assistant messages have content[].type=tool_use
orphaned=$(
    grep '"TaskUpdate"' "$transcript" 2>/dev/null | \
    jq -r '
        .message.content[]? |
        select(.type == "tool_use" and .name == "TaskUpdate") |
        "\(.input.taskId // "") \(.input.status // "")"
    ' 2>/dev/null | \
    awk '
        $1 != "" && $2 != "" { tasks[$1] = $2 }
        END {
            for (id in tasks) {
                if (tasks[id] == "in_progress") print id
            }
        }
    '
) || orphaned=""

[ -n "$orphaned" ] || exit 0

count=$(printf '%s\n' "$orphaned" | wc -l | tr -d ' ')
ids=$(printf '%s\n' "$orphaned" | tr '\n' ',' | sed 's/,$//')

printf '{"decision":"block","reason":"Tasks left in_progress (%s): %s. Complete or delete them before stopping."}\n' "$count" "$ids"
