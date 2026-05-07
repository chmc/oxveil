# Changelog

## Unreleased

### Fixed
- Plan preview detects plans written by Claude Code: clears stale session state on activation, polls every 5s when visible, tracks state before panel opens

### Added
- Provider indicator in status bar: `$(cloud)` for Claude, `$(terminal)` for OpenCode
- Provider badge in sidebar card headers (ready, running, stopped, failed, completed states)
- `Oxveil: Switch Provider` command — switch between Claude and OpenCode from the Command Palette
- README Providers section: setup, quick switch, and troubleshooting for both providers
- `oxveil.provider`, `oxveil.claudePath`, `oxveil.opencodePath` documented in Settings table
