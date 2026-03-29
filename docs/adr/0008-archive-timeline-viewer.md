# 8. Archive timeline viewer

**Date:** 2026-03-29
**Status:** Accepted

## Context

Users need to review past claudeloop run timelines after execution completes. The existing `TimelinePanel` manages live state (process handles, polling, stop actions) which conflicts with read-only archive viewing. We needed a way to display historical timelines without introducing mode-switching complexity into the live panel.

## Decision

Introduce a dedicated `ArchiveTimelinePanel` that renders read-only past run timelines in a separate webview panel. Key design choices:

- **Separate panel class** rather than adding a mode switch to the live `TimelinePanel`. `ArchiveTimelinePanel` reuses `renderTimelineHtml` with an optional header parameter indicating the archive context.
- **Side-by-side viewing** — the archive panel uses a distinct `viewType` so it can coexist alongside the live timeline without conflicts.
- **No process state** — `ArchiveTimelinePanel` has no dependency on `ProcessManager`. It receives pre-parsed phase data and renders it statically.
- **Command registration** — `oxveil.archiveTimeline` command wired into the extension for opening archive views.

### Alternatives considered

- **Reuse live panel with mode switch:** Would require guarding every process-related method behind a mode check, increasing coupling and risk of state bugs.
- **Extend replay viewer:** The replay viewer serves a different purpose (step-through playback) and adding static timeline rendering would blur its responsibilities.

## Consequences

- **Positive:** Clean separation of concerns — live and archive panels evolve independently. No risk of accidentally sending stop signals to archived runs. Enables viewing a past timeline while a live run is in progress.
- **Negative:** Some HTML rendering logic is shared via `renderTimelineHtml` — changes to timeline visuals must be tested in both contexts. A second panel class adds a small amount of surface area to maintain.
