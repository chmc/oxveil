#!/bin/sh
# PostToolUse(Read): write vv-recipes-read marker when visual-verification-recipes.md is Read
set -eu

input=$(cat)
STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null) || exit 0
[ -z "$file_path" ] && exit 0

case "$file_path" in
  *visual-verification-recipes.md)
    mkdir -p "$STATE_DIR"
    touch "$STATE_DIR/vv-recipes-read"
    ;;
esac

exit 0
