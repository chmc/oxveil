#!/bin/sh
# Tests for vv-recipes-required.sh PreToolUse gate
set -eu

PASS=0; FAIL=0
pass() { printf "PASS: %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

HOOK="$(cd "$(dirname "$0")/.." && pwd)/hooks/vv-recipes-required.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

STATE="$TMP/.claude/workflow-state"
mkdir -p "$STATE"

run_hook() {
    CLAUDE_PROJECT_DIR="$TMP" sh "$HOOK" 2>/dev/null
}

make_payload() {
    jq -n --arg cmd "$1" '{"tool_name":"Bash","tool_input":{"command":$cmd}}'
}

MCP_CMD='curl -s -X POST http://localhost:49481/command -H "Authorization: Bearer abc123"'
MCP_CLICK='curl -s http://localhost:49481/click -H "Authorization: Bearer abc123"'
MCP_SEQ='curl -s -X POST http://localhost:49481/sendSequence -H "Authorization: Bearer abc123"'
NON_MCP='curl -s https://api.github.com/repos/foo/bar'
LOCAL_NO_BEARER='curl -s http://localhost:3000/health'

# ── F1: MCP bridge curl without marker → deny ────────────────────────────────

for label in "command" "click" "sendSequence"; do
    case "$label" in
        command) cmd="$MCP_CMD" ;;
        click)   cmd="$MCP_CLICK" ;;
        *)       cmd="$MCP_SEQ" ;;
    esac
    output=$(make_payload "$cmd" | run_hook)
    if printf '%s' "$output" | grep -q '"deny"'; then
        pass "F1: /$label without marker → deny"
    else
        fail "F1: /$label without marker → expected deny, got: $output"
    fi
done

# Denial message should name recipes.md
output=$(make_payload "$MCP_CMD" | run_hook)
if printf '%s' "$output" | grep -q 'recipes.md'; then
    pass "F1: denial message names recipes.md"
else
    fail "F1: denial message does not name recipes.md"
fi

# ── F2: non-MCP curl → pass through ─────────────────────────────────────────

for label in "github-api" "local-no-bearer"; do
    case "$label" in
        github-api)     cmd="$NON_MCP" ;;
        local-no-bearer) cmd="$LOCAL_NO_BEARER" ;;
    esac
    output=$(make_payload "$cmd" | run_hook)
    if ! printf '%s' "$output" | grep -q '"deny"'; then
        pass "F2: $label → pass through"
    else
        fail "F2: $label → unexpected deny"
    fi
done

# ── F3: MCP curl with marker present → pass through ─────────────────────────

touch "$STATE/vv-recipes-read"
output=$(make_payload "$MCP_CMD" | run_hook)
if ! printf '%s' "$output" | grep -q '"deny"'; then
    pass "F3: /command with marker → pass through"
else
    fail "F3: /command with marker → unexpected deny"
fi
rm -f "$STATE/vv-recipes-read"

# ── F4: OXVEIL_SKIP_GATES=1 → skip gate ─────────────────────────────────────

output=$(make_payload "$MCP_CMD" | OXVEIL_SKIP_GATES=1 CLAUDE_PROJECT_DIR="$TMP" sh "$HOOK" 2>/dev/null)
if ! printf '%s' "$output" | grep -q '"deny"'; then
    pass "F4: OXVEIL_SKIP_GATES=1 → skip gate"
else
    fail "F4: OXVEIL_SKIP_GATES=1 → unexpected deny"
fi

# ── Summary ──────────────────────────────────────────────────────────────────

printf "\nResults: %d passed, %d failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
