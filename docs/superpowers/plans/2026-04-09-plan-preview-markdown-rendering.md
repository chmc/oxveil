# Plan Preview Markdown Rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom markdown renderer in Plan Preview with `marked` for full GFM support (tables, links, emphasis, strikethrough, etc.)

**Architecture:** Swap `renderMarkdownHtml()` and `formatInline()` in `planPreviewHtml.ts` with `marked.parse()` configured for GFM. Add a lightweight `stripUnsafeHtml()` post-processor. Add scoped CSS for new HTML elements `marked` produces. Update tests.

**Tech Stack:** `marked` (npm), TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-04-09-plan-preview-markdown-rendering-design.md`

---

### Task 1: Install `marked`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install marked as production dependency**

Run: `npm install marked`

- [ ] **Step 2: Verify installation**

Run: `npm ls marked`
Expected: `marked@<version>` listed under dependencies

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add marked dependency for markdown rendering"
```

---

### Task 2: Write failing tests for new markdown features

**Files:**
- Modify: `src/test/unit/views/planPreviewHtml.test.ts`

- [ ] **Step 1: Add test for table rendering in phase descriptions**

Add to the `"markdown rendering in phase descriptions"` describe block:

```typescript
it("renders markdown tables as <table>", () => {
  const html = renderPhaseCardsHtml({ ...mdOpts, phases: [
    { number: 1, title: "T", description: "| A | B |\n|---|---|\n| 1 | 2 |", dependencies: [] },
  ]});
  expect(html).toContain("<table");
  expect(html).toContain("<th");
  expect(html).toContain("<td");
});
```

- [ ] **Step 2: Add test for link rendering**

```typescript
it("renders links as <a>", () => {
  const html = renderPhaseCardsHtml({ ...mdOpts, phases: [
    { number: 1, title: "T", description: "See [docs](https://example.com)", dependencies: [] },
  ]});
  expect(html).toContain('<a href="https://example.com"');
  expect(html).toContain("docs</a>");
});
```

- [ ] **Step 3: Add test for emphasis and strikethrough**

```typescript
it("renders emphasis as <em> and strikethrough as <del>", () => {
  const html = renderPhaseCardsHtml({ ...mdOpts, phases: [
    { number: 1, title: "T", description: "*italic* and ~~struck~~", dependencies: [] },
  ]});
  expect(html).toContain("<em>italic</em>");
  expect(html).toContain("<del>struck</del>");
});
```

- [ ] **Step 4: Add test for table rendering in raw markdown fallback**

```typescript
it("renders tables in raw markdown", () => {
  const html = renderPhaseCardsHtml({
    state: "raw-markdown",
    rawMarkdown: "| Col1 | Col2 |\n|------|------|\n| a | b |",
    sessionActive: true,
  });
  expect(html).toContain("<table");
  expect(html).toContain("<th");
});
```

- [ ] **Step 5: Add test for checkbox rendering**

```typescript
it("renders checkboxes as ballot box characters", () => {
  const html = renderPhaseCardsHtml({ ...mdOpts, phases: [
    { number: 1, title: "T", description: "- [ ] unchecked\n- [x] checked", dependencies: [] },
  ]});
  expect(html).toContain("&#9744;");  // empty ballot box
  expect(html).toContain("&#9745;");  // checked ballot box
  expect(html).toContain("unchecked");
  expect(html).toContain("checked");
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/test/unit/views/planPreviewHtml.test.ts`
Expected: 5 new tests FAIL (tables, links, emphasis/strikethrough, checkboxes not rendered by custom parser)

- [ ] **Step 7: Commit**

```bash
git add src/test/unit/views/planPreviewHtml.test.ts
git commit -m "test: add failing tests for GFM markdown features in plan preview"
```

---

### Task 3: Replace `renderMarkdownHtml` and `formatInline` with `marked`

**Files:**
- Modify: `src/views/planPreviewHtml.ts`

- [ ] **Step 1: Add `marked` import and configure**

