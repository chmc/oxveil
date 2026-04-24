# Plan: Fix Oxveil Self-Implementation (Issue #66)

## Context

**Problem:** When visual verification runs on Oxveil itself, the dev extension's "live run tab" and progress appear in the main VS Code instance. The EDH (Extension Development Host) and main VS Code share the same workspace root, causing:

1. Both instances monitor the same `.claudeloop/` directory via file watchers
2. File watcher events fire in BOTH instances when session state changes
3. Both instances write `.oxveil-mcp` discovery file to the same location
4. UI components (LiveRunPanel, StatusBar, Sidebar) update from cross-instance events

**Solution:** Use git worktree for visual verification when testing Oxveil on itself. This creates a completely isolated workspace with its own `.claudeloop/` directory.

**Why worktree over isolated test workspace:**
- Tests actual committed/staged changes, not synthetic state
- Full verification fidelity
- Already have `superpowers:using-git-worktrees` infrastructure
- Worktree creation is fast (~1s)

## Phase 1: Update Visual Verification Skill

**File:** `.claude/skills/visual-verification/SKILL.md`

**Changes:**
1. Add new section "Self-Implementation Mode" explaining when and how worktree isolation is used
2. Update Phase 0 (Pre-flight) to detect self-implementation scenario
3. Update Phase 1 (Build & Launch) to create worktree and launch EDH in worktree directory
4. Update Phase 6 (Cleanup) to remove worktree

**Detection logic:** If `workspaceRoot` contains `package.json` with `"name": "oxveil"`, activate self-implementation mode.

## Phase 2: Add Worktree Recipes

**File:** `.claude/skills/visual-verification/references/visual-verification-recipes.md`

**Add recipes:**
1. **Self-implementation detection script** - check if current workspace is oxveil
2. **Worktree setup recipe** - create worktree at `../oxveil-verify-{timestamp}`
3. **WIP preservation** - stash/commit uncommitted changes before worktree creation
4. **EDH launch in worktree** - modify launch command to open worktree as workspace
5. **Worktree cleanup recipe** - `git worktree remove` in Phase 6
6. **Bridge path handling** - ensure `.oxveil-mcp` is read from worktree, not main repo

## Phase 3: Update Launch Configuration

**File:** `.vscode/launch.json`

**Add new launch config:**
```json
{
  "name": "Run Extension (Isolated)",
  "type": "extensionHost",
  "request": "launch",
  "args": [
    "--extensionDevelopmentPath=${workspaceFolder}",
    "${input:testWorkspacePath}"
  ],
  "outFiles": ["${workspaceFolder}/dist/**/*.js"],
  "preLaunchTask": "npm: build"
}
```

This allows launching EDH with a different workspace folder for manual testing.

## Phase 4: Verify the Fix

**Automated verification using MCP bridge and screenshots:**

1. **Before EDH launch:** Capture main VS Code sidebar state via MCP `GET /state`
2. **Launch EDH in worktree:** Verify worktree path in window title (screenshot + osascript check)
3. **Run verification session in EDH:** Use fake_claude `success` scenario
4. **Monitor main VS Code during EDH session:**
   - Poll main instance MCP bridge `GET /state` every 2s
   - Confirm `view` remains unchanged (not showing EDH session progress)
   - Screenshot main VS Code sidebar at session midpoint
5. **Verify file isolation:**
   - Check `.oxveil-mcp` exists in worktree: `[[ -f ../oxveil-verify-*/oxveil-mcp ]]`
   - Check `.claudeloop/` created in worktree, not main repo
6. **After EDH closes:** Verify worktree removed, no orphan files

**Pass criteria:**
- Main VS Code sidebar state unchanged throughout EDH session
- No `.claudeloop/` or `.oxveil-mcp` changes in main repo during verification
- Worktree fully cleaned up

## Critical Files

- `.claude/skills/visual-verification/SKILL.md`
- `.claude/skills/visual-verification/references/visual-verification-recipes.md`
- `.vscode/launch.json`

## Verification

- [ ] `/visual-verification` skill updated with self-implementation mode
- [ ] Recipes include worktree setup/teardown scripts
- [ ] Launch config allows isolated workspace testing
- [ ] Execute Phase 4 automated verification: run visual verification on Oxveil, monitor both VS Code instances via MCP bridge, confirm no cross-instance state bleeding

## Closes

GitHub issue: chmc/oxveil#66
