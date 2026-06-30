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

# Goal update gate: block task completion if goal Status not updated this session
TASKS_MARKER="$STATE_DIR/tasks-created"
if [ -f "$TASKS_MARKER" ]; then
    GATE_FILE="$STATE_DIR/goal-gate-passed"
    if [ -f "$GATE_FILE" ]; then
        gate_epoch=$(cut -d: -f1 "$GATE_FILE")
        goal_id=$(cut -d: -f2 "$GATE_FILE")
        goal_file="$STATE_DIR/goals/${goal_id}.md"
        if [ -f "$goal_file" ]; then
            goal_mtime=$(stat -f '%m' "$goal_file" 2>/dev/null || stat -c '%Y' "$goal_file")
            if [ "$goal_mtime" -le "$gate_epoch" ]; then
                cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Update goal's ## Status section with handoff summary before completing task."}}
EOF
                exit 0
            fi
        fi
    fi
fi

# Collect missing requirements
missing=""

# Gate 5b: Incremental test gate (skip for internal tooling)
if [ -f "$EDIT_ORDER_FILE" ] && ! grep -qvE '^(\.claude/|docs/)' "$EDIT_ORDER_FILE" 2>/dev/null; then
    : # internal tooling only — skip
elif [ -f "$EDIT_ORDER_FILE" ]; then
    _changed=$(grep -vE '\.md$|\.claude/' "$EDIT_ORDER_FILE" 2>/dev/null | sort -u)
    if [ -n "$_changed" ]; then
        if ! echo "$_changed" | xargs npx vitest related --run --passWithNoTests 2>/dev/null; then
            add_missing "related tests failed"
        fi
    fi
fi

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
            _has_changelog=false
            git -C "${CLAUDE_PROJECT_DIR:-.}" diff --cached --name-only 2>/dev/null | grep -q "CHANGELOG.md" && _has_changelog=true
            git -C "${CLAUDE_PROJECT_DIR:-.}" diff --name-only 2>/dev/null | grep -q "CHANGELOG.md" && _has_changelog=true
            if [ "$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-list --count HEAD 2>/dev/null || echo 0)" -gt 1 ]; then
                git -C "${CLAUDE_PROJECT_DIR:-.}" diff --name-only HEAD~1 2>/dev/null | grep -q "CHANGELOG.md" && _has_changelog=true
            fi
            [ "$_has_changelog" = false ] && add_missing "CHANGELOG.md not modified"
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

# Gate 11a: Visual verification marker integrity — fires whenever marker exists (not gated on view files)
# Covers .claude/-only changes that carry a VV marker (e.g. hook edits, skill edits).
if [ -f "$STATE_DIR/visual-verified" ]; then
    # Normalize: collapse whitespace to single spaces, trim edges (preserves status= / session= separator)
    _vv_content=$(tr -d '\n' < "$STATE_DIR/visual-verified" | sed 's/[[:space:]]\{1,\}/ /g; s/^ //; s/ $//')
    # New format: status=pass|blocked session=<path>
    # Legacy format (path-only): treated as status=pass for backwards compat
    _vv_status=""
    _session_path=""
    if echo "$_vv_content" | grep -q "^status="; then
        _vv_status=$(echo "$_vv_content" | grep -o 'status=[^ ]*' | head -1 | cut -d= -f2)
        _session_path=$(echo "$_vv_content" | grep -o 'session=.*' | head -1 | cut -d= -f2-)
        if [ "$_vv_status" != "pass" ] && [ "$_vv_status" != "blocked" ]; then
            add_missing "visual verification marker has invalid status: $_vv_status (expected pass or blocked)"
        fi
    else
        _session_path="$_vv_content"
    fi
    if [ -z "$_session_path" ] || [ ! -d "$_session_path" ]; then
        add_missing "visual verification session not found: $_session_path"
    elif [ ! -f "$_session_path/SESSION.md" ]; then
        add_missing "visual verification session missing SESSION.md"
    else
        # Require non-empty ## Transcript section in SESSION.md for status=pass
        if [ "${_vv_status:-pass}" = "pass" ]; then
            _transcript_start=$(grep -in "^## transcript" "$_session_path/SESSION.md" 2>/dev/null | head -1 | cut -d: -f1) || _transcript_start=""
            if [ -z "$_transcript_start" ]; then
                add_missing "visual verification SESSION.md missing ## Transcript section (write user-pov narrative per flow before marking complete)"
            else
                _transcript_body=$(tail -n +"$((_transcript_start + 1))" "$_session_path/SESSION.md" | sed -n '1,/^## /p' | grep -v '^## ' | grep -v '^[[:space:]]*$') || _transcript_body=""
                if [ -z "$_transcript_body" ]; then
                    add_missing "visual verification SESSION.md ## Transcript section is empty (write user-pov narrative per flow before marking complete)"
                fi
            fi
        fi
    fi
fi

# Gate 11b: Was VV required but skipped? (only when view files were edited)
if has_view_files && [ ! -f "$STATE_DIR/visual-verified" ] && [ ! -f "$STATE_DIR/visual-skip-reason" ]; then
    add_missing "visual verification not done (or no skip reason provided)"
fi

# Gate 12: Verify task criteria (only for tasks with verify-session marker)
_taskId=$(printf '%s' "$input" | jq -r '.tool_input.taskId // empty' 2>/dev/null) || _taskId=""
if [ -n "$_taskId" ]; then
    _verify_session="$STATE_DIR/verify-session-$_taskId"
    if [ -f "$_verify_session" ]; then
        _session_dir=$(tr -d '[:space:]' < "$_verify_session")
        _session_md="$_session_dir/SESSION.md"
        if [ -f "$_session_md" ]; then
            if grep -qE "^- \[ \]" "$_session_md"; then
                add_missing "verification criteria unchecked in SESSION.md"
            fi
        else
            add_missing "verify-session marker found but SESSION.md missing: $_session_md"
        fi
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
