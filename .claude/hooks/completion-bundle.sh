#!/bin/sh
# Gates 6-11: Completion Bundle Hook
# Blocks TaskUpdate to completed until all requirements are met

set -eu

if [ "${OXVEIL_SKIP_GATES:-0}" = "1" ]; then cat > /dev/null; exit 0; fi

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"
REQUIREMENTS_FILE="$STATE_DIR/plan-requirements.json"
EDIT_ORDER_FILE="$STATE_DIR/edit-order"

# Read stdin JSON
input=$(cat)

# Extract tool_name
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null) || tool_name=""

# Only check TaskUpdate tool
if [ "$tool_name" != "TaskUpdate" ]; then
    exit 0
fi

# Extract status from tool_input
status=$(printf '%s' "$input" | jq -r '.tool_input.status // empty' 2>/dev/null) || status=""

# Only check status: completed
if [ "$status" != "completed" ]; then
    exit 0
fi

# Collect missing requirements
missing=""

# Helper: Add to missing list
add_missing() {
    if [ -z "$missing" ]; then
        missing="$1"
    else
        missing="$missing, $1"
    fi
}

# Helper: Returns true if any src/ file (not src/test/) was edited
has_impl_files() {
    [ -f "$EDIT_ORDER_FILE" ] || return 1
    grep -E '^src/' "$EDIT_ORDER_FILE" 2>/dev/null | grep -qvE '^src/test/'
}

# Helper: Returns true if any src/views/ file was edited
has_view_files() {
    [ -f "$EDIT_ORDER_FILE" ] && grep -qE 'src/views/' "$EDIT_ORDER_FILE" 2>/dev/null
}

# Helper: Returns true if ALL edited files are internal tooling (.claude/ or docs/)
is_internal_tooling_only() {
    [ -f "$EDIT_ORDER_FILE" ] || return 0
    # Fail if any file is NOT .claude/ or docs/
    ! grep -qvE '^(\.claude/|docs/)' "$EDIT_ORDER_FILE" 2>/dev/null
}

# Read plan requirements (if exists)
if [ -f "$REQUIREMENTS_FILE" ]; then
    # Gate 6: Documentation
    docs_required=$(jq -r '.documentation // false' "$REQUIREMENTS_FILE")
    if [ "$docs_required" = "true" ]; then
        if [ ! -f "$STATE_DIR/docs-complete" ]; then
            add_missing "documentation not updated"
        fi
    fi

    # Gate 7: ADR
    adr_required=$(jq -r '.adr // false' "$REQUIREMENTS_FILE")
    if [ "$adr_required" = "true" ]; then
        if [ ! -f "$STATE_DIR/adr-complete" ]; then
            add_missing "ADR not created"
        fi
    fi

    # Gate 8a: package.json
    package_json_required=$(jq -r '.package_json // false' "$REQUIREMENTS_FILE")
    if [ "$package_json_required" = "true" ]; then
        if [ ! -f "$STATE_DIR/package-json-complete" ]; then
            add_missing "package.json not updated"
        fi
    fi

    # Gate 8b: Changelog
    changelog_required=$(jq -r '.changelog // false' "$REQUIREMENTS_FILE")
    if [ "$changelog_required" = "true" ]; then
        if [ ! -f "$STATE_DIR/changelog-complete" ]; then
            add_missing "changelog not updated"
        fi
    fi

    # Gate 8c: README
    readme_required=$(jq -r '.readme // false' "$REQUIREMENTS_FILE")
    if [ "$readme_required" = "true" ]; then
        if [ ! -f "$STATE_DIR/readme-complete" ]; then
            add_missing "readme not updated"
        fi
    fi
fi

# Gate 9: Simplify (if impl files were edited, skip for internal tooling)
if has_impl_files && ! is_internal_tooling_only; then
    if [ ! -f "$STATE_DIR/simplify-complete" ]; then
        add_missing "/simplify not run"
    fi
fi

# Gate 10: Code review (skip for internal tooling)
if ! is_internal_tooling_only; then
    _review_pass=false
    for _session in "${CLAUDE_PROJECT_DIR:-.}/.claude/review-sessions/*/README.md"; do
        [ -f "$_session" ] || continue
        if grep -q "^result: PASS" "$_session"; then
            _review_pass=true
            break
        fi
    done
    if [ "$_review_pass" = false ] && [ ! -f "$STATE_DIR/review-complete" ]; then
        add_missing "code review not completed"
    fi
fi

# Gate 11: Visual verification (only if view files were edited)
if has_view_files; then
    if [ ! -f "$STATE_DIR/visual-verified" ] && [ ! -f "$STATE_DIR/visual-skip-reason" ]; then
        add_missing "visual verification not done (or no skip reason provided)"
    fi
fi

# If any missing, deny completion
if [ -n "$missing" ]; then
    # Write marker so taskupdate-reminder hook catches forgotten retries
    _taskId=$(printf '%s' "$input" | jq -r '.tool_input.taskId // empty' 2>/dev/null) || _taskId=""
    [ -n "$_taskId" ] && touch "$STATE_DIR/pending-taskupdate-$_taskId"
    cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Completion blocked: $missing",
    "additionalContext": "Complete all requirements before marking task as completed."
  }
}
EOF
fi
