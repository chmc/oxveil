# Fix: Remove Chat Sessions Sidebar from Visual Verification

## Context

GitHub issue #82: During visual verification sessions, the "Chat sessions" view from GitHub Copilot Chat extension appears in screenshots, cluttering the viewport. The existing `closeAuxiliaryBar` command in the Maximize Viewport recipe isn't sufficient because:

1. EDH (Extension Development Host) doesn't inherit `.vscode/settings.json` from the Oxveil repo
2. Chat sessions view can appear in either primary or secondary sidebar
3. VS Code may restore window state, reopening sidebars after our close commands

## Approach

Disable Copilot Chat extension in EDH via `--disable-extension` flag. This is the simplest and most robust solution - no timing issues, no settings to inject, works regardless of sidebar placement.

## Implementation

### Phase 1: Update VS Code Launch Command

**File:** `.claude/skills/visual-verification/SKILL.md`

Update the EDH launch commands to disable Copilot Chat:

```bash
# Standard launch (before)
code --extensionDevelopmentPath="$(pwd)"

# Standard launch (after)
code --extensionDevelopmentPath="$(pwd)" --disable-extension GitHub.copilot-chat

# Self-implementation mode (before)
code --extensionDevelopmentPath="$WORKTREE_PATH" "$WORKTREE_PATH"

# Self-implementation mode (after)
code --extensionDevelopmentPath="$WORKTREE_PATH" --disable-extension GitHub.copilot-chat "$WORKTREE_PATH"
```

### Phase 2: Update Recipes Reference

**File:** `.claude/skills/visual-verification/references/visual-verification-recipes.md`

Update all EDH launch recipes to include `--disable-extension GitHub.copilot-chat`.

### Phase 3: Verification

Run `/visual-verification` on Oxveil to confirm:
- Chat sessions sidebar no longer appears in screenshots
- Oxveil sidebar still visible and functional
- No regressions in sidebar state capture

### Phase 4: Close Issue

Close GitHub issue #82 with `gh issue close`.

## Critical Files

- `.claude/skills/visual-verification/SKILL.md` (lines 58, 40-46)
- `.claude/skills/visual-verification/references/visual-verification-recipes.md` (lines 283, 1043)

## Verification

1. Launch EDH with new command
2. Take screenshot - no Chat sessions visible
3. Confirm Oxveil sidebar works normally
4. `/visual-verification` pass
