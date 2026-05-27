#!/usr/bin/env bash
# PreToolUse:ExitPlanMode — intercept for Oxveil plan review workflow
# Denies ExitPlanMode and instructs Claude to ask the user how to proceed.

set -euo pipefail

CLAUDE_DIR="${CLAUDE_PROJECT_DIR:-$PWD}/.claude"
MARKER="$CLAUDE_DIR/oxveil-plan-active"

allow() { echo '{"permissionDecision":"allow"}'; exit 0; }

# Pass through if no active Plan chat session
[[ -f "$MARKER" ]] || allow

# Break infinite loop: allow if denyCount >= 5
deny_count=$(jq -r '.denyCount // 0' "$MARKER" 2>/dev/null || echo 0)
[[ "$deny_count" -lt 5 ]] || allow

# Increment denyCount in marker
new_count=$((deny_count + 1))
session_id=$(jq -r '.sessionId // ""' "$MARKER" 2>/dev/null || echo "")
jq -n --arg sid "$session_id" --argjson cnt "$new_count" \
  '{"sessionId":$sid,"denyCount":$cnt}' > "$MARKER"

CONTEXT='Before proceeding, ask the user with AskUserQuestion:

Question: "How should we proceed with the plan?"
Options:
1. "Form Plan with Oxveil" - Hand off to Oxveil for implementation
2. "Run critic agents first" - Run 2-3 critic agents before proceeding
3. "Continue planning" - Stay in plan mode for refinement

Based on their answer:
- Form Plan with Oxveil → write file `.claude/oxveil-execute` with content `{"action":"formPlan"}`, then STOP and wait (do NOT call ExitPlanMode)
- Run critic agents → run 2-3 parallel critic agents covering root cause, scope/mocks, alternatives/UX, then call ExitPlanMode again
- Continue planning → do NOT call ExitPlanMode, ask what they want to change'

jq -n --arg ctx "$CONTEXT" \
  '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","additionalContext":$ctx}}'
