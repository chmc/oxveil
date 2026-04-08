# Welcome Screen CTA Redesign

## Problem

The current welcome screen uses "Create a Plan" as its heading and CTA — generic language that doesn't communicate what Oxveil does or invite users to start. Users arrive with an idea (rough or refined) and want to craft it into something real with AI. The entry point should reflect that journey.

## Design

### Copy Changes

All changes are in `src/views/sidebarHtml.ts`, `renderEmpty()` function (lines 107-130).

| Element | Current | New |
|---------|---------|-----|
| Heading | "Create a Plan" | "From Idea to Reality" |
| Subtitle | "Describe your project and let AI draft the phases." | "Tell AI what you're thinking. It'll help you refine it, plan it, and build it." |
| CTA button | "Create Plan" | "Let's Go" |
| Step 1 | "Describe your project to Claude in a chat" | "Tell AI what you're thinking" |
| Step 2 | "Claude drafts a plan with phases" | "Together, shape it into a plan" |
| Step 3 | "Review, configure, and run" | "Review and let AI build it" |

### Unchanged Elements

- Icon (`codicon-comment-discussion`)
- "How it works" section heading
- Secondary buttons ("Write Plan" / "AI Parse")
- All CSS, commands, and structural code

### README Update

Update `README.md` onboarding section (line 119) to match new language. Current step 3 reads "Create or open a plan" — update to reflect the new CTA tone. The sidebar feature description (line 50) mentions "7 states: onboarding, plan ready, live progress..." — this is structural, not copy, so it stays.

Specific README changes:
- Line 39, walkthrough step 3: "Create or open a plan" → "Bring your idea or open an existing plan"
- No other README changes needed — the welcome screen copy is not quoted elsewhere in the README.

## Scope

- **Files modified:** 2 (`src/views/sidebarHtml.ts`, `README.md`)
- **Lines changed:** ~8 string literals
- **Risk:** Zero — copy-only changes, no logic or structure affected

## Verification

1. `npm run lint` — passes clean
2. `npm test` — passes clean (no tests assert on welcome screen copy)
3. Visual verification — launch EDH, confirm sidebar shows new copy in empty state
