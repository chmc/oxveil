#!/bin/sh
# Tests for graphify-check.sh Agent-deny path
set -eu

PASS=0
FAIL=0
pass() { printf "PASS: %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

HOOK="$(cd "$(dirname "$0")/.." && pwd)/hooks/graphify-check.sh"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Stub graphify-out/graph.json so hook doesn't exit early
mkdir -p "$TMP/graphify-out"
echo '{}' > "$TMP/graphify-out/graph.json"
# Fake .git/index so graph.json doesn't trigger background update
mkdir -p "$TMP/.git"
touch "$TMP/.git/index"

AGENT_INPUT='{"tool_name":"Agent","tool_input":{"prompt":"do something"},"transcript_path":""}'

run_hook() {
    (cd "$TMP" && printf '%s' "$1" | sh "$HOOK" 2>/dev/null)
}

# 1: Agent spawn without GRAPH_REPORT in transcript → deny
result=$(run_hook "$AGENT_INPUT")
if printf '%s' "$result" | grep -q '"deny"'; then
    pass "Agent without GRAPH_REPORT: denied"
else
    fail "Agent without GRAPH_REPORT: expected deny (got: $result)"
fi

# 2: OXVEIL_SKIP_GRAPHIFY=1 → allow (no output = allow)
result=$(cd "$TMP" && printf '%s' "$AGENT_INPUT" | OXVEIL_SKIP_GRAPHIFY=1 sh "$HOOK" 2>/dev/null)
if [ -z "$result" ]; then
    pass "OXVEIL_SKIP_GRAPHIFY=1: allowed"
else
    fail "OXVEIL_SKIP_GRAPHIFY=1: expected allow (got: $result)"
fi

# 3: Transcript contains GRAPH_REPORT → allow
TRANSCRIPT="$TMP/session.jsonl"
printf '{"type":"tool_use","name":"Read","input":{"file_path":"graphify-out/GRAPH_REPORT.md"}}\n' > "$TRANSCRIPT"
AGENT_INPUT_WITH_TRANSCRIPT=$(printf '{"tool_name":"Agent","tool_input":{"prompt":"do something"},"transcript_path":"%s"}' "$TRANSCRIPT")
result=$(run_hook "$AGENT_INPUT_WITH_TRANSCRIPT")
if [ -z "$result" ]; then
    pass "GRAPH_REPORT in transcript: allowed"
else
    fail "GRAPH_REPORT in transcript: expected allow (got: $result)"
fi

# 4: Glob tool → advisory only (additionalContext, not deny)
GLOB_INPUT='{"tool_name":"Glob","tool_input":{"pattern":"**/*.ts"},"transcript_path":""}'
result=$(run_hook "$GLOB_INPUT")
if printf '%s' "$result" | grep -q '"additionalContext"'; then
    pass "Glob: advisory (not deny)"
else
    fail "Glob: expected advisory (got: $result)"
fi

printf "\nResults: %d passed, %d failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
