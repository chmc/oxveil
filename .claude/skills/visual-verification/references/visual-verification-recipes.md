---
name: visual-verification-recipes
description: Scripts, templates, and checklists for the visual verification loop skill. Reference file — not a skill.
---

# Visual Verification Recipes

## Contents

- [Safety Rules](#safety-rules)
- [Pre-flight Checks](#pre-flight-checks)
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

## Safety Rules

- **`keystroke` is NOT process-scoped.** It always targets the system frontmost app, regardless of `tell process` target. Never use `keystroke` for destructive operations (Cmd+W, Cmd+Q, Cmd+Shift+W).
- **Use accessibility menu clicks for destructive operations.** `click menu item X of menu Y of menu bar 1` is process-scoped — it cannot misfire to another app.
- **`AXRaise` before menu clicks** to ensure the correct Code window receives the action. AXRaise sets which window is front *within* the process.
- **`set frontmost to true` before non-destructive keystrokes.** Required because `keystroke` goes to system frontmost.

## Pre-flight Checks

Run all of these before starting a session. Abort on any failure.

```bash
# 1. Platform check
[[ "$(uname)" == "Darwin" ]] || { echo "FAIL: macOS required"; exit 1; }

# 2. code CLI in PATH
which code > /dev/null 2>&1 || { echo "FAIL: 'code' CLI not in PATH. Install via Command Palette: Shell Command: Install 'code' command in PATH"; exit 1; }

# 3. Accessibility permission (osascript + System Events)
osascript -e 'tell application "System Events" to get name of first process' > /dev/null 2>&1 || { echo "FAIL: Grant Accessibility permission to $TERM_PROGRAM in System Settings > Privacy & Security > Accessibility"; exit 1; }

# 4. Screen Recording permission
screencapture -x /tmp/oxveil-preflight.png 2>&1
[[ -s /tmp/oxveil-preflight.png ]] || { echo "FAIL: Grant Screen Recording permission to $TERM_PROGRAM in System Settings > Privacy & Security > Screen Recording"; exit 1; }
rm -f /tmp/oxveil-preflight.png

# 5. Close stale EDH windows
# Use process-scoped menu click — cannot misfire to Terminal.
# AXRaise makes the EDH the front window within Code so the menu action targets it.
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

# 6. MCP bridge setting enabled
grep -q '"oxveil.mcpBridge": true' .vscode/settings.json 2>/dev/null || { echo "FAIL: Enable oxveil.mcpBridge in .vscode/settings.json"; exit 1; }
```

## MCP Bridge Recipes

The MCP bridge is the primary method for interacting with sidebar webview buttons during verification. osascript/cliclick synthetic events do not pass through Electron webview iframes.

### Reading discovery file

```bash
# Parse discovery file into PORT and TOKEN variables
DISCOVERY=$(cat .oxveil-mcp)
PORT=$(echo "$DISCOVERY" | python3 -c "import sys, json; print(json.load(sys.stdin)['port'])")
TOKEN=$(echo "$DISCOVERY" | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])")
```

### Polling for bridge readiness after EDH launch

```bash
# Poll for .oxveil-mcp file (max 15 seconds)
for i in $(seq 1 15); do
    [[ -f .oxveil-mcp ]] && break
    sleep 1
done
[[ -f .oxveil-mcp ]] || { echo "FAIL: MCP bridge not started — check oxveil.mcpBridge setting"; exit 1; }
echo "MCP bridge ready after ${i}s"
```

### Common sidebar interactions

```bash
# Get current state
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/state | python3 -m json.tool

# Get just the view name
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/state | python3 -c "import sys, json; print(json.load(sys.stdin)['view'])"

# Click a sidebar button (fire-and-forget — poll state to confirm)
# Body must match the SidebarCommand type exactly — fields are top-level, not nested in "args".
# WRONG: {"command":"skip","args":{"phase":2}}  — silently ignored
# RIGHT: {"command":"skip","phase":2}
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"resumePlan"}' http://127.0.0.1:$PORT/click

# Execute a VS Code command
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"oxveil.start"}' http://127.0.0.1:$PORT/command
```

### Click-and-verify pattern

```bash
# Standard pattern: click, wait, verify state
click_and_verify() {
    local CMD="$1" EXPECTED="$2"
    curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d "{\"command\":\"$CMD\"}" http://127.0.0.1:$PORT/click > /dev/null
    sleep 1
    local VIEW=$(curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/state | python3 -c "import sys, json; print(json.load(sys.stdin)['view'])")
    if [[ "$VIEW" == "$EXPECTED" ]]; then
        echo "OK: $CMD → $EXPECTED"
    else
        echo "FAIL: $CMD → expected $EXPECTED, got $VIEW"
    fi
}

# Usage: click_and_verify "resumePlan" "ready"
```

### Simulate sidebar command

Both `/click` and `_simulateClick` dispatch directly through `dispatchSidebarMessage` on the extension side — neither goes through the webview DOM. Use either for QA automation.

```bash
# Via /click endpoint (POST body is a SidebarCommand)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"restart"}' http://127.0.0.1:$PORT/click

# Via _simulateClick VS Code command (simple command name only, no phase/archive)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"oxveil._simulateClick","args":[{"command":"start"}]}' http://127.0.0.1:$PORT/command
```

`/click` accepts the full `SidebarCommand` shape (including `phase`, `archive`). `_simulateClick` accepts only `{ command: string }` — use `/click` for phase-specific commands like `retry` or `skip`. Both available when MCP bridge is enabled.

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

## End-to-End Workflow Recipes

Combine existing primitives (MCP bridge, fake CLI, screenshots) into complete lifecycle recipes.

### Key transition mechanisms

- PLAN.md creation triggers file watcher → sidebar transitions to `stale` (plan detected, user hasn't confirmed).
- Lock file `.claudeloop/lock` creation → sidebar transitions to `running` (claudeloop executing).
- Lock file removal + all phases completed → sidebar transitions to `completed`.
- State names and derivation logic: `src/views/sidebarState.ts:deriveViewState()`.

### wait_for_view helper

Poll `GET /state` until the sidebar reaches the expected view. Use for async transitions (file watcher, process completion) where a fixed sleep is insufficient.

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

**Prerequisites:**
- EDH launched with fake_claude in PATH (`success` scenario). See [claudeloop Fake CLI > Setup](#claudeloop-fake-cli) above.
- MCP bridge ready. `$PORT` and `$TOKEN` parsed from `.oxveil-mcp`. See [Reading discovery file](#reading-discovery-file) above.
- claudeloop detected (sidebar not in `not-found` state).

**IMPORTANT — Vary plan content every run.** Do NOT reuse the same 2-phase plan template. Each verification session must use a different number of phases (3–6), different titles, and different descriptions. This catches parsing bugs, text truncation, and static-text rendering errors that a fixed template would miss. Use the `generate_plan` helper below.

```bash
# Generate a randomized PLAN.md with 3-6 phases.
# Titles and descriptions vary per run to catch parsing/rendering bugs.
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

# 0. Clean slate — remove any leftover PLAN.md from previous runs
rm -f PLAN.md
wait_for_view "empty" 10

# 1. Verify starting state
VIEW=$(curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/state \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['view'])")
[[ "$VIEW" == "empty" ]] || { echo "FAIL: expected empty, got $VIEW"; exit 1; }
# Screenshot: 01-empty

# 2. Write randomized PLAN.md (## Phase N: headers recognized by parsePlan())
generate_plan > PLAN.md
echo "Generated plan:"
grep "^## Phase" PLAN.md

# 3. File watcher detects PLAN.md → stale
wait_for_view "stale" 10
# Screenshot: 02-stale

# 4. Resume plan → ready
click_and_verify "resumePlan" "ready"
# Screenshot: 03-ready

# 5. Verify phase count and titles match what was written
EXPECTED_PHASES=$(grep -c "^## Phase" PLAN.md)
ACTUAL_PHASES=$(curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/state \
  | python3 -c "import sys, json; s=json.load(sys.stdin); print(len(s.get('plan',{}).get('phases',[])))")
if [[ "$EXPECTED_PHASES" == "$ACTUAL_PHASES" ]]; then
    echo "OK: phase count matches ($ACTUAL_PHASES)"
else
    echo "FAIL: expected $EXPECTED_PHASES phases, sidebar shows $ACTUAL_PHASES"
fi

# 6. Start → running (fake_claude spawned via claudeloop)
click_and_verify "start" "running"
# Screenshot: 04-running

# 7. Wait for fake_claude success scenario to complete
wait_for_view "completed" 45
# Screenshot: 05-completed

# 8. Cleanup (triggers file watcher — expect brief state flicker to empty)
rm -f PLAN.md
```

### Form Plan button path (manual only)

The Form Plan button (`oxveil.formPlan`) cannot be fully automated via MCP bridge:
- Triggers `pickGranularity()` QuickPick — requires osascript to select an option.
- `liveRunPanel` must exist — it is auto-created during `activateViews`, so always available in EDH. No action needed.
- `onPlanFormed()` sets `planUserChoice = "resume"`, transitioning directly to `ready` (skips `stale`).
- Source plan file can have any markdown content — formPlan copies it to PLAN.md, then AI parse extracts phases. Use `## Phase N:` headers for predictable results with fake_claude.

To test manually:
1. Create a source plan file (not named PLAN.md) in the workspace.
2. Use `/command` to invoke: `{"command":"oxveil.formPlan","args":[{"filePath":"/absolute/path/to/source.md"}]}`.
3. QuickPick appears after ~1s. Use osascript to select granularity. Options: `Phases`, `Tasks`, `Steps`.

```bash
# Wait for QuickPick, type "Phases" and confirm
sleep 1
osascript -e '
tell application "System Events"
    tell process "Code"
        set frontmost to true
        perform action "AXRaise" of (first window whose name contains "[Extension Development Host]")
        delay 0.5
        keystroke "Phases"
        delay 0.3
        key code 36
    end tell
end tell'
```

4. `wait_for_view "ready" 15` — formPlan writes PLAN.md, runs AI parse (fake_claude handles it), then calls `onPlanFormed()`.
5. Continue with `start` → `running` as in the Full Lifecycle recipe.
6. Cleanup: `rm -f source-plan.md PLAN.md`

Use the file-write recipe above as the default. Reserve this path for testing the AI-parse pipeline specifically.

### Extended command reference (via /command endpoint)

VS Code commands invoked via `POST /command` (not sidebar button clicks via `/click`):

| Command | Args | Notes |
|---------|------|-------|
| `oxveil.formPlan` | `[{"filePath":"..."}]` | Writes PLAN.md + AI parse. Triggers QuickPick |
| `oxveil.discardPlan` | none | Removes PLAN.md, resets to empty |

## Swift CGWindowID Script

CGWindowList and System Events use **different** names for VS Code:
- **CGWindowList** `kCGWindowOwnerName`: `"Visual Studio Code"` (derived from the `.app` bundle directory name)
- **System Events** process name: `"Code"` (derived from `CFBundleName` in `Info.plist`)
- **Insiders** (assumed, unverified): `"Visual Studio Code - Insiders"` / `"Code - Insiders"` respectively

If window lookup fails, verify the owner name with the diagnostic snippet below.

```bash
# Diagnostic: list all VS Code windows with their CGWindowList owner names
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
# Get CGWindowID for the Extension Development Host window
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
# NEVER use screencapture -w — it requires an interactive click and hangs in automation.
# Always use -l (window ID) or -R (region).

# Capture + resize in one pipeline
screencapture -l "$WINDOW_ID" "$SESSION_DIR/screenshots/$SCREENSHOT_NAME.png"
sips --resampleWidth 1568 "$SESSION_DIR/screenshots/$SCREENSHOT_NAME.png" --out "$SESSION_DIR/screenshots/$SCREENSHOT_NAME.png" > /dev/null 2>&1
```

## Polling for EDH Window Readiness

Replace fixed waits with polling. Use after launching EDH.

```bash
# Poll for EDH window appearance (max 15 seconds)
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

All recipes use `process "Code"` with window name filtering.
`set frontmost to true` is mandatory before any `keystroke` — without it, the keystroke goes to whichever app has system focus.

### Focusing the Plan Chat terminal

The Plan Chat terminal is an editor-area terminal (not the bottom panel). Standard terminal focus methods (`Ctrl+\``, `Terminal: Focus Terminal in Editor Area`) target the bottom panel terminal, NOT the Plan Chat.

**Correct approach:** Call `Oxveil: Plan Chat` via command palette twice. The second invocation detects the existing session and calls `focusTerminal()` which does `terminal.show()` — focusing the Plan Chat terminal specifically.

```bash
# Focus Plan Chat terminal (call the command twice)
# First call: may open Plan Chat if not running, or do nothing
# Second call: focuses the existing Plan Chat terminal
for attempt in 1 2; do
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
            keystroke "Oxveil: Plan Chat"
            delay 0.8
            key code 36
        end tell
    end tell'
    sleep 2
done
# Now keystrokes will reach the Plan Chat terminal
```

**Never use** `click at {x, y}` to focus the Plan Chat terminal — VS Code editor-area terminals don't reliably receive click-based focus via osascript.

```bash
# Focus EDH window and open command palette
# set frontmost to true: makes Code the system frontmost app (required for keystroke)
# AXRaise: makes the EDH the front window within Code
osascript -e '
tell application "System Events"
    tell process "Code"
        set frontmost to true
        perform action "AXRaise" of (first window whose name contains "[Extension Development Host]")
        delay 0.3
        keystroke "p" using {command down, shift down}
    end tell
end tell'

# Type and execute an Oxveil command
osascript -e '
tell application "System Events"
    tell process "Code"
        delay 0.5
        keystroke "Oxveil: Start"
        delay 0.3
        key code 36 -- Enter
    end tell
end tell'

# Close EDH window (for cleanup)
# Use process-scoped menu click — cannot misfire to Terminal.
# AXRaise makes the EDH the front window within Code so the menu action targets it.
osascript -e '
tell application "System Events"
    tell process "Code"
        set edh to (every window whose name contains "[Extension Development Host]")
        if (count of edh) > 0 then
            repeat with w in edh
                perform action "AXRaise" of w
                delay 0.3
                click menu item "Close Window" of menu "File" of menu bar 1
                delay 0.5
            end repeat
        end if
    end tell
end tell'

# Close active editor tab in EDH (e.g., Settings, Welcome)
# Uses process-scoped menu click — cannot misfire to Terminal.
# AXRaise ensures EDH is Code's front window so menu targets the right tab.
osascript -e '
tell application "System Events"
    tell process "Code"
        perform action "AXRaise" of (first window whose name contains "[Extension Development Host]")
        delay 0.3
        click menu item "Close Editor" of menu "File" of menu bar 1
    end tell
end tell'
```

## Maximize Viewport

Run after EDH launch and before first screenshot to maximize the area available for visual analysis. Keep the primary sidebar visible — it contains the Oxveil tree view.

```bash
# Close bottom panel, secondary sidebar, and unwanted editor tabs.
# Keep primary sidebar visible (Oxveil tree view lives there).
# Uses process-scoped menu clicks — cannot misfire to other apps.
osascript -e '
tell application "System Events"
    tell process "Code"
        set frontmost to true
        perform action "AXRaise" of (first window whose name contains "[Extension Development Host]")
        delay 0.3

        -- Close bottom panel (Terminal, Problems, Output, Debug Console)
        -- "Toggle Panel Visibility" toggles it off if open
        try
            click menu item "Panel" of menu "View" of menu bar 1
            delay 0.3
        end try

        -- Close secondary sidebar if open
        try
            click menu item "Secondary Side Bar" of menu "View" of menu bar 1
            delay 0.3
        end try

        -- Close unwanted editor tabs (Welcome, Settings, etc.)
        -- Repeat a few times to catch multiple open tabs
        -- AXRaise before each click — closing a tab can shift focus to another Code window
        repeat 3 times
            try
                perform action "AXRaise" of (first window whose name contains "[Extension Development Host]")
                delay 0.3
                click menu item "Close Editor" of menu "File" of menu bar 1
                delay 0.3
            end try
        end repeat

        delay 0.5
    end tell
end tell'
```

> **Note:** The Panel and Secondary Side Bar menu items toggle visibility. If they are already hidden, clicking them will open them. To avoid this, check the menu item state or screenshot first and only close if visible. In practice, EDH usually launches with the panel open, so toggling once is correct.

## Webview Interaction via Commands

VS Code webview content (iframes) is unreachable via macOS accessibility or coordinate-based clicking. To verify interactive webview features during visual verification, expose the interaction as a VS Code command and invoke it via command palette.

**Pattern:**
1. Add a public method to the panel class (e.g., `nextTab()`)
2. Register as a VS Code command (e.g., `oxveil.planPreviewNextTab`)
3. During verification, invoke via command palette: `Oxveil: Plan Preview — Next Tab`

**Example: Plan Preview tab switching**
```bash
# Focus EDH and invoke the nextTab command
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

**When to apply:** Any webview button, toggle, or interactive element that needs visual verification. The command serves double duty — keyboard-accessible for users AND testable during automation.

## Mock .claudeloop/ State Scripts

Prefer the claudeloop fake CLI (below) for end-to-end dynamic verification. Use manual mocking only for fast static state checks or states hard to trigger via claudeloop (e.g., stale lock after crash).

> **SAFETY:** NEVER delete the `.claudeloop/` directory itself. Only remove individual mock-created files via the `.MOCK_SESSION` marker. See CLAUDE.md hard rules.

Testing-only exception to the read-only IPC contract.

```bash
# Check no real session is running
[[ -f .claudeloop/lock ]] && { echo "ABORT: Real claudeloop session running. Do not mock."; exit 1; }

# --- "idle" state: no active session files ---
# Remove mock-created files only. NEVER delete the directory itself.
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

# --- Cleanup mock (always run in Phase 6) ---
# Remove mock-created files only. NEVER delete the .claudeloop/ directory.
if [[ -f .claudeloop/.MOCK_SESSION ]]; then
  find .claudeloop -newer .claudeloop/.MOCK_SESSION -not -path .claudeloop -delete 2>/dev/null
  rm -f .claudeloop/.MOCK_SESSION
else
  echo "WARNING: .claudeloop/ exists but is not a mock session. Skipping cleanup."
fi
```

**In-memory state caveat:** Removing `.claudeloop/PROGRESS.md` and `lock` from the filesystem does not reset `SessionState` in memory. After a failed/completed run, the sidebar derives from orphaned in-memory progress (e.g., stays "failed" even after file cleanup). To get a clean idle state, reload the EDH window or relaunch EDH. Plan accordingly when testing multiple lifecycle round trips in one session.

## claudeloop Fake CLI

- Path: `<claudeloop-repo>/tests/fake_claude` (local: `/Users/aleksi/source/claudeloop/tests/fake_claude`)
- Replaces the `claude` binary, NOT `claudeloop`. Oxveil still spawns claudeloop normally.
- Outputs NDJSON stream-json to stdout. claudeloop's stream processor converts this to `.claudeloop/` files (live.log, PROGRESS.md, lock).
- Prefer this over manual mocking for dynamic verification (state transitions, timing, full watcher pipeline).
- Use manual mocking (above) for fast static state checks or testing states hard to trigger via claudeloop (e.g., stale lock).
- The `success`, `success_multi`, and `success_realistic` scenarios auto-detect AI-parse and verification prompts, so the `success` scenario works end-to-end with `--ai-parse` (claudeloop's default). No special configuration needed.

### Setup

1. Create temp dir: `FAKE_BIN=$(mktemp -d)`
2. Copy fake CLI as `claude`: `cp /Users/aleksi/source/claudeloop/tests/fake_claude "$FAKE_BIN/claude" && chmod +x "$FAKE_BIN/claude"`
3. Create config dir: `export FAKE_CLAUDE_DIR=$(mktemp -d)`
4. Set scenario: `echo "success" > "$FAKE_CLAUDE_DIR/scenario"`
5. Prepend to PATH: `export PATH="$FAKE_BIN:$PATH"`
6. Launch Oxveil normally. It spawns claudeloop, which finds the fake `claude` in PATH.

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

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `FAKE_CLAUDE_DIR` | Yes | Config dir for scenario, exit_codes, call_count |
| `FAKE_CLAUDE_SLEEP` | No | Sleep duration for `slow` scenario (default: 30s) |
| `FAKE_CLAUDE_THINK` | No | Thinking pause for `success_verbose` (default: 0.3s) |

### Cleanup

- Remove fake bin dir: `rm -rf "$FAKE_BIN"`
- Remove config dir: `rm -rf "$FAKE_CLAUDE_DIR"`
- Do NOT remove `.claudeloop/`. It contains state written through claudeloop's normal pipeline. The next real run overwrites it naturally.

## SESSION.md Template

```markdown
# Verification: {context-title}
Started: {YYYY-MM-DD HH:MM:SS}
Platform: macOS (System Events: "Code", CGWindowList: "Visual Studio Code")

## Log
{HH:MM:SS} {ACTION} {description} — {result}

## Changes Made
- {file:line} — {description}

## Cleanup
- [ ] EDH window closed
- [ ] Mock .claudeloop/ removed (if created)
- [ ] Fake CLI temp dirs removed (if created)
- [ ] No orphan processes

Result: {PASS|FAIL}
Completed: {YYYY-MM-DD HH:MM:SS}
Iterations: {N}
```

## Cost Control for Real Claude Instances

Plan chat automatically uses haiku when running in EDH (`ExtensionMode.Development` detected). No configuration needed.

To override the model (e.g., testing with a specific model):

```bash
OXVEIL_CLAUDE_MODEL=sonnet code --extensionDevelopmentPath="$(pwd)"
```

The env var takes precedence over the dev-mode default. In production (normal VS Code, not EDH), no model override is applied — the user's default model is used.

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

## v0.1 Verification Targets

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
- **Screenshot failure:** Retry once. If still fails, log "unavailable" and continue.
- **osascript failure:** Use menu clicks for destructive operations (close window/tab). Use `set frontmost to true` + AXRaise before non-destructive keystrokes. Retry once. Never use `keystroke` for Cmd+W/Cmd+Q — it targets the system frontmost app, not the `tell process` target.
- **Vision inconclusive:** Log "analysis inconclusive" and continue.
