# AI Parsed Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "AI Parsed" as a fourth top-level tab in Plan Preview that shows when `.claudeloop/ai-parsed-plan.md` exists.

**Architecture:** Extend existing `PlanFileCategory` type with `"ai-parsed"`, add specific file check in `findAllPlanFiles()`, and update label map. Auto-activate leverages existing resolver logic.

**Tech Stack:** TypeScript, VS Code Extension API, Vitest

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/views/planPreviewPanel.ts` | Type definition for `PlanFileCategory` |
| `src/views/planFileResolver.ts` | Tab label mapping |
| `src/activateViews.ts` | File detection for ai-parsed-plan.md |
| `src/test/unit/views/planPreviewPanel.tabs.test.ts` | Tab behavior tests |
| `docs/workflow/states.md` | Workflow documentation |
| `docs/qa-sessions/2026-04-23-comprehensive/interactive-elements.md` | QA element docs |

---

## Task 1: Add Type Definition

**Files:**
- Modify: `src/views/planPreviewPanel.ts:9`

- [ ] **Step 1: Write the failing test**

Add to `src/test/unit/views/planPreviewPanel.tabs.test.ts`:

```typescript
describe("ai-parsed category", () => {
  const AI_PARSED_PATH = "/workspace/.claudeloop/ai-parsed-plan.md";

  it("should render AI Parsed tab when ai-parsed file exists", async () => {
    const deps = createTestDeps();
    const now = Date.now();
    deps.findAllPlanFiles = vi.fn(async () => [
      { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
      { path: AI_PARSED_PATH, category: "ai-parsed" as PlanFileCategory, mtimeMs: now + 100 },
    ]);

    const panel = new PlanPreviewPanel(deps);
    await panel.reveal();
    await flushMicrotasks();

    const html = deps.postMessage.mock.calls[0][0].html;
    expect(html).toContain('data-category="ai-parsed"');
    expect(html).toContain("AI Parsed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run planPreviewPanel.tabs`
Expected: FAIL - Type '"ai-parsed"' is not assignable to type 'PlanFileCategory'

- [ ] **Step 3: Update type definition**

In `src/views/planPreviewPanel.ts` line 9, change:

```typescript
export type PlanFileCategory = "design" | "implementation" | "plan" | "ai-parsed";
```

- [ ] **Step 4: Run test - still fails (missing label)**

Run: `npm test -- --run planPreviewPanel.tabs`
Expected: FAIL - html does not contain "AI Parsed"

---

## Task 2: Add Label Mapping

**Files:**
- Modify: `src/views/planFileResolver.ts:204-208`

- [ ] **Step 1: Update label map**

In `src/views/planFileResolver.ts`, update `buildTabs()`:

```typescript
const labelMap: Record<PlanFileCategory, string> = {
  design: "Design",
  implementation: "Implementation",
  plan: "Plan",
  "ai-parsed": "AI Parsed",
};
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test -- --run planPreviewPanel.tabs`
Expected: PASS

- [ ] **Step 3: Commit type and label changes**

```bash
git add src/views/planPreviewPanel.ts src/views/planFileResolver.ts src/test/unit/views/planPreviewPanel.tabs.test.ts
git commit -m "feat(plan-preview): add ai-parsed category type and label"
```

---

## Task 3: Add File Detection

**Files:**
- Modify: `src/activateViews.ts:100-126`

- [ ] **Step 1: Write integration test**

Add to `src/test/unit/views/planPreviewPanel.tabs.test.ts`:

```typescript
it("should auto-switch to ai-parsed tab when file is created mid-session", async () => {
  const deps = createTestDeps();
  const now = Date.now();
  
  // Initial state: only design file
  deps.findAllPlanFiles = vi.fn(async () => [
    { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
  ]);

  const panel = new PlanPreviewPanel(deps);
  await panel.reveal();
  panel.beginSession();
  await flushMicrotasks();

  // Simulate ai-parsed-plan.md creation
  deps.findAllPlanFiles = vi.fn(async () => [
    { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
    { path: AI_PARSED_PATH, category: "ai-parsed" as PlanFileCategory, mtimeMs: now + 1000 },
  ]);
  deps.statFile = vi.fn(async () => ({ birthtimeMs: now + 500, mtimeMs: now + 1000 }));

  // Trigger file change
  deps.onDidChange?.();
  await flushMicrotasks();

  const lastCall = deps.postMessage.mock.calls.at(-1)[0];
  expect(lastCall.html).toContain('data-category="ai-parsed"');
  expect(lastCall.html).toContain('class="tab-pill active"');
  expect(lastCall.html).toContain("AI Parsed");
});
```

- [ ] **Step 2: Run test to verify behavior**

Run: `npm test -- --run planPreviewPanel.tabs`
Expected: PASS (file detection is mocked, but verifies auto-switch)

- [ ] **Step 3: Add file detection in activateViews.ts**

In `src/activateViews.ts`, after line 124 (after the directory loop), add:

```typescript
// Check for ai-parsed-plan.md specifically
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

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 6: Commit file detection**

```bash
git add src/activateViews.ts src/test/unit/views/planPreviewPanel.tabs.test.ts
git commit -m "feat(plan-preview): detect ai-parsed-plan.md file"
```

---

## Task 4: Add Edge Case Tests

**Files:**
- Modify: `src/test/unit/views/planPreviewPanel.tabs.test.ts`

- [ ] **Step 1: Test tab disappears when file deleted**

```typescript
it("should remove ai-parsed tab when file is deleted", async () => {
  const deps = createTestDeps();
  const now = Date.now();
  
  // Start with ai-parsed file
  deps.findAllPlanFiles = vi.fn(async () => [
    { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
    { path: AI_PARSED_PATH, category: "ai-parsed" as PlanFileCategory, mtimeMs: now + 100 },
  ]);

  const panel = new PlanPreviewPanel(deps);
  await panel.reveal();
  await flushMicrotasks();

  // File deleted - only design remains
  deps.findAllPlanFiles = vi.fn(async () => [
    { path: DESIGN_PATH, category: "design" as PlanFileCategory, mtimeMs: now },
  ]);

  deps.onDidChange?.();
  await flushMicrotasks();

  const lastCall = deps.postMessage.mock.calls.at(-1)[0];
  expect(lastCall.html).not.toContain('data-category="ai-parsed"');
});
```

- [ ] **Step 2: Test ai-parsed tab at startup**

```typescript
it("should show ai-parsed tab when file exists at startup", async () => {
  const deps = createTestDeps();
  const now = Date.now();
  
  deps.findAllPlanFiles = vi.fn(async () => [
    { path: AI_PARSED_PATH, category: "ai-parsed" as PlanFileCategory, mtimeMs: now },
  ]);

  const panel = new PlanPreviewPanel(deps);
  await panel.reveal();
  await flushMicrotasks();

  const html = deps.postMessage.mock.calls[0][0].html;
  // Single file = no tab strip, but content should be from ai-parsed
  expect(panel.getActiveFilePath()).toBe(AI_PARSED_PATH);
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- --run planPreviewPanel.tabs`
Expected: All PASS

- [ ] **Step 4: Commit edge case tests**

```bash
git add src/test/unit/views/planPreviewPanel.tabs.test.ts
git commit -m "test(plan-preview): add edge case tests for ai-parsed tab"
```

---

## Task 5: Update Documentation

**Files:**
- Modify: `docs/workflow/states.md:409`
- Modify: `docs/qa-sessions/2026-04-23-comprehensive/interactive-elements.md:102`

- [ ] **Step 1: Update states.md**

In `docs/workflow/states.md`, find the Plan Preview Messages table and update the switchTab row comment or add a note that PlanFileCategory now includes `"ai-parsed"`.

- [ ] **Step 2: Update interactive-elements.md**

In `docs/qa-sessions/2026-04-23-comprehensive/interactive-elements.md`, line 102, change:

```markdown
| `.tab-pill[data-category]` | click | Switch to category tab (design/implementation/plan/ai-parsed) |
```

- [ ] **Step 3: Commit documentation**

```bash
git add docs/workflow/states.md docs/qa-sessions/2026-04-23-comprehensive/interactive-elements.md
git commit -m "docs: update Plan Preview tab categories for ai-parsed"
```

---

## Task 6: Visual Verification

**Files:** None (verification only)

- [ ] **Step 1: Run visual verification**

Run: `/visual-verification`

Acceptance criteria:
- Start Oxveil in VS Code
- Open Plan Preview panel
- Create a plan using Plan Chat
- Run "Form Plan" command
- Verify "AI Parsed" tab appears in tab strip
- Verify tab is auto-activated (has "active" class)
- Verify content matches `.claudeloop/ai-parsed-plan.md`
- Switch to another tab, verify switching works
- Delete `.claudeloop/ai-parsed-plan.md`, verify tab disappears

- [ ] **Step 2: Final commit if needed**

If visual verification reveals issues, fix and commit.

---

## Summary

| Task | Description | Commit |
|------|-------------|--------|
| 1-2 | Type definition + label mapping | `feat(plan-preview): add ai-parsed category type and label` |
| 3 | File detection | `feat(plan-preview): detect ai-parsed-plan.md file` |
| 4 | Edge case tests | `test(plan-preview): add edge case tests for ai-parsed tab` |
| 5 | Documentation | `docs: update Plan Preview tab categories for ai-parsed` |
| 6 | Visual verification | — |

Closes chmc/oxveil#68.
