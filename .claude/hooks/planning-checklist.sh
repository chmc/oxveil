#!/bin/sh
# Gate 2: Planning Checklist
# Blocks ExitPlanMode unless plan has all 15 required sections
set -eu

if [ "${OXVEIL_SKIP_GATES:-0}" = "1" ]; then exit 0; fi

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"
PLANS_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/plans"
FEATURES_MD="${CLAUDE_PROJECT_DIR:-.}/docs/FEATURES.md"
GOALS_DIR="$STATE_DIR/goals"

# shellcheck source=planning-checklist-goal-match.sh
. "$(dirname "$0")/planning-checklist-goal-match.sh"

# Read stdin (hook input, not used but must consume)
cat > /dev/null

# Find plan file
if [ -n "${PLAN_FILE:-}" ] && [ -f "$PLAN_FILE" ]; then
    plan_file="$PLAN_FILE"
else
    plan_file=""
    if [ -d "$PLANS_DIR" ]; then
        # shellcheck disable=SC2012
        plan_file=$(ls -t "$PLANS_DIR"/*.md 2>/dev/null | head -1) || true
    fi
fi

if [ -z "$plan_file" ] || [ ! -f "$plan_file" ]; then
    cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "No plan file found. Create a plan in .claude/plans/ before exiting plan mode.",
    "additionalContext": "Plans must be stored in .claude/plans/ directory."
  }
}
EOF
    exit 0
fi

# Read plan content (lowercase for case-insensitive matching)
plan_content=$(tr '[:upper:]' '[:lower:]' < "$plan_file")

# Ensure state directory exists
mkdir -p "$STATE_DIR"

# Helper: extract first non-empty line of a section's content
# Usage: get_section_content "SectionName"
# Returns empty string if section not found
get_section_content() {
    section_name="$1"
    section_start=$(grep -in "^## $section_name" "$plan_file" | head -1 | cut -d: -f1) || true
    if [ -z "$section_start" ]; then
        echo ""; return 0
    fi
    tail_start="$((section_start + 1))"
    content=$(tail -n +"$tail_start" "$plan_file" | head -20)
    next_section=$(echo "$content" | grep -n '^## ' | head -1 | cut -d: -f1)
    if [ -n "$next_section" ]; then
        last_line="$((next_section - 1))"
        [ "$last_line" -gt 0 ] && content=$(echo "$content" | head -"$last_line") || content=""
    fi
    echo "$content" | grep -v '^$' | head -1
}

# Helper: check if section is empty (no content after heading, before next section heading)
# Returns 0 (true) if section is EMPTY
# Returns 1 (false) if section has content
is_empty_section() {
    first=$(get_section_content "$1")
    [ -z "$first" ]
}

# Helper: check if section starts with N/A
# Returns 0 (true) if section starts with N/A
# Returns 1 (false) otherwise
is_na_section() {
    first=$(get_section_content "$1" | tr '[:upper:]' '[:lower:]')
    echo "$first" | grep -qE '^n/?a[[:space:]]|^n/?a$|^n/?a[[:space:]]*-'
}

# Helper: check if N/A reason uses an approved category
# Returns 0 (true) if approved category found
# Returns 1 (false) otherwise
is_valid_na_reason() {
    first=$(get_section_content "$1" | tr '[:upper:]' '[:lower:]')
    echo "$first" | grep -qiE '^n/?a[[:space:]]*-[[:space:]]*(bug fix|docs only|test only|config only|typo fix|dependency update|ci fix|build fix|lint fix|formatting only|version bump|no architectural change)'
}

# Helper: extract section content text (first non-empty lines, up to 5)
get_section_first_line() {
    section_name="$1"
    section_start=$(grep -in "^## $section_name" "$plan_file" | head -1 | cut -d: -f1) || return 0
    if [ -z "$section_start" ]; then
        return 0
    fi
    tail_start="$((section_start + 1))"
    content=$(tail -n +"$tail_start" "$plan_file" | head -20)
    next_section=$(echo "$content" | grep -n '^## ' | head -1 | cut -d: -f1)
    if [ -n "$next_section" ]; then
        last_line="$((next_section - 1))"
        if [ "$last_line" -gt 0 ]; then
            content=$(echo "$content" | head -"$last_line")
        else
            content=""
        fi
    fi
    echo "$content" | grep -v '^$' | head -5
}

# Check all 13 required sections
missing=""

# 1. Feature
if ! echo "$plan_content" | grep -q "^## feature"; then
    missing="$missing Feature (missing),"
elif is_empty_section "Feature"; then
    missing="$missing Feature (empty),"
fi

# 2. Architecture Impact
if ! echo "$plan_content" | grep -q "^## architecture impact"; then
    missing="$missing Architecture Impact (missing),"
elif is_empty_section "Architecture Impact"; then
    missing="$missing Architecture Impact (empty),"
fi

# 3. ADR
if ! echo "$plan_content" | grep -q "^## adr"; then
    missing="$missing ADR (missing),"
elif is_empty_section "ADR"; then
    missing="$missing ADR (empty),"
elif is_na_section "ADR" && ! is_valid_na_reason "ADR"; then
    missing="$missing ADR (N/A requires approved category: bug fix|docs only|test only|config only|typo fix|dependency update|ci fix|build fix|lint fix|formatting only|version bump|no architectural change),"
fi

# 4. State Machine / Sync (prefix match: ^## state)
if ! echo "$plan_content" | grep -qE "^## state"; then
    missing="$missing State Machine / Sync (missing),"
elif is_empty_section "State Machine" || is_empty_section "State"; then
    missing="$missing State Machine / Sync (empty),"
fi

# 5. Tests
if ! echo "$plan_content" | grep -qE "^## tests"; then
    missing="$missing Tests (missing),"
elif is_empty_section "Tests"; then
    missing="$missing Tests (empty),"
fi

# 6. Documentation
if ! echo "$plan_content" | grep -q "^## documentation"; then
    missing="$missing Documentation (missing),"
elif is_empty_section "Documentation"; then
    missing="$missing Documentation (empty),"
fi

# 7. package.json / contributes (prefix match: ^## package)
if ! echo "$plan_content" | grep -qE "^## package"; then
    missing="$missing package.json / contributes (missing),"
elif is_empty_section "package"; then
    missing="$missing package.json / contributes (empty),"
fi

# 8. CHANGELOG
if ! echo "$plan_content" | grep -q "^## changelog"; then
    missing="$missing CHANGELOG (missing),"
elif is_empty_section "CHANGELOG"; then
    missing="$missing CHANGELOG (empty),"
fi

# 9. README
if ! echo "$plan_content" | grep -q "^## readme"; then
    missing="$missing README (missing),"
elif is_empty_section "README"; then
    missing="$missing README (empty),"
fi

# 10. Task Tracking
if ! echo "$plan_content" | grep -q "^## task tracking"; then
    missing="$missing Task Tracking (missing),"
elif is_empty_section "task tracking"; then
    missing="$missing Task Tracking (empty),"
fi

# 11. Acceptance Criteria
if ! echo "$plan_content" | grep -q "^## acceptance criteria"; then
    missing="$missing Acceptance Criteria (missing),"
else
    # Extract content between ## Acceptance Criteria and next ## header
    ac_content=$(sed -n '/^## [Aa]cceptance [Cc]riteria/,/^## /p' "$plan_file" | grep -v '^## ')
    if ! echo "$ac_content" | grep -qE "^- \[ \]"; then
        missing="$missing Acceptance Criteria (no checkboxes),"
    fi
fi

# 12. Visual Verification phase (if present and not N/A, must have descriptive checkboxes)
vv_phase_start=$(grep -in "^## .*visual verification" "$plan_file" 2>/dev/null | head -1 | cut -d: -f1) || vv_phase_start=""
if [ -n "$vv_phase_start" ]; then
    vv_content=$(tail -n +"$((vv_phase_start + 1))" "$plan_file" | sed -n '1,/^## /p' | grep -v '^## ')
    vv_first=$(echo "$vv_content" | grep -v '^$' | head -1 | tr '[:upper:]' '[:lower:]')
    if ! echo "$vv_first" | grep -qE '^n/?a'; then
        if ! echo "$vv_content" | grep -qE "^- \[ \]"; then
            missing="$missing Visual Verification phase (no checkboxes),"
        else
            short_items=$(echo "$vv_content" | grep -E "^- \[ \]" | sed 's/^- \[ \] //' | awk 'length < 15')
            if [ -n "$short_items" ]; then
                missing="$missing Visual Verification items too short (need >15 chars each),"
            fi
            # C: each criterion must contain a positive evidence anchor
            anchor_missing=""
            while IFS= read -r cb; do
                criterion=$(echo "$cb" | sed 's/^- \[ \] //')
                if ! echo "$criterion" | grep -qE '\.[a-zA-Z]{2,5}\b|`[^`]+`|sessions\[|view=|phases\[|screenshot:'; then
                    anchor_missing="${anchor_missing}  - ${criterion}\n"
                fi
            done <<CRITERIA_BLOCK
$(echo "$vv_content" | grep -E "^- \[ \]")
CRITERIA_BLOCK
            if [ -n "$anchor_missing" ]; then
                missing="$missing Visual Verification criteria missing evidence anchor (each criterion needs file path, backtick log substring, MCP state field sessions[/view=/phases[, or screenshot: prefix),"
            fi
        fi
    fi
fi

# 13. Side-Effects (strict N/A — only trivial changes exempt)
if ! echo "$plan_content" | grep -qE "^## side-effects"; then
    missing="$missing Side-Effects (missing),"
elif is_empty_section "Side-Effects"; then
    missing="$missing Side-Effects (empty),"
elif is_na_section "Side-Effects"; then
    se_content=$(get_section_content "Side-Effects" | tr '[:upper:]' '[:lower:]')
    if ! echo "$se_content" | grep -qiE '^n/?a[[:space:]]*-[[:space:]]*(typo fix|docs only|formatting only|version bump)'; then
        missing="$missing Side-Effects (N/A only for: typo fix, docs only, formatting only, version bump),"
    fi
fi

# 14. Flow Visualization (required — N/A must justify why no flow exists)
if ! echo "$plan_content" | grep -qE "^## flow visualization"; then
    missing="$missing Flow Visualization (missing),"
elif is_empty_section "Flow Visualization"; then
    missing="$missing Flow Visualization (empty),"
elif is_na_section "Flow Visualization"; then
    fv_content=$(get_section_content "Flow Visualization")
    fv_after_na=$(echo "$fv_content" | sed 's/^[Nn]\/?[Aa][[:space:]]*[-—]*[[:space:]]*//')
    fv_len=$(printf '%s' "$fv_after_na" | wc -c | tr -d ' ')
    if [ "$fv_len" -lt 30 ]; then
        missing="$missing Flow Visualization (N/A needs justification — explain why no flow exists),"
    fi
fi

# Helper: get full section content (all lines between heading and next ##)
get_full_section_content() {
    section_start=$(grep -in "^## $1" "$plan_file" | head -1 | cut -d: -f1) || true
    [ -z "$section_start" ] && return 0
    tail -n +"$((section_start + 1))" "$plan_file" | sed -n '1,/^## /p' | grep -v '^## '
}

# Flow Visualization diagram content check (non-N/A only)
if ! is_na_section "Flow Visualization" && ! is_empty_section "Flow Visualization"; then
    fv_full=$(get_full_section_content "Flow Visualization")
    if ! echo "$fv_full" | grep -qE '[├└│┌┐┘─┬┴┤┼→←↑↓▶◀]|^```|^[[:space:]]*[|+][-+]+[|+]'; then
        missing="$missing Flow Visualization (no diagram found — use ASCII arrows/tree/box characters or fenced code block),"
    fi
fi

# 15. Root Cause Evidence (every plan; N/A with approved category for non-bug-fix)
if ! echo "$plan_content" | grep -q "^## root cause evidence"; then
    missing="$missing Root Cause Evidence (missing),"
elif is_empty_section "Root Cause Evidence"; then
    missing="$missing Root Cause Evidence (empty),"
else
    rce_first=$(get_section_first_line "Root Cause Evidence" | tr '[:upper:]' '[:lower:]')
    if echo "$rce_first" | grep -qE '^n/?a'; then
        if ! echo "$rce_first" | grep -qiE '^n/?a[[:space:]]*-[[:space:]]*(bug fix|docs only|test only|config only|typo fix|dependency update|ci fix|build fix|lint fix|formatting only|version bump|no architectural change)'; then
            missing="$missing Root Cause Evidence (N/A requires approved category: bug fix|docs only|test only|config only|typo fix|dependency update|ci fix|build fix|lint fix|formatting only|version bump|no architectural change),"
        fi
    elif ! echo "$rce_first" | grep -qiE '\[failing-test\]|\[runtime-observation\]|\[debugger-snapshot\]|\[n/?a-symptom-only\]'; then
        missing="$missing Root Cause Evidence (tag required: [failing-test], [runtime-observation], [debugger-snapshot], or [N/A-symptom-only]),"
    fi
fi

# 16. Harness Requirements (every plan; tag required)
if ! echo "$plan_content" | grep -q "^## harness requirements"; then
    missing="$missing Harness Requirements (missing),"
elif is_empty_section "Harness Requirements"; then
    missing="$missing Harness Requirements (empty),"
else
    hr_first=$(get_section_first_line "Harness Requirements" | tr '[:upper:]' '[:lower:]')
    if ! echo "$hr_first" | grep -qiE '\[needs-real-session\]|\[empty-harness-ok\]|\[n/?a-no-workspace-interaction\]'; then
        missing="$missing Harness Requirements (tag required: [needs-real-session], [empty-harness-ok], or [N/A-no-workspace-interaction]),"
    fi
fi

# If any missing or empty, deny
if [ -n "$missing" ]; then
    missing=$(echo "$missing" | sed 's/,$//')
    cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Plan missing or empty sections:$missing",
    "additionalContext": "All 15 sections required with non-empty content. Use 'N/A - reason' for sections that don't apply. Sections: Feature, Architecture Impact, ADR, State Machine / Sync, Tests, Documentation, package.json / contributes, CHANGELOG, README, Task Tracking, Side-Effects, Flow Visualization, Acceptance Criteria, Root Cause Evidence, Harness Requirements. Root Cause Evidence tags: [failing-test], [runtime-observation], [debugger-snapshot], [N/A-symptom-only]. Harness Requirements tags: [needs-real-session], [empty-harness-ok], [N/A-no-workspace-interaction]. Optional: Visual Verification phase — if present and not N/A, must contain descriptive checkboxes (>15 chars each) with positive evidence anchors."
  }
}
EOF
    exit 0
