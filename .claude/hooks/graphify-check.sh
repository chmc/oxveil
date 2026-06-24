#!/bin/bash
# Fires on PreToolUse: Glob|Grep|Agent
# Auto-updates graphify if stale, outputs guidance with example pattern

if [ ! -f graphify-out/graph.json ]; then
  exit 0
fi

# Background update if graph is older than git index (staged changes)
if [ graphify-out/graph.json -ot .git/index ]; then
  command -v graphify >/dev/null 2>&1 && graphify update . >/dev/null 2>&1 &
fi

input=$(cat)
tool_name=$(printf '%s' "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")

# Agent spawns: deny unless skip-env set or GRAPH_REPORT.md recently read in transcript
if [ "$tool_name" = "Agent" ]; then
  if [ "${OXVEIL_SKIP_GRAPHIFY:-0}" = "1" ]; then
    exit 0
  fi
  transcript_path=$(printf '%s' "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('transcript_path',''))" 2>/dev/null || echo "")
  if [ -n "$transcript_path" ] && [ -f "$transcript_path" ]; then
    if tail -200 "$transcript_path" 2>/dev/null | grep -q "GRAPH_REPORT"; then
      exit 0
    fi
  fi
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"graphify: Read graphify-out/GRAPH_REPORT.md first (or set OXVEIL_SKIP_GRAPHIFY=1 for non-graph tasks like shell/config). Then include community context in your Agent prompt."}}'
  exit 0
fi

# Glob/Grep: advisory only
echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"graphify: STOP. Read graphify-out/GRAPH_REPORT.md first. For Agent spawns: include context (e.g., '\''Community 1: LiveRunPanel in src/views/'\''). Or use graphify query/path/explain instead of raw exploration."}}'
