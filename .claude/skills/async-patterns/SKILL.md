---
name: async-patterns
description: Checklist for async handlers, new panels, and state reads before await
trigger: creating async handlers, new webview panels, state management, async methods in views
---

## Checklist

- [ ] Async handler typed as `GuardedHandler<T>` from `src/core/state/GuardedHandler.ts`
- [ ] `_readSeq` field present and incremented before await
- [ ] Stale check after await: `if (seq !== this._readSeq) return`
- [ ] `_disposed = false` field on panel, set `_disposed = true` first in `dispose()`
- [ ] `_disposed` checked at entry of all public methods that create/interact with panels
- [ ] State reads before await use `session.readSnapshot()` + `try { session.assertFresh(seq); } catch { return; }`

## Examples

See `docs/patterns/async-guards.md`.

## Key Files

- `src/core/state/GuardedHandler.ts` — GuardedHandler type
- `src/core/state/VersionedSnapshot.ts` — VersionedSnapshot + StaleStateError
- `src/views/planPreviewPanel.ts` — reference implementation (_readSeq pattern)
- `src/sessionWiring.ts` — assertFresh usage example
