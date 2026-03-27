---
name: visual-verification
description: Visual verification loop for Oxveil UI — build, launch, screenshot, analyze, fix, repeat. macOS only. Invoke after completing UI-facing features or at milestone boundaries.
---

# Visual Verification Loop

## Constraints

- macOS only. Requires osascript (Accessibility permission) and screencapture (Screen Recording permission).
- Do not invoke during TDD cycles. This is a standalone verification activity.
- Do not commit fixes automatically. Log changes in SESSION.md. Developer reviews `git diff` after session.
- All code paths must reach Phase 6 (Cleanup). No exceptions.
- Do not mock `.claudeloop/` if a real session is running (check lock file first).

## When to Invoke

- User asks to visually verify UI.
- After completing a UI-facing feature.
- At milestone boundaries.
- Lightweight mode (skip session folder) for quick spot-checks when explicitly requested.

## Phases

0. **Pre-flight** — Run pre-flight checks from recipes. Platform, permissions, `code` CLI, stale EDH cleanup (via menu click, never keystroke). Create session folder: `verification-sessions/YYYYMMDD-HHMMSS-{title}/screenshots/`. Initialize SESSION.md.
1. **Build & Launch** — `npm run compile`. Check `mcp__ide__getDiagnostics`. Launch EDH via `code --extensionDevelopmentPath="$(pwd)"`. Poll for EDH window (1s intervals, 15s timeout). Screenshot on success.
2. **Interact** — Use osascript to interact with EDH window. Always `set frontmost to true` + AXRaise before any `keystroke`. Use menu clicks for destructive actions (close tab/window). Log each action to SESSION.md. Wait for UI to settle.
3. **Capture** — Screenshot via `screencapture -l <CGWindowID>`. Resize with `sips --resampleWidth 1568`. Save to `screenshots/NN-description.png`.
4. **Analyze** — `Read` each screenshot. Compare against reference mockups in `docs/mockups/`. Tier 1 checks only (presence, text, gross layout, item count). Log findings to SESSION.md. For text content (output channel), verify programmatically instead.
5. **Decide** — Critical/bug: fix code, go to Phase 1. Nit: log, continue to Phase 2. All states verified: go to Phase 6. Escalate: 3 iterations on same issue → ask user. 5 total iterations → stop and summarize.
6. **Cleanup** — Close EDH window via process-scoped menu click (never `keystroke` Cmd+W). Remove mock-created files from `.claudeloop/` if created (never delete the directory itself). Verify no orphan processes. Write final result and completion time to SESSION.md.

## Vision Analysis Tiers

- **Tier 1 (reliable — use screenshots):** Element presence/absence, text content, gross layout, item count, notification visibility.
- **Tier 2 (unreliable — verify via code review):** ThemeColor correctness, spinner animation, pixel alignment, contrast ratios.

## References

See `.claude/skills/visual-verification/references/visual-verification-recipes.md` for all scripts, templates, and checklists.
