#!/bin/sh
# PreToolUse(Bash): deny MCP bridge curl until visual-verification-recipes.md has been Read
set -eu

if [ "${OXVEIL_SKIP_GATES:-0}" = "1" ]; then cat > /dev/null; exit 0; fi

input=$(cat)
STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"

command=$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0
[ -z "$command" ] && exit 0

# Match curl calls to the Oxveil MCP bridge:
#   - localhost: URL
#   - path ending in /command, /click, /sendSequence, /focusPlanChat, or /log-tail
#   - Bearer token header present (distinguishes MCP bridge from other local servers)
case "$command" in
  *curl*localhost*) : ;;
  *) exit 0 ;;
esac

case "$command" in
  */command*|*/click*|*/sendSequence*|*/focusPlanChat*|*/log-tail*)
    : ;;
  *) exit 0 ;;
esac

case "$command" in
  *Bearer*) : ;;
  *) exit 0 ;;
esac

# Gate: recipes file must have been Read this session
if [ -f "$STATE_DIR/vv-recipes-read" ]; then
  exit 0
fi

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Read .claude/skills/visual-verification/references/visual-verification-recipes.md before calling the MCP bridge. The Read tool will set the vv-recipes-read marker automatically."
  }
}
EOF
exit 0
