#!/bin/sh
# Tests for vv-recipes-read-marker.sh PostToolUse hook
set -eu

PASS=0; FAIL=0
pass() { printf "PASS: %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

HOOK="$(cd "$(dirname "$0")/.." && pwd)/hooks/vv-recipes-read-marker.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

STATE="$TMP/.claude/workflow-state"
mkdir -p "$STATE"

run_hook() {
    payload="$1"
    printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$TMP" sh "$HOOK" 2>/dev/null
}

# ── F1: Read of recipes file → marker written ────────────────────────────────

run_hook "$(jq -n --arg p '/Users/aleksi/source/oxveil/.claude/skills/visual-verification/references/visual-verification-recipes.md' \
    '{"tool_name":"Read","tool_input":{"file_path":$p}}')"

if [ -f "$STATE/vv-recipes-read" ]; then
    pass "F1: Read recipes.md → marker written"
else
    fail "F1: Read recipes.md → marker not written"
fi

# ── F2: Read of unrelated file → no marker ───────────────────────────────────

rm -f "$STATE/vv-recipes-read"

run_hook "$(jq -n --arg p '/Users/aleksi/source/oxveil/src/extension.ts' \
    '{"tool_name":"Read","tool_input":{"file_path":$p}}')"

if [ ! -f "$STATE/vv-recipes-read" ]; then
    pass "F2: Read unrelated file → no marker"
else
    fail "F2: Read unrelated file → marker unexpectedly written"
fi

# ── F3: Read of SKILL.md (same dir, not recipes) → no marker ─────────────────

run_hook "$(jq -n --arg p '/Users/aleksi/source/oxveil/.claude/skills/visual-verification/SKILL.md' \
    '{"tool_name":"Read","tool_input":{"file_path":$p}}')"

if [ ! -f "$STATE/vv-recipes-read" ]; then
    pass "F3: Read SKILL.md → no marker (must be exactly recipes.md)"
else
    fail "F3: Read SKILL.md → marker unexpectedly written"
fi

# ── F4: Marker is idempotent (re-read doesn't break anything) ────────────────

run_hook "$(jq -n --arg p '/some/path/visual-verification-recipes.md' \
    '{"tool_name":"Read","tool_input":{"file_path":$p}}')"
run_hook "$(jq -n --arg p '/some/path/visual-verification-recipes.md' \
    '{"tool_name":"Read","tool_input":{"file_path":$p}}')"

if [ -f "$STATE/vv-recipes-read" ]; then
    pass "F4: double-Read of recipes.md → marker present, no error"
else
    fail "F4: double-Read → marker missing"
fi

# ── Summary ──────────────────────────────────────────────────────────────────

printf "\nResults: %d passed, %d failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