fi

# ADR keyword detection: block N/A when plan mentions architectural terms
ADR_TRIGGER_KEYWORDS="new pattern|new module|new service|new protocol|breaking change|security|authentication|authorization|encryption|new dependency|api change|schema change|database|migration|introduces|replaces|deprecates"
plan_body=$(cat "$plan_file" | tr '[:upper:]' '[:lower:]')

# Side-Effects content-quality validation
# Cross-validates plan body risk indicators against SE section content
if ! is_na_section "Side-Effects" && ! is_empty_section "Side-Effects"; then
    se_full=$(get_full_section_content "Side-Effects" | tr '[:upper:]' '[:lower:]')

    # Detect dismissal patterns (only meaningful if risk categories also fire)
    se_dismissal=""
    if echo "$se_full" | grep -qiE "(^|[[:space:]])(none|nothing)(\.?$|[[:space:]])|no side.?effects|no impact|none expected|no risks"; then
        se_dismissal="yes"
    fi

    se_unaddressed=""

    # state-mutation
    if echo "$plan_body" | grep -qiE "shared state|global state|singleton|setstate|mutable state|state mutation"; then
        if [ -n "$se_dismissal" ] || ! echo "$se_full" | grep -qiE "state|mutation|shared|global|singleton"; then
            se_unaddressed="${se_unaddressed}state-mutation, "
        fi
    fi

    # hook-event
    if echo "$plan_body" | grep -qiE "registercommand|ondid[a-z]|addeventlistener|removelistener|disposable|event emitter"; then
        if [ -n "$se_dismissal" ] || ! echo "$se_full" | grep -qiE "hook|event|listener|handler|disposable|command"; then
            se_unaddressed="${se_unaddressed}hook-event, "
        fi
    fi

    # async-timing
    if echo "$plan_body" | grep -qiE "race condition|execution order|concurrent|setinterval|settimeout|promise\.race|async migrat"; then
        if [ -n "$se_dismissal" ] || ! echo "$se_full" | grep -qiE "async|timing|race|order|concurrent|await"; then
            se_unaddressed="${se_unaddressed}async-timing, "
        fi
    fi

    # api-interface
    if echo "$plan_body" | grep -qiE "function signature|break.*change|public api|required param|return type change|interface change"; then
        if [ -n "$se_dismissal" ] || ! echo "$se_full" | grep -qiE "api|signature|interface|parameter|break|contract|caller"; then
            se_unaddressed="${se_unaddressed}api-interface, "
        fi
    fi

    # config-settings
    if echo "$plan_body" | grep -qiE "contributes.*configuration|getconfiguration|workspace setting|environment variable|env var|settings migrat"; then
        if [ -n "$se_dismissal" ] || ! echo "$se_full" | grep -qiE "config|setting|environment|variable|migrat"; then
            se_unaddressed="${se_unaddressed}config-settings, "
        fi
    fi

    # removal-replace
    if echo "$plan_body" | grep -qiE "remove.*function|remove.*feature|replace.*module|replace.*component|replace.*system|deprecat|drop support|delete.*handler|eliminate.*module"; then
        if [ -n "$se_dismissal" ] || ! echo "$se_full" | grep -qiE "remove|replace|deprecat|backward|compat|migrat|caller"; then
            se_unaddressed="${se_unaddressed}removal-replace, "
        fi
    fi

    if [ -n "$se_unaddressed" ]; then
        se_unaddressed=$(echo "$se_unaddressed" | sed 's/, $//')
        cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Side-Effects section does not address detected risk categories: $se_unaddressed",
    "additionalContext": "Plan body contains patterns suggesting these risk areas but Side-Effects section does not discuss them. Add analysis for each category, or explain why it does not apply. If the change is truly trivial, use 'N/A - <approved reason>' instead."
  }
}
EOF
        exit 0
    fi
