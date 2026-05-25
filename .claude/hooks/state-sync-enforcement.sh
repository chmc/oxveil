#!/bin/sh
# Gate 5: State Sync Enforcement
set -eu

if [ "${OXVEIL_SKIP_GATES:-0}" = "1" ]; then cat > /dev/null; exit 0; fi
if [ "${OXVEIL_SKIP_STATE_SYNC:-0}" = "1" ]; then cat > /dev/null; exit 0; fi

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"
EDIT_ORDER_FILE="$STATE_DIR/edit-order"

input=$(cat)
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null) || tool_name=""
[ "$tool_name" != "Edit" ] && exit 0

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || file_path=""
[ -z "$file_path" ] && exit 0

mkdir -p "$STATE_DIR"

is_state_file() {
    case "$1" in
        */src/core/sessionState.ts|src/core/sessionState.ts) return 0 ;;
        */src/views/sidebarState.ts|src/views/sidebarState.ts) return 0 ;;
        */src/views/statusBar.ts|src/views/statusBar.ts) return 0 ;;
        */src/views/planPreviewPanel.ts|src/views/planPreviewPanel.ts) return 0 ;;
        */src/views/planPreviewHtml.ts|src/views/planPreviewHtml.ts) return 0 ;;
        */src/types.ts|src/types.ts) return 0 ;;
        */src/sessionWiring.ts|src/sessionWiring.ts) return 0 ;;
        */src/views/sidebarMessages.ts|src/views/sidebarMessages.ts) return 0 ;;
        */src/views/sidebarRenderers.ts|src/views/sidebarRenderers.ts) return 0 ;;
        */src/activateSidebar.ts|src/activateSidebar.ts) return 0 ;;
        */src/activateDetection.ts|src/activateDetection.ts) return 0 ;;
        */src/extension.ts|src/extension.ts) return 0 ;;
        */src/commands/formPlan.ts|src/commands/formPlan.ts) return 0 ;;
        *) return 1 ;;
    esac
}

is_states_md() {
    case "$1" in
        */docs/workflow/states.md|docs/workflow/states.md) return 0 ;;
        *) return 1 ;;
    esac
}

is_user_flows_md() {
    case "$1" in
        */docs/workflow/user-flows.md|docs/workflow/user-flows.md) return 0 ;;
        *) return 1 ;;
    esac
}

# If editing states.md or user-flows.md itself: append to edit-order, exit 0
if is_states_md "$file_path" || is_user_flows_md "$file_path"; then
    echo "$file_path" >> "$EDIT_ORDER_FILE"
    exit 0
fi

# If not a state file: exit 0
if ! is_state_file "$file_path"; then
    exit 0
fi

# State file: check edit-order for both states.md and user-flows.md
if [ -f "$EDIT_ORDER_FILE" ]; then
    has_states_md=false
    has_user_flows_md=false
    grep -qF "docs/workflow/states.md" "$EDIT_ORDER_FILE" && has_states_md=true
    grep -qF "docs/workflow/user-flows.md" "$EDIT_ORDER_FILE" && has_user_flows_md=true
    if [ "$has_states_md" = "true" ] && [ "$has_user_flows_md" = "true" ]; then
        echo "$file_path" >> "$EDIT_ORDER_FILE"
        exit 0
    fi
fi

# Deny — report which docs are missing
missing_docs=""
if [ ! -f "$EDIT_ORDER_FILE" ] || ! grep -qF "docs/workflow/states.md" "$EDIT_ORDER_FILE" 2>/dev/null; then
    missing_docs="docs/workflow/states.md"
fi
if [ ! -f "$EDIT_ORDER_FILE" ] || ! grep -qF "docs/workflow/user-flows.md" "$EDIT_ORDER_FILE" 2>/dev/null; then
    missing_docs="${missing_docs:+$missing_docs and }docs/workflow/user-flows.md (run: npm run generate:flow)"
fi

jq -n --arg reason "State sync required: update $missing_docs before editing state files." '{
    hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $reason,
        additionalContext: "docs/workflow/states.md is the source of truth. docs/workflow/user-flows.md tracks user journeys (regenerate with npm run generate:flow). Edit both before changing implementation."
    }
}'
exit 0
