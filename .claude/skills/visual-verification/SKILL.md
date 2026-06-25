---
name: visual-verification
description: Visual verification loop for Oxveil UI — build, launch, screenshot, analyze, fix, repeat. macOS only. Invoke after completing UI-facing features or at milestone boundaries.
---

# Visual Verification Loop

## Constraints

<BLOCKING-GATE id="visual-verification-critical">

- Screenshot failure is blocking. Stop and tell user: "Screenshot capture failed: [error]."
- Visual verification MUST NOT modify user settings (`workbench.colorTheme`, etc.). Setup operations are limited to viewport prep via `workbench.action.close*`.
- NEVER use `screencapture -w` (blocks in automation). Use `-l <CGWindowID>` or `-R x,y,w,h -x`.
- NEVER delete `verification-sessions/` or any session subfolder.
- All code paths must reach Phase 6 (Cleanup). No exceptions.
- Cleanup MUST verify EDH window closed. Use `close_edh_window` function — never inline osascript.
- **Verification = exercising the fix path.** "Extension loads" is not verification. If you cannot trigger the acceptance criteria behavior, verification FAILED. Report: "FAILED: [criteria] not exercisable. Blocker: [reason]."

</BLOCKING-GATE>

- Black screenshots from `screencapture -x` with valid file size = display asleep, not rendering bug. Fallback to MCP bridge state + filesystem assertions for headless/display-asleep contexts.
- macOS only. Requires osascript (Accessibility permission) and screencapture (Screen Recording permission).
- **ALWAYS capture videos for state transitions and workflows.** Screenshots show static states; videos capture timing, animations, and transitions. Use `screencapture -v -l <CGWindowID>` for video (30s default, or `-V <seconds>` for custom duration). Save to `videos/NN-description.mov`.
- Do not invoke during TDD cycles. This is a standalone verification activity.
- Do not commit fixes automatically. Log changes in SESSION.md. Developer reviews `git diff` after session.
- Do not mock `.claudeloop/` if a real session is running (check lock file first).
- Exercise the full workflow path, not static screenshots of a single state.
- Vary plan content every run — different phase counts, titles, descriptions. Use `generate_plan` from recipes.
- Stash or use worktree if uncommitted changes exist — fake_claude `success` triggers auto-commit that captures dirty state.
- Before claiming "fake_claude not available", you MUST: (1) read `.claude/skills/visual-verification/references/visual-verification-recipes.md` claudeloop section, (2) check `~/source/claudeloop/tests/fake_claude`. Setup is documented; "not in PATH" is not "not available."
- **Claude selection verification:** After starting a session, check first line of `.claudeloop/live.log` before phase execution begins. Real Claude shows `model=claude-*`; fake_claude shows `[FAKE]` prefix. If unexpected, abort immediately. Log choice in SESSION.md: `"Using: fake_claude"` or `"Using: real claude (intentional)"`.

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

## Plan Formatting

When writing plans with numbered phases, VV must be a numbered phase (e.g., `## Phase N: Visual Verification`), not a standalone section at the end. If the plan has no numbered phases, use `## Visual Verification` as a standalone section.

## Phases

