# Changelog

## Unreleased

### Added
- CI workflow for PR checks with coverage reporting
- ESLint async rules to catch floating promises
- Pre-commit hooks via lefthook
- State transition validation in SessionState
- Regression test suite for race conditions and cleanup
- Incremental test gate using `vitest related` on task completion (~500ms)

### Fixed
- Eliminate TOCTOU race conditions in state-changed handler via snapshot capture (sessionWiring.ts)
- Session-scoped edit-order cleared on session start to prevent stale TDD checks
- Fix EROFS error when forming plan with relative PLAN_FILE path in .claudeloop.conf
- Panel visible getter now tracks webview ready state to prevent silent postMessage failures (#119)
- ProcessManager race conditions in spawn methods (#117)
- Fix async race condition in self-improvement trigger (#116)
- MCP bridge `/click` now returns `found` field indicating whether the target element was clicked
- Self-improvement panel now opens after session completion even when sidebar state lags progress
- Live run header now stays visible when scrolling log content (#114)
- Stale plan dialog no longer appears after successful completion when untracked `.claude/plans/` files exist
- Plan Preview no longer shows stale title from previous session on new plan chat
- Plan files not tracked by preview panel are now cleaned up on session end (#111)
- Self-improvement command now finds lessons from archive when panel state is empty (#113)
- Fix plan preview showing unrelated global plans (#112)
- Plan Preview scroll position no longer resets on content updates (#107)
- Plan Preview no longer shows stale content from previous sessions when opened without an active Plan Chat session
- Self-improvement command errors are now caught and logged instead of silently failing (#103)
- Plan preview detects plans written by Claude Code: clears stale session state on activation, polls every 5s when visible, tracks state before panel opens

### Added
- Provider indicator in status bar: `$(cloud)` for Claude, `$(terminal)` for OpenCode
- Provider badge in sidebar card headers (ready, running, stopped, failed, completed states)
- `Oxveil: Switch Provider` command — switch between Claude and OpenCode from the Command Palette
- README Providers section: setup, quick switch, and troubleshooting for both providers
- `oxveil.provider`, `oxveil.claudePath`, `oxveil.opencodePath` documented in Settings table
