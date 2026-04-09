# Scope and Completeness Review: Stale Plan Bug Fix

## Overall Assessment

The plan correctly identifies the three interacting root causes and proposes targeted fixes. The analysis is solid. Below are gaps and risks found.

---

## Check 1: Does the plan address ALL root causes? Are there other code paths that could produce the same symptom?

**Verdict: Mostly yes, with one gap.**

The three causes (birthtimeMs-only filter, stale `_sessionDataResolved`, stale `_lastPhases` on ready) are correctly identified and addressed.

**Gap: `statFile` does not return `mtimeMs`.** The plan's fix #1 references `candidate.mtimeMs` (from `findAllPlanFiles`) but the existing `statFile` dep only returns `{ birthtimeMs: number }`. The plan's proposed code change uses `candidate.mtimeMs` (which comes from `findAllPlanFiles`, not `statFile`), so the data is available. However, this is subtly fragile -- the session-aware filter at line 146 uses `stats` (from `statFile`) for `birthtimeMs` but must use `candidate` (from `findAllPlanFiles`) for `mtimeMs`. The plan should call this out explicitly so the implementer does not accidentally write `stats.mtimeMs` (which doesn't exist on the type).

**Potential additional code path:** The `_resolveSessionless` method's Layer 1 (workspace cache) could also serve stale data. If a previous session persisted a plan path, and a new session starts and ends quickly without discovering a new plan, `_resolveSessionless` would return the old cached path. The plan's fix #2 (resetting `_sessionDataResolved`) helps Layer 2 re-run, but Layer 1 (workspace cache) is checked first and would still return the stale cached path. The `beginSession()` call does `persistPlanPath?.(undefined)` which clears the cache, so this is handled -- but only if `beginSession()` was called. If the extension reloads without a session (crash, manual reload), the stale cache persists. This is pre-existing and outside the plan's scope, but worth noting.

---

## Check 2: Is there a scenario where the fix still fails?

**Scenario: Plan file created AND last modified before session start.**

If Claude creates the plan file in a previous session and does not modify it during the current session, both `birthtimeMs` and `mtimeMs` will be older than `_sessionStartTime`. The fix correctly filters this out (both conditions fail). But if the user opens Plan Chat expecting to see that file, they get nothing. This is arguably correct behavior (the file isn't part of the current session), but the plan should acknowledge this edge case and confirm it's intentional.

**Scenario: Race between `beginSession()` and first file write.**

`registerPlanChat.ts` calls `beginSession()` then `session.start()` then `onFileChanged()`. Between `beginSession()` (which records `Date.now()`) and Claude's first write to the plan file, there is no gap issue because `mtimeMs` only needs to be *after* `_sessionStartTime`, and any write by Claude will be after the session start. This looks safe.

---

## Check 3: Does `registerPlanChat.ts` call `onFileChanged()` after `beginSession()`? If the file doesn't exist yet, does FSWatcher catch it later?

**Yes, this works correctly.**

Line 50 of `registerPlanChat.ts`: `await deps.planPreviewPanel?.onFileChanged()` runs after `beginSession()`. At this point Claude hasn't created the plan file yet, so `findAllPlanFiles` won't find it. However, the FSWatcher (set up in `activateViews.ts` line 188) fires `onFileChanged()` via debounced handler when files are created/changed. So the plan file will be picked up ~200ms after Claude creates it. No gap here.

---

## Check 4: After terminal closes, does the next `onFileChanged()` correctly resolve the plan?

**This is the key question, and there IS a remaining issue.**

When the terminal closes (`extension.ts` line 326-332):
1. `setSessionActive(false)` is called -- updates UI state
2. `endSession()` is called -- clears `_sessionStartTime`

After the plan's fix #2, `endSession()` also resets `_sessionDataResolved = false`.

The next `onFileChanged()` (from FSWatcher or manual) enters the sessionless branch (since `_sessionStartTime` is undefined). It runs `_resolveSessionless`:
- Layer 1: `loadPersistedPlanPath()` -- this returns the path that was persisted during the session. **This works correctly** because `endSession()` does NOT clear the persisted path (only `beginSession()` does).
- So the plan resolves from cache. Good.

**However**, there is a subtle ordering concern: `extension.ts` calls `setSessionActive(false)` BEFORE `endSession()`. Between these two calls, `_sendUpdate()` runs (inside `setSessionActive`), which posts a UI update with the old session state. After the plan's fix #3 (ready triggers `onFileChanged()`), this ordering doesn't cause a problem because the ready handler only fires on panel creation, not on `setSessionActive`. So this is fine.

---

## Check 5: Are there other places that should also reset `_sessionDataResolved`?

**One place to consider: `dispose()`.**

Currently `dispose()` calls `stopWatching()` and disposes the panel, but does not reset `_sessionDataResolved`. If the panel is disposed and recreated (unlikely in normal flow but possible), the flag could be stale. Since `dispose()` destroys the object, this is a non-issue in practice.

**No other places need the reset.** The flag is correctly reset in `beginSession()` (line 119) and the plan adds a reset in `endSession()`. These are the only two session lifecycle transitions.

---

## Check 6: Documentation updates needed?

The plan does not mention documentation updates. Given that this is an internal bug fix with no user-facing API change:
- **ARCHITECTURE.md**: If it documents the 4-layer pipeline or session lifecycle, the `endSession` behavior change should be noted. (Need to check.)
- **Inline comments**: The `endSession()` method should have a comment explaining why `_sessionDataResolved` is reset but `_trackedFiles` is not.
- **ADR**: Not needed -- this is a bug fix, not an architectural decision.

---

## Summary of Gaps

### Important (should fix before implementation)

1. **Clarify `candidate.mtimeMs` vs `stats.birthtimeMs` in fix #1.** The plan's proposed code change uses `candidate.mtimeMs` which comes from `findAllPlanFiles`, not from `statFile`. The `statFile` type does not include `mtimeMs`. The plan should be explicit that the implementer must use the `candidate` object for `mtimeMs`, not the `stats` object. Consider updating `statFile` to also return `mtimeMs` for consistency, or add a comment explaining the two different data sources.

2. **Add inline comment in `endSession()` explaining the reset.** The plan says "Do NOT clear `_trackedFiles`" but doesn't say to document WHY `_sessionDataResolved` IS cleared. A one-line comment prevents future confusion.

### Suggestions (nice to have)

3. **Acknowledge the "file not modified during session" edge case.** The plan should note that a plan file created before the session and never modified during it will not be tracked. This is correct behavior but should be documented as intentional.

4. **The plan numbers two sections as "### 2".** Fix #2 and fix #3 are both numbered "### 2". The third fix should be "### 3".

5. **Layer 3 appears to be missing from `_resolveSessionless`.** The code goes from Layer 2 to Layer 4 (line 245 says "Layer 4: mtimeMs fallback"). This is pre-existing and not caused by the plan, but if this was intentional (Layer 3 removed), a comment would help.
