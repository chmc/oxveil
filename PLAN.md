# Fix: Plan Preview Shows Stale Plans (#123)

## Feature

| plan-preview | — bug fix for staleness filtering

## Context

After clicking "Form plan", unrelated old plans appear in the sidebar. The bug is in `src/views/planFileResolver.ts` lines 128-130.

**Current code:**
```typescript
const aiParsedInCandidates = candidates.some(c => c.category === "ai-parsed");
if (isStale && !aiParsedInCandidates) continue;
```

**Problem:** When any ai-parsed file exists in candidates, the staleness check is bypassed for ALL candidates — not just the ai-parsed one. This allows old workspace/superpowers plans to appear.

**Intent:** ai-parsed files (claudeloop's plan output) should bypass staleness because they represent the active session's plan. Other categories should still require freshness.

## Fix

Change line 130 from:
```typescript
if (isStale && !aiParsedInCandidates) continue;
```
To:
```typescript
if (isStale && candidate.category !== "ai-parsed") continue;
```

This ensures:
1. ai-parsed files always tracked (they're claudeloop's current plan)
2. Other categories (plan, design, implementation) still require `birthtimeMs > sessionStartTime` OR `mtimeMs > sessionStartTime`

## Files

- `src/views/planFileResolver.ts:130` — single line change
- `src/test/unit/views/planPreviewPanel.tabs.aiParsed.test.ts` — add test case

## Test Gap

Add test: stale workspace `plan` candidate + fresh `ai-parsed` candidate → stale `plan` NOT tracked, fresh `ai-parsed` IS tracked.

## Architecture Impact

N/A - single line bug fix in existing staleness logic.

## ADR

N/A - no architectural decision, fixing implementation bug.

## State Machine / Sync

N/A - no state machine changes, fix is in filtering logic.

## Tests

Add test case in `src/test/unit/views/planPreviewPanel.tabs.aiParsed.test.ts`:
- Stale workspace `plan` + fresh `ai-parsed` → stale `plan` NOT tracked, `ai-parsed` IS tracked

## Documentation

N/A - internal bug fix, no user-facing documentation changes.

## package.json / contributes

N/A - no package.json changes.

## CHANGELOG

Add under `### Fixed`:
- Plan preview no longer shows stale plans when ai-parsed file exists (#123)

## README

N/A - no README changes needed.

## Acceptance Criteria

- [ ] Stale workspace plans not shown when ai-parsed exists
- [ ] Fresh ai-parsed plans still tracked correctly
- [ ] Existing tests pass
- [ ] New test covers the bug scenario

## Verification

1. `npm run lint && npm test`
2. Create stale plan file in `.claude/plans/` with old mtime
3. Start session, click "Form plan" — stale plan should NOT appear
4. `/visual-verification` if UI behavior unclear
5. `gh issue close 123` after merge
