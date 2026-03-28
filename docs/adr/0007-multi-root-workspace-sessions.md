# 7. Multi-root workspace sessions via WorkspaceSessionManager

**Date:** 2026-03-28
**Status:** Accepted

## Context

VS Code multi-root workspaces allow multiple project folders in a single window. Each folder may have its own `.claudeloop/` directory with independent session state. The original architecture assumed a single workspace root — one SessionState, one ProcessManager, one set of watchers.

Supporting multi-root requires isolating per-folder state while presenting a unified UI.

## Decision

Introduce `WorkspaceSessionManager` as the central hub for multi-root support.

**Per-folder isolation:** Each workspace folder gets a `WorkspaceSession` instance containing its own `SessionState`, `ProcessManager`, and `GitIntegration`. Sessions are created lazily when a folder's `.claudeloop/` directory is detected or when a command targets that folder.

**Active folder tracking:** The manager tracks which folder is currently "active" (the one shown in the status bar, tree view, and webview panels). Active folder changes emit `active-session-changed` events. Views subscribe to this event to re-render for the new folder.

**Folder picker:** A `pickWorkspaceFolder()` utility shows a quick-pick when commands need to resolve a target folder. In single-root workspaces, this resolves automatically with no UI.

**Folder-scoped views:** Status bar shows a folder prefix in multi-root workspaces. Phase tree groups phases by folder. Webview panels (dependency graph, timeline, config wizard) are scoped to the active folder.

**Backward compatibility:** In single-root workspaces, the manager creates one session. All existing commands and views work unchanged — they resolve through `getActiveSession()`.

## Consequences

**Positive:**
- Each folder's claudeloop session is fully isolated — no cross-contamination of state
- Single-root workspaces see no behavioral change
- The `WorkspaceSession` container makes dependency injection explicit — each session gets its own instances
- Folder picker provides a consistent UX for multi-root command resolution

**Negative:**
- Increased memory footprint — each folder has its own watcher, parser state, and event emitters
- Active folder tracking adds complexity to view updates — views must handle folder switches
- Commands that previously assumed a single root now route through the manager, adding an indirection layer
