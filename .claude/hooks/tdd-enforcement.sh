#!/bin/sh
# Gate 4: TDD Enforcement
set -eu

if [ "${OXVEIL_SKIP_GATES:-0}" = "1" ]; then cat > /dev/null; exit 0; fi
if [ "${OXVEIL_SKIP_TDD:-0}" = "1" ]; then cat > /dev/null; exit 0; fi

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"
EDIT_ORDER_FILE="$STATE_DIR/edit-order"

input=$(cat)
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null) || tool_name=""
[ "$tool_name" != "Edit" ] && exit 0

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || file_path=""
[ -z "$file_path" ] && exit 0

mkdir -p "$STATE_DIR"

is_test_file() {
    case "$1" in
        src/test/*) return 0 ;;
        *.test.ts|*.test.js|*.spec.ts|*.spec.js) return 0 ;;
        *) return 1 ;;
    esac
}

is_impl_file() {
    case "$1" in
        src/test/*) return 1 ;;
        src/*.ts|src/*/*.ts|src/*/*/*.ts|src/*/*/*/*.ts) return 0 ;;
        *) return 1 ;;
    esac
}

get_test_pattern() {
    path="$1"
    # Strip src/ prefix and .ts suffix
    rel="${path#src/}"
    base="${rel%.ts}"
    # Mirrored: src/test/unit/<rel>.test.ts
    echo "src/test/unit/${base}.test.ts"
    # Flat fallback: src/test/unit/<basename>.test.ts
    echo "src/test/unit/$(basename "$base").test.ts"
}

# If test file: append to edit-order, exit 0
if is_test_file "$file_path"; then
    echo "$file_path" >> "$EDIT_ORDER_FILE"
    exit 0
fi

# If not impl file: exit 0 (docs, config, hooks, etc.)
if ! is_impl_file "$file_path"; then
    exit 0
fi

# Impl file: check if either candidate test path appears in edit-order
mirrored=$(get_test_pattern "$file_path" | head -1)
flat=$(get_test_pattern "$file_path" | tail -1)

if [ -f "$EDIT_ORDER_FILE" ]; then
    if grep -qF "$mirrored" "$EDIT_ORDER_FILE" || grep -qF "$flat" "$EDIT_ORDER_FILE"; then
        echo "$file_path" >> "$EDIT_ORDER_FILE"
        exit 0
    fi
fi

# Deny
jq -n \
    --arg mirrored "$mirrored" \
    --arg flat "$flat" \
    '{
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: ("TDD required: edit test file first. Expected: " + $mirrored + " or " + $flat),
            additionalContext: "Write or update the test file before editing the implementation. The test file must appear in the edit sequence before the impl file."
        }
    }'
exit 0
