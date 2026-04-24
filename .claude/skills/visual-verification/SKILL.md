---
name: visual-verification
description: Visual verification loop for Oxveil UI — build, launch, screenshot, analyze, fix, repeat. macOS only. Invoke after completing UI-facing features or at milestone boundaries.
---

# Visual Verification Loop

## Constraints

- macOS only. Requires osascript (Accessibility permission) and screencapture (Screen Recording permission).
- NEVER use `screencapture -w` (blocks in automation). Use `-l <CGWindowID>` or `-R x,y,w,h -x`.
- **ALWAYS capture videos for state transitions and workflows.** Screenshots show static states; videos capture timing, animations, and transitions. Use `screencapture -v -l <CGWindowID>` for video (30s default, or `-V <seconds>` for custom duration). Save to `videos/NN-description.mov`.
- Screenshot failure is blocking. Stop and tell the user: "Screenshot capture failed: [error]." Never silently fall back to non-visual checks.
- Do not invoke during TDD cycles. This is a standalone verification activity.
- Do not commit fixes automatically. Log changes in SESSION.md. Developer reviews `git diff` after session.
- All code paths must reach Phase 6 (Cleanup). No exceptions.
- Do not mock `.claudeloop/` if a real session is running (check lock file first).
- Exercise the full workflow path, not static screenshots of a single state.
- Vary plan content every run — different phase counts, titles, descriptions. Use `generate_plan` from recipes.
- Stash or use worktree if uncommitted changes exist — fake_claude `success` triggers auto-commit that captures dirty state.
- NEVER delete `verification-sessions/` or any session subfolder. They are gitignored but kept on disk for developer auditing.

## Self-Implementation Mode

When visual verification runs on Oxveil itself, the main VS Code and EDH share the same workspace root. This causes cross-instance state bleeding: both instances monitor the same `.claudeloop/` directory, fire the same file watcher events, and compete for `.oxveil-mcp`.

**Detection:** Check `package.json` in workspace root. If `"name": "oxveil"`, activate self-implementation mode.

**Isolation:** Use a git worktree at `../oxveil-verify-{timestamp}`. This provides:
- Separate `.claudeloop/` directory (no file watcher cross-talk)
- Separate `.oxveil-mcp` discovery file
- Full verification fidelity (tests actual committed/staged changes)
- Fast setup (~1s)

**WIP handling:** Before creating worktree, stash uncommitted changes. Restore after verification completes. If commit is needed for worktree visibility, use `git stash create` to save state without affecting the working tree.

**Workflow:**
1. Phase 0: Detect self-implementation mode, stash WIP
2. Phase 1: Create worktree, `npm install && npm run build` in worktree, launch EDH with worktree as workspace
3. Phase 6: Remove worktree via `git worktree remove`, restore stash

## When to Invoke

- User asks to visually verify UI.
- After completing a UI-facing feature.
- At milestone boundaries.
- Lightweight mode (skip session folder) for quick spot-checks when explicitly requested.

## Phases

