---
name: visual-verification-recipes
description: Scripts, templates, and checklists for the visual verification loop skill. Reference file — not a skill.
---

# Visual Verification Recipes

## Contents

- [Safety Rules](#safety-rules)
- [GUI Primitives](#gui-primitives)
- [Oxveil Sidebar Identification](#oxveil-sidebar-identification)
- [Pre-flight Checks](#pre-flight-checks)
- [Self-Implementation Mode Recipes](#self-implementation-mode-recipes)
- [MCP Bridge Recipes](#mcp-bridge-recipes)
- [End-to-End Workflow Recipes](#end-to-end-workflow-recipes)
- [Swift CGWindowID Script](#swift-cgwindowid-script)
- [Screenshot Pipeline](#screenshot-pipeline)
- [Polling for EDH Window Readiness](#polling-for-edh-window-readiness)
- [osascript Interaction Recipes](#osascript-interaction-recipes)
- [Maximize Viewport](#maximize-viewport)
- [Webview Interaction via Commands](#webview-interaction-via-commands)
- [Mock .claudeloop/ State Scripts](#mock-claudeloop-state-scripts)
- [claudeloop Fake CLI](#claudeloop-fake-cli)
- [SESSION.md Template](#sessionmd-template)
- [Cost Control for Real Claude Instances](#cost-control-for-real-claude-instances)
- [Common Issues Checklist](#common-issues-checklist)
- [v0.1 Verification Targets](#v01-verification-targets)
- [Error Handling](#error-handling)

## GUI Primitives

VS Code Activity Bar buttons are NOT exposed via osascript (`every button of edhWin` returns only window chrome). Use cliclick coordinates instead.

```bash
# ICON_INDEX: 1=Explorer, 2=Search, 3=SCM, 4=Debug, 5=Extensions, 6=Claude, 7=Graph, 8=Oxveil
# Adjust if other extensions installed — screenshot right edge to count.
click_activity_bar_icon() {
    local ICON_LABEL="$1"
    local ICON_INDEX="${2:-8}"
    local INFO=$(osascript -e '
    tell application "System Events"
        tell process "Code"
            set w to (first window whose name contains "[Extension Development Host]")
            set p to position of w; set s to size of w
            return (item 1 of p) & "," & (item 2 of p) & "," & (item 1 of s) & "," & (item 2 of s)
        end tell
    end tell')
    local WIN_X=$(echo $INFO | cut -d, -f1)
    local WIN_Y=$(echo $INFO | cut -d, -f2)
    local WIN_W=$(echo $INFO | cut -d, -f3)
    osascript -e "tell application \"System Events\" to tell process \"Code\" to perform action \"AXRaise\" of (first window whose name contains \"[Extension Development Host]\")"
    sleep 0.2
    cliclick c:$((WIN_X + WIN_W - 24)),$((WIN_Y + 28 + (ICON_INDEX - 1) * 48 + 24))
    sleep 0.5
}

# Click into terminal (must be visible), then type
type_in_terminal_gui() {
    local TEXT="$1"
    cliclick t:"$TEXT"
    sleep 0.1
    cliclick kp:return
}
```

Usage:
```bash
click_activity_bar_icon "Oxveil" 8    # open Oxveil sidebar
click_activity_bar_icon "Explorer" 1  # open Explorer

# Plan Chat input: click Let's Go first, click terminal area, then type
cliclick c:$((WIN_X + WIN_W / 2)),$((WIN_Y + WIN_H / 2))
sleep 0.5
type_in_terminal_gui "describe what to build"
```

---

## Safety Rules

- **`keystroke` is NOT process-scoped.** Targets system frontmost app regardless of `tell process` target. Never use for destructive ops (Cmd+W, Cmd+Q, Cmd+Shift+W).
- **Destructive ops: use accessibility menu clicks.** `click menu item X of menu Y of menu bar 1` is process-scoped.
- **`AXRaise` before menu clicks** — ensures correct Code window receives the action.
- **`set frontmost to true` before non-destructive keystrokes** — required because `keystroke` goes to system frontmost.

## Oxveil Sidebar Identification

VS Code has multiple sidebar views. You MUST verify you're capturing the Oxveil sidebar, not another view.

### What Oxveil Sidebar Contains

| State | Elements |
|-------|----------|
| Empty | "Describe what to build" input, Archives section |
| Stale | Plan phases (greyed), Resume/Dismiss buttons, Archives |
| Ready | Plan phases (pending), Start button, Archives |
| Running | Plan phases (with progress), elapsed time, cost, todos |
| Completed | Plan phases (all green), self-improvement status, Archives |
| Failed | Plan phases (with red failed), error info, Retry button |

**Always present:** Oxveil header, activity bar icon (lightning bolt or custom)

### What Is NOT Oxveil (Common Confusion)

| You See | This Is | Not Oxveil |
|---------|---------|------------|
| "CHAT" header, "SESSIONS" section, conversation history | Copilot Chat / Claude Code | ✗ |
| File/folder tree | Explorer | ✗ |
| Git changes, staged files | Source Control | ✗ |
| Search results | Search | ✗ |
| Extension list | Extensions | ✗ |

### Focus Oxveil Sidebar Recipe

If you captured the wrong sidebar, use `click_activity_bar_icon` (GUI primitive, see [GUI Primitives](#gui-primitives)):

```bash
click_activity_bar_icon "Oxveil"
```

Fallback via menu if Activity Bar button not found:

```bash
osascript -e '
tell application "System Events"
  tell process "Code"
    set frontmost to true
    delay 0.2
    click menu item "Oxveil" of menu "View" of menu bar 1
    delay 0.5
  end tell
end tell'
```

### Verify Correct Sidebar Script

After capturing, verify MCP state matches visual:

```bash
# Get MCP state - should return Oxveil sidebar state
STATE=$(curl -s -H "Authorization: Bearer $MCP_TOKEN" http://localhost:$MCP_PORT/state)
echo "$STATE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'View: {d.get(\"view\", \"unknown\")}')"

# If state shows valid Oxveil view (empty/stale/ready/running/completed/failed)
# but screenshot shows CHAT/SESSIONS, you captured wrong sidebar
```

## Pre-flight Checks

Run all before starting a session. Abort on any failure.

```bash
[[ "$(uname)" == "Darwin" ]] || { echo "FAIL: macOS required"; exit 1; }

which code > /dev/null 2>&1 || { echo "FAIL: 'code' CLI not in PATH. Install via Command Palette: Shell Command: Install 'code' command in PATH"; exit 1; }

osascript -e 'tell application "System Events" to get name of first process' > /dev/null 2>&1 || { echo "FAIL: Grant Accessibility permission to $TERM_PROGRAM in System Settings > Privacy & Security > Accessibility"; exit 1; }

screencapture -x /tmp/oxveil-preflight.png 2>&1
[[ -s /tmp/oxveil-preflight.png ]] || { echo "FAIL: Grant Screen Recording permission to $TERM_PROGRAM in System Settings > Privacy & Security > Screen Recording"; exit 1; }
rm -f /tmp/oxveil-preflight.png

# Close stale EDH windows (process-scoped menu click, not keystroke)
osascript -e '
tell application "System Events"
    tell process "Code"
        set edh to (every window whose name contains "[Extension Development Host]")
        repeat with w in edh
            perform action "AXRaise" of w
            delay 0.3
            click menu item "Close Window" of menu "File" of menu bar 1
            delay 0.5
        end repeat
    end tell
end tell' 2>/dev/null

grep -q '"oxveil.mcpBridge": true' .vscode/settings.json 2>/dev/null || { echo "FAIL: Enable oxveil.mcpBridge in .vscode/settings.json"; exit 1; }

# Cross-repo version check: claudeloop installed version should match source
if [[ -d ~/source/claudeloop ]]; then
    INSTALLED_VER=$(claudeloop --version 2>/dev/null || echo "0.0.0")
    SOURCE_VER=$(cat ~/source/claudeloop/VERSION 2>/dev/null || echo "unknown")
    if [[ "$INSTALLED_VER" != "$SOURCE_VER" ]]; then
        echo "WARN: claudeloop version mismatch - installed: $INSTALLED_VER, source: $SOURCE_VER"
        echo "Run: cd ~/source/claudeloop && ./install.sh"
    fi
fi
```

## Self-Implementation Mode Recipes

When running visual verification on Oxveil itself, use these recipes to avoid cross-instance state bleeding between the main VS Code and EDH.

### Self-implementation detection

Check if the current workspace is Oxveil by inspecting `package.json`:

```bash
detect_self_implementation() {
    if [[ -f package.json ]]; then
        local PKG_NAME=$(python3 -c "import json; print(json.load(open('package.json')).get('name', ''))" 2>/dev/null)
        if [[ "$PKG_NAME" == "oxveil" ]]; then
            echo "SELF_IMPL=true"
            return 0
        fi
    fi
    echo "SELF_IMPL=false"
    return 1
}

# Usage
eval "$(detect_self_implementation)"
if [[ "$SELF_IMPL" == "true" ]]; then
    echo "Self-implementation mode: will use worktree isolation"
fi
```

### WIP preservation (stash before worktree)

Capture WIP as a dangling stash ref. The main working tree is left untouched — WIP stays there. `STASH_REF` is echoed for `setup_worktree` to replay inside the worktree.

```bash
preserve_wip() {
    # Check for uncommitted changes
    if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
        echo "WIP detected — stashing..."
        
        # Stage everything so git stash create captures untracked files too
        # (git stash create -u returns empty for untracked-only trees)
        git add -A 2>/dev/null || true
        STASH_REF=$(git stash create)
        # Restore index to unstaged (working tree content is unchanged)
        git restore --staged . 2>/dev/null || git reset HEAD . 2>/dev/null || true
        
        if [[ -n "$STASH_REF" ]]; then
            echo "STASH_REF=$STASH_REF"
            echo "Stash ref created: $STASH_REF"
        else
            echo "WARN: Stash create returned empty — no changes to stash"
            echo "STASH_REF="
        fi
    else
        echo "No uncommitted changes — skipping stash"
        echo "STASH_REF="
    fi
}

# Usage (capture STASH_REF for setup_worktree; main working tree is unchanged)
eval "$(preserve_wip)"
```

**Alternative: commit WIP to temp branch** (when stash is unreliable for complex states):

```bash
preserve_wip_commit() {
    local TEMP_BRANCH="visual-verify-wip-$(date +%s)"
    local ORIG_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    
    if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
        echo "WIP detected — committing to temp branch..."
        
        git checkout -b "$TEMP_BRANCH"
        git add -A
        git commit -m "WIP: visual verification checkpoint"
        git checkout "$ORIG_BRANCH"
        
        echo "TEMP_BRANCH=$TEMP_BRANCH"
        echo "ORIG_BRANCH=$ORIG_BRANCH"
    else
        echo "No uncommitted changes"
        echo "TEMP_BRANCH="
        echo "ORIG_BRANCH=$ORIG_BRANCH"
    fi
}
```

### Worktree setup

Create isolated worktree for verification. `STASH_REF` (from `preserve_wip`) is applied inside the worktree so it mirrors the main working tree — files-under-test are present regardless of path.

```bash
setup_worktree() {
    local TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    local WORKTREE_PATH="../oxveil-verify-$TIMESTAMP"
    
    # Create worktree from current HEAD (detached)
    git worktree add --detach "$WORKTREE_PATH" HEAD
    [[ $? -eq 0 ]] || { echo "FAIL: git worktree add failed"; return 1; }
    
    # Replay WIP into worktree so files-under-test match the main working tree
    if [[ -n "${STASH_REF:-}" ]]; then
        echo "Applying WIP stash into worktree..."
        (cd "$WORKTREE_PATH" && git stash apply --index "$STASH_REF") \
            || { echo "FAIL: git stash apply failed in worktree (ref: $STASH_REF)" >&2; return 1; }
        echo "WIP applied to worktree"
    fi
    
    # Build in worktree
    echo "Installing dependencies in worktree..."
    (cd "$WORKTREE_PATH" && npm install --silent)
    [[ $? -eq 0 ]] || { echo "FAIL: npm install failed in worktree"; return 1; }
    
    echo "Building in worktree..."
    (cd "$WORKTREE_PATH" && npm run build)
    [[ $? -eq 0 ]] || { echo "FAIL: npm run build failed in worktree"; return 1; }
    
    # Strip CLAUDE.md so Plan Chat haiku sees a vanilla repo without the 9-section plan
    # template — prevents clarifying-question loops that add ~6min of wall-clock (#144).
    # planning-checklist.sh is already guarded by OXVEIL_VV_ACTIVE=1 (no hook strip needed).
    # No cleanup rename-back: git worktree remove --force destroys the dir.
    [[ -f "$WORKTREE_PATH/CLAUDE.md" ]] && mv "$WORKTREE_PATH/CLAUDE.md" "$WORKTREE_PATH/CLAUDE.md.vv-bak" || true
    
    echo "WORKTREE_PATH=$WORKTREE_PATH"
    echo "Worktree ready at: $WORKTREE_PATH"
}

# Usage (STASH_REF from preserve_wip is picked up from environment; capture WORKTREE_PATH)
eval "$(setup_worktree)"
```

### EDH launch in worktree

Launch EDH with worktree as both extension source AND workspace:

```bash
launch_edh_worktree() {
    local WORKTREE_PATH="$1"
    
    [[ -d "$WORKTREE_PATH" ]] || { echo "FAIL: Worktree not found at $WORKTREE_PATH"; return 1; }
    
    # Launch EDH with worktree as extension AND workspace
    # This ensures .oxveil-mcp and .claudeloop/ are isolated to the worktree
    code --extensionDevelopmentPath="$WORKTREE_PATH" --disable-extension GitHub.copilot-chat "$WORKTREE_PATH" &
    
    echo "EDH launched with worktree workspace"
}

# Usage
launch_edh_worktree "$WORKTREE_PATH"
```

### Bridge path handling (worktree-aware)

Read `.oxveil-mcp` from the correct location based on mode:

```bash
get_bridge_credentials() {
    local WORKSPACE_ROOT="${1:-.}"
    local DISCOVERY_PATH="$WORKSPACE_ROOT/.oxveil-mcp"
    
    # Poll for discovery file (15s timeout)
    for i in $(seq 1 15); do
        [[ -f "$DISCOVERY_PATH" ]] && break
        sleep 1
    done
    
    [[ -f "$DISCOVERY_PATH" ]] || { echo "FAIL: MCP bridge not started — $DISCOVERY_PATH not found"; return 1; }
    
    local DISCOVERY=$(cat "$DISCOVERY_PATH")
    PORT=$(echo "$DISCOVERY" | python3 -c "import sys, json; print(json.load(sys.stdin)['port'])")
    TOKEN=$(echo "$DISCOVERY" | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])")
    
    echo "Bridge ready at port $PORT"
    export PORT TOKEN
}

# Usage in self-implementation mode
if [[ "$SELF_IMPL" == "true" ]]; then
    get_bridge_credentials "$WORKTREE_PATH"
else
    get_bridge_credentials "."
fi
```

### Worktree cleanup (Phase 6)

Remove worktree and restore stashed WIP:

```bash
cleanup_worktree() {
    local WORKTREE_PATH="$1"
    local STASH_MSG="$2"
    
    # Close EDH first
    close_edh_window "$MCP_PORT"
    
    # Remove worktree
    if [[ -d "$WORKTREE_PATH" ]]; then
        echo "Removing worktree at $WORKTREE_PATH..."
        git worktree remove --force "$WORKTREE_PATH" 2>/dev/null || {
            echo "WARN: git worktree remove failed — trying manual cleanup"
            rm -rf "$WORKTREE_PATH"
            git worktree prune
        }
    fi
    
    # Restore stash if created
    if [[ -n "$STASH_MSG" ]]; then
        echo "Restoring stashed WIP..."
        local STASH_REF=$(git stash list | grep "$STASH_MSG" | cut -d: -f1 | head -1)
        if [[ -n "$STASH_REF" ]]; then
            git stash pop "$STASH_REF"
            echo "WIP restored"
        else
            echo "WARN: Stash not found — may have been manually dropped"
        fi
    fi
    
    # Clean up any orphaned .oxveil-mcp in main repo
    rm -f .oxveil-mcp
    
    echo "Cleanup complete"
}

# Usage
cleanup_worktree "$WORKTREE_PATH" "$STASH_MSG"
```

### Alternative: restore WIP from temp branch

```bash
cleanup_wip_branch() {
    local ORIG_BRANCH="$1"
    local TEMP_BRANCH="$2"
    
    if [[ -n "$TEMP_BRANCH" ]]; then
        git checkout "$ORIG_BRANCH"
        # Cherry-pick the WIP commit (soft reset to unstage)
        git cherry-pick --no-commit "$TEMP_BRANCH"
        # Delete temp branch
        git branch -D "$TEMP_BRANCH"
        echo "WIP restored from temp branch"
    fi
}
```

### Full self-implementation workflow

Combines all recipes into a complete workflow:

```bash
#!/bin/bash
# Self-implementation visual verification orchestrator

set -e

# Phase 0: Detection and WIP preservation
eval "$(detect_self_implementation)"
if [[ "$SELF_IMPL" != "true" ]]; then
    echo "Not in Oxveil workspace — use standard verification"
    exit 0
fi

eval "$(preserve_wip)"

# Phase 1: Worktree setup and launch
eval "$(setup_worktree)"
launch_edh_worktree "$WORKTREE_PATH"

# Wait for EDH window
for i in $(seq 1 15); do
    WINDOW_ID=$(swift -e '
import CoreGraphics
let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String: Any]]
for w in windows {
    let owner = w["kCGWindowOwnerName"] as? String ?? ""
    let name = w["kCGWindowName"] as? String ?? ""
    if owner.contains("Code") && name.contains("[Extension Development Host]") {
        print(w["kCGWindowNumber"] as? Int ?? 0)
        break
    }
}
')
    [[ -n "$WINDOW_ID" && "$WINDOW_ID" != "0" ]] && break
    sleep 1
done
echo "EDH ready (WindowID: $WINDOW_ID)"

# Get bridge credentials from worktree
get_bridge_credentials "$WORKTREE_PATH"

# ... verification phases 2-5 here ...

# Phase 6: Cleanup
cleanup_worktree "$WORKTREE_PATH" "$STASH_MSG"
```

## MCP Bridge Recipes

Primary method for sidebar webview buttons. osascript/cliclick synthetic events do not pass through Electron webview iframes.

### Reading discovery file

```bash
DISCOVERY=$(cat .oxveil-mcp)
PORT=$(echo "$DISCOVERY" | python3 -c "import sys, json; print(json.load(sys.stdin)['port'])")
TOKEN=$(echo "$DISCOVERY" | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])")
```

### Polling for bridge readiness after EDH launch

```bash
for i in $(seq 1 15); do
    [[ -f .oxveil-mcp ]] && break
    sleep 1
done
[[ -f .oxveil-mcp ]] || { echo "FAIL: MCP bridge not started — check oxveil.mcpBridge setting"; exit 1; }
echo "MCP bridge ready after ${i}s"
```

### Common sidebar interactions

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/state | python3 -m json.tool

curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/state | python3 -c "import sys, json; print(json.load(sys.stdin)['view'])"

# Click: fields are top-level SidebarCommand, NOT nested in "args" ({"command":"skip","phase":2})
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"resumePlan"}' http://127.0.0.1:$PORT/click

curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"oxveil.start"}' http://127.0.0.1:$PORT/command
```

### Click Body Format

The `/click` endpoint expects `{"command": "resumePlan"}`, NOT a raw selector:

```bash
# Wrong — will click nothing
curl -X POST -d '{"selector":"button[data-command=resumePlan]"}' ...

# Correct
curl -X POST -d '{"command":"resumePlan"}' ...
```

The bridge runs `commandToSelector(msg)` which reads `msg.command` to build the selector.

### Click-and-verify pattern

```bash
# Standard pattern: click, wait, verify state + timestamp advanced
click_and_verify() {
    local CMD="$1" EXPECTED="$2"
    local BEFORE_TS=$(curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/state | python3 -c "import sys, json; print(json.load(sys.stdin).get('lastUpdatedAt', 0))")
    curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d "{\"command\":\"$CMD\"}" http://127.0.0.1:$PORT/click > /dev/null
    sleep 1
    local STATE=$(curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/state)
    local VIEW=$(echo "$STATE" | python3 -c "import sys, json; print(json.load(sys.stdin)['view'])")
    local AFTER_TS=$(echo "$STATE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('lastUpdatedAt', 0))")
    if [[ "$VIEW" == "$EXPECTED" ]]; then
        if [[ "$AFTER_TS" -gt "$BEFORE_TS" ]]; then
            echo "OK: $CMD → $EXPECTED (state updated)"
        else
            echo "WARN: $CMD → $EXPECTED but state timestamp unchanged (stale?)"
        fi
    else
        echo "FAIL: $CMD → expected $EXPECTED, got $VIEW"
    fi
}

# Usage: click_and_verify "resumePlan" "ready"
```

### Real DOM clicks

POST `/click` dispatches real `MouseEvent` in the webview via `dispatchEvent()`. This exercises the full click path: DOM event → event handler → postMessage → command execution.

```bash
# /click — full SidebarCommand shape (phase, archive supported)
# Now triggers real DOM click in webview
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"restart"}' http://127.0.0.1:$PORT/click

# Phase-specific click
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"retry","phase":2}' http://127.0.0.1:$PORT/click
```

Use `/click` for all sidebar button interactions. MCP bridge converts command to CSS selector and dispatches MouseEvent.

### Sidebar command reference

| Command | From state | To state | Notes |
|---------|-----------|----------|-------|
| `resumePlan` | stale | ready | Accepts orphaned plan as current work |
| `dismissPlan` | stale | empty | Ignores orphaned plan |
| `start` | ready | running | Starts claudeloop session |
| `stop` | running | stopped | Stops running session |
| `resume` | stopped | running | Needs `phase` parameter |
| `restart` | stopped | running | Resets and starts fresh |
| `discardPlan` | ready | empty | Removes plan |

### disable_tamp_for_vv

Tamp (Claude plugin, typically running on `:7778`) injects "output rules" blocks into claude's context via `ANTHROPIC_BASE_URL`. In Plan Chat, this causes claude to flag directive-shaped blocks, ask "Is this intentional?", and require extra `\r` keystrokes — skewing VV results and risking ExitPlanMode never firing.

Unset before `code --extensionDevelopmentPath=…` so the EDH-spawned claude hits `api.anthropic.com` directly:

```bash
# Disable Tamp for this VV run (scoped to harness subprocess — user's shell is unaffected)
if [[ "${OXVEIL_VV_KEEP_TAMP:-0}" != "1" ]]; then
    unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN HTTP_PROXY HTTPS_PROXY
fi
# Suppress goal Status appends for plans approved inside this VV session (#141)
export OXVEIL_VV_ACTIVE=1

code --extensionDevelopmentPath="$WORKTREE_PATH" \
     --disable-extension GitHub.copilot-chat \
     "$WORKTREE_PATH"
```

**Escape hatch:** `OXVEIL_VV_KEEP_TAMP=1` preserves Tamp — use when debugging Tamp↔oxveil interactions specifically.

**Verify the unset took effect** after Plan Chat opens:
```bash
PLAN_CHAT_PID=$(pgrep -f "permission-mode plan" | head -1)
ps eww "$PLAN_CHAT_PID" | grep -o 'ANTHROPIC_BASE_URL=[^ ]*' || echo "ANTHROPIC_BASE_URL not in child env — OK"
```

### submit_askuserquestion_selection

When `resources/oxveil-plan-intercept.sh` denies ExitPlanMode, claude renders an AskUserQuestion TUI menu in the Plan Chat terminal. The chevron `>` marks the currently highlighted option. Send bare `\r` to submit the highlighted option — do NOT send the option number (e.g. "1"), which types into the input box instead.

```bash
# After polling confirms denyCount >= 1, submit the highlighted option (option 1 = Form Plan)
curl -s -X POST "http://localhost:$MCP_PORT/command" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"workbench.action.terminal.sendSequence","args":[{"text":"\r"}]}'
# Note: args must be an array ([{...}]), not an object ({...})

# Poll for sentinel within 10s
for i in $(seq 1 10); do
    [[ -f "$WORKTREE/.claude/oxveil-execute" ]] && break
    sleep 1
done
[[ -f "$WORKTREE/.claude/oxveil-execute" ]] || echo "FAIL: sentinel not written within 10s"
```

**Evidence required for AC PASS:**
- Frame (a): terminal screenshot BEFORE `\r` showing `> 1. Form Plan with Oxveil` (chevron on option 1)
- Frame (b): terminal screenshot AFTER `\r` showing claude's `Write(.claude/oxveil-execute)` tool-use frame

**Known pitfalls:**
- `sendSequence` `args` as object `{"text":"\r"}` → `Spread syntax requires ...iterable[Symbol.iterator]` error. Must be array.
- If the TUI menu hasn't rendered yet (denyCount just flipped), add a 1–2s delay before sending `\r`.
- If option 1 is NOT highlighted (chevron elsewhere), send `\x1b[A` (up arrow) to move it before `\r`.

## End-to-End Workflow Recipes

### Key transition mechanisms

State derivation: `src/views/sidebarState.ts:deriveViewState()`. See `docs/workflow/states.md` for full state machine.

### wait_for_view helper

Poll `GET /state` until expected view. Use for async transitions instead of fixed sleeps.

```bash
# Poll sidebar state until expected view or timeout
# Usage: wait_for_view "ready" 10
wait_for_view() {
    local EXPECTED="$1" TIMEOUT="${2:-10}"
    local END=$((SECONDS + TIMEOUT))
    local VIEW=""
    while [[ $SECONDS -lt $END ]]; do
        VIEW=$(curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/state \
          | python3 -c "import sys, json; print(json.load(sys.stdin)['view'])")
        if [[ "$VIEW" == "$EXPECTED" ]]; then
            echo "OK: view=$EXPECTED"
            return 0
        fi
        sleep 0.5
    done
    echo "FAIL: expected $EXPECTED, got $VIEW after ${TIMEOUT}s"
    return 1
}
```

### Recipe: Full Lifecycle (empty → stale → ready → running → completed)

**Prerequisites:** EDH launched with fake_claude `success` scenario in PATH. MCP bridge ready (`$PORT`, `$TOKEN` parsed). claudeloop detected.

**Vary plan content every run** — different phase counts, titles, descriptions. Use `generate_plan` below.

```bash
generate_plan() {
    local TITLES=(
        "Bootstrap" "Scaffold" "Configure" "Initialize" "Provision"
        "Build core" "Implement API" "Wire database" "Add auth" "Create UI"
        "Write tests" "Run linter" "Integration check" "E2E validation" "Load test"
        "Deploy staging" "Smoke test" "Documentation" "Security audit" "Cleanup"
    )
    local DESCS=(
        "Set up project structure and install dependencies."
        "Implement the primary business logic."
        "Connect to external services and verify contracts."
        "Add unit and integration test coverage."
        "Run static analysis and fix violations."
        "Build frontend components and wire to backend."
        "Configure CI pipeline and verify green builds."
        "Review security posture and patch vulnerabilities."
        "Write user-facing documentation and changelog."
        "Validate end-to-end behavior in staging environment."
    )
    local COUNT=$(( (RANDOM % 3) + 2 ))  # 2-4 phases
    echo "# Verification Plan"
    echo ""
    local USED=()
    for i in $(seq 1 $COUNT); do
        # Pick a title not yet used this run
        local IDX=$(( RANDOM % ${#TITLES[@]} ))
        while [[ " ${USED[*]} " == *" $IDX "* ]]; do
            IDX=$(( RANDOM % ${#TITLES[@]} ))
        done
        USED+=($IDX)
        local DESC_IDX=$(( RANDOM % ${#DESCS[@]} ))
        echo "## Phase $i: ${TITLES[$IDX]}"
        echo "${DESCS[$DESC_IDX]}"
        echo ""
    done
}

rm -f PLAN.md
wait_for_view "empty" 10

VIEW=$(curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/state \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['view'])")
[[ "$VIEW" == "empty" ]] || { echo "FAIL: expected empty, got $VIEW"; exit 1; }
# Screenshot: 01-empty

generate_plan > PLAN.md
echo "Generated plan:"
grep "^## Phase" PLAN.md

wait_for_view "stale" 10
# Screenshot: 02-stale

click_and_verify "resumePlan" "ready"
# Screenshot: 03-ready

EXPECTED_PHASES=$(grep -c "^## Phase" PLAN.md)
ACTUAL_PHASES=$(curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/state \
  | python3 -c "import sys, json; s=json.load(sys.stdin); print(len(s.get('plan',{}).get('phases',[])))")
if [[ "$EXPECTED_PHASES" == "$ACTUAL_PHASES" ]]; then
    echo "OK: phase count matches ($ACTUAL_PHASES)"
else
    echo "FAIL: expected $EXPECTED_PHASES phases, sidebar shows $ACTUAL_PHASES"
fi

click_and_verify "start" "running"
# Screenshot: 04-running

wait_for_view "completed" 45
# Screenshot: 05-completed

rm -f PLAN.md
```

### Form Plan button path (automatable via cliclick)

**Requires:** `cliclick` (`brew install cliclick`). osascript `keystroke` does NOT reliably interact with VS Code QuickPick dialogs — use cliclick for coordinate-based interaction.

`onPlanFormed()` transitions directly to `ready` (skips `stale`). Use `## Phase N:` headers for predictable fake_claude results.

1. Create source plan file (not PLAN.md). Invoke `/command`: `{"command":"oxveil.formPlan","args":[{"filePath":"/absolute/path/to/source.md"}]}`.
2. Select granularity via cliclick (`Phases`, `Tasks`, `Steps`):

```bash
# Get EDH window position
WIN_INFO=$(osascript -e '
tell application "System Events"
    tell process "Code"
        set edhWindow to (first window whose name contains "[Extension Development Host]")
        set winPos to position of edhWindow
        set winSize to size of edhWindow
        return (item 1 of winPos as string) & "," & (item 2 of winPos as string) & "," & (item 1 of winSize as string) & "," & (item 2 of winSize as string)
    end tell
end tell')

WIN_X=$(echo $WIN_INFO | cut -d, -f1)
WIN_Y=$(echo $WIN_INFO | cut -d, -f2)
WIN_W=$(echo $WIN_INFO | cut -d, -f3)

# QuickPick appears at center-top of window (~100px from top)
QUICKPICK_X=$((WIN_X + WIN_W/2))
QUICKPICK_Y=$((WIN_Y + 100))

# Wait for QuickPick to appear
sleep 1.5

# Click in QuickPick area to ensure focus, then type and confirm
cliclick c:$QUICKPICK_X,$QUICKPICK_Y
sleep 0.3
cliclick t:"Phases"
sleep 0.3
cliclick kp:return
```

3. `wait_for_view "ready" 15`. Continue with `start` → `running`. Cleanup: `rm -f source-plan.md PLAN.md`.

**Why cliclick?** osascript `keystroke` sends keys to the system frontmost app but QuickPick input fields don't reliably receive them. cliclick's coordinate-based click + type bypasses this issue.

### Extended command reference (via /command endpoint)

| Command | Args | Notes |
|---------|------|-------|
| `oxveil.formPlan` | `[{"filePath":"..."}]` | Writes `PLAN.md` + AI parse. Triggers QuickPick |
| `oxveil.discardPlan` | none | Removes PLAN.md, resets to empty |

## Swift CGWindowID Script

VS Code name mapping (CGWindowList vs System Events):

| API | Name | Insiders |
|-----|------|----------|
| CGWindowList (`kCGWindowOwnerName`) | `"Visual Studio Code"` | `"Visual Studio Code - Insiders"` |
| System Events (process name) | `"Code"` | `"Code - Insiders"` |

If window lookup fails, verify with diagnostic snippet:

```bash
swift -e '
import CoreGraphics
let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String: Any]]
for w in windows {
    let owner = w["kCGWindowOwnerName"] as? String ?? ""
    if owner.contains("Visual Studio") || owner.contains("Code") {
        print("\(owner) | \(w["kCGWindowName"] as? String ?? "(no name)")")
    }
}
'
```

```bash
WINDOW_ID=$(swift -e '
import CoreGraphics
let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String: Any]]
for w in windows {
    let owner = w["kCGWindowOwnerName"] as? String ?? ""
    let name = w["kCGWindowName"] as? String ?? ""
    if owner.contains("Code") && name.contains("[Extension Development Host]") {
        print(w["kCGWindowNumber"] as? Int ?? 0)
        break
    }
}
')

# Verify window was found
[[ -n "$WINDOW_ID" && "$WINDOW_ID" != "0" ]] || { echo "FAIL: EDH window not found"; exit 1; }
```

## Screenshot Pipeline

```bash
# Never use screencapture -w (interactive, hangs in automation). Use -l or -R.
screencapture -l "$WINDOW_ID" "$SESSION_DIR/screenshots/$SCREENSHOT_NAME.png"
sips --resampleWidth 1568 "$SESSION_DIR/screenshots/$SCREENSHOT_NAME.png" --out "$SESSION_DIR/screenshots/$SCREENSHOT_NAME.png" > /dev/null 2>&1
```

## Polling for EDH Window Readiness

Poll after launching EDH instead of fixed waits.

```bash
for i in $(seq 1 15); do
    WINDOW_ID=$(swift -e '
import CoreGraphics
let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String: Any]]
for w in windows {
    let owner = w["kCGWindowOwnerName"] as? String ?? ""
    let name = w["kCGWindowName"] as? String ?? ""
    if owner.contains("Code") && name.contains("[Extension Development Host]") {
        print(w["kCGWindowNumber"] as? Int ?? 0)
        break
    }
}
')
    [[ -n "$WINDOW_ID" && "$WINDOW_ID" != "0" ]] && break
    sleep 1
done
echo "EDH window found after ${i}s (WindowID: $WINDOW_ID)"
```

## osascript Interaction Recipes

All recipes use `process "Code"` with window name filtering. `set frontmost to true` mandatory before any `keystroke`.

### Focusing the Plan Chat terminal

Plan Chat opens as an editor-area terminal when the user clicks "Let's Go". Focus it by clicking into the editor area using `type_in_terminal_gui` (see [GUI Primitives](#gui-primitives)).

Never use `click at {x, y}` for Plan Chat focus — editor-area terminals don't reliably receive click-based focus from AppleScript coordinates; use cliclick coordinates instead.

```bash
# Focus EDH window
osascript -e '
tell application "System Events"
    tell process "Code"
        set frontmost to true
        perform action "AXRaise" of (first window whose name contains "[Extension Development Host]")
    end tell
end tell'

# Close EDH window — use close_edh_window() function (handles sheets, verifies closure)
# See "close_edh_window function" section below for definition and usage.
close_edh_window "$MCP_PORT"

# Close active editor tab (process-scoped menu click)
osascript -e '
tell application "System Events"
    tell process "Code"
        perform action "AXRaise" of (first window whose name contains "[Extension Development Host]")
        delay 0.3
        click menu item "Close Editor" of menu "File" of menu bar 1
    end tell
end tell'
```

## close_edh_window function

Handles modal sheets, dialog windows, and "Replace?" prompts. Use this instead of inline osascript everywhere.

```bash
# Close EDH window with sheet/dialog dismissal and verified closure
# Usage: close_edh_window [MCP_PORT] [WORKTREE_PATH]
# WORKTREE_PATH: if set, deletes PLAN.md there before close to prevent "Replace?" dialog
close_edh_window() {
    local MCP_PORT="${1:-}"
    local WORKTREE="${2:-}"

    # 0. Remove PLAN.md from worktree — prevents "PLAN.md already exists. Replace?" dialog
    # VS Code shows this dialog when closing if PLAN.md was written during the session.
    # Deleting it here prevents the dialog entirely; no sheet dismissal needed for it.
    if [[ -n "$WORKTREE" && -f "$WORKTREE/PLAN.md" ]]; then
        rm -f "$WORKTREE/PLAN.md"
        sleep 0.3
    fi

    # 1. [SETUP] Discard unsaved changes via MCP to avoid "Save changes?" sheet
    if [[ -n "$MCP_PORT" ]]; then
        curl -s -X POST "http://localhost:$MCP_PORT/command" \
            -H "Content-Type: application/json" \
            -d '{"command":"workbench.action.revertAndCloseActiveEditor"}' >/dev/null 2>&1 || true
        curl -s -X POST "http://localhost:$MCP_PORT/command" \
            -H "Content-Type: application/json" \
            -d '{"command":"workbench.action.closeAllEditors"}' >/dev/null 2>&1 || true
        sleep 0.5
    fi

    # 2+3. Dismiss sheets/dialogs then close — single osascript to avoid timing gaps
    # Escape does NOT work on VS Code sheets or dialogs; must click button directly.
    # Priority: Cancel > Don't Save > fail loudly (no blind fallback)
    # Also handles AXDialog windows (e.g. "Replace?" prompt) in addition to AXSheet.
    osascript -e '
    tell application "System Events"
        tell process "Code"
            -- Helper: click Cancel > Don'"'"'t Save in a list of buttons
            -- Returns true if a button was clicked
            set edh to (every window whose name contains "[Extension Development Host]")
            repeat with w in edh
                perform action "AXRaise" of w
                set frontmost to true
                delay 0.2

                -- 2a. Dismiss AXSheet (e.g. "Save changes?" on editor close)
                try
                    set s to (first sheet of w)
                    set btns to every button of s
                    set clicked to false
                    repeat with b in btns
                        if name of b is "Cancel" then
                            click b
                            set clicked to true
                            exit repeat
                        end if
                    end repeat
                    if not clicked then
                        repeat with b in btns
                            if name of b is "Don'"'"'t Save" then
                                click b
                                set clicked to true
                                exit repeat
                            end if
                        end repeat
                    end if
                    if not clicked then
                        error "Unknown sheet buttons: " & (name of every button of s as string)
                    end if
                    delay 0.3
                end try

                -- 2b. Dismiss AXDialog windows (e.g. "PLAN.md already exists. Replace?")
                -- These appear as child windows with subrole AXDialog, not as sheets.
                try
                    set dialogs to (every window of (application "Code") whose subrole is "AXDialog")
                    repeat with d in dialogs
                        set btns to every button of d
                        set clicked to false
                        repeat with b in btns
                            if name of b is "Cancel" then
                                click b
                                set clicked to true
                                delay 0.3
                                exit repeat
                            end if
                        end repeat
                        if not clicked then
                            repeat with b in btns
                                if name of b is "Don'"'"'t Save" then
                                    click b
                                    delay 0.3
                                    exit repeat
                                end if
                            end repeat
                        end if
                    end repeat
                end try

                -- 3. Close the EDH window via close button
                perform action "AXRaise" of w
                delay 0.2
                perform action "AXPress" of (first button of w whose subrole is "AXCloseButton")
                delay 0.5
            end repeat
        end tell
    end tell' 2>/dev/null || true

    # 4. Verify closed
    sleep 0.5
    local remaining
    remaining=$(osascript -e '
    tell application "System Events"
        tell process "Code"
            count of (every window whose name contains "[Extension Development Host]")
        end tell
    end tell' 2>/dev/null || echo "0")

    if [[ "$remaining" -gt 0 ]]; then
        echo "ERROR: EDH window still open after close attempts"
        return 1
    fi

    echo "EDH window closed successfully"
    return 0
}
```

## Maximize Viewport

Two variants depending on phase. Always keep primary sidebar visible (Oxveil tree view).

### Phase 1 — Initial maximize (before Plan Chat opens)

Run once after EDH launch. Plan Chat is not yet open, so `closeAllEditors` is safe.

```bash
# Focus EDH window
osascript -e '
tell application "System Events"
    tell process "Code"
        set frontmost to true
        perform action "AXRaise" of (first window whose name contains "[Extension Development Host]")
    end tell
end tell'

sleep 0.3

# [SETUP] Close bottom panel (Terminal, Problems, Output, Debug Console)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"workbench.action.closePanel"}' http://127.0.0.1:$PORT/command

# [SETUP] Close secondary sidebar (Copilot Chat, etc.)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"workbench.action.closeAuxiliaryBar"}' http://127.0.0.1:$PORT/command

# [SETUP] Close all editor tabs (Welcome, Get Started, README previews, etc.)
# Safe here — Plan Chat is not open yet.
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"workbench.action.closeAllEditors"}' http://127.0.0.1:$PORT/command

sleep 0.5
```

### Phase 3 — Pre-capture re-maximize (Plan Chat may be open)

Run before EVERY screenshot or video in Phase 3. Skips `closeAllEditors` — Plan Chat opens as an
editor-area terminal tab and must survive. See §"Focusing the Plan Chat terminal" for why.

```bash
# Focus EDH window
osascript -e '
tell application "System Events"
    tell process "Code"
        set frontmost to true
        perform action "AXRaise" of (first window whose name contains "[Extension Development Host]")
    end tell
end tell'

sleep 0.3

# [SETUP] Close bottom panel
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"workbench.action.closePanel"}' http://127.0.0.1:$PORT/command

# [SETUP] Close secondary sidebar (Copilot Chat, etc.)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"workbench.action.closeAuxiliaryBar"}' http://127.0.0.1:$PORT/command

# [SETUP] Bring Oxveil into primary sidebar focus (displaces Copilot Chat if pinned there)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"workbench.view.extension.oxveil"}' http://127.0.0.1:$PORT/command

# DO NOT run closeAllEditors here — Plan Chat tab must survive.

sleep 0.5
```

## Webview Interaction via Commands

Webview iframes are unreachable via accessibility/clicking. Expose interactions as VS Code commands, invoke via command palette.

**Pattern:** Add public method → register command → invoke via palette during verification.

```bash
osascript -e '
tell application "System Events"
    tell process "Code"
        set frontmost to true
        perform action "AXRaise" of (first window whose name contains "[Extension Development Host]")
        delay 0.3
        keystroke "p" using {command down, shift down}
    end tell
end tell'
sleep 1
osascript -e '
tell application "System Events"
    tell process "Code"
        delay 0.3
        keystroke "Oxveil: Plan Preview"
        delay 0.8
        key code 36
    end tell
end tell'
```

Applies to any webview button/toggle needing verification. Commands serve double duty — keyboard-accessible for users AND testable in automation.

**Plan Preview timing**: PlanFileResolver picks up plans via filesystem mtime/birthtime — not active editor. After writing a plan file, wait for the watcher debounce (~200ms) or the 5-second poll interval before asserting Plan Preview state. Add `sleep 6` if the watcher may not be registered yet.

## Mock .claudeloop/ State Scripts

### Triggering Webview Updates

| File Changed | Event | Updates Webview? |
|--------------|-------|------------------|
| PLAN.md | Full rebuild | ✅ Yes (`updateState`) |
| PROGRESS.md | `phases-changed` | ❌ Partial only (`sendProgressUpdate`) |
| lock | `lock-changed` | Depends on session state |

To force full webview refresh: touch PLAN.md or restart EDH.

Prefer fake CLI for dynamic verification. Use manual mocking only for fast static checks or hard-to-trigger states (stale lock after crash). **NEVER delete `.claudeloop/` directory — only remove files via `.MOCK_SESSION` marker.**

```bash
[[ -f .claudeloop/lock ]] && { echo "ABORT: Real claudeloop session running. Do not mock."; exit 1; }

# --- "idle" state ---
if [[ -f .claudeloop/.MOCK_SESSION ]]; then
  find .claudeloop -newer .claudeloop/.MOCK_SESSION -not -path .claudeloop -delete 2>/dev/null
  rm -f .claudeloop/.MOCK_SESSION
fi

# --- "running" state ---
mkdir -p .claudeloop/logs
echo "mock-$(date +%s)" > .claudeloop/.MOCK_SESSION
echo '99999' > .claudeloop/lock
cat > .claudeloop/PROGRESS.md << 'PROGRESS_EOF'
## Phase Details

### ✅ Phase 1: Setup
Status: completed
Started: 2026-03-25 14:01:00
Completed: 2026-03-25 14:01:30

### 🔄 Phase 2: Implementation
Status: in_progress
Started: 2026-03-25 14:02:00

### ⏳ Phase 3: Testing
Status: pending
PROGRESS_EOF
echo "[2026-03-25 14:01:00] Phase 1 complete" > .claudeloop/live.log
echo "[2026-03-25 14:02:00] Phase 2 starting..." >> .claudeloop/live.log

# --- "failed" state ---
cat > .claudeloop/PROGRESS.md << 'PROGRESS_EOF'
## Phase Details

### ✅ Phase 1: Setup
Status: completed
Started: 2026-03-25 14:01:00
Completed: 2026-03-25 14:01:30

### ❌ Phase 2: Implementation
Status: failed
Started: 2026-03-25 14:02:00
Attempts: 3
PROGRESS_EOF

# --- "done" state ---
rm -f .claudeloop/lock
cat > .claudeloop/PROGRESS.md << 'PROGRESS_EOF'
## Phase Details

### ✅ Phase 1: Setup
Status: completed
Started: 2026-03-25 14:01:00
Completed: 2026-03-25 14:01:30

### ✅ Phase 2: Implementation
Status: completed
Started: 2026-03-25 14:02:00
Completed: 2026-03-25 14:05:00

### ✅ Phase 3: Testing
Status: completed
Started: 2026-03-25 14:05:30
Completed: 2026-03-25 14:08:00
PROGRESS_EOF

# --- Cleanup mock (Phase 6) ---
if [[ -f .claudeloop/.MOCK_SESSION ]]; then
  find .claudeloop -newer .claudeloop/.MOCK_SESSION -not -path .claudeloop -delete 2>/dev/null
  rm -f .claudeloop/.MOCK_SESSION
else
  echo "WARNING: .claudeloop/ exists but is not a mock session. Skipping cleanup."
fi
```

**In-memory caveat:** Removing files doesn't reset `SessionState` in memory. Reload or relaunch EDH for clean idle state between lifecycle round trips.

## claudeloop Fake CLI

- Path: `/Users/aleksi/source/claudeloop/tests/fake_claude`
- Replaces `claude` binary (not `claudeloop`). Outputs NDJSON; claudeloop converts to `.claudeloop/` files.
- Prefer over manual mocking for dynamic verification. `success*` scenarios auto-detect AI-parse/verification prompts.

### Setup

Use `CLAUDELOOP_CLAUDE_BIN` to inject fake_claude. PATH modification alone is unreliable — macOS GUI apps (Electron/VS Code) may not inherit terminal PATH when `code` forwards IPC to a running instance.

**Persistent dev config via launch.json** — add an `env` block to `.vscode/launch.json` so `CLAUDELOOP_CLAUDE_BIN` is set automatically on every EDH launch from VS Code (F5 / Run Extension):

```json
{
  "name": "Run Extension",
  "type": "extensionHost",
  "request": "launch",
  "env": {
    "CLAUDELOOP_CLAUDE_BIN": "/path/to/fake_claude_dir/claude",
    "FAKE_CLAUDE_DIR": "/path/to/fake_claude_dir"
  },
  ...
}
```

Set up the fake_claude dir once:
```bash
FAKE_CLAUDE_DIR=$(mktemp -d -t fake_claude.XXXXXX)
cp /Users/aleksi/source/claudeloop/tests/fake_claude "$FAKE_CLAUDE_DIR/claude"
cp -r /Users/aleksi/source/claudeloop/tests/lib "$FAKE_CLAUDE_DIR/"
chmod +x "$FAKE_CLAUDE_DIR/claude"
echo "success" > "$FAKE_CLAUDE_DIR/scenario"
# Then hardcode the path in launch.json env block
```

**Note:** launch.json env propagates to the EDH process, which spawns claudeloop, which inherits `CLAUDELOOP_CLAUDE_BIN` — same inheritance chain as the script approach.

```bash
# Create temp dir — binary + config in same dir
FAKE_CLAUDE_DIR=$(mktemp -d -t fake_claude.XXXXXX)
export FAKE_CLAUDE_DIR

# Install binary (copy lib alongside — fake_claude uses $(dirname $0)/lib/)
cp /Users/aleksi/source/claudeloop/tests/fake_claude "$FAKE_CLAUDE_DIR/claude"
cp -r /Users/aleksi/source/claudeloop/tests/lib "$FAKE_CLAUDE_DIR/"
chmod +x "$FAKE_CLAUDE_DIR/claude"

# Set scenario
echo "success_verbose" > "$FAKE_CLAUDE_DIR/scenario"

# Ensure cleanup on any exit (SIGINT, SIGTERM, set -e)
trap 'rm -rf "$FAKE_CLAUDE_DIR"' EXIT

# Export CLAUDELOOP_CLAUDE_BIN — claudeloop provider_cli() checks this first,
# bypassing PATH lookup. Safe: env var is process-scoped, unset = real claude.
export CLAUDELOOP_CLAUDE_BIN="$FAKE_CLAUDE_DIR/claude"
# Suppress goal Status appends for plans approved inside this VV session (#141)
export OXVEIL_VV_ACTIVE=1

# Launch EDH — CLAUDELOOP_CLAUDE_BIN propagates via env, not PATH
code --extensionDevelopmentPath="$WORKTREE_PATH" --disable-extension GitHub.copilot-chat "$WORKTREE_PATH"
```

**Cleanup:** Handled automatically by `trap EXIT`. No manual cleanup needed.
If EDH is kept open after script exits, temp dir may already be gone — relaunch if needed.

### Scenario Reference

| Scenario | Exit | Description | Visual Verification Use |
|----------|------|-------------|------------------------|
| `success` | 0 | Single Edit tool use, auto-detects AI-parse/verify prompts | Full lifecycle: AI parse → execute → completed → archive |
| `success_multi` | 0 | Read, Edit, Bash tool uses, auto-detects AI-parse/verify | Multiple tool activity in output channel |
| `success_verbose` | 0 | 9 turns, TodoWrite, thinking pauses | Full tree view, status bar, output channel test |
| `success_realistic` | 0 | Proper assistant/user wrapping, auto-detects AI-parse/verify | NDJSON parser accuracy |
| `ai_parse` | 0 | Emits `## Phase N:` headers (no tool_use) | Explicit AI-parse output without auto-detection |
| `ai_verify_pass` | 0 | Emits `PASS` for AI plan verification | Explicit AI-verify output without auto-detection |
| `failure` | 1 | Simple error | Status bar "failed", failure notification |
| `error_realistic` | 1 | Tool errors with is_error:true | Error UX in output channel |
| `slow` | 0 | Sleeps `$FAKE_CLAUDE_SLEEP` (default 30s) | Elapsed timer, spinner presence |
| `empty` | 0 | No output | Graceful handling of empty response |
| `quota_error` | 1 | Rate limit exceeded | Error notification UX |
| `network_error` | 1 | Connection error | Error notification UX |
| `permission_error` | 0 | Write permission denied | Non-fatal error UX |
| `verify_pass` | 0 | VERIFICATION_PASSED marker | Verification status in tree view |
| `verify_fail` | 0 | VERIFICATION_FAILED marker | Verification failure UX |
| `verify_skip` | 0 | Pass with no tool_use | Minimal verification UI |
| `rate_limit` | 0 | rate_limit_event (utilization: 0.85) | Rate limit warning display |
| `read_only` | 0 | Read + Grep only | UI when no file modifications occur |
| `custom` | 0 | Reads `$FAKE_CLAUDE_DIR/custom_output` | Ad-hoc testing of specific outputs |

### Scenario Selection by Test Goal

| Goal | Scenario | Config changes |
|------|----------|----------------|
| Full lifecycle → completed | `success` | `VERIFY_PHASES=false` in `.claudeloop.conf` |
| Self-improvement trigger | `success` | `VERIFY_PHASES=false`, write LESSONS.md after EDH launch |
| AI-parse output only | `ai_parse` | — |
| Verification UX (pass/fail) | `verify_pass` / `verify_fail` | — |
| Multiple tool activity | `success_multi` | — |
| Long-running / elapsed timer | `slow` | set `FAKE_CLAUDE_SLEEP` |

### Self-Improvement Flow: LESSONS.md Timing

`activateSidebar.ts:164` calls `refreshLessonsAvailable()` at extension activation when `oxveil.selfImprovement: true`. If LESSONS.md exists at that point, `lessonsAvailable` is set to `true` before any session runs — **false positive**.

**Correct order:**
1. Launch EDH (no LESSONS.md present)
2. Wait for MCP bridge
3. Pre-flight: assert `lessonsAvailable === false`
4. Write LESSONS.md (startup check already ran — won't fire again)
5. Start session → session completion handler finds LESSONS.md → sets `lessonsAvailable = true`

```bash
# Pre-flight assertion
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/state | \
  python3 -c "import sys,json; s=json.load(sys.stdin); v=s.get('selfImprovement',{}).get('lessonsAvailable'); assert v != True, f'FAIL: lessonsAvailable already true — LESSONS.md present at launch?'"

# Write LESSONS.md after assertion passes
mkdir -p "$WORKTREE_PATH/.claudeloop"
cat > "$WORKTREE_PATH/.claudeloop/LESSONS.md" << 'EOF'
# Lessons Learned

## Session: test
- Lesson: Test content
EOF
```

### Known Limitation: Verification Prompt Detection

The `success*` scenarios auto-detect verification prompts via `is_phase_verify_prompt()`. When claudeloop runs phase verification (prompt contains "verification"), fake_claude emits `VERIFICATION_PASSED` without file changes. claudeloop then treats the phase as failed (`no_write_actions`).

**Impact:** Cannot test features requiring successful session completion (e.g., self-improvement auto-start) with default `VERIFY_PHASES=true`.

**Fix:** Set `VERIFY_PHASES=false` in `.claudeloop.conf` before clicking Start:
```bash
sed -i '' 's/VERIFY_PHASES=true/VERIFY_PHASES=false/' "$WORKTREE_PATH/.claudeloop/.claudeloop.conf"
```

**Alternative:** Use `success_verbose` which writes multiple files, or create a custom scenario:
```bash
cat > "$FAKE_CLAUDE_DIR/custom_output" << 'EOF'
{"type":"system","subtype":"init","model":"fake-claude-v1"}
{"type":"assistant","message":{"content":[{"type":"text","text":"Making changes..."}]}}
{"type":"tool_use","name":"Write","input":{"file_path":"output.txt","content":"done"},"id":"t1"}
{"type":"tool_result","content":"ok","id":"t1"}
{"type":"result","total_cost_usd":0.01,"duration_ms":3000,"num_turns":2,"usage":{"input_tokens":500,"output_tokens":200}}
EOF
echo "custom" > "$FAKE_CLAUDE_DIR/scenario"
# Must also create the file fake_claude claims to write
echo "done" > "$WORKTREE_PATH/output.txt"
```

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `FAKE_CLAUDE_DIR` | Yes | Config dir for scenario, exit_codes, call_count |
| `FAKE_CLAUDE_SLEEP` | No | Sleep duration for `slow` scenario (default: 30s) |
| `FAKE_CLAUDE_THINK` | No | Thinking pause for `success_verbose` (default: 0.3s) |

### Cleanup

- Remove fake bin dir: `rm -rf "$FAKE_BIN"`
- Remove config dir: `rm -rf "$FAKE_CLAUDE_DIR"`
- **Remove symlink:** `rm -f ~/.local/bin/claude` (or `sudo rm -f /usr/local/bin/claude` if system-wide)
- Do NOT remove `.claudeloop/`. It contains state written through claudeloop's normal pipeline. The next real run overwrites it naturally.

## Toast / Notification Capture Recipe

Toasts auto-dismiss in ~1s. A single screenshot races the dismissal. Use a capture series instead.

```bash
# Capture series: 12 frames at 500ms intervals = 6s window
toast_capture_series() {
    local SESSION_SCREENSHOTS="$1"
    local WINDOW_ID="$2"
    local PREFIX="${3:-toast}"

    for i in $(seq -w 1 12); do
        screencapture -l "$WINDOW_ID" "$SESSION_SCREENSHOTS/${PREFIX}-frame-${i}.png" 2>/dev/null
        sleep 0.5
    done
    echo "Toast capture series complete: 12 frames in $SESSION_SCREENSHOTS"
}

# Usage: trigger the action, then immediately start the series
# (run in background while action fires, or start before triggering)
toast_capture_series "$SESSION_DIR/screenshots" "$WINDOW_ID" "ac3-toast"
```

After capture, read every frame in sequence. Write the Per-AC Record observation from the first frame that shows the toast — or BLOCKED if no frame shows it.

**If MCP `/state.notifications` is available** (future), prefer polling over frame capture:
```bash
# Poll for notification matching text
BEFORE_TS=$(date +%s%3N)
# ... trigger action ...
for i in $(seq 1 12); do
    NOTIFS=$(curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/state" \
      | python3 -c "import sys,json; s=json.load(sys.stdin); print(s.get('notifications','[]'))")
    echo "$NOTIFS" | grep -q "Plan ready" && { echo "PASS: toast found"; break; }
    sleep 0.5
done
```

## What Counts as an Observation

An observation is a **literal description of what is visible in the captured frame or returned by `/state`**. It is not an inference, a hope, or a deduction from side-effects.

**PASS examples (literal, specific):**
- "Screenshot 02 shows the Oxveil sidebar in stale state; the Resume and Dismiss buttons are visible; no notification badge is present."
- "Frame 3 of the toast series shows a blue notification at the top of the editor reading 'Plan ready: handoff.md' with Form Plan and Dismiss buttons."
- "`/state` returns `view=ready` and `plan.phases` has 3 entries matching the written PLAN.md."

**BLOCKED examples (honest, with reason):**
- "Screenshots 12 and 13 show the editor and sidebar with no toast visible; the notification area is empty in both frames. Capture fired after auto-dismiss."
- "All 12 toast-series frames show no notification; toast either did not fire or dismissed before frame 1 at t+0ms."
- "`/state` does not include a `notifications` field; there is no programmatic way to confirm the toast rendered."

**FAILED examples (contradictory evidence):**
- "`/state` returns `planPreview.activeFilePath = '...qa-verification-design.md'` — the spec file, not the foreign plan written for this AC."
- "Screenshot 05 shows the sidebar still in 'stale' state after clicking Resume; expected 'ready'."

**Never acceptable as an observation:**
- "The sentinel file was deleted so the toast must have fired." (inference from side-effect)
- "The command executed without error so the UI probably updated." (no visual evidence)
- "Panel is visible." (not specific enough — what does the panel show?)

## SESSION.md Template

```markdown
# Verification: {context-title}
Started: {YYYY-MM-DD HH:MM:SS}
Platform: macOS (System Events: "Code", CGWindowList: "Visual Studio Code")

## Fix description
{One sentence describing what was fixed}

## Acceptance Criteria
- [ ] {Copy verbatim from plan ## Acceptance Criteria — check off as verified}
- [ ] {Second criterion}

## Actions log
{HH:MM:SS} {ACTION} {description} — {result}

## Changes Made
- {file:line} — {description}

## Cleanup
- [ ] EDH window closed
- [ ] Mock .claudeloop/ removed (if created)
- [ ] Fake CLI temp dirs removed (if created)
- [ ] No orphan processes

result: {PASS|FAIL}
Completed: {YYYY-MM-DD HH:MM:SS}
Iterations: {N}
```

**Acceptance Criteria rules:**
- Copy checkboxes verbatim from plan's `## Acceptance Criteria` section
- Check off (`- [x]`) each criterion as it is observed during verification
- All must be `- [x]` before marking the Verify task complete
- Gate 12 in completion-bundle.sh blocks TaskUpdate if any `- [ ]` remain

## Cost Control for Real Claude Instances

Plan chat auto-defaults to haiku in EDH. Override: `OXVEIL_CLAUDE_MODEL=sonnet code --extensionDevelopmentPath="$(pwd)"`. Env var takes precedence. No override in production.

## Common Issues Checklist

- Status bar text truncated or wrong icon
- Tree view not refreshing after state change
- Notification at wrong time or wrong severity
- Output channel not streaming or missing lines
- Commands enabled in wrong states (e.g., Stop when nothing running)
- Extension not activating on expected events
- Click actions not wired (status bar click, tree item click)
- Welcome/not-found state not showing when expected
- MCP bridge not starting (check `oxveil.mcpBridge` setting, `.oxveil-mcp` file)
- Sidebar button click dispatched but state unchanged (check `/state` before and after)
- Bridge auth rejected (stale discovery file — reload EDH)

### MCP says "ready" but webview shows "stale"

MCP `/state` calls `buildFullState()` on-demand — returns computed state.
Webview only updates when `sidebarPanel.updateState()` is explicitly called.

These can diverge when:
- File watcher updated in-memory state but no trigger called `updateState()`
- `phases-changed` event fired (triggers `sendProgressUpdate`, NOT full `updateState`)

**Fix:** Restart EDH for clean init state. Don't fight stale webview.

## v0.1 Verification Targets
<!-- TODO: verify if still current -->

| Surface | States to Verify | Reference Mockup |
|---------|-----------------|------------------|
| Status bar | not-found, installing, ready, idle, running, failed, done | `docs/mockups/v01-status-bar.png` |
| Phase tree view | welcome, not-found guidance, running with phases, completed | `docs/mockups/v01-phase-tree-view.png` |
| Command palette | All 5 commands visible, correct when-clause gating | `docs/mockups/v01-command-palette.png` |
| Output channel | live.log streaming, stderr prefixed | `docs/mockups/v01-output-channel.png` |
| Notifications | Phase complete, phase failed, claudeloop not found | `docs/mockups/v01-notifications.png` |

## Error Handling

- **Build failure:** Log error. Do NOT launch EDH. Skip to Phase 6.
- **Launch failure:** Retry once with 15s wait. If still fails, skip to Phase 6.
- **Screenshot failure:** Blocking. Retry once. If still fails, stop and tell user.
- **osascript failure:** Menu clicks for destructive ops, `set frontmost` + AXRaise for keystrokes. Retry once.
- **Vision inconclusive:** Log "analysis inconclusive" and continue.

## Terminal Input

Use `type_in_terminal_gui` (see [GUI Primitives](#gui-primitives)) — clicks into the terminal area and types via cliclick. This mirrors how a real user interacts with the Plan Chat terminal.

```bash
# Click Let's Go to open Plan Chat, then type
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"createPlan"}' "http://127.0.0.1:$PORT/click"
sleep 2

# Get EDH window geometry
WIN_INFO=$(osascript -e '
tell application "System Events"
    tell process "Code"
        set edhWin to (first window whose name contains "[Extension Development Host]")
        set p to position of edhWin
        set s to size of edhWin
        return (item 1 of p) & "," & (item 2 of p) & "," & (item 1 of s) & "," & (item 2 of s)
    end tell
end tell')
WIN_X=$(echo $WIN_INFO | cut -d, -f1)
WIN_Y=$(echo $WIN_INFO | cut -d, -f2)
WIN_W=$(echo $WIN_INFO | cut -d, -f3)
WIN_H=$(echo $WIN_INFO | cut -d, -f4)

# Click center of editor area where Plan Chat terminal appears
cliclick c:$((WIN_X + WIN_W / 2)),$((WIN_Y + WIN_H / 2))
sleep 0.5

type_in_terminal_gui "plan how to add a button"
```

**Terminal Enter — MANDATORY:** Use `workbench.action.terminal.sendSequence` with `\r` to submit input. `cliclick kp:return` is **forbidden** for terminal Enter — VS Code is not reliably frontmost in automation and the keystroke drops silently.

```bash
# Submit a prompt in Plan Chat terminal
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"workbench.action.terminal.sendSequence","args":[{"text":"\r"}]}' \
  "http://127.0.0.1:$PORT/command"
```

## Waiting for Plan Files

Poll for new plan files created by Claude after typing in Plan Chat.
Uses workspace-local marker to avoid /tmp collisions across workspaces.

```bash
# Wait for a plan file newer than marker, up to TIMEOUT seconds
# Returns the path of the newest matching file, or "TIMEOUT" on failure
wait_for_plan_file() {
    local WORKSPACE="${1:-.}"
    local TIMEOUT="${2:-120}"
    local MARKER="$WORKSPACE/.claude/.plan-marker"
    local END=$((SECONDS + TIMEOUT))

    while [[ $SECONDS -lt $END ]]; do
        # Find newest .md file created after marker (sort by mtime)
        local PLAN
        PLAN=$(find "$WORKSPACE/.claude/plans" -name "*.md" -newer "$MARKER" -print0 2>/dev/null \
          | xargs -0 ls -t 2>/dev/null | head -1)
        [[ -n "$PLAN" ]] && { echo "$PLAN"; return 0; }
        sleep 2
    done
    echo "TIMEOUT"
    return 1
}

# Usage pattern:
# 1. Touch marker BEFORE triggering Claude
mkdir -p "$WORKSPACE/.claude"
touch "$WORKSPACE/.claude/.plan-marker"
# 2. Type in Plan Chat
type_in_plan_chat "plan how to add a button\n"
# 3. Wait for file
PLAN_FILE=$(wait_for_plan_file "$WORKSPACE" 120)
[[ "$PLAN_FILE" != "TIMEOUT" ]] || { echo "FAIL: No plan file created"; return 1; }
echo "Plan file: $PLAN_FILE"
```

## End-to-End: Plan Chat → Plan Preview Verification

Full workflow: click Let's Go → type in Plan Chat → wait for plan file → verify Plan Preview via /state.
Requires: $PORT, $TOKEN from .oxveil-mcp, type_in_plan_chat, wait_for_plan_file.

**Timing prerequisite**: PlanFileResolver detects plans by filesystem mtime/birthtime (watcher debounce ~200ms, poll interval 5s). The `sleep 3` at step 4 below covers the debounce but not the poll — if the watcher isn't registered, increase to `sleep 6`.

```bash
verify_plan_chat_flow() {
    local WORKSPACE="${1:-.}"

    # 1. Click Let's Go
    curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{"command":"createPlan"}' "http://127.0.0.1:$PORT/click"
    sleep 2

    # 2. Mark time, type prompt
    mkdir -p "$WORKSPACE/.claude"
    touch "$WORKSPACE/.claude/.plan-marker"
    type_in_plan_chat "plan how to add a button\n"

    # 3. Wait for plan file (120s timeout — Claude responses can be slow)
    PLAN_FILE=$(wait_for_plan_file "$WORKSPACE" 120)
    [[ "$PLAN_FILE" != "TIMEOUT" ]] || { echo "FAIL: No plan file created"; return 1; }
    echo "Plan file: $PLAN_FILE"

    # 4. Wait for Plan Preview to update
    sleep 3

    # 5. Verify via /state (no vision needed)
    STATE=$(curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/state")
    VISIBLE=$(echo "$STATE" | jq -r '.planPreview.visible // false')
    FORMED=$(echo "$STATE" | jq -r '.planPreview.planFormed // false')
    PHASES=$(echo "$STATE" | jq '.planPreview.phases | length // 0')

    echo "planPreview.visible=$VISIBLE planFormed=$FORMED phases=$PHASES"
    [[ "$VISIBLE" == "true" && "$PHASES" -gt 0 ]] && echo "PASS" || { echo "FAIL: planPreview not ready (visible=$VISIBLE phases=$PHASES)"; return 1; }
}
```

## Assertion Target Priority

Pick the highest-fidelity assertion available. Lower tiers are acceptable only when higher tiers are structurally unavailable.

| Priority | Target | Example |
|----------|--------|---------|
| 1 (best) | MCP state field | `jq -r '.sessions[0].phase'` |
| 2 | File content | `cat .claudeloop/PLAN.md \| grep "phase-count"` |
| 3 | Log substring via `/log-tail` | `curl .../log-tail?grep=formPlan+adapter` |
| 4 (last resort) | Screenshot pixel region | Visual only — Tier 1 checks |

Never use log assertions as primary evidence when a state field exists. Logs confirm execution; state confirms outcome.

## `/log-tail` Endpoint Recipe

Query extension host console logs for VV assertions. Requires MCP bridge running (`oxveil.mcpBridge: true`).

```bash
# Read TOKEN and PORT from discovery file
MCP_FILE=$(cat "$(pwd)/.oxveil-mcp" 2>/dev/null || cat "../oxveil-verify-*/. oxveil-mcp" 2>/dev/null)
TOKEN=$(echo "$MCP_FILE" | jq -r '.token')
PORT=$(echo "$MCP_FILE" | jq -r '.port')

# Get all logs since timestamp (ms epoch)
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:$PORT/log-tail"

# Filter by substring
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:$PORT/log-tail?grep=formPlan+adapter"

# Get logs since a timestamp (avoids re-reading pre-test logs)
BEFORE_TS=$(date +%s%3N)
# ... trigger action ...
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:$PORT/log-tail?since=${BEFORE_TS}&grep=formPlan+adapter"

# Assert a specific log line appeared
assert_log_line() {
    local grep_term="$1"
    local since_ts="${2:-0}"
    local result
    result=$(curl -s -H "Authorization: Bearer $TOKEN" \
        "http://127.0.0.1:$PORT/log-tail?since=${since_ts}&grep=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$grep_term")")
    local count
    count=$(echo "$result" | jq 'length')
    [[ "$count" -gt 0 ]] && echo "PASS: found '$grep_term' ($count entries)" \
        || { echo "FAIL: '$grep_term' not in logs since $since_ts"; return 1; }
}
```

Response format: `[{"t": <epoch_ms>, "line": "<text>"}, ...]`

Coverage: wraps `console.log/warn/error` only. Subprocess stdout (claudeloop) and `outputChannel.appendLine` are NOT captured.

## ExitPlanMode Handover End-to-End

Full path: Plan Chat → claude calls ExitPlanMode → terminal intercept → user picks "Form Plan with Oxveil" → sentinel → planInterceptWatcher → `oxveil.formPlan` → Live Run opens.

**Prerequisites:** `[needs-real-session]` — run `vv-harness-preflight.sh` first (or `oxveil.start` via MCP then verify `processManager.exists=true`).

```bash
# Step 1: Start claudeloop session (provides processManager)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"oxveil.start"}' "http://127.0.0.1:$PORT/command"
# Wait for processManager.exists=true
until curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/state" \
  | jq -e '.processManager.exists == true' > /dev/null 2>&1; do sleep 1; done

# Step 2: Open Plan Chat (Let's Go)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"createPlan"}' "http://127.0.0.1:$PORT/click"
sleep 2

# Step 3: Type prompt + submit (see Terminal Input section — sendSequence ONLY)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"workbench.action.terminal.sendSequence","args":[{"text":"Plan a dark mode toggle feature\r"}]}' \
  "http://127.0.0.1:$PORT/command"

# Step 4: Wait for plan file written by claude (see Waiting for Plan Files section)
# wait_for_plan_file() polls .claude/plans/*.md for new content

# Step 5: Detect intercept dialog
# The AskUserQuestion prompt appears in the Plan Chat terminal.
# Screenshot to capture it (see Phase 3 maximize before capture).
# The intercept sends {action:"formPlan",planFile:"<abs-path>"} sentinel via the hook.
# To exercise the handover from harness, write sentinel directly:
PLAN_FILE="$(ls -t "$(pwd)/.claude/plans/"*.md 2>/dev/null | head -1)"
SENTINEL="$(pwd)/.claude/oxveil-execute"
printf '{"action":"formPlan","planFile":"%s"}' "$PLAN_FILE" > "$SENTINEL"

# Step 6: Assert sentinel consumed + view=running
sleep 2
STATE=$(curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/state")
echo "$STATE" | jq -e '.view == "running"' && echo "PASS: Live Run opened" \
  || echo "FAIL: view=$(echo "$STATE" | jq -r '.view') — check processManager.exists and plan file path"
[ ! -f "$SENTINEL" ] && echo "PASS: sentinel consumed" || echo "FAIL: sentinel still present"
```

**Failure diagnosis:** If `view` stays `planning` after sentinel write, check `/log-tail?grep=formPlan`:
- `outcome=silent-exit reason=no-process-manager` → processManager null; `oxveil.start` was not called or session not detected
- `outcome=silent-exit reason=no-workspace-folder` → workspace folder not resolved
- No log line → planInterceptWatcher did not fire; check sentinel path is inside workspace root

## submit_prompt_to_plan_chat

Sends a prompt to the active Plan Chat terminal and submits it. Codifies the two-`\r` quirk: the first `sendSequence` displays the text but doesn't submit; a second bare `\r` actually sends it.

**Rationale:** `osascript keystroke` is unreliable for VS Code terminals. `sendSequence` with a trailing `\r` in the same call echoes the text but leaves claude waiting; only a second bare `\r` triggers submission. This is a harness quirk present regardless of Tamp/proxy state.

```bash
# Read MCP credentials
PORT=$(jq -r '.port' "$WORKTREE_PATH/.oxveil-mcp")
TOKEN=$(jq -r '.token' "$WORKTREE_PATH/.oxveil-mcp")

submit_prompt_to_plan_chat() {
  local prompt="$1"

  # Focus Plan Chat terminal
  curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"command":"oxveil.focusPlanChat"}' "http://127.0.0.1:$PORT/command"
  sleep 0.5

  # Type prompt (displayed but NOT submitted yet)
  curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"command\":\"workbench.action.terminal.sendSequence\",\"args\":[{\"text\":\"$prompt\"}]}" \
    "http://127.0.0.1:$PORT/command"
  sleep 0.3

  # Submit with bare Enter
  curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"command":"workbench.action.terminal.sendSequence","args":[{"text":"\r"}]}' \
    "http://127.0.0.1:$PORT/command"
}

# Example: submit a plan prompt and wait for denyCount to increment
DENY_BEFORE=$(curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/state" | jq '.denyCount // 0')
submit_prompt_to_plan_chat "Write a TypeScript function that returns the first N primes. Form a plan first. Do not ask any clarifying questions — make reasonable assumptions and proceed."
# Poll for denyCount + 1 within 90s (real claude responds)
timeout 90 bash -c "
  until [ \$(curl -s -H 'Authorization: Bearer $TOKEN' 'http://127.0.0.1:$PORT/state' | jq '.denyCount // 0') -gt $DENY_BEFORE ]; do
    sleep 2
  done
" && echo "PASS: prompt submitted and claude responded" || echo "FAIL: denyCount did not increment within 90s"
```

## find_plan_marker

Locates the active `oxveil-plan-active` marker file by name under workspace storage. Returns the path without relying on mtime (which fails across worktrees and multi-instance setups).

**Rationale:** The marker path is workspace-storage-ID-keyed (`~/Library/Application Support/Code/User/workspaceStorage/<id>/chmc.oxveil/oxveil-plan-active`). The ID changes per worktree and cannot be predicted. Finding by name is stable.

```bash
find_plan_marker() {
  find ~/Library/Application\ Support/Code/User/workspaceStorage \
    -name "oxveil-plan-active" -print 2>/dev/null | head -1
}

# Pre-clear marker before formPlan (prevents stale sentinel reuse)
MARKER=$(find_plan_marker)
if [ -n "$MARKER" ]; then
  rm -f "$MARKER"
  echo "Cleared stale marker: $MARKER"
else
  echo "No stale marker found — clean"
fi

# Post-formPlan: verify marker written
MARKER=$(find_plan_marker)
[ -n "$MARKER" ] && echo "PASS: marker exists at $MARKER" || echo "FAIL: marker not written"
```

## bypass_verification_dialog

Dismisses the AI plan-verification ("Verification Failed") dialog programmatically via MCP, allowing the session to proceed without manual intervention. Requires the `oxveil.confirmPlan` command (registered in package.json contributes).

**Rationale:** The dialog's DOM selectors are not reliably reachable via MCP `/click`, and cliclick coordinate-guessing fails when the window is in a non-standard position. `oxveil.confirmPlan` calls `liveRunPanel.triggerAiParseAction("ai-parse-continue")` directly — same effect as clicking "Continue As-is".

```bash
# Poll for AI parse to reach the verification-pending state, then dismiss
bypass_verification_dialog() {
  local port="$1"
  local token="$2"
  local timeout_s="${3:-30}"

  echo "Waiting for verification dialog (up to ${timeout_s}s)..."
  local i=0
  while [ "$i" -lt "$timeout_s" ]; do
    STATE=$(curl -s -H "Authorization: Bearer $token" "http://127.0.0.1:$port/state")
    AI_PARSE_STATUS=$(echo "$STATE" | jq -r '.aiParseStatus // ""')
    if [ "$AI_PARSE_STATUS" = "verification-failed" ] || [ "$AI_PARSE_STATUS" = "verifying" ]; then
      echo "Dialog detected (status=$AI_PARSE_STATUS) — dismissing via oxveil.confirmPlan"
      curl -s -X POST -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
        -d '{"command":"oxveil.confirmPlan"}' "http://127.0.0.1:$port/command"
      echo "PASS: bypass_verification_dialog invoked"
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  echo "WARN: verification dialog did not appear within ${timeout_s}s — may have already passed or been skipped"
}

# Example usage after submit_prompt_to_plan_chat completes ExitPlanMode
bypass_verification_dialog "$PORT" "$TOKEN" 30

# Verify session proceeds: view transitions to running
sleep 3
VIEW=$(curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/state" | jq -r '.view')
[ "$VIEW" = "running" ] && echo "PASS: session running" || echo "FAIL: view=$VIEW after bypass"
```

---

## Hook Fixture Helpers

Use these when verifying a CC hook (PreToolUse/PostToolUse/UserPromptSubmit) in a VV session.
Fixtures must live OUTSIDE any `oxveil-verify-*` worktree — `planning-checklist.sh` line 9 early-exits
on worktree paths, making both branches return the same result.

```bash
# setup_planning_hook_fixture <name>
# Creates /tmp/vv-<name>-fixture-XXXXXX/ with the skeleton planning-checklist.sh needs.
# Exports CLAUDE_PROJECT_DIR to the fixture path.
# Prints the fixture path — capture it for teardown.
setup_planning_hook_fixture() {
  local name="$1"
  local fixture
  fixture="$(mktemp -d "/tmp/vv-${name}-fixture-XXXXXX")"
  mkdir -p "$fixture/.claude/plans" "$fixture/.claude/workflow-state/goals" "$fixture/docs"
  local main_repo
  main_repo="$(git worktree list --porcelain | awk '/^worktree/ {print $2; exit}')"
  cp "$main_repo/docs/FEATURES.md" "$fixture/docs/FEATURES.md" 2>/dev/null || {
    echo "WARN: docs/FEATURES.md not found in main repo — hook may exit early on FEATURES check" >&2
  }
  export CLAUDE_PROJECT_DIR="$fixture"
  echo "$fixture"
}

# teardown_planning_hook_fixture <fixture-path>
# Removes the fixture dir and unsets CLAUDE_PROJECT_DIR.
teardown_planning_hook_fixture() {
  local fixture="$1"
  [ -n "$fixture" ] && [ -d "$fixture" ] && rm -rf "$fixture"
  unset CLAUDE_PROJECT_DIR
}
```

Example usage:

```bash
source .claude/skills/visual-verification/references/visual-verification-recipes.md
FIXTURE="$(setup_planning_hook_fixture "my-hook-test")"

# Run hook under test against the fixture
PLAN_FILE="$FIXTURE/.claude/plans/test.md" \
  bash .claude/hooks/planning-checklist.sh < /dev/null

teardown_planning_hook_fixture "$FIXTURE"
```

## Plan-Fixture Injection for Per-Branch Hook ACs

**Problem:** When VV exercises `planning-checklist.sh` ACs in plan-chat, plan-chat-claude always writes its own plan before calling `ExitPlanMode`. The hook's discovery path (`ls -t .claude/plans/*.md | head -1`) then picks claude's plan, not your fixture. Per-branch isolation (e.g. "VV Transcript missing" vs "Task Tracking missing transcript task" vs "N/A bypass") becomes impossible because every flow evaluates claude's autogenerated plan, which fails the earliest check regardless of which branch you're testing.

**Solution:** Set `PLAN_FILE=<fixture>` in the EDH-launching environment. `planning-checklist.sh:24-31` checks `$PLAN_FILE` first, before the `ls -t` discovery. The hook reads the fixture directly; claude's auto-plan is ignored.

**Contract:**

1. **Use `PLAN_FILE` for per-branch flows** — when an AC tests a specific deny reason (reason X for input shape Y), write a fixture plan that hits exactly that branch and set `PLAN_FILE` before launching EDH.

2. **Keep ≥1 discovery flow with no override** — at least one AC per VV session must exercise the natural `ls -t` path to prove the file-selection logic works end-to-end. Do NOT set `PLAN_FILE` for this flow.

3. **Tag in SESSION.md Per-AC Record** — each Per-AC Record must note which isolation method was used:
   - `[discovery-flow]` — hook found the plan via `ls -t` (real harness, no override)
   - `[fixture-injected via PLAN_FILE]` — hook used `$PLAN_FILE` override

4. **Unset after VV** — add `unset PLAN_FILE` to your Phase 6 cleanup to prevent stale env from leaking into a subsequent non-VV plan-mode session in the same shell.

**How to set `PLAN_FILE` for an EDH launch:**

Option A — shell env (simplest, applies to this EDH launch only):
```bash
# Write fixture
cat > /tmp/fixture-no-transcript-task.md <<'EOF'
## Feature
test feature
## Visual Verification
- [ ] something observable in plan-chat terminal output
## VV Transcript
I see the deny payload containing the expected message.
## Task Tracking
1. Do something without the word transcript here
## Acceptance Criteria
- [ ] deny fires
## Root Cause Evidence
[N/A-symptom-only]
## Harness Requirements
[needs-real-session]
## Side-Effects
N/A - typo fix
## Architecture Impact
N/A - bug fix
## ADR
N/A - bug fix
## State Machine / Sync
N/A - bug fix
## Tests
N/A - bug fix
## Documentation
N/A - docs only
## package.json / contributes
N/A
## CHANGELOG
N/A
## README
N/A
EOF

# Launch EDH with PLAN_FILE injected
PLAN_FILE=/tmp/fixture-no-transcript-task.md \
  code --extensionDevelopmentPath="$WORKTREE_PATH" \
       --disable-extension GitHub.copilot-chat \
       "$WORKTREE_PATH"
```

Option B — `.claude/settings.local.json` hooks env block (persists for the workspace):
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "ExitPlanMode",
      "hooks": [{
        "type": "command",
        "command": "PLAN_FILE=/tmp/fixture-no-transcript-task.md \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/planning-checklist.sh"
      }]
    }]
  }
}
```
Note: `settings.local.json` is gitignored. Remove or blank the `PLAN_FILE=...` prefix after VV.

**Worked example — VV with 3 flows (1 discovery + 2 fixture-injected):**

```
Flow A (discovery): submit "Call ExitPlanMode" to plan-chat.
  claude auto-writes its own plan → ls -t picks it up.
  Observe deny for whatever branch claude's plan fails on.
  Per-AC: Status: PASS [real-harness] [discovery-flow]

Flow B (fixture-injected): set PLAN_FILE=/tmp/fixture-no-transcript-task.md in EDH env.
  submit "Call ExitPlanMode" to plan-chat.
  claude auto-writes its own plan (ignored by hook — $PLAN_FILE takes precedence).
  Observe deny "Task Tracking missing transcript task" — the fixture's specific branch.
  Per-AC: Status: PASS [real-harness] [fixture-injected via PLAN_FILE]

Flow C (fixture-injected): set PLAN_FILE=/tmp/fixture-vv-na.md in EDH env.
  submit "Call ExitPlanMode" to plan-chat.
  Observe approve (no deny) — N/A bypass fires.
  Per-AC: Status: PASS [real-harness] [fixture-injected via PLAN_FILE]
```

**Phase 6 cleanup addition:**
```bash
unset PLAN_FILE  # prevent stale fixture from leaking into next plan-mode session
```