fi
if is_na_section "ADR" && echo "$plan_body" | grep -qiE "$ADR_TRIGGER_KEYWORDS"; then
    matched=$(echo "$plan_body" | grep -oiE "$ADR_TRIGGER_KEYWORDS" | head -1)
    cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Plan mentions '$matched' but ADR is N/A. This keyword typically requires ADR consideration.",
    "additionalContext": "Review docs/adr/README.md for ADR trigger criteria. Either create an ADR in docs/adr/ or explicitly justify why ADR doesn't apply."
  }
}
EOF
    exit 0
fi

# Complex feature planning check: >3 phases requires spike evidence or approved bypass
phase_count=$(grep -ciE "^#{2,3} (phase |step )?[0-9]+[.:]?" "$plan_file") || phase_count=0
if [ "$phase_count" -gt 3 ]; then
    unverified_count=$(grep -c '\[UNVERIFIED\]' "$plan_file" 2>/dev/null) || unverified_count=0
    if [ "$unverified_count" -gt 0 ]; then
        cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Plan has $phase_count phases with $unverified_count unresolved [UNVERIFIED] assumptions.",
    "additionalContext": "Resolve each [UNVERIFIED] tag by testing the assumption and documenting the result. See .claude/skills/complex-feature-planning/SKILL.md"
  }
}
EOF
        exit 0
    fi

    SPIKE_BYPASS_PATTERN='\[SPIKE-NOT-NEEDED:[[:space:]]*(single api call|well-documented pattern|config only|refactor only|trivial change)\]'
    SPIKE_EVIDENCE_PATTERN='spike:|prototype built|^#{1,3} .*spike|verified.*(assumption|api|behavior)'
    if ! grep -qiE "$SPIKE_BYPASS_PATTERN" "$plan_file" && ! grep -qiE "$SPIKE_EVIDENCE_PATTERN" "$plan_file"; then
        cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Plan has $phase_count phases but no spike/prototype evidence.",
    "additionalContext": "Complex plans (>3 phases) require spike evidence. Add a 'Spike:' section, or use [SPIKE-NOT-NEEDED: reason] with an approved category: single api call|well-documented pattern|config only|refactor only|trivial change. See .claude/skills/complex-feature-planning/SKILL.md"
  }
}
EOF
        exit 0
    fi