0. **Pre-flight** — Run pre-flight checks from recipes. Platform, permissions, `code` CLI, stale EDH cleanup (via menu click, never keystroke). **Detect self-implementation:** read `package.json` in workspace root — if `"name": "oxveil"`, set `SELF_IMPL=true` and stash uncommitted changes. Verify `oxveil.mcpBridge` is enabled in workspace settings (`.vscode/settings.json`). Create session folder: `verification-sessions/YYYYMMDD-HHMMSS-{title}/screenshots/`. Initialize SESSION.md.
1. **Build & Launch** — **If self-implementation mode:** Create worktree at `../oxveil-verify-{timestamp}` via `git worktree add`, run `npm install && npm run build` in worktree. Launch EDH via `code --extensionDevelopmentPath="$WORKTREE_PATH" "$WORKTREE_PATH"`. **Otherwise:** `npm run build` in current workspace. Launch EDH via `code --extensionDevelopmentPath="$(pwd)"`. Check `mcp__ide__getDiagnostics`. Plan chat automatically uses haiku in EDH (override with `OXVEIL_CLAUDE_MODEL=<model>` if needed). Poll for EDH window (1s intervals, 15s timeout). Wait for `.oxveil-mcp` discovery file to appear (in worktree if self-implementation mode). Maximize viewport: close bottom panel, secondary sidebar, and unwanted editor tabs (Welcome, Settings). Keep primary sidebar visible (Oxveil tree view). Use recipes from references. Screenshot on success.
2. **Interact** — Exercise the full workflow path affected by the implementation. Walk through every user-facing state transition end-to-end. For the standard lifecycle (empty → stale → ready → running → completed), follow the "Full Lifecycle" recipe in the references file. Use the **MCP bridge as the primary interaction method** for sidebar webview buttons (see MCP recipes below). Use osascript only for non-webview interactions (command palette, window management, focus). Cross-check: after each MCP action, verify the state via `get_sidebar_state` AND a screenshot. Log each action to SESSION.md. Wait for UI to settle.
3. **Capture** — Before each capture, verify viewport is maximized (no bottom panel, no secondary sidebar). Re-run maximize recipe if panels reappeared.
   - **Video (for transitions):** `screencapture -v -V 30 -l <CGWindowID> videos/NN-description.mov` — Record state transitions, rapid changes, session execution, plan chat flows. Videos are mandatory for any multi-step workflow.
   - **Screenshot (for static states):** `screencapture -l <CGWindowID> screenshots/NN-description.png` then `sips --resampleWidth 1568` — Capture individual states for quick reference.
4. **Analyze** — `Read` each screenshot. Compare against reference mockups in `docs/mockups/`. Tier 1 checks only (presence, text, gross layout, item count). Log findings to SESSION.md. For text content (output channel), verify programmatically instead. Use `get_sidebar_state` to confirm state matches visual.
5. **Decide** — Critical/bug: fix code, go to Phase 1. Nit: log, continue to Phase 2. All states verified: go to Phase 6. Escalate: 3 iterations on same issue → ask user. 5 total iterations → stop and summarize.
6. **Cleanup** — Close EDH window via process-scoped menu click (never `keystroke` Cmd+W). **If self-implementation mode:** Remove worktree via `git worktree remove $WORKTREE_PATH`, restore stash if created in Phase 0. Remove mock-created files from `.claudeloop/` if created (never delete the directory itself). Remove `.oxveil-mcp` if it remains (from worktree or main repo). Verify no orphan processes. Write final result and completion time to SESSION.md. NEVER delete the `verification-sessions/` folder or any session subfolder — they are gitignored but kept on disk for developer auditing.

## MCP Bridge Interaction

The MCP bridge is the primary method for interacting with sidebar webview buttons. osascript cannot reach webview iframe content.

**Setup:** The bridge starts automatically when `oxveil.mcpBridge` is enabled in workspace settings. After EDH launch, verify `.oxveil-mcp` exists in workspace root.

**Pattern:** Read state via `GET /state`, click buttons via `POST /click`, execute commands via `POST /command`. After every click, poll state to confirm the effect.

**Real DOM clicks:** POST `/click` calls `element.click()` in the webview. This exercises the full click path: DOM event → event handler → postMessage → command execution. The same path as a real user click. Note: `/click` is fire-and-forget; check state after to confirm the effect.

**Stale state detection:** GET `/state` includes `lastUpdatedAt` timestamp. After actions, verify timestamp advanced. Fail verification if state timestamp is older than action time.

**Webview input fields:** MCP `/click` handles buttons but cannot type into input fields inside webviews. When verification requires form input (text fields, submit), create a test command (e.g., `oxveil._testAnnotation`) that accepts parameters and exercises the same code path. Invoke via MCP `/command`. This bypasses the UI while still exercising the underlying logic.

See `references/visual-verification-recipes.md` for discovery file parsing, full command reference, and click-and-verify scripts.

## Vision Analysis Tiers

- **Tier 1 (reliable — use screenshots):** Element presence/absence, text content, gross layout, item count, notification visibility.
- **Tier 2 (unreliable — verify via code review):** ThemeColor correctness, spinner animation, pixel alignment, contrast ratios.
- **Not screenshot-verifiable:** Notification deduplication/timing — verify via unit tests. Message format, severity, button labels remain Tier 1.

## References

See `.claude/skills/visual-verification/references/visual-verification-recipes.md` for all scripts, templates, and checklists.
