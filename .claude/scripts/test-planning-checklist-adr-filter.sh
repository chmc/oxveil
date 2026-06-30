#!/bin/sh
# Tests for ADR keyword preprocessing in planning-checklist.sh
# Verifies that code-fence, backtick, and negation stripping eliminates
# false positives while preserving coverage on real architectural claims.
set -eu

PASS=0; FAIL=0
pass() { printf "PASS: %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "FAIL: %s -- %s\n" "$1" "$2"; FAIL=$((FAIL+1)); }

HOOK="$(cd "$(dirname "$0")/.." && pwd)/hooks/planning-checklist.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

STATE="$TMP/.claude/workflow-state"
mkdir -p "$STATE/goals" "$TMP/docs" "$TMP/.claude/plans"
printf "| existing feature |\n" > "$TMP/docs/FEATURES.md"
mkdir -p "$STATE"
touch "$STATE/goal-gate-passed"  # skip goal-selection block

# Helper: write a minimal valid plan with custom ADR and Side-Effects content,
# then run the hook. Returns hook stdout (which contains permissionDecision on deny).
run_hook_with_plan() {
  local adr_content="$1"
  local extra_content="${2:-}"
  local plan="$TMP/.claude/plans/test-$$.md"
  cat > "$plan" <<PLANEOF
# ADR Filter Test Plan

## Context
Testing ADR keyword filter.

## Approach
No architectural changes here.

## Feature
existing feature

## Architecture Impact
N/A - no architectural change

## ADR
${adr_content}

## State Machine / Sync
N/A - no state machine

## Tests
unit tests

## Documentation
N/A - docs only

## package.json / contributes
N/A - no new commands

## CHANGELOG
Added something

## README
N/A - internal

## Task Tracking
1. do something
2. Add row to docs/FEATURES.md

## Acceptance Criteria
- [ ] Something happens

## Side-Effects
${extra_content:-N/A - typo fix}

## Flow Visualization
\`\`\`
BEFORE  AFTER
──────  ─────
old  →  new
\`\`\`

## Root Cause Evidence
[runtime-observation] confirmed

## Harness Requirements
[N/A-no-workspace-interaction]
PLANEOF
  PLAN_FILE="$plan" CLAUDE_PROJECT_DIR="$TMP" sh "$HOOK" 2>/dev/null || true
}

assert_allow() {
  local label="$1" adr="$2" extra="${3:-}"
  local out; out="$(run_hook_with_plan "$adr" "$extra")"
  if echo "$out" | grep -q '"permissionDecision"'; then
    fail "$label" "expected ALLOW but got DENY: $out"
  else
    pass "$label"
  fi
}

assert_deny() {
  local label="$1" adr="$2" extra="${3:-}"
  local out; out="$(run_hook_with_plan "$adr" "$extra")"
  if echo "$out" | grep -q '"permissionDecision"'; then
    pass "$label"
  else
    fail "$label" "expected DENY but got ALLOW"
  fi
}

# ── Negative cases (must ALLOW — false positives eliminated) ─────────────────

# N/A ADR with negation phrase "no migration risk" in Side-Effects
assert_allow \
  "allow: negation 'no migration risk' in Side-Effects" \
  "N/A - bug fix" \
  "No migration risk. No schema impact."

# N/A ADR with Bearer-token example in a backtick span
assert_allow \
  "allow: backtick span with keyword" \
  "N/A - bug fix" \
  "Run \`curl -H 'Authorization: Bearer \$TOKEN'\` to verify."

# N/A ADR with "no new authorization model" colloquial use
assert_allow \
  "allow: colloquial 'no new authorization model' in Side-Effects" \
  "N/A - bug fix" \
  "No new approval model introduced. User confirmation is the only gate."

# ── Positive cases (must DENY — real architectural claims still caught) ───────

# introduces a new authentication model in Approach (no negation)
assert_deny \
  "deny: real architectural keyword 'authentication' in Approach section" \
  "N/A - bug fix" \
  "Introduces a new authentication model for API requests."

# "breaking change" in Side-Effects (no negation prefix within 30 chars)
assert_deny \
  "deny: 'breaking change' without negation" \
  "N/A - bug fix" \
  "This is a breaking change to the public API surface."

# "no schema impact, but we do introduce a breaking change" —
# comma terminates the 30-char negation window so "breaking change" is not dropped
assert_deny \
  "deny: negation clause followed by keyword past comma boundary" \
  "N/A - bug fix" \
  "No schema impact, but we do introduce a breaking change to the plugin API."

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
