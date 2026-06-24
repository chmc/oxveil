# Changelog

## Unreleased

### Fixed
- Goal gate writes automatically on AskUserQuestion answer — no more "Select a goal first" denial after picking a goal
- Fix false "phase failed" notification when phase succeeds after verification retry (#133)
- "Do something else" goal selection no longer blocked by gate or fuzzy-matched to existing goals
- Fix duplicate goal files created on plan iteration
- Fix task tracking in live run sticky top for TaskCreate/TaskUpdate tools (#132)
- Fix plan intercept watcher not detecting hook request files (pattern mismatch)
- Plan intercept now works in all projects, not just those previously opened with Oxveil

### Changed
- Plan exit intercept now shows options in Claude terminal instead of VS Code QuickPick

### Added
- Flow Visualization required plan section with gate enforcement (N/A needs >30 char justification)
- Side-Effects content-quality validation: cross-validates plan body risk patterns against SE section, blocks dismissals ("none", "no side-effects") when risk categories detected
- Side-Effects required plan section with gate enforcement (N/A only for trivial changes)
- CI workflow for PR checks with coverage reporting
- ESLint async rules to catch floating promises
- Pre-commit hooks via lefthook
- State transition validation in SessionState
- Regression test suite for race conditions and cleanup
- Incremental test gate using `vitest related` on task completion (~500ms)

### Removed
- Write Plan, AI Parse, Form Plan buttons from initial view — "Let's Go" is the only entry point
- Stale plan detection and Resume/Dismiss flow — always starts fresh on VS Code reopen
- `oxveil.writePlan` and `oxveil.aiParsePlan` commands

### Fixed
- Plan Preview Start button now responds to clicks correctly (#115)
- Plan Preview keeps both plan tabs when ai-parsed appears after Form Plan
- Plan Preview shows correct content after VS Code window reload (#128)
- Fix plan preview showing "Terminal closed" on session failure instead of only on terminal close
- Fix ai-parsed-plan.md being deleted on plan file changes during active sessions
- Fix plan preview showing Design tab alongside AI Parsed in sessionless mode when ai-parsed-plan.md is created
- Fix plan preview showing stale superpowers plans when ai-parsed appears
- Plan preview Start button now disables when claudeloop starts (#124)
- Plan preview no longer shows stale plans when ai-parsed file exists (#123)
- Sidebar no longer shows "Ready" state on startup due to stale `.claude/plans/` files from previous sessions
- Sidebar no longer shows orphaned plan files from `.claude/plans/` when no active session
- Edit button in sidebar now opens plan file (was calling unregistered `oxveil.writePlan` command)
- Fix code indentation lost in plan preview (#125)
- Fix code block indentation in plan preview (#121)
- Disposal guard in async state-changed handler prevents stale writes after WorkspaceSession disposed
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