fi

# Cross-check: Architecture Impact with decision language → ADR must also be non-N/A
arch_content=$(get_section_content "Architecture Impact" | tr '[:upper:]' '[:lower:]')
if ! is_na_section "Architecture Impact" && is_na_section "ADR"; then
    if echo "$arch_content" | grep -qiE "decided|chose|will use|option|alternative|selected|adopted"; then
        cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Architecture Impact contains decision language but ADR is N/A. Architectural decisions require an ADR.",
    "additionalContext": "Either: (1) Create/update ADR in docs/adr/, or (2) Rewrite Architecture Impact without decision language if no architectural decision was actually made."
  }
}
EOF
        exit 0
    fi
fi

# Cross-check: state files in plan → Documentation must not be N/A
STATE_FILE_PATTERN="activateSidebar|sessionWiring|sidebarRefresh|sessionState|sidebarState|statusBar|planPreviewPanel|types\.ts|extension\.ts|activateDetection|formPlan"
if grep -qE "$STATE_FILE_PATTERN" "$plan_file" 2>/dev/null; then
    if is_na_section "Documentation"; then
        cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Plan modifies state files but Documentation is N/A. State file changes require docs/workflow/states.md update.",
    "additionalContext": "Files touching state machines (activateSidebar, sessionWiring, sidebarState, etc.) must document their changes in docs/workflow/states.md. Update Documentation section to reference states.md."
  }
}
EOF
        exit 0
    fi
