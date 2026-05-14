#!/bin/sh
# SessionStart: clear stale edit-order from previous sessions
# $CLAUDE_PROJECT_DIR may be unset in SessionStart - use script-relative path
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$SCRIPT_DIR/../workflow-state"
rm -f "$STATE_DIR/edit-order"
