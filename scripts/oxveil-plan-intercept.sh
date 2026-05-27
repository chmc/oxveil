#!/usr/bin/env bash
# PreToolUse:ExitPlanMode — intercept for Oxveil plan review workflow
# Writes a request file, polls for extension response, returns allow/deny JSON.

set -euo pipefail

CLAUDE_DIR="${CLAUDE_PROJECT_DIR:-$PWD}/.claude"
MARKER="$CLAUDE_DIR/oxveil-plan-active"

allow() { echo '{"permissionDecision":"allow"}'; exit 0; }

# Pass through if no active Plan chat session
[[ -f "$MARKER" ]] || allow

# Break infinite loop: allow if denyCount >= 3
deny_count=$(jq -r '.denyCount // 0' "$MARKER" 2>/dev/null || echo 0)
[[ "$deny_count" -lt 3 ]] || allow

# Generate UUID
UUID=$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' \
  || python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null \
  || cat /proc/sys/kernel/random/uuid 2>/dev/null)

REQUEST_FILE="$CLAUDE_DIR/plan-intercept-request-${UUID}.json"
RESPONSE_FILE="$CLAUDE_DIR/plan-intercept-response-${UUID}.json"

# Write request — extension watches .claude/ and responds
jq -n \
  --arg root "${CLAUDE_PROJECT_DIR:-$PWD}" \
  --arg uuid "$UUID" \
  '{"workspaceRoot":$root,"uuid":$uuid}' > "$REQUEST_FILE"

# Poll for response (30s timeout, 100ms interval)
DEADLINE=$((SECONDS + 30))
while [[ $SECONDS -lt $DEADLINE ]]; do
  if [[ -f "$RESPONSE_FILE" ]]; then
    decision=$(jq -r '.decision // "allow"' "$RESPONSE_FILE" 2>/dev/null || echo "allow")
    reason=$(jq -r '.reason // ""' "$RESPONSE_FILE" 2>/dev/null || echo "")
    feedback=$(jq -r '.feedback // ""' "$RESPONSE_FILE" 2>/dev/null || echo "")
    rm -f "$REQUEST_FILE" "$RESPONSE_FILE"

    if [[ "$decision" == "deny" ]]; then
      if [[ "$reason" == "critic" ]]; then
        # Increment denyCount in marker
        new_count=$((deny_count + 1))
        session_id=$(jq -r '.sessionId // ""' "$MARKER" 2>/dev/null || echo "")
        jq -n --arg sid "$session_id" --argjson cnt "$new_count" \
          '{"sessionId":$sid,"denyCount":$cnt}' > "$MARKER"

        critic_msg="Run 2-3 critic agents in parallel before calling ExitPlanMode. Agents should cover: (1) root cause correctness, (2) scope and mock sites, (3) alternatives and UX. After critics complete, call ExitPlanMode again."

        jq -n --arg msg "$critic_msg" \
          '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","additionalContext":$msg}}'
      else
        # Text feedback deny
        context="${feedback:-Please review and make changes before proceeding.}"
        jq -n --arg ctx "$context" \
          '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","additionalContext":$ctx}}'
      fi
    else
      # decision == "allow" — execute or skip
      allow
    fi
    exit 0
  fi
  sleep 0.1
done

# Timeout — cleanup and allow silently
rm -f "$REQUEST_FILE"
allow