At top of `src/views/planPreviewHtml.ts`, add after the existing `escapeHtml` import:

```typescript
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });
```

- [ ] **Step 2: Delete `formatInline` function and add `stripUnsafeHtml`**

Delete `formatInline` (lines 92-98) entirely. Add in its place:

```typescript
/** Belt-and-suspenders sanitization — CSP is the real security boundary. */
function stripUnsafeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=/gi, " data-removed=");
}
```

- [ ] **Step 3: Replace `renderMarkdownHtml` with checkbox support**

Replace the `renderMarkdownHtml` function (lines 101-186) with:

```typescript
/** Convert markdown to HTML using marked (GFM). */
function renderMarkdownHtml(raw: string): string {
  // marked does not render checkboxes by default — pre-process them
  const preprocessed = raw.replace(
    /^(\s*[-*])\s+\[ \]\s/gm,
    "$1 &#9744; ",
  ).replace(
    /^(\s*[-*])\s+\[[xX]\]\s/gm,
    "$1 &#9745; ",
  );
  const html = marked.parse(preprocessed, { async: false }) as string;
  return stripUnsafeHtml(html);
}
```

This preserves the old renderer's checkbox → ballot-box behavior. Plan files use `- [ ]` / `- [x]` heavily.

- [ ] **Step 4: Run new tests to verify they pass**

Run: `npx vitest run src/test/unit/views/planPreviewHtml.test.ts`
Expected: The 4 new tests from Task 2 now PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/planPreviewHtml.ts
git commit -m "feat: replace custom markdown parser with marked for GFM support

