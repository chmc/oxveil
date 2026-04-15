# 14. Canonical Sidebar State Builder

**Date:** 2026-04-15
**Status:** Accepted

## Context

`sessionWiring.ts` had its own `buildAndSendSidebarState()` that reconstructed sidebar state from `SessionWiringDeps` fields (`detectionStatus`, `planDetected`, `getPlanUserChoice`, etc.). Several of these fields were static snapshots captured at wiring time. When the file watcher updated `planDetected` at runtime, the wiring continued reading the stale snapshot, causing the sidebar to revert to "empty" on the next session state transition (issue #27).

`activateSidebar.ts` already had a canonical `buildFullState()` that reads live mutable state. The duplication meant every mutable sidebar input needed manual synchronization between two code paths.

## Decision

Session wiring receives a single `buildSidebarState: () => SidebarState` callback (the canonical `buildFullState()` from `activateSidebar.ts`) instead of individual state fields. The wiring calls this callback on every state change and only merges session-local tracking data (cost, todos) into the returned state.

Removed from `SessionWiringDeps`: `detectionStatus`, `planDetected`, `planFilename`, `getArchives`, `getPlanUserChoice`.

**Contract:** `buildSidebarState()` reads `SessionState.status` via the manager, so it must be called after `_transition()` updates `_status`. This holds because `SessionState._transition()` sets status before emitting `state-changed`.

## Consequences

- **Positive:** Single source of truth for sidebar state. Runtime changes to `planDetected`, `detectionStatus`, or `planUserChoice` are always reflected. No manual sync needed when adding new mutable fields.
- **Positive:** Simpler `SessionWiringDeps` interface — fewer fields, no mix of static values and getter functions.
- **Negative:** `buildSidebarState` creates a coupling between session wiring and `activateSidebar`'s closure. If `buildFullState` later depends on something unavailable during session event handling, it would break silently. Integration tests mitigate this.
