---
name: visual-verification-recipes
description: Scripts, templates, and checklists for the visual verification loop skill. Reference file — not a skill.
---

# Visual Verification Recipes

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
```

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
        repeat 3 times
            try
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

## claudeloop Fake CLI

- Path: `<claudeloop-repo>/tests/fake_claude` (local: `/Users/aleksi/source/claudeloop/tests/fake_claude`)
- Replaces the `claude` binary, NOT `claudeloop`. Oxveil still spawns claudeloop normally.
- Outputs NDJSON stream-json to stdout. claudeloop's stream processor converts this to `.claudeloop/` files (live.log, PROGRESS.md, lock).
- Prefer this over manual mocking for dynamic verification (state transitions, timing, full watcher pipeline).
- Use manual mocking (above) for fast static state checks or testing states hard to trigger via claudeloop (e.g., stale lock).

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
| `success` | 0 | Single Edit tool use | Basic running → done transition |
| `success_multi` | 0 | Read, Edit, Bash tool uses | Multiple tool activity in output channel |
| `success_verbose` | 0 | 9 turns, TodoWrite, thinking pauses | Full tree view, status bar, output channel test |
| `success_realistic` | 0 | Proper assistant/user wrapping | NDJSON parser accuracy |
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
