# Start Button Click Indication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immediate visual feedback ("Starting..." with spinner) when user clicks the Start button in the sidebar.

**Architecture:** Client-side optimistic UI. Modify the webview click handler to transform the Start button immediately on click, before the state transition completes.

**Tech Stack:** TypeScript (VS Code webview JavaScript)

**Spec:** `docs/superpowers/specs/2026-04-25-start-button-feedback-design.md`

**Issue:** [chmc/oxveil#65](https://github.com/chmc/oxveil/issues/65)

---

## File Structure

- Modify: `src/views/sidebarScript.ts:19-22` (click handler button disable logic)
- Create: `src/test/unit/views/sidebarScript.test.ts` (string-based test for generated script)

---

### Task 1: Add Test for Start Button Feedback

**Files:**
- Create: `src/test/unit/views/sidebarScript.test.ts`

- [ ] **Step 1: Create test file with failing test**

`sidebarJs()` returns a JavaScript string. Test that the string contains the start button feedback code:

```typescript
import { describe, it, expect } from "vitest";
import { sidebarJs } from "../../../views/sidebarScript";

describe("sidebarJs", () => {
  it("includes start button feedback transformation", () => {
    const script = sidebarJs();
    
    // Should transform start button to show spinner and Starting... text
    expect(script).toContain('msg.command === "start"');
    expect(script).toContain("Starting...");
    expect(script).toContain("codicon-sync");
    expect(script).toContain("spin");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=sidebarScript`

Expected: FAIL - script doesn't contain start button transformation code

- [ ] **Step 3: Commit failing test**

```bash
git add src/test/unit/views/sidebarScript.test.ts
git commit -m "test(sidebar): add failing test for Start button feedback"
```

---

### Task 2: Implement Start Button Transformation

**Files:**
- Modify: `src/views/sidebarScript.ts:19-22`

- [ ] **Step 1: Update click handler to transform Start button**

Replace lines 19-22 in `sidebarScript.ts`:

```typescript
// Before:
if (btn.tagName === "BUTTON") {
  btn.setAttribute("disabled", "true");
  setTimeout(function() { btn.removeAttribute("disabled"); }, 2000);
}

// After:
if (btn.tagName === "BUTTON") {
  btn.setAttribute("disabled", "true");
  if (msg.command === "start") {
    btn.innerHTML = '<span class="codicon codicon-sync spin"></span> Starting...';
  } else {
    setTimeout(function() { btn.removeAttribute("disabled"); }, 2000);
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=sidebarScript`

Expected: PASS

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: No errors

- [ ] **Step 4: Commit implementation**

```bash
git add src/views/sidebarScript.ts
git commit -m "feat(sidebar): show Starting... with spinner on Start click

Closes #65"
```

---

### Task 3: Visual Verification

**Files:** None (verification only)

- [ ] **Step 1: Run visual verification**

Action: `/visual-verification`

Acceptance criteria:
- Click Start button
- Button immediately shows spinning icon and "Starting..." text
- Button stays disabled
- When running state arrives, Stop button appears normally

- [ ] **Step 2: Commit any fixes if needed**

If visual verification reveals issues, fix and re-verify before proceeding.

---

## Verification Checklist

- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] Visual verification confirms Start button feedback works
- [ ] Issue #65 will close on push
