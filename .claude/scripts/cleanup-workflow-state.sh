#!/bin/sh
# Run after branch merge or discard to clear per-session workflow artifacts.
set -eu

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"
REVIEW_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/review-sessions"

find "$STATE_DIR" -type f ! -name "claudeloop-features-hash" -delete 2>/dev/null || true
rm -rf "${REVIEW_DIR:?}"/* 2>/dev/null || true

echo "Workflow state cleaned"