0. **Pre-flight** — **First, define acceptance criteria:**
   1. Write to SESSION.md: **Fix description** (one sentence), **Observable behavior** (exact UI state/transition that proves the fix), **Trigger action** (user action or mock sequence that produces it).
   2. **Feasibility check:** Can the trigger action be executed in EDH? If NO → stop, report "FAILED: [criteria] not exercisable. Blocker: [reason]." Do not proceed.
   3. `TaskCreate` with subject `"Verify: [observable behavior]"` — mark completed only when behavior is observed.
      **After TaskCreate:** write session path to workflow-state marker:
      ```bash
      echo "$SESSION_DIR" > "${CLAUDE_PROJECT_DIR:-.}/.claude/workflow-state/verify-session-$TASK_ID"
      ```
      Replace `$TASK_ID` with the numeric ID returned by TaskCreate (e.g. `12`).
      Copy acceptance criteria checkboxes from plan's `## Acceptance Criteria` verbatim into SESSION.md.

   Then: **Legacy fake_claude cleanup:** `if [[ -f ~/.local/bin/claude ]] && grep -q "FAKE_CLAUDE_DIR" ~/.local/bin/claude 2>/dev/null; then rm -f ~/.local/bin/claude; rm -rf ~/.local/bin/lib; fi`. **Stale worktree cleanup:** `git worktree list | grep oxveil-verify | awk '{print $1}' | xargs -I{} git worktree remove --force {} 2>/dev/null`. Run pre-flight checks from recipes. Platform, permissions, `code` CLI, stale EDH cleanup (via menu click, never keystroke). **Detect self-implementation:** read `package.json` in workspace root — if `"name": "oxveil"`, set `SELF_IMPL=true` and stash uncommitted changes. Verify `oxveil.mcpBridge` is enabled in workspace settings (`.vscode/settings.json`). Create session folder: `verification-sessions/YYYYMMDD-HHMMSS-{title}/screenshots/`. Initialize SESSION.md.
1. **Build & Launch** — **If self-implementation mode:** Create worktree at `../oxveil-verify-{timestamp}` via `git worktree add`, run `npm install && npm run build` in worktree. Launch EDH via `code --extensionDevelopmentPath="$WORKTREE_PATH" --disable-extension GitHub.copilot-chat "$WORKTREE_PATH"`. **Otherwise:** `npm run build` in current workspace. Launch EDH via `code --extensionDevelopmentPath="$(pwd)" --disable-extension GitHub.copilot-chat`. Check `mcp__ide__getDiagnostics`. Plan chat automatically uses haiku in EDH (override with `OXVEIL_CLAUDE_MODEL=<model>` if needed). Poll for EDH window (1s intervals, 15s timeout). Wait for `.oxveil-mcp` discovery file to appear (in worktree if self-implementation mode). **Maximize viewport (BLOCKING GATE):** Run the maximize recipe from `references/visual-verification-recipes.md` — close bottom panel, secondary sidebar, and unwanted editor tabs (Welcome, Settings). Keep primary sidebar visible (Oxveil tree view). This step MUST succeed before proceeding to Phase 2. Screenshot on success.
2. **Interact** — Exercise the full workflow path affected by the implementation. Walk through every user-facing state transition end-to-end. For the standard lifecycle (empty → stale → ready → running → completed), follow the "Full Lifecycle" recipe in the references file. Use the **MCP bridge as the primary interaction method** for sidebar webview buttons (see MCP recipes below).
   - **Terminal input:** Use `type_in_plan_chat()` (MCP `sendSequence` via `oxveil.focusPlanChat`) — see recipes. osascript `keystroke` is unreliable for VS Code terminals.
   - **Waiting for AI output:** Use `wait_for_plan_file()` to poll for plan files — see recipes. Default 120s timeout.
   Use osascript only for non-webview interactions (command palette, window management, focus). Cross-check: after each MCP action, verify the state via `get_sidebar_state` AND a screenshot. Log each action to SESSION.md. Wait for UI to settle.
3. **Capture** — **BLOCKING GATE: Maximize viewport is a mandatory prerequisite for every capture.** MUST run the maximize recipe from `references/visual-verification-recipes.md` before EVERY screenshot or video capture. If panels have reappeared since Phase 1, re-run the full maximize recipe before capturing. Do not capture with bottom panel or secondary sidebar visible — captures taken without maximizing are invalid and must be discarded.
   - **Video (for transitions):** `screencapture -v -V 30 -l <CGWindowID> videos/NN-description.mov` — Record state transitions, rapid changes, session execution, plan chat flows. Videos are mandatory for any multi-step workflow.
   - **Screenshot (for static states):** `screencapture -l <CGWindowID> screenshots/NN-description.png` then `sips --resampleWidth 1568` — Capture individual states for quick reference.
