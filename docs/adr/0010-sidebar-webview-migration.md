# 10. Sidebar Tree View to Webview Migration

**Date:** 2026-04-07
**Status:** Accepted

## Context

The sidebar used two native VS Code tree views ("Phases" and "Past Runs") which were limited to text + icons with no custom HTML. This could not support the 7 context-aware states needed for good UX: onboarding guidance, live progress with cost/todo info bars, error recovery flows, and post-run summaries.

## Decision

Replace both tree views with a single `WebviewViewProvider` (`oxveil.sidebar`) that renders full HTML for 7 states: not-found, empty, ready, running, stopped, failed, completed.

**Architecture:**
- `deriveViewState()` maps `DetectionStatus` + `SessionStatus` + plan existence + progress to a view state
- `SidebarPanel` implements `WebviewViewProvider`, receives state updates via `updateState()`/`sendProgressUpdate()`
- HTML rendering uses `var(--vscode-*)` theme variables and codicon font
- Message dispatch maps webview button clicks to existing VS Code commands
- Session events flow through `sessionWiring.ts` to the sidebar alongside other consumers
- Archive data is refreshed after session completion and pushed to sidebar

**State updates flow from:**
- `sessionWiring.ts` `state-changed`/`phases-changed`/`log-appended` → sidebar
- Plan file watcher `onDidCreate`/`onDidDelete` → sidebar
- Detection status changes → sidebar
- Archive refresh completion → sidebar

## Consequences

**Positive:**
- Rich, context-aware UI with actionable CTAs for each state
- Live progress bars, cost/todo info, error snippets during runs
- Single unified panel replaces two disconnected tree views
- Full control over layout, styling, and interaction patterns

**Negative:**
- Webview requires more code than tree views (~800 lines of HTML rendering)
- Message-passing adds indirection vs direct tree data binding
- `retainContextWhenHidden` keeps webview in memory even when sidebar is collapsed
- No native VS Code drag-and-drop or tree keyboard navigation
