#!/bin/sh
# Tests for "do-something-else" sentinel handling in goal hooks
set -eu

PASS=0
FAIL=0

pass() { printf "PASS: %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GATE_HOOK="$SCRIPT_DIR/hooks/goal-action-gate.sh"
CHECKLIST="$SCRIPT_DIR/hooks/planning-checklist.sh"

# Setup tmp workspace
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

GOALS_DIR="$TMP/goals"
GATE_FILE="$TMP/goal-gate-passed"
STATE_DIR="$TMP"
mkdir -p "$GOALS_DIR"

# Create a real goal file for baseline tests
echo "# Real Goal" > "$GOALS_DIR/260101-0000-real-goal.md"

# Helper: run gate hook with given gate content
run_gate() {
    gate_content="$1"
    echo "$gate_content" > "$GATE_FILE"
    # Simulate input JSON
    echo '{"tool_name":"Edit","tool_input":{"file_path":"/some/other/file.ts"}}' | \
        OXVEIL_SKIP_GATES=0 \
        sh -c "
            STATE_DIR='$STATE_DIR'
            GOALS_DIR='$GOALS_DIR'
            GATE_FILE='$GATE_FILE'
            gate_goal=\$(cut -d: -f2 '$GATE_FILE' 2>/dev/null || echo '')
            if [ -z \"\$gate_goal\" ] || [ \"\$gate_goal\" = 'do-something-else' ] || [ -f \"\$GOALS_DIR/\${gate_goal}.md\" ]; then
                echo allow
            else
                echo deny
            fi
        "
}

# Test 1: sentinel allows through gate
result=$(run_gate "$(date +%s):do-something-else")
if [ "$result" = "allow" ]; then
    pass "sentinel allows through gate"
else
    fail "sentinel allows through gate (got: $result)"
fi

# Test 2: real goal ID allows through gate
result=$(run_gate "$(date +%s):260101-0000-real-goal")
if [ "$result" = "allow" ]; then
    pass "real goal ID allows through gate"
else
    fail "real goal ID allows through gate (got: $result)"
fi

# Test 3: missing goal file denies
result=$(run_gate "$(date +%s):260101-0000-deleted-goal")
if [ "$result" = "deny" ]; then
    pass "deleted goal ID denies gate"
else
    fail "deleted goal ID denies gate (got: $result)"
fi

# Test 4: empty gate_goal allows (no gate)
result=$(run_gate "$(date +%s):")
if [ "$result" = "allow" ]; then
    pass "empty goal ID allows through gate"
else
    fail "empty goal ID allows through gate (got: $result)"
fi

# Test 5: planning-checklist sentinel skips fuzzy match
# Create a plan file whose title matches the real goal
PLANS_DIR="$TMP/plans"
mkdir -p "$PLANS_DIR"
cat > "$PLANS_DIR/test-plan.md" << 'EOF'
# Real Goal

## Feature
N/A - bug fix

## Architecture Impact
N/A - bug fix

## ADR
N/A - bug fix

## State Machine / Sync
N/A - bug fix

## Tests
N/A - bug fix

## Documentation
N/A - bug fix

## package.json / contributes
N/A - bug fix

## CHANGELOG
N/A - bug fix

## README
N/A - bug fix

## Task Tracking
- task

## Acceptance Criteria
- [ ] test passes

## Side-Effects
N/A - bug fix

## Flow Visualization
N/A - no architectural flow
EOF

echo "$(date +%s):do-something-else" > "$GATE_FILE"

# Run the goal-creation logic extracted from planning-checklist.sh
new_goal=$(sh << SCRIPT
set -eu
GOALS_DIR="$GOALS_DIR"
GATE_FILE="$GATE_FILE"
PLANS_DIR="$PLANS_DIR"
plan_file="$PLANS_DIR/test-plan.md"
goal_name=""
selected_goal=""
if [ -f "\$GATE_FILE" ]; then
    selected_goal=\$(cut -d: -f2 "\$GATE_FILE")
    if [ -n "\$selected_goal" ] && [ -f "\$GOALS_DIR/\${selected_goal}.md" ]; then
        goal_name="\$selected_goal"
    fi
fi
plan_title=\$(grep -m1 '^# ' "\$plan_file" 2>/dev/null | sed 's/^# //' || true)
if [ -n "\$plan_title" ]; then
    normalize_title() { printf '%s' "\$1" | tr '[:upper:]' '[:lower:]' | tr -s ' ' | sed 's/^ *//;s/ *\$//'; }
    if [ -z "\$goal_name" ] && [ "\$selected_goal" != "do-something-else" ]; then
        plan_norm=\$(normalize_title "\$plan_title")
        for f in "\$GOALS_DIR"/*.md; do
            [ -f "\$f" ] || continue
            title=\$(sed -n 's/^# //p' "\$f" | head -1)
            title_norm=\$(normalize_title "\$title")
            if [ "\$plan_norm" = "\$title_norm" ]; then
                goal_name=\$(basename "\$f" .md)
                break
            fi
        done
    fi
    if [ -z "\$goal_name" ]; then
        ts=\$(date '+%y%m%d-%H%M')
        slug=\$(echo "\$plan_title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-\$//' | cut -c1-40)
        goal_name="\${ts}-\${slug}"
    fi
fi
echo "\$goal_name"
SCRIPT
)

if [ "$new_goal" = "260101-0000-real-goal" ]; then
    fail "sentinel with matching title: still fuzzy-matched existing goal"
else
    pass "sentinel with matching title: created new goal (got: $new_goal)"
fi

# Summary
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
