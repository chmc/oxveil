# Oxveil Features

Single source of truth for Oxveil capabilities. Plans must declare which feature(s) they affect (Gate 2 planning checklist).

## Status Values

- `stable` — Production-ready; breaking changes require deprecation notice
- `beta` — Usable but API/UX may change
- `planned` — Not yet implemented
- `deprecated` — Being phased out

## Feature Registry

| Feature | Status | Since | Key Files | Description |
|---------|--------|-------|-----------|-------------|
| sidebar | stable | 0.1.0 | src/views/sidebarState.ts, src/activateSidebar.ts | Session progress webview panel |
| status-bar | stable | 0.1.0 | src/views/statusBar.ts | Status bar indicator showing session state |
| plan-preview | stable | 0.2.0 | src/views/planPreviewPanel.ts | Plan markdown preview panel |
| live-run | stable | 0.3.0 | src/views/liveRunPanel.ts | Live session output panel |
| timeline | stable | 0.3.0 | src/views/timelinePanel.ts | Phase timeline visualization |
| replay | stable | 0.4.0 | src/views/replayPanel.ts | Session replay panel |
| plan-chat | stable | 0.5.0 | src/commands/planChatSession.ts | Interactive plan creation via Claude |
| self-improvement | beta | 0.6.0 | src/selfImprovement/ | Post-session lessons capture |
| dependency-graph | beta | 0.7.0 | src/commands/ | Phase dependency visualization |
| installer | stable | 0.1.0 | src/core/installer.ts | claudeloop detection and installation |
| claudeloop-awareness-gate | planned | - | .claude/hooks/claudeloop-awareness.sh | Workflow gate: blocks edits when claudeloop FEATURES.md changes |
| provider-ui | planned | - | src/views/statusBar.ts, src/views/sidebarRenderers.ts | Provider indicator in status bar and sidebar with quick-switch |
| visual-verification | stable | 0.5.0 | .claude/skills/visual-verification/ | Automated UI testing skill for VS Code EDH |
| workflow-enforcement | planned | - | .claude/hooks/ | Regression prevention gates: test-pass, session-scoped edit-order, marker validation |

## Adding a New Feature

1. Add a row to the registry above with status `planned` or `beta`
2. Reference it by the exact `Feature` column value in plan checklists
3. Update status as the feature matures
