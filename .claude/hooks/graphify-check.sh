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

echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"graphify: STOP. Read graphify-out/GRAPH_REPORT.md first. For Agent spawns: include context (e.g., '\''Community 1: LiveRunPanel in src/views/'\''). Or use graphify query/path/explain instead of raw exploration."}}'
