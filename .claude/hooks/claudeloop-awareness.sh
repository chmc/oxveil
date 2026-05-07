#!/bin/sh
set -eu
if [ "${OXVEIL_SKIP_GATES:-0}" = "1" ]; then cat > /dev/null; exit 0; fi

FEATURES_FILE="/Users/aleksi/source/claudeloop/docs/FEATURES.md"
STATE_DIR="$CLAUDE_PROJECT_DIR/.claude/workflow-state"
HASH_FILE="$STATE_DIR/claudeloop-features-hash"
CONFIRMED_FILE="$STATE_DIR/claudeloop-confirmed"

mkdir -p "$STATE_DIR"
cat > /dev/null

[ ! -f "$FEATURES_FILE" ] && exit 0

current_hash=$(shasum -a 256 "$FEATURES_FILE" | cut -d' ' -f1)

# First run: store hash, allow
if [ ! -f "$HASH_FILE" ]; then
    echo "$current_hash" > "$HASH_FILE"
    exit 0
fi

stored_hash=$(cat "$HASH_FILE")
[ "$current_hash" = "$stored_hash" ] && exit 0

# Hash changed: clear stale confirm, check fresh confirm
rm -f "$CONFIRMED_FILE"
[ -f "$CONFIRMED_FILE" ] && exit 0

cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Claudeloop FEATURES.md changed since last review",
    "additionalContext": "Review: cat /Users/aleksi/source/claudeloop/docs/FEATURES.md\n\nTo continue: touch .claude/workflow-state/claudeloop-confirmed\nTo update baseline: shasum -a 256 /Users/aleksi/source/claudeloop/docs/FEATURES.md | cut -d' ' -f1 > .claude/workflow-state/claudeloop-features-hash"
  }
}
EOF