fi

# All sections present — validate Feature section against FEATURES.md
feature_content=$(get_section_first_line "Feature" || get_section_first_line "feature")

if is_na_section "Feature"; then
    : # N/A — skip FEATURES.md check
elif [ -f "$FEATURES_MD" ]; then
    # Check if any token from feature section exists in FEATURES.md
    feature_found=0
    while IFS= read -r word; do
        len=$(printf '%s' "$word" | wc -c | tr -d ' ')
        [ "$len" -lt 3 ] && continue
        word_lower=$(printf '%s' "$word" | tr '[:upper:]' '[:lower:]' | tr -d '`*_#|')
        [ -z "$word_lower" ] && continue
        if grep -qi "| *$word_lower *|" "$FEATURES_MD" 2>/dev/null; then
            feature_found=1
            break
        fi
    done <<EOF
$(echo "$feature_content" | tr ' \t' '\n' | grep -v '^$')
EOF

    if [ "$feature_found" = "0" ]; then
        feature_name=$(echo "$feature_content" | head -1 | tr '[:upper:]' '[:lower:]' | sed 's/[#*`|]//g' | xargs)
        # Check Task Tracking for a planned FEATURES.md update
        task_content=$(get_full_section_content "Task Tracking")
        if echo "$task_content" | grep -qi "FEATURES.md"; then
            : # Task planned — allow
        else
            cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Feature '$feature_name' not in docs/FEATURES.md and no Task Tracking item to add it.",
    "additionalContext": "Either: (1) Add the feature row to docs/FEATURES.md now, or (2) Add a task in Task Tracking section to add '| $feature_name |' to docs/FEATURES.md."
  }
}
EOF
            exit 0
        fi
    fi
