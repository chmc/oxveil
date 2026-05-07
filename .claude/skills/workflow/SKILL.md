---
name: workflow
description: Show current workflow gate status for oxveil. Use when checking what gates are satisfied or blocked.
---

# Workflow Status

Check and display current workflow state.

Run this bash command and report results:

```bash
STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state"
echo "=== Workflow State ==="
echo "Branch confirmed:    $([ -f "$STATE_DIR/branch-confirmed" ] && echo "✓" || echo "✗")"
echo "Plan exited:         $([ -f "$STATE_DIR/plan-exited" ] && echo "✓" || echo "✗")"
echo "Tasks created:       $([ -f "$STATE_DIR/tasks-created" ] && echo "✓" || echo "✗")"
echo ""
echo "=== Completion Gates ==="
echo "Docs complete:       $([ -f "$STATE_DIR/docs-complete" ] && echo "✓" || echo "✗")"
echo "ADR complete:        $([ -f "$STATE_DIR/adr-complete" ] && echo "✓" || echo "✗")"
echo "package.json:        $([ -f "$STATE_DIR/package-json-complete" ] && echo "✓" || echo "✗")"
echo "Changelog:           $([ -f "$STATE_DIR/changelog-complete" ] && echo "✓" || echo "✗")"
echo "README:              $([ -f "$STATE_DIR/readme-complete" ] && echo "✓" || echo "✗")"
echo "Simplify:            $([ -f "$STATE_DIR/simplify-complete" ] && echo "✓" || echo "✗")"
echo "Review:              $([ -f "$STATE_DIR/review-complete" ] && echo "✓" || echo "✗")"
echo "Visual verified:     $([ -f "$STATE_DIR/visual-verified" ] && echo "✓" || echo "$([ -f "$STATE_DIR/visual-skip-reason" ] && echo "skipped" || echo "✗")")"
echo ""
echo "=== Edit Order ==="
[ -f "$STATE_DIR/edit-order" ] && cat "$STATE_DIR/edit-order" || echo "(none)"
```

Also report plan-requirements.json if it exists:

```bash
[ -f "${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state/plan-requirements.json" ] && cat "${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state/plan-requirements.json" | jq .
```
