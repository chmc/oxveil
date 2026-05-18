# ADR-0017: Versioned State and Async Guards

## Status
Accepted

## Context

Recurring race condition fixes (6+) fell into three patterns:
1. **Disposal races** — async handler continues after panel disposed
2. **TOCTOU** — state read before await, used stale value after
3. **Derived state lag** — checking view property instead of source session state

Fixes were ad-hoc and inconsistent across panels.

## Decision

Introduce lightweight architectural primitives that prevent these patterns by construction:

1. **`VersionedSnapshot<T>`** — wraps mutable state with a monotonic sequence number. `assertFresh(seq)` throws `StaleStateError` if state changed during an await.

2. **`GuardedHandler<T>`** type — TypeScript type `(seq: number) => Promise<T>`. Compiler enforces seq parameter on async handlers, making the stale-check pattern visible and required.

3. **`_disposed` flag** — standardized across all 9 webview panels. Set as first action in `dispose()`. Checked at entry of all public methods that create or interact with panels.

4. **`_readSeq` pattern** — monotonic counter on panels with async file I/O. Incremented before await, checked after. Already used in PlanPreviewPanel; now consistent across codebase.

5. **`SessionMetrics`** — extracted from `SidebarMutableState` as a dedicated class for cost/todo accumulation. Reduces SidebarMutableState's coupling surface.

## Consequences

- TOCTOU bugs in `sessionWiring.ts` caught at runtime (throw + break on stale state)
- Disposal races prevented on all 9 panels
- New async handlers require `seq` parameter — pattern is visible in type signature
- `SessionMetrics` decouples cost/todo tracking from view state management
- CI gate: `fix:` commits without test files are rejected

## Files

- `src/core/state/VersionedSnapshot.ts`
- `src/core/state/GuardedHandler.ts`
- `src/core/state/index.ts`
- `src/core/sessionMetrics.ts`
- `src/core/sessionState.ts` — gains `readSnapshot()` and `assertFresh(seq)`
- `src/sessionWiring.ts` — TOCTOU sites fixed
- `src/views/*.ts` — all 9 panels have `_disposed` flag
