# fix: Plan Preview sticky bottom action bar (#16)

## Context

The Plan Preview webview renders header, tabs, and action buttons ("Form Claudeloop Plan", "Add note") inside `#plan-content`, which gets its `innerHTML` replaced on every `postMessage` update. All content scrolls together, so action buttons disappear on scroll.

**Root cause:** `#plan-content` and `body` have no flex layout. The dynamic HTML produces distinct sections (`.preview-header`, `.tab-strip`, `.preview-content`) but they all flow vertically with no height constraint.

## Approach: CSS-only layout fix

Make `#plan-content` a flex column. The dynamic HTML already produces distinct sections in predictable order. Move action buttons into a new `.action-bar` div appended after `.preview-content`. CSS flexbox handles the three-zone layout.

**No protocol change.** `postMessage` stays `{ type: "update", html: string }`. `renderPhaseCardsHtml` stays returning `string`. Panel tests stay untouched.

```
#plan-content (flex column, height: 100%)
  ├── .preview-header          flex-shrink: 0  (title, badges)
  ├── .tab-strip               flex-shrink: 0  (tabs, when 2+)
  ├── .session-ended-banner    flex-shrink: 0  (when ended)
  ├── .preview-content         flex: 1, overflow-y: auto, min-height: 0
  └── .action-bar              flex-shrink: 0  (Form Plan + Add note)
```

## Files to modify

| File | Scope |
|------|-------|
| `src/views/planPreviewHtml.ts` | Shell CSS + dynamic HTML restructuring |
| `src/test/unit/views/planPreviewHtml.test.ts` | Add action-bar tests, verify existing pass |

No changes needed to `planPreviewPanel.ts` or panel test files.

## Phase 1: Shell CSS changes

**File:** `src/views/planPreviewHtml.ts` — `renderPlanPreviewShell()` CSS block

1. Add `html { height: 100%; }` (not `100vh` — safer in VS Code webview iframes)
2. Add to `body`: `height: 100%;`
3. Add `#plan-content { display: flex; flex-direction: column; height: 100%; }`
4. Update `.preview-content`: keep `padding: 16px;`, change to `flex: 1; overflow-y: auto; min-height: 0;` (`min-height: 0` is critical — without it, flex items refuse to shrink below content size and push the action bar offscreen)
5. Add `.action-bar { flex-shrink: 0; display: flex; gap: 8px; justify-content: flex-end; padding: 10px 16px; border-top: 1px solid var(--vscode-panel-border, #333); background: var(--vscode-sideBar-background, #252526); }`
6. `.form-plan-btn`: remove `margin-left: auto` (no longer needed in action bar context)

## Phase 2: Move buttons into `.action-bar`

**File:** `src/views/planPreviewHtml.ts` — `renderPhaseCardsHtml()` + `renderHeader()`

1. **Remove** "Form Claudeloop Plan" button from `renderHeader()` (lines 58-60). The function only outputs title, badges, tabs.

2. Build `.action-bar` HTML per state in `renderPhaseCardsHtml()`:
   - `empty` → no action bar (empty string)
   - `raw-markdown` + `sessionActive` → `<div class="action-bar">[Add note btn][Form Plan btn if showFormButton]</div>`
   - `raw-markdown` + `!sessionActive` → `<div class="action-bar">[Form Plan btn if showFormButton]</div>` (or no bar if no buttons)
   - `active` → `<div class="action-bar">[Form Plan btn if showFormButton]</div>`
   - `session-ended` → `<div class="action-bar">[Form Plan btn if showFormButton]</div>` (no Add note — annotations disabled)

3. **Remove** the raw-markdown "Add note" button from inside `.preview-content` (line 136). It now lives in `.action-bar`.

4. Append the action bar HTML after the `.preview-content` div in each return statement.

5. Per-phase "Note" buttons stay inside their phase cards (contextual, not global).

## Phase 3: Fix annotation binding for action-bar button

**File:** `src/views/planPreviewHtml.ts` — inline script `bindAnnotationButtons()`

The "Add note" button (`data-phase="plan"`) now lives in `.action-bar` instead of `.preview-content`. The current binding logic at line 288:
```js
var card = this.closest(".phase-card") || this.closest(".preview-content");
```
This would return `null` for the action-bar button, silently breaking annotations.

**Fix:** Add `.action-bar` to the fallback chain:
```js
var card = this.closest(".phase-card") || this.closest(".preview-content") || this.closest(".action-bar");
```

The annotation input will appear inside the action bar — reasonable UX since the user clicked there.

## Phase 4: Update tests

**File:** `src/test/unit/views/planPreviewHtml.test.ts`

1. Add tests for `.action-bar`:
   - Present with Form Plan button when `showFormButton: true` (active state)
   - Present with Add note button in raw-markdown + sessionActive
   - Absent in empty state
   - Form Plan button no longer in `.preview-header`
2. Existing tests should pass unchanged (they use `toContain()` on the full HTML string; buttons still exist in output, just in a different location)
3. If any test asserts button is inside header specifically, update it

## Phase 5: Verify

1. `npm run lint` + `npm test`
2. `/visual-verification`:
   - Form Plan button visible at bottom during scroll
   - Phase tabs stay at top
   - Short content: action bar at bottom, no extra whitespace
   - Empty state: no action bar
   - Raw-markdown: Add note + Form Plan in bottom bar
   - Annotation input appears in action bar when clicking Add note
