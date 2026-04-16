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
- Always exercise the full user-facing workflow path affected by the implementation. Static screenshots of a single state are insufficient — navigate through the complete interaction sequence.
- Vary plan content every run. Never reuse the same fixed plan template. Use different phase counts (2–4), titles, and descriptions each time. This catches parsing bugs, text truncation, and rendering errors that static templates hide. Use the `generate_plan` helper from the recipes.

## When to Invoke

- User asks to visually verify UI.
- After completing a UI-facing feature.
- At milestone boundaries.
- Lightweight mode (skip session folder) for quick spot-checks when explicitly requested.

## Phases

0. **Pre-flight** — Run pre-flight checks from recipes. Platform, permissions, `code` CLI, stale EDH cleanup (via menu click, never keystroke). Verify `oxveil.mcpBridge` is enabled in workspace settings (`.vscode/settings.json`). Create session folder: `verification-sessions/YYYYMMDD-HHMMSS-{title}/screenshots/`. Initialize SESSION.md.
1. **Build & Launch** — `npm run build`. Check `mcp__ide__getDiagnostics`. Launch EDH via `code --extensionDevelopmentPath="$(pwd)"`. Plan chat automatically uses haiku in EDH (override with `OXVEIL_CLAUDE_MODEL=<model>` if needed). Poll for EDH window (1s intervals, 15s timeout). Wait for `.oxveil-mcp` discovery file to appear (confirms MCP bridge is running). Maximize viewport: close bottom panel, secondary sidebar, and unwanted editor tabs (Welcome, Settings). Keep primary sidebar visible (Oxveil tree view). Use recipes from references. Screenshot on success.
2. **Interact** — Exercise the full workflow path affected by the implementation. Walk through every user-facing state transition end-to-end. For the standard lifecycle (empty → stale → ready → running → completed), follow the "Full Lifecycle" recipe in the references file. Use the **MCP bridge as the primary interaction method** for sidebar webview buttons (see MCP recipes below). Use osascript only for non-webview interactions (command palette, window management, focus). Cross-check: after each MCP action, verify the state via `get_sidebar_state` AND a screenshot. Log each action to SESSION.md. Wait for UI to settle.
3. **Capture** — Before each capture, verify viewport is maximized (no bottom panel, no secondary sidebar). Re-run maximize recipe if panels reappeared. Screenshot via `screencapture -l <CGWindowID>`. Resize with `sips --resampleWidth 1568`. Save to `screenshots/NN-description.png`.
4. **Analyze** — `Read` each screenshot. Compare against reference mockups in `docs/mockups/`. Tier 1 checks only (presence, text, gross layout, item count). Log findings to SESSION.md. For text content (output channel), verify programmatically instead. Use `get_sidebar_state` to confirm state matches visual.
5. **Decide** — Critical/bug: fix code, go to Phase 1. Nit: log, continue to Phase 2. All states verified: go to Phase 6. Escalate: 3 iterations on same issue → ask user. 5 total iterations → stop and summarize.
6. **Cleanup** — Close EDH window via process-scoped menu click (never `keystroke` Cmd+W). Remove mock-created files from `.claudeloop/` if created (never delete the directory itself). Remove `.oxveil-mcp` if it remains. Verify no orphan processes. Write final result and completion time to SESSION.md.

## MCP Bridge Interaction

The MCP bridge is the primary method for interacting with sidebar webview buttons. osascript cannot reach webview iframe content.

**Setup:** The bridge starts automatically when `oxveil.mcpBridge` is enabled in workspace settings. After EDH launch, verify `.oxveil-mcp` exists in workspace root.

**Pattern:** Read state via `GET /state`, click buttons via `POST /click`, execute commands via `POST /command`. After every click, poll state to confirm the effect.

See `references/visual-verification-recipes.md` for discovery file parsing, full command reference, and click-and-verify scripts.

## Vision Analysis Tiers

- **Tier 1 (reliable — use screenshots):** Element presence/absence, text content, gross layout, item count, notification visibility.
- **Tier 2 (unreliable — verify via code review):** ThemeColor correctness, spinner animation, pixel alignment, contrast ratios.

## References

See `.claude/skills/visual-verification/references/visual-verification-recipes.md` for all scripts, templates, and checklists.