4. **Analyze** — `Read` each screenshot. Compare against reference mockups in `docs/mockups/`. Tier 1 checks only (presence, text, gross layout, item count). Log findings to SESSION.md. For text content (output channel), verify programmatically instead. Use `get_sidebar_state` to confirm state matches visual.
5. **Decide** — **Harness fidelity gate (run first):** If plan declares `## Harness Requirements: [needs-real-session]`, query `GET /state` and check `sessions.length >= 1`. If `sessions.length === 0` → FAILED: "Harness fidelity: [needs-real-session] but MCP reports sessions.length=0. Re-run in a workspace with a real session or create the session as step 1 of the scenario." Do NOT mark any criteria PASS until this gate passes. **Then claim success:** Re-read SESSION.md acceptance criteria. Did you observe the specific behavior stated? If not → FAILED, regardless of other observations. Mark the verification task complete only if yes. Then: Critical/bug: fix code, go to Phase 1. Nit: log, continue to Phase 2. All states verified: go to Phase 6. Escalate: 3 iterations on same issue → ask user. 5 total iterations → stop and summarize.
6. **Cleanup** — Close EDH window via `close_edh_window` function (see recipes): dismisses modal sheets by clicking Cancel/Don't Save button directly (Escape does not work on VS Code sheets), then AXPress close button, then verifies no EDH windows remain. Never use `keystroke` Cmd+W or inline osascript. **If self-implementation mode:** Remove worktree via `git worktree remove $WORKTREE_PATH`, restore stash if created in Phase 0. Remove mock-created files from `.claudeloop/` if created (never delete the directory itself). Remove `.oxveil-mcp` if it remains (from worktree or main repo). Verify no orphan processes. Write final result and completion time to SESSION.md. NEVER delete the `verification-sessions/` folder or any session subfolder — they are gitignored but kept on disk for developer auditing. **Write session path to marker:** `echo "$SESSION_DIR" > .claude/workflow-state/visual-verified` (not `touch` — path is required for gate validation).

## Setup vs Verification Boundary

**Setup (acceptable shortcuts):** file writes, env vars, build, EDH launch, MCP `/command` `[SETUP]` for viewport prep, `GET /state` for assertions.

**Verification (must mirror real user interactions):**
- Sidebar buttons → MCP `/click` (real DOM `MouseEvent`, same path as physical click)
- Activity bar navigation → `click_activity_bar_icon()` (see recipes)
- Text input → `type_in_terminal_gui()` after clicking to focus (see recipes)
- QuickPick → `click_quickpick_item()` (see recipes)

**MCP `/command` is a shortcut** — calls `vscode.commands.executeCommand()` directly, bypasses UI. Allowed only for `[SETUP]` tagged operations (viewport prep, cleanup). Never use for verification-path interactions.

**MCP `/click` is legitimate** — calls `element.dispatchEvent(new MouseEvent(...))`. Same event chain as physical click: DOM event → handler → postMessage → command.

## MCP Bridge Interaction

The MCP bridge is the primary method for interacting with sidebar webview buttons. osascript cannot reach webview iframe content.

**Setup:** The bridge starts automatically when `oxveil.mcpBridge` is enabled in workspace settings. After EDH launch, verify `.oxveil-mcp` exists in workspace root.

**Pattern:** Read state via `GET /state`, click buttons via `POST /click`. After every click, poll state to confirm the effect.

**Real DOM clicks:** POST `/click` calls `element.click()` in the webview. This exercises the full click path: DOM event → event handler → postMessage → command execution. The same path as a real user click. Note: `/click` is fire-and-forget; check state after to confirm the effect.

**Stale state detection:** GET `/state` includes `lastUpdatedAt` timestamp. After actions, verify timestamp advanced. Fail verification if state timestamp is older than action time.

**Webview input fields:** MCP `/click` handles buttons but cannot type into input fields inside webviews. When verification requires form input (text fields, submit), create a test command (e.g., `oxveil._testAnnotation`) that accepts parameters and exercises the same code path. Invoke via MCP `/command`. This bypasses the UI while still exercising the underlying logic.

**Webview scroll limitation:** VS Code webview iframes reject external synthetic scroll events (CGEvent, cliclick, osascript). `scrollTop` behavior only testable via injected JS within the webview or unit tests mocking DOM — MCP `/click` and `/scroll` cannot interact with webview scroll position.

