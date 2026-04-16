---
title: Oxveil User Stories
version: 1.0.0
parent: docs/workflow/states.md
---

# User Stories

Each story traces the code path from trigger to final state across all four state systems. See [states.md](states.md) for the state tables, decision tables, and transition matrices referenced here.

---

### US-01: Extension Loads (Activation Sequence)

**As-is:**

1. `activate()` in `extension.ts` is called by VS Code
2. Status bar item created (no state yet — shows nothing until `update()` called)
3. `activateDetection()` runs: checks claudeloop version ≥ 0.22.0, sets context keys `oxveil.detected` and `oxveil.processRunning=false`, detects Claude CLI → sets `oxveil.claudeDetected`
4. Status bar updated: `ready` if detected, `not-found` otherwise
5. `WorkspaceSessionManager` created, one `WorkspaceSession` per folder (if detected)
6. PLAN.md existence checked via `fs.access()`
7. Webview panels created (dependency graph, timeline, config wizard, replay viewer, archive timeline, live run, plan preview)
8. `activateSidebar()` initializes sidebar state with detection result and initial plan status
9. `wireAllSessions()` connects SessionState events to all UI targets
10. `initWorkspaceWatchers()` starts `.claudeloop/` file watchers, calls `checkInitialState()` per session
11. Sidebar receives initial full state push
12. Archives loaded asynchronously, sidebar refreshed again

**To-be:** Same as as-is — activation sequence is correct.

**States touched:**
- Session: starts at `idle` (or `running` if `checkInitialState()` finds lock)
- Sidebar: `not-found` or `empty` or `stale` (if plan detected with no progress)
- StatusBar: `not-found` or `ready`
- PlanPreview: not initialized until revealed

**Context keys set:** `oxveil.detected`, `oxveil.processRunning=false`, `oxveil.claudeDetected`, `oxveil.walkthrough.hasPlan` (if plan exists)

**Edge cases:**
- Extension activates while claudeloop is already running → `checkInitialState()` detects lock → Session transitions to `running`
- PLAN.md check and detection both use await — if either hangs, activation blocks. Detection uses execFile (no timeout wrapper in `activateDetection()` itself, but `activate()` has a try-catch pattern)

<!-- GAP: activateDetection() uses execFile without an explicit timeout. While the CLAUDE.md hard rule says "never await an external process without a timeout in activate()", the detection call is at the top of activate(). If claudeloop binary hangs, the entire extension activation blocks. -->

---

### US-02: Initial View (Empty State)

**As-is:**

1. Sidebar webview resolves, receives initial state
2. `deriveViewState()` returns `"empty"` when: detected + idle + no plan + no progress
3. `renderEmpty()` shows: discussion icon, "From Idea to Reality" title, "Let's Go" primary button, "How it works" steps, secondary buttons (Write Plan, AI Parse, Form Plan)
4. Archives section shown below if any exist

**To-be:** Same as as-is.

**States touched:**
- Sidebar: `empty`
- StatusBar: `ready` or `idle`

---

### US-03: User Clicks "Let's Go"

**As-is:**

1. Button click sends `{ command: "createPlan" }` to extension
2. Dispatched to `oxveil.createPlan` → delegates to `oxveil.openPlanChat`
3. `registerPlanChat` handler: validates Claude CLI, prevents duplicate sessions, resolves model (haiku in dev mode)
4. Creates VS Code terminal with Claude CLI: `claude [--model haiku] --append-system-prompt "..." --permission-mode plan`
5. `onPlanChatSessionCreated` callback: calls `sidebar.onPlanReset()` (sets `planUserChoice="dismiss"`, clears cached phases), resets active session state, sets `oxveil.planChatActive=true`
6. `planPreviewPanel.beginSession()` called → resets file tracking
7. `planPreviewPanel.reveal()` opens panel in column 2
8. `planPreviewPanel.setSessionActive(true)` → panel enters `active` state

**To-be:** Same as as-is.

**States touched:**
- Session: `reset()` called if was `done`/`failed` → transitions to `idle`
- Sidebar: `onPlanReset()` → `planUserChoice="dismiss"` → view recalculates (likely `empty`)
- PlanPreview: `empty` (no phases yet) then `active` when Claude writes plan files

**Context keys:** `oxveil.planChatActive=true`

**Edge cases:**
- Double-click: prevented by `getActivePlanChatSession()` check — returns early if session exists
- Claude CLI not found: shows error notification, no terminal created

---

### US-04: User Converses Plan in Chat

**As-is:**

