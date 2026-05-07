#!/bin/sh
# Gate 1: Branch Awareness
# Blocks first Edit/Write until branch confirmed
set -eu

if [ "${OXVEIL_SKIP_GATES:-0}" = "1" ]; then exit 0; fi

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"
CONFIRMED_FILE="$STATE_DIR/branch-confirmed"

if [ -f "$CONFIRMED_FILE" ]; then
    exit 0
fi

# To unblock: run `touch "$STATE_DIR/branch-confirmed"` after user confirms branch.
# The permissions.allow in settings.json grants this Bash command automatically.
BRANCH=$(git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current 2>/dev/null || echo "unknown")
CHANGES=$(git -C "${CLAUDE_PROJECT_DIR:-.}" status --short 2>/dev/null || echo "")
CHANGES_MSG=""
if [ -n "$CHANGES" ]; then
    CHANGES_MSG=" Pending changes: $(echo "$CHANGES" | wc -l | tr -d ' ') file(s) modified/untracked."
fi

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Branch confirmation required. Current branch: $BRANCH.$CHANGES_MSG",
    "additionalContext": "After user confirms branch is correct, run: touch $STATE_DIR/branch-confirmed"
  }
}
EOF