See `references/visual-verification-recipes.md` for discovery file parsing, full command reference, and click-and-verify scripts.

## Perception-Reasoning-Action Loop (Mandatory)

**After EVERY screenshot capture, you MUST complete this loop before taking any further action:**

1. **Analyze**: What does this screenshot actually show? Describe it.
2. **Understand**: Does this match what I expected to see? If not, why?
3. **Decide**: Based on this understanding, what should my next action be?

**Never proceed with a pre-planned action if your observation contradicts expectations.** Adapt based on what you actually see.

**Wrong sidebar detection**: If you're verifying Oxveil UI but your screenshot shows:
- "CHAT" header, "SESSIONS" section, conversation history → You captured **Copilot Chat**, not Oxveil
- File tree with folders → You captured **Explorer**, not Oxveil
- Git changes list → You captured **Source Control**, not Oxveil

**Oxveil sidebar contains**: plan phases with status indicators, Start/Resume/Dismiss buttons, self-improvement status badge, session info (elapsed, cost, todos), archives section. In empty state: "Describe what to build" input.

**If wrong sidebar captured**:
1. Do NOT proceed with verification
2. Focus Oxveil sidebar: Command Palette → "View: Show Oxveil" or click Oxveil activity bar icon
3. Re-capture screenshot
4. Re-run perception-reasoning-action loop

## Screenshot Readability Loop

After each screenshot capture, **verify the target UI element is actually readable** in the image:

1. Read the screenshot
2. Check: Can you see and read the specific text/element being verified?
3. **If not readable** (too small, cropped out, obscured):
   - Zoom: Focus the specific panel/area, close other panels
   - Crop: Use `-R x,y,w,h` to capture just the target region
   - Resize window: Make the target panel larger before capture
   - Higher DPI: Capture at native resolution without `sips` downscaling
4. **Retry capture** with adjusted approach
5. Repeat until the acceptance criteria are visually confirmable
6. **Only fail** after 3 attempts with different capture strategies

**Never** substitute MCP state JSON for visual verification. Data existing is not the same as UI rendering correctly. The goal is evidence a user can see the feature.

Example: Verifying 10px sub-step text requires either:
- Cropped capture of just the sidebar
- Full-resolution capture without downscaling
- Zoomed screenshot where text is readable

**Sidebar vs Editor Area:** The sidebar webview and editor panels (like Live Run) are DIFFERENT components. When verifying sidebar content:
- The primary sidebar is on the left (or right if user moved it)
- Capture the window region that includes the sidebar, not just the editor area
- If the sidebar isn't in your capture, adjust the capture region to include it
- Do not confuse the Live Run panel (editor tab) with the sidebar webview

**Troubleshooting order:** When expected UI is missing from a screenshot, diagnose capture issues before code issues:
1. Verify you captured the correct panel/region (sidebar vs editor, correct window)
2. Retry with different capture strategies (zoom, crop, different coordinates)
3. Only after confirming the capture is correct and the element is still missing, investigate as a code bug

## Vision Analysis Tiers

- **Tier 1 (reliable — use screenshots):** Element presence/absence, text content, gross layout, item count, notification visibility.
- **Tier 2 (unreliable — verify via code review):** ThemeColor correctness, spinner animation, pixel alignment, contrast ratios.
- **Not screenshot-verifiable:** Notification deduplication/timing — verify via unit tests. Message format, severity, button labels remain Tier 1.

## osascript Patterns

- NEVER `keystroke` via osascript for destructive ops (Cmd+W/Q). `keystroke` targets frontmost app, not `tell process` target. Use `click menu item`.
- Non-destructive keystrokes: `set frontmost to true` + `AXRaise` first.
- Escape does NOT dismiss VS Code AXSheets — click Cancel/Don't Save button directly.
- Merge related operations into single osascript call — separate bash calls introduce timing gaps.

## References

See `.claude/skills/visual-verification/references/visual-verification-recipes.md` for all scripts, templates, and checklists.
