#!/bin/sh
# Skill-invoked harness preflight for visual verification.
# Usage: vv-harness-preflight.sh <plan-file> <oxveil-mcp-discovery-file>
# Exit 0 = pass, exit 1 = fail (message on stderr).
# Reads plan's ## Harness Requirements section; if [needs-real-session], polls
# MCP /state.processManager.exists (3 attempts x 500ms) before asserting failure.
set -eu

PLAN_FILE="${1:-}"
MCP_DISCOVERY="${2:-}"

if [ -z "$PLAN_FILE" ] || [ ! -f "$PLAN_FILE" ]; then
  echo "[vv-harness-preflight] SKIP: no plan file provided" >&2
  exit 0
fi

# Check for [needs-real-session] in Harness Requirements section
harness_section=$(awk '/^## Harness Requirements/{p=1;next} /^## /{p=0} p' "$PLAN_FILE")
if ! echo "$harness_section" | grep -q '\[needs-real-session\]'; then
  echo "[vv-harness-preflight] PASS: [needs-real-session] not declared" >&2
  exit 0
fi

# [needs-real-session] declared — verify processManager.exists via MCP
if [ -z "$MCP_DISCOVERY" ] || [ ! -f "$MCP_DISCOVERY" ]; then
  # Try default location
  MCP_DISCOVERY="${CLAUDE_PROJECT_DIR:-.}/.oxveil-mcp"
fi

if [ ! -f "$MCP_DISCOVERY" ]; then
  echo "[vv-harness-preflight] FAIL: [needs-real-session] declared but .oxveil-mcp not found. Run oxveil.start first." >&2
  exit 1
fi

PORT=$(jq -r '.port' "$MCP_DISCOVERY" 2>/dev/null) || PORT=""
TOKEN=$(jq -r '.token' "$MCP_DISCOVERY" 2>/dev/null) || TOKEN=""

if [ -z "$PORT" ] || [ -z "$TOKEN" ]; then
  echo "[vv-harness-preflight] FAIL: could not parse port/token from .oxveil-mcp" >&2
  exit 1
fi

# Poll up to 3 times with 500ms delay
i=0
pm_exists="false"
while [ "$i" -lt 3 ]; do
  response=$(curl -s --max-time 2 -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:$PORT/state" 2>/dev/null) || response=""
  pm_exists=$(printf '%s' "$response" | jq -r '.processManager.exists // false' 2>/dev/null) || pm_exists="false"
  if [ "$pm_exists" = "true" ]; then
    break
  fi
  i=$((i + 1))
  [ "$i" -lt 3 ] && sleep 0.5
done

if [ "$pm_exists" = "true" ]; then
  echo "[vv-harness-preflight] PASS: processManager.exists=true" >&2
  exit 0
else
  echo "[vv-harness-preflight] FAIL: [needs-real-session] but processManager.exists=false after 3 polls. Run oxveil.start to start a claudeloop session, then re-run preflight." >&2
  exit 1
fi
