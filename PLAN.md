# Plan: Show Improvement Content in Self-Improvement Panel

## Context

Issue #85 requests the self-improvement tab show "actual improvement content that could be talked about" instead of just implementation phases with retry count and spent time.

**Current state:** Table displays Phase | Title | Retries | Duration | Status
**Available but hidden:** `failReason?: string` and `summary?: string` fields on Lesson type

The `summary` field contains one-sentence learnings (30-100 chars) like "Learned that caching improves performance by 50%". The `failReason` field contains short enum values (verification_failed, trapped_tool_calls) when retries > 0.

## Approach

Add inline Summary column to the table. This is simpler than expandable rows and directly surfaces discussable content without requiring clicks.

- Summary column shows the one-sentence learning
- Empty summary shows "—" (em-dash)
- failReason shown as title tooltip on Retries cell when present

## Implementation

### Phase 1: Add Summary Column to HTML

**File:** `src/views/selfImprovementHtml.ts`

1. Add "Summary" header after "Status" column (line 124)
2. Modify row rendering to include summary cell with em-dash fallback (lines 20-28)
3. Add title attribute to Retries cell when failReason present (hover tooltip)
4. Add CSS for summary column styling (narrower other columns, summary takes remaining width)

### Phase 2: Update Tests

**File:** `src/test/unit/views/selfImprovementHtml.test.ts`

1. Add test data with `failReason` and `summary` fields
2. Add test: summary column renders when present
3. Add test: em-dash renders when summary absent
4. Add test: failReason appears as title attribute on retries cell

### Phase 3: Verification

1. `npm run lint` - fix all
2. `npm test` - fix all
3. `/visual-verification` - verify table layout with summary column

### Phase 4: Close Issue

```bash
gh issue close 85 --repo chmc/oxveil
```

## Critical Files

- `src/views/selfImprovementHtml.ts` - main changes
- `src/test/unit/views/selfImprovementHtml.test.ts` - test updates
- `src/types.ts` - Lesson interface (no changes needed, fields exist)

## Acceptance Criteria

- Summary column visible in self-improvement panel
- Lessons with summary show the text
- Lessons without summary show "—"
- Retries cell shows failReason on hover when present
- All existing tests pass
- Visual verification confirms layout