1. Claude writes plan files to workspace (PLAN.md, .claudeloop/design.md, etc.)
2. PLAN.md file watcher in `registerPlanWatcher()` fires `onDidCreate` → sets `planDetected=true`, updates sidebar
3. Plan preview file watcher (200ms debounce) detects changes → `onFileChanged()` → `_parseAndRender()`
4. `PlanFileResolver` tracks files by category, auto-switches to newly created categories
5. Parsed phases render as cards in the preview panel
6. If multiple categories exist, tabs appear (Design / Implementation / Plan)
7. User can annotate phases via "Note" buttons → `PlanChatSession.sendAnnotation()` sends text to Claude terminal
8. User can switch tabs manually or via `oxveil.planPreviewNextTab` command

**To-be:** Same as as-is.

**States touched:**
- Sidebar: `empty` → `stale` (PLAN.md created, no progress, `planUserChoice="dismiss"` from onPlanReset → actually goes to `empty` since dismiss is set. Revisit: the sidebar stays `empty` during plan chat because `onPlanReset` sets `planUserChoice="dismiss"`)
- PlanPreview: `empty` → `raw-markdown` (if initial content unparseable) → `active` (once phases parsed)

<!-- GAP: During plan chat, `onPlanReset()` sets `planUserChoice="dismiss"`. When the PLAN.md watcher fires, it only resets planUserChoice if it's not already "resume" or "dismiss". Since "dismiss" is already set, the sidebar stays in "empty" view even though a plan exists. This is intentional — the user is actively creating a plan, so showing "stale" would be confusing. But this coupling between onPlanReset and the watcher guard is implicit and fragile. -->

---

### US-05: User Clicks "Form Plan"

**As-is:**

1. Button click sends `{ command: "formPlan" }` → dispatched to `oxveil.formPlan`
2. Resolves source file from active plan preview tab or argument
3. Reads source file content
4. Checks if PLAN.md exists — if so, asks user for confirmation to replace
5. Writes source content to PLAN.md, sets `oxveil.walkthrough.hasPlan=true`
6. Shows granularity picker (phases / tasks / steps)
7. If user picks granularity: runs `aiParseLoop()` — dry-run AI parse with retry loop (max 3 retries)
8. If AI parse passes: reads result from `.claudeloop/ai-parsed-plan.md`, parses phases
9. Calls `sidebar.onPlanFormed()` → sets `planUserChoice="resume"`, caches phases, updates sidebar
10. Sidebar view becomes `ready` (all-pending phases via cached plan)
11. Opens parsed plan in editor

**To-be:** Same as as-is.

**States touched:**
- Sidebar: `empty` → `ready` (via `onPlanFormed()` setting `planUserChoice="resume"` + caching phases)
- PlanPreview: updates if plan file changes during parse

**Context keys:** `oxveil.walkthrough.hasPlan=true`

**Edge cases:**
- User cancels granularity picker → opens raw plan in editor without AI parse, does not call `onPlanFormed()`
- AI parse dry-run fails silently → falls through to "pass" outcome

---

### US-06: User Clicks "Start"

**As-is:**

1. Button click sends `{ command: "start" }` → dispatched to `oxveil.start`
2. Resolves active session via `resolveFolder()`
3. Calls `processManager.spawn()` — spawns claudeloop child process
4. claudeloop creates `.claudeloop/lock` file
5. File watcher detects lock → `SessionState.onLockChanged({ locked: true })` → transitions `idle` → `running`
6. `wireSessionEvents` state-changed handler fires:
   - Starts elapsed timer
   - Sets `oxveil.processRunning=true`
   - Updates StatusBar to `running` (Phase 1/N | 0m)
   - Auto-reveals LiveRunPanel if configured
   - Resets cost/todo tracking
   - Sends full sidebar state (view = `running`)
7. claudeloop writes `.claudeloop/PROGRESS.md` as phases execute
8. File watcher detects progress changes → `SessionState.onProgressChanged()` → emits `phases-changed`
9. `wireSessionEvents` phases-changed handler: updates DependencyGraph, ExecutionTimeline, LiveRunPanel, StatusBar (current phase), Sidebar (incremental progress update)
10. claudeloop writes to `live.log` → `log-appended` event → LiveRunPanel updated, cost/todos extracted

**To-be:** Same as as-is.

**States touched:**
- Session: `idle` → `running`
- Sidebar: `ready` → `running`
- StatusBar: `idle` → `running`
- PlanPreview: not affected by session start

**Context keys:** `oxveil.processRunning=true`

---

### US-07: Session Completes

**As-is:**

1. claudeloop finishes all phases, removes `.claudeloop/lock`
2. File watcher detects lock removal → `SessionState.onLockChanged({ locked: false })`
3. All phases have `status: "completed"` → transitions `running` → `done`
4. `wireSessionEvents` state-changed handler:
   - Stops elapsed timer
   - Updates StatusBar to `done` (elapsed time)
   - Calls `liveRunPanel.onRunFinished("done")`
   - Sets `oxveil.walkthrough.hasRun=true`
   - Sends full sidebar state
