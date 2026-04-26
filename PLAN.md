# Plan: Show AI-Parsed Plan Tab in Plan Preview

**Issue**: [#68](https://github.com/chmc/oxveil/issues/68)

## Context

When a user creates an AI-parsed plan during a Plan Chat session, the tab for comparing it with the source file doesn't appear. The user expects to see both "Source" and "AI Parsed" tabs to compare the original plan with the parsed version.

**Root Cause**: Session filtering in `_resolveWithSession()` (line 120-121) excludes pre-existing source files when they weren't modified during the session. When only the new ai-parsed file is tracked, `buildTabs()` returns undefined (requires 2+ tracked files).

## Phase 1: Modify Session Filtering Logic

**File**: `src/views/planFileResolver.ts`

**Change**: When ai-parsed exists in candidates, allow source files to be tracked even if they predate the session. This enables the comparison use case.

At lines 120-121, change:
```typescript
if (stats.birthtimeMs <= this._sessionStartTime! && stats.mtimeMs <= this._sessionStartTime!)
  continue;
```

To:
```typescript
const isStale = stats.birthtimeMs <= this._sessionStartTime! && stats.mtimeMs <= this._sessionStartTime!;
const aiParsedInCandidates = candidates.some(c => c.category === "ai-parsed");
if (isStale && !aiParsedInCandidates) continue;
```

**Rationale**: 
- Preserves session filtering when no ai-parsed is involved (normal behavior)
- Enables source file tracking when ai-parsed exists (comparison scenario)
- Minimal change, no architectural changes needed

## Phase 2: Add Test Coverage

**File**: `src/test/unit/views/planPreviewPanel.tabs.aiParsed.test.ts`

Add test case:
```typescript
it("should show tabs when ai-parsed created with pre-existing source file", async () => {
  // Setup: design file exists BEFORE session (birthtimeMs < sessionStartTime)
  // Action: session starts, ai-parsed created
  // Assert: both tabs visible (design + ai-parsed)
});
```

## Phase 3: Verify Existing Tests Pass

Run `npm test` to ensure existing session filtering tests still pass. The change should not affect scenarios without ai-parsed files.

## Verification

1. `npm run lint` - no lint errors
2. `npm test` - all tests pass including new test
3. `/visual-verification` with acceptance criteria:
   - Start Plan Chat with pre-existing design file in `docs/superpowers/specs/`
   - Run Form Plan to create ai-parsed plan
   - Plan Preview shows tab strip with both "Design" and "AI Parsed" tabs
   - Clicking tabs switches between source and parsed content
   - Auto-switch to "AI Parsed" tab when file is created

## Critical Files

- `src/views/planFileResolver.ts:120-121` - session filtering logic
- `src/test/unit/views/planPreviewPanel.tabs.aiParsed.test.ts` - test coverage
- `src/test/unit/views/planPreviewPanel.helpers.ts` - test helpers (may need update)