Resolves chmc/oxveil#8"
```

---

### Task 4: Update existing test assertions for `marked` output

**Files:**
- Modify: `src/test/unit/views/planPreviewHtml.test.ts`

`marked` produces standard HTML without custom classes. Several existing test assertions need updating:

- [ ] **Step 1: Update inline code test**

The test at line 221-226 expects `<code class="md-code">foo.ts</code>`. `marked` produces `<code>foo.ts</code>`.

Change:
```typescript
expect(html).toContain('<code class="md-code">foo.ts</code>');
```
To:
```typescript
expect(html).toContain("<code>foo.ts</code>");
```

Apply this same change to the test at line 237-243 ("renders inline code inside list items").

- [ ] **Step 2: Update fenced code block test**

The test at line 245-252 expects `md-codeblock` class. `marked` produces plain `<pre><code>`.

Change:
```typescript
expect(html).toContain("md-codeblock");
```
To:
```typescript
expect(html).toContain("<pre>");
```

- [ ] **Step 3: Update list item assertions**

`marked` wraps list item content in `<p>` tags in some cases and may include newlines. The tests at lines 228-235 and 254-261 check for exact `<li>item one</li>`. Update to use `toContain` with the text content:

```typescript
// Bullet list test — verify structure and content
expect(html).toContain("<ul");
expect(html).toContain("item one");
expect(html).toContain("item two");
expect(html).toContain("<li>");
```

```typescript
// Ordered list test
expect(html).toContain("<ol");
expect(html).toContain("first");
expect(html).toContain("second");
expect(html).toContain("<li>");
```

- [ ] **Step 4: Update XSS escape test for descriptions**

The test at line 116-123 checks that `<script>alert(1)</script>` in descriptions is escaped. `marked` escapes angle brackets inside paragraph text. The assertion `expect(html).not.toContain("<script>alert")` still holds. Verify this test still passes — no change needed if it does.

Similarly, the raw markdown XSS test at line 290-297 should still pass since `stripUnsafeHtml` removes `<script>` tags.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run src/test/unit/views/planPreviewHtml.test.ts`
Expected: ALL tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/test/unit/views/planPreviewHtml.test.ts
git commit -m "test: update plan preview test assertions for marked output format"
```

---

### Task 5: Add CSS for new HTML elements

**Files:**
- Modify: `src/views/planPreviewHtml.ts` (the `renderPlanPreviewShell` function, CSS section starting at line 297)

- [ ] **Step 1: Add scoped CSS rules**

In the `<style>` block inside `renderPlanPreviewShell`, after the existing `.md-codeblock` rules (around line 306), add:

```css
/* marked output — scoped to content areas */
.phase-desc table, .raw-markdown table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
.phase-desc th, .raw-markdown th, .phase-desc td, .raw-markdown td { border: 1px solid #444; padding: 4px 8px; text-align: left; }
.phase-desc th, .raw-markdown th { background: var(--vscode-sideBar-background, #252526); color: var(--vscode-foreground, #e0e0e0); font-weight: 600; }
.phase-desc em, .raw-markdown em { font-style: italic; }
.phase-desc del, .raw-markdown del { text-decoration: line-through; opacity: 0.7; }
.phase-desc a, .raw-markdown a { color: var(--vscode-textLink-foreground, #569cd6); text-decoration: none; }
.phase-desc a:hover, .raw-markdown a:hover { text-decoration: underline; }
.phase-desc blockquote, .raw-markdown blockquote { border-left: 3px solid #444; padding-left: 12px; margin: 8px 0; color: #888; }
.phase-desc pre, .raw-markdown pre { background: var(--vscode-textCodeBlock-background, #2d2d2d); padding: 8px 12px; border-radius: 4px; font-family: var(--vscode-editor-font-family, 'Menlo', 'Consolas', monospace); font-size: 11px; line-height: 1.4; overflow-x: auto; color: #ccc; white-space: pre; margin: 4px 0; }
.phase-desc code, .raw-markdown code { background: var(--vscode-textCodeBlock-background, #2d2d2d); padding: 1px 4px; border-radius: 3px; font-family: var(--vscode-editor-font-family, 'Menlo', 'Consolas', monospace); font-size: 11px; }
.phase-desc pre code, .raw-markdown pre code { background: none; padding: 0; }
.phase-desc ul, .raw-markdown ul, .phase-desc ol, .raw-markdown ol { margin: 4px 0 4px 20px; font-size: 12px; line-height: 1.6; color: #999; }
.phase-desc p, .raw-markdown p { font-size: 12px; line-height: 1.6; color: #999; margin: 2px 0; }
.phase-desc h1, .phase-desc h2, .phase-desc h3, .phase-desc h4, .phase-desc h5, .phase-desc h6,
.raw-markdown h1, .raw-markdown h2, .raw-markdown h3, .raw-markdown h4, .raw-markdown h5, .raw-markdown h6 { margin: 12px 0 6px 0; color: var(--vscode-foreground, #e0e0e0); }
```

- [ ] **Step 2: Remove old `.md-*` class styles that are no longer produced**

Remove these CSS rules which targeted custom classes from the old renderer (they are no longer generated):
- `.md-heading` and `h2.md-heading`, `h3.md-heading`, `h4.md-heading`
- `.md-text`
- `.md-list`
- `.md-code`
- `.md-codeblock`
- `.phase-desc .md-heading` and `.phase-desc .md-list`

- [ ] **Step 3: Add CSS test for new elements**

In `planPreviewHtml.test.ts`, in the `"renderPlanPreviewShell"` describe block, add:

```typescript
it("contains CSS for markdown table elements", () => {
  const html = renderPlanPreviewShell(nonce, cspSource);
  expect(html).toContain(".phase-desc table");
  expect(html).toContain(".phase-desc th");
  expect(html).toContain(".raw-markdown table");
});
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run src/test/unit/views/planPreviewHtml.test.ts`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/planPreviewHtml.ts src/test/unit/views/planPreviewHtml.test.ts
git commit -m "style: add scoped CSS for marked GFM output in plan preview"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run linter**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Build extension**

Run: `npm run compile` (or the project's build command)
Expected: Clean build, no TypeScript errors

- [ ] **Step 4: Commit any remaining fixes**

If lint or build surfaced issues, fix and commit.

- [ ] **Step 5: Run visual verification**

Invoke `/visual-verification` to confirm tables, links, emphasis, and strikethrough render correctly in Plan Preview.
