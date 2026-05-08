# Fix: Plan preview not detecting active Claude Code plans

## Context

Visual verification revealed two issues:
1. **JSONL attachment format**: `extractLastPlanFilePath` checks only `message.content[].input.planFilePath`, misses `attachment.planFilePath`
2. **Priority bug**: Plan Preview shows home dir plan over workspace plan (sidebar shows correct workspace plan)

## Feature

plan-preview

## Architecture Impact

N/A

## ADR

N/A

## State Machine / Sync

N/A

## Tests

```typescript
// src/test/unit/core/planResolver.test.ts
it("extracts planFilePath from attachment format", () => {
  const content = '{"attachment":{"type":"plan_mode","planFilePath":"/path/to/plan.md"}}';
  expect(extractLastPlanFilePath(content)).toBe("/path/to/plan.md");
});
```

## Documentation

N/A

## package.json / contributes

N/A

## CHANGELOG

fix: plan preview detects active Claude Code plan sessions

## README

N/A

---

## Changes

### 1. JSONL parsing (`src/core/planResolver.ts`)

Add attachment format check after message format:

```typescript
// After existing message.content check:
if (parsed?.attachment?.planFilePath) {
  return parsed.attachment.planFilePath;
}
```

### 2. Cache staleness fix (`src/views/planFileResolver.ts`)

**Root cause:** Layer 1 returns cached path if file exists, bypassing mtime comparison. Stale cache from previous session points to home dir plan.

**Fix:** In `_resolveSessionless`, compare cached mtime against newest candidate:

```typescript
// Layer 1: workspaceState cache - but verify it's still newest
const cached = this._deps.loadPersistedPlanPath?.();
if (cached && candidates.length > 0) {
  // Sort candidates by mtime first
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const newest = candidates[0];
  
  // Only use cache if it matches the newest file
  if (cached.planPath === newest.path) {
    return newest;
  }
  // Otherwise, cache is stale - clear it and use newest
  this._deps.persistPlanPath?.(undefined);
}
```

## Verification

1. `npm run lint`
2. `npm test`
3. Visual: Create workspace plan, open Plan Preview, confirm shows workspace plan (not home dir)
