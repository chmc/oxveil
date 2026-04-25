# AI Parsed Tab in Plan Preview

## Context

After forming a plan using Plan Chat, `ai-parsed-plan.md` is generated at `.claudeloop/ai-parsed-plan.md`. Currently this file is only viewable in the sidebar phase tree or by opening in the editor. Users have no way to see it in Plan Preview alongside Design/Implementation/Plan tabs.

**Problem:** The AI-parsed output is hidden from the Plan Preview panel, requiring users to open the file manually.

**Solution:** Add "AI Parsed" as a fourth top-level tab in Plan Preview that shows when `ai-parsed-plan.md` exists.

Closes chmc/oxveil#68.

## Design

### Type Extension

Add `"ai-parsed"` to the `PlanFileCategory` union type:

**File:** `src/views/planPreviewPanel.ts`
```typescript
export type PlanFileCategory = "design" | "implementation" | "plan" | "ai-parsed";
```

### File Detection

Extend `findAllPlanFiles()` to check for the specific file:

**File:** `src/activateViews.ts`

After collecting directory-based files, add:
```typescript
if (deps.workspaceRoot) {
  const aiParsedPath = path.join(deps.workspaceRoot, ".claudeloop", "ai-parsed-plan.md");
  try {
    const s = await stat(aiParsedPath);
    results.push({ path: aiParsedPath, category: "ai-parsed", mtimeMs: s.mtimeMs });
  } catch {
    // File doesn't exist - skip
  }
}
```

### Tab Label

Add label mapping in `buildTabs()`:

**File:** `src/views/planFileResolver.ts`
```typescript
const labelMap: Record<PlanFileCategory, string> = {
  design: "Design",
  implementation: "Implementation",
  plan: "Plan",
  "ai-parsed": "AI Parsed",
};
```

### Auto-Activate Behavior

No changes needed. Existing `PlanFileResolver.resolve()` auto-switches to new categories when they appear:

```typescript
// Auto-switch: always switch when a new category appears
if (newCategoryAdded) {
  this._activeCategory = newCategoryAdded;
}
```

When `ai-parsed-plan.md` is created, the file watcher triggers a re-scan, detects the new "ai-parsed" category, and auto-switches to the tab.

## Files to Modify

| File | Change |
|------|--------|
| `src/views/planPreviewPanel.ts` | Add `"ai-parsed"` to `PlanFileCategory` type |
| `src/views/planFileResolver.ts` | Add `"ai-parsed": "AI Parsed"` to label map |
| `src/activateViews.ts` | Add file check for `.claudeloop/ai-parsed-plan.md` |
| `src/test/unit/views/planPreviewPanel.tabs.test.ts` | Add tests for new tab |
| `docs/workflow/states.md` | Update `switchTab` message to note new category |
| `docs/qa-sessions/2026-04-23-comprehensive/interactive-elements.md` | Add `ai-parsed` to tab categories |

## Documentation

### docs/workflow/states.md

Update the Plan Preview Messages table to reflect the new category value:

**Before:**
```
| `switchTab` | `{ category: PlanFileCategory }` | `_onTabSwitch()` |
```

**After:** Add note that PlanFileCategory now includes `"ai-parsed"`.

### docs/qa-sessions/2026-04-23-comprehensive/interactive-elements.md

Update the tab-pill selector documentation:

**Before:**
```
| `.tab-pill[data-category]` | click | Switch to category tab (design/implementation/plan) |
```

**After:**
```
| `.tab-pill[data-category]` | click | Switch to category tab (design/implementation/plan/ai-parsed) |
```

## Testing

### Unit Tests

Add to `planPreviewPanel.tabs.test.ts`:

1. **Tab appears when ai-parsed-plan.md exists** - Include ai-parsed file in candidates, verify tab renders
2. **Auto-switch to "AI Parsed" when file is created** - Simulate file creation mid-session, verify active tab switches
3. **Tab disappears when file is deleted** - Remove file from candidates, verify tab gone
4. **Label renders as "AI Parsed"** - Verify label text in buildTabs() output

### Visual Verification

1. Start Plan Preview with no files
2. Create a plan in Plan Chat
3. Run "Form Plan" command
4. Verify "AI Parsed" tab appears and is active
5. Verify content matches `ai-parsed-plan.md`
6. Switch to another tab, verify manual switching works
7. Delete `ai-parsed-plan.md`, verify tab disappears

## Verification

```bash
npm run lint
npm test
```

Then run `/visual-verification` with acceptance criteria:
- "AI Parsed" tab appears after Form Plan
- Tab is auto-activated when first created
- Content displays correctly
- Tab switching works