else
    # FEATURES.md doesn't exist — warn but allow
    cat <<'WARN'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"Warning: docs/FEATURES.md not found. Create it with your feature list to enable feature validation."}}
WARN
fi

# Auto-create/update goal from plan (only on fully approved plans)
mkdir -p "$GOALS_DIR"
GATE_FILE="$STATE_DIR/goal-gate-passed"
goal_name=""
selected_goal=""
if [ -f "$GATE_FILE" ]; then
    selected_goal=$(cut -d: -f2 "$GATE_FILE")
    if [ -n "$selected_goal" ] && [ -f "$GOALS_DIR/${selected_goal}.md" ]; then
        goal_name="$selected_goal"
    fi
fi
plan_title=$(grep -m1 '^# ' "$plan_file" 2>/dev/null | sed 's/^# //' || true)
if [ -n "$plan_title" ]; then
    # Fallback: match plan title to existing goal using Jaccard similarity (handles crash-recovery case)
    # For "do-something-else": still run matcher but only honor strong matches (#N or Jaccard ≥ 0.5)
    # find_matching_goal() already enforces those thresholds, so removing the sentinel skip is sufficient
    if [ -z "$goal_name" ]; then
        goal_name=$(find_matching_goal "$plan_title" || true)
    fi
    if [ -z "$goal_name" ]; then
        ts=$(date '+%y%m%d-%H%M')
        issue_num=$(echo "$plan_title" | grep -oE '#[0-9]+' | head -1 | tr -d '#' || true)
        slug=$(echo "$plan_title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | cut -c1-40)
        if [ -n "$issue_num" ]; then
            goal_name="${ts}-${issue_num}-${slug}"
        else
            goal_name="${ts}-${slug}"
        fi
    fi
    goal_file="$GOALS_DIR/${goal_name}.md"
    if [ -f "$goal_file" ]; then
        created=$(grep '^created:' "$goal_file" | head -1)
    else
        created="created: $(date '+%d.%m.%Y %H:%M')"
    fi
    context_content=$(sed -n '/^## Context/,/^## /p' "$plan_file" | sed '1d;$d' | head -25 | sed 's/^[[:space:]]*//' || true)
    task_content=$(sed -n '/^## Task Tracking/,/^## /p' "$plan_file" | sed '1d;$d' | head -10 || true)
    # Append-only: if file exists, just append new status entry
    new_entry="### $(date '+%Y-%m-%d %H:%M') - ${plan_title}
${task_content:-See plan file for details.}"
    if [ -f "$goal_file" ]; then
        # Append to existing file
        echo "" >> "$goal_file"
        echo "$new_entry" >> "$goal_file"
    else
        # Create new file
        tmp=$(mktemp)
        cat > "$tmp" << EOF
---
$created
---
# $plan_title

## Why
${context_content:-No context section in plan.}

## Status
$new_entry
EOF
        mv "$tmp" "$goal_file"
        # Write gate file so subsequent ExitPlanMode calls append to this goal
        echo "$(date +%s):$goal_name" > "$GATE_FILE"
    fi
fi

# Build requirements JSON
arch_req="false"
if ! is_na_section "Architecture Impact"; then
    arch_req="true"
fi

adr_req="false"
if ! is_na_section "ADR"; then
    adr_req="true"
fi

state_machine_req="false"
if ! is_na_section "State Machine" && ! is_na_section "State"; then
    state_machine_req="true"
fi

tests_req="false"
if ! is_na_section "Tests"; then
    tests_req="true"
fi

docs_req="false"
if ! is_na_section "Documentation"; then
    docs_req="true"
fi

package_json_req="false"
if ! is_na_section "package"; then
    package_json_req="true"
fi

changelog_req="false"
if ! is_na_section "CHANGELOG"; then
    changelog_req="true"
fi

readme_req="false"
if ! is_na_section "README"; then
    readme_req="true"
fi

side_effects_req="false"
if ! is_na_section "Side-Effects"; then
    side_effects_req="true"
fi

flow_viz_req="false"
if ! is_na_section "Flow Visualization"; then
    flow_viz_req="true"
fi

# Write requirements file
plan_file_escaped=$(printf '%s' "$plan_file" | sed 's/\\/\\\\/g; s/"/\\"/g')
cat > "$STATE_DIR/plan-requirements.json" <<EOF
{
  "architecture": $arch_req,
  "adr": $adr_req,
  "state_machine": $state_machine_req,
  "tests": $tests_req,
  "documentation": $docs_req,
  "package_json": $package_json_req,
  "changelog": $changelog_req,
  "readme": $readme_req,
  "side_effects": $side_effects_req,
  "flow_visualization": $flow_viz_req,
  "plan_file": "$plan_file_escaped"
}
EOF

# Touch plan-exited state file
touch "$STATE_DIR/plan-exited"

# Clean up state for fresh workflow cycle
rm -f "$STATE_DIR/tasks-created"
rm -f "$STATE_DIR/edit-order"
rm -f "$STATE_DIR/simplify-complete"
rm -f "$STATE_DIR/review-complete"
rm -f "$STATE_DIR/visual-verified"
rm -f "$STATE_DIR/visual-skip-reason"

# D: advisory warning — workspace-coupled diff but plan declares empty-harness-ok
WORKSPACE_COUPLED_PATTERN='WorkspaceSession|pickWorkspaceFolder|processManager|getAllSessions|formPlan'
hr_content_raw=$(get_section_first_line "Harness Requirements" | tr '[:upper:]' '[:lower:]')
if echo "$hr_content_raw" | grep -qiE '\[empty-harness-ok\]|\[n/?a-no-workspace-interaction\]'; then
    if git -C "${CLAUDE_PROJECT_DIR:-.}" diff HEAD 2>/dev/null | grep -qE "$WORKSPACE_COUPLED_PATTERN"; then
        cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"Advisory: diff touches workspace-session code (WorkspaceSession/pickWorkspaceFolder/processManager/getAllSessions/formPlan) but Harness Requirements declares [empty-harness-ok] or [N/A-no-workspace-interaction]. Verify your VV harness has sessions.length >= 1 or the tested code path does not depend on workspace sessions."}}
EOF
    fi
fi

# Allow
exit 0