5. Archive refresh triggered → archive created → sidebar updated with new archive entry
6. Sidebar view = `completed`: success banner, summary (elapsed, cost), phase list, "Replay" and "Create New Plan" buttons

**To-be:** Same as as-is.

**States touched:**
- Session: `running` → `done`
- Sidebar: `running` → `completed`
- StatusBar: `running` → `done`

**Context keys:** `oxveil.processRunning=false`, `oxveil.walkthrough.hasRun=true`

---

### US-08: Session Fails

**As-is:**

1. claudeloop phase fails, removes `.claudeloop/lock`
2. File watcher detects lock removal → `SessionState.onLockChanged({ locked: false })`
3. At least one phase has `status: "failed"` → transitions `running` → `failed`
4. `wireSessionEvents` state-changed handler:
   - Stops elapsed timer
   - Finds failed phase number from progress
   - Updates StatusBar to `failed` (failed phase number)
   - Calls `liveRunPanel.onRunFinished("failed")`
   - Sends full sidebar state
5. Archive refresh triggered
6. Sidebar view = `failed`: error snippet (last line of phase log), phase list, "Retry" and "Skip" buttons targeting the failed phase
7. Error snippet read from `.claudeloop/phase-N.log` via `readErrorSnippet()`

**To-be:** Same as as-is.

**States touched:**
- Session: `running` → `failed`
- Sidebar: `running` → `failed`
- StatusBar: `running` → `failed`

**Context keys:** `oxveil.processRunning=false`

**Edge cases:**
- Multiple phases fail → sidebar shows first failed phase for retry/skip
- Phase log missing → error snippet is undefined, still shows failed view without snippet

---

### US-09: User Stops Session

**As-is:**

1. Button click sends `{ command: "stop" }` → dispatched to `oxveil.stop`
2. `processManager.stop()` called → kills child process with 5s timeout
3. claudeloop cleanup removes lock file
4. `SessionState.onLockChanged({ locked: false })` fires
5. Progress has mix of completed and pending phases (no failed) → transitions `running` → `done`
6. `deriveViewState()` with `sessionStatus="done"` and not all completed → returns `stopped`
7. Sidebar view = `stopped`: progress bar, phase list (first pending phase highlighted as "paused"), "Resume" (from next pending phase) and "Restart" buttons

**To-be:** Status bar derives its state from `deriveViewState()`, matching sidebar. When partial progress (not all completed), status bar shows `stopped`. LiveRunPanel shows "Run Stopped" banner (no error styling).

**States touched:**
- Session: `running` → `done`
- Sidebar: `running` → `stopped`
- StatusBar: `running` → `stopped`

**Context keys:** `oxveil.processRunning=false`

**Edge cases:**
- Stop when all phases are actually completed (race) → sidebar shows `completed` instead of `stopped`
- Stop when a phase was in `in_progress` → phase status may stay as `in_progress` in PROGRESS.md (depends on claudeloop cleanup). `deriveViewState` doesn't check for `in_progress` specifically.

<!-- GAP: When a session is stopped mid-phase, the in_progress phase's status in PROGRESS.md may not be reset to "pending" by claudeloop. deriveViewState() treats this as neither failed nor completed+pending mix (since in_progress ≠ completed and in_progress ≠ failed). The fallback path depends on whether planDetected is true. This edge case should be verified against actual claudeloop behavior. -->

---

### US-10: Plan Discovery (Stale State)

**As-is:**

1. Extension activates, `fs.access(PLAN.md)` succeeds → `initialPlanDetected = true`
2. No session running, no progress → `deriveViewState()` returns `stale` (row 12 in decision table)
3. Sidebar view = `stale`: "Found" badge, "A plan file was found. Is this your current work?", "Resume" and "Dismiss" buttons
4. User clicks "Resume" → `onPlanChoice("resume")` → `planUserChoice = "resume"` → sidebar rebuilds → `deriveViewState()` returns `ready` (row 11)
5. User clicks "Dismiss" → `onPlanChoice("dismiss")` → `planUserChoice = "dismiss"` → sidebar rebuilds → `deriveViewState()` returns `empty` (row 10)

**To-be:** Same as as-is.

**States touched:**
- Sidebar: `stale` → `ready` (resume) or `stale` → `empty` (dismiss)

**Edge cases:**
- PLAN.md exists but progress also exists from prior run → sidebar shows `stopped` or `failed` instead of `stale` (rows 6-7 take precedence)
- PLAN.md deleted while stale view is shown → watcher fires, `planDetected=false`, `planUserChoice="none"` → `empty`
- Multiple PLAN.md create/delete events in rapid succession → each triggers full state rebuild, last one wins
