# Plan Preview: Render Markdown (Tables, Lists, Formatting)

**Issue:** [chmc/oxveil#8](https://github.com/chmc/oxveil/issues/8)
**Date:** 2026-04-09

## Problem

The Plan Preview panel displays raw markdown instead of rendered HTML. Tables appear as pipe-delimited text, headings render without proper formatting, and several markdown constructs (emphasis, links, strikethrough) are unsupported.

The root cause is a hand-rolled line-based markdown parser in `planPreviewHtml.ts` (`renderMarkdownHtml`, lines 101-186) that only handles a subset of markdown: headings, lists, checkboxes, fenced code blocks, bold, and inline code. Tables require multi-line parsing that this approach cannot support cleanly.

## Decision

Replace the custom `renderMarkdownHtml()` and `formatInline()` with the `marked` library, configured for GitHub Flavored Markdown (GFM).

**Why `marked`:**
- ~40KB minified, zero dependencies
- GFM tables built-in (no plugins needed)
- Synchronous API — drop-in replacement
- Widely adopted (33k+ GitHub stars)

**Rejected alternatives:**
- `markdown-it`: Larger (~100KB), plugin ecosystem we don't need
- Extending custom renderer: High complexity for tables, ongoing maintenance burden

## Design

### Rendering pipeline (unchanged)

```
Plan file → parsers → renderMarkdownHtml(raw) → HTML string → postMessage → webview
```

The rendering stays in the extension host. The webview shell, CSP policy, message protocol, and plan parsing layer are unaffected.

### Changes

#### 1. New dependency

```
npm install marked
```

Production dependency. `@types/marked` ships with the package (built-in types since v4).

#### 2. Replace `renderMarkdownHtml` in `planPreviewHtml.ts`

Delete:
- `formatInline()` (lines 92-98)
- `renderMarkdownHtml()` (lines 101-186)

Replace with:

```typescript
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

function renderMarkdownHtml(raw: string): string {
  const html = marked.parse(raw, { async: false }) as string;
  return stripUnsafeHtml(html);
}
```

The function signature stays the same — callers at line 70 and line 212 are unaffected.

#### 3. Sanitization: `stripUnsafeHtml`

Lightweight defense-in-depth (CSP is the real security boundary):

```typescript
function stripUnsafeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=/gi, " data-removed=");
}
```

Plan files are local (user's `~/.claude/plans/` and workspace docs). The webview CSP already blocks inline scripts via nonce requirement. This strip is belt-and-suspenders.

#### 4. CSS additions in `renderPlanPreviewShell`

Add styles for elements `marked` produces that the custom renderer never did:

```css
/* Tables */
table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
th, td { border: 1px solid #444; padding: 4px 8px; text-align: left; }
th { background: var(--vscode-sideBar-background, #252526); color: var(--vscode-foreground, #e0e0e0); font-weight: 600; }

/* Inline formatting */
em { font-style: italic; }
del { text-decoration: line-through; opacity: 0.7; }
a { color: var(--vscode-textLink-foreground, #569cd6); text-decoration: none; }
a:hover { text-decoration: underline; }
blockquote { border-left: 3px solid #444; padding-left: 12px; margin: 8px 0; color: #888; }

/* marked uses <pre><code> like the custom renderer */
pre { background: var(--vscode-textCodeBlock-background, #2d2d2d); padding: 8px 12px; border-radius: 4px; font-size: 11px; line-height: 1.4; overflow-x: auto; color: #ccc; margin: 4px 0; }
code { background: var(--vscode-textCodeBlock-background, #2d2d2d); padding: 1px 4px; border-radius: 3px; font-family: var(--vscode-editor-font-family, 'Menlo', 'Consolas', monospace); font-size: 11px; }
pre code { background: none; padding: 0; }
```

Scope these under `.phase-desc` and `.raw-markdown` to avoid leaking into header/tab/annotation UI. Example: `.phase-desc table { ... }`, `.raw-markdown table { ... }`, etc.

#### 5. Keep `escapeHtml` import

`planPreviewHtml.ts` imports `escapeHtml` from `utils/html.ts`. The deleted functions used it, but it's also used by `renderHeader`, `renderPhaseCard`, `formatLabel`, etc. Keep the import — just remove it from the deleted code paths.

#### 6. Update tests

`planPreviewHtml.test.ts` assertions will change because output shifts from custom class-based HTML (`<h2 class="md-heading">`, `<ul class="md-list">`) to standard `marked` output (`<h2>`, `<ul>`). Update assertions to match new output while preserving the same coverage:
- Headings render as `<h1>`–`<h6>`
- Lists render as `<ul>/<ol>` with `<li>`
- Code blocks render as `<pre><code>`
- **New tests:** tables, links, emphasis, strikethrough, blockquotes

### What doesn't change

- Webview shell HTML structure and CSP
- `postMessage` communication protocol
- Plan file discovery and watching (`activateViews.ts`)
- Plan parsing (`parsePlanWithDescriptions`, `parsePlan`, `parseSections`)
- Phase card structure and layout
- Annotation UI
- Tab switching

## Verification

1. `npm run lint` — no errors
2. `npm test` — all tests pass (updated assertions)
3. Manual: open a plan file with tables, links, emphasis, strikethrough → all render correctly in Plan Preview
4. Manual: verify phase card descriptions also render inline markdown properly
5. Manual: check CSP — no console errors about blocked resources
