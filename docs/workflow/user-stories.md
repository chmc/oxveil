---
title: Oxveil User Stories
version: 2.0.0
parent: docs/workflow/states.md
---

# User Stories

Each story traces the code path from trigger to final state across all four state systems. See [states.md](states.md) for the state tables, decision tables, and transition matrices referenced here.

## Sidebar-First Architecture

The sidebar is the primary UI entry point for all Oxveil workflows. Users interact with the sidebar to:
- Start plan creation (Let's Go, Write Plan, AI Parse, Form Plan)
- Execute sessions (Start, Stop, Resume, Retry, Skip)
- Browse and manage archives (Recent Runs section)
- Access visualization panels (Timeline, Graph links)
- Handle stale state (Resume/Dismiss buttons)
- Recover from errors (Force Unlock, Reset)

Secondary entry points (command palette, status bar clicks, keyboard shortcuts) exist for power users but route through the same command handlers.

---

## Part A: Core Session Lifecycle (US-01 to US-10)

These stories cover the primary session lifecycle from extension activation through completion.

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

---

## Part B: Archive Management (US-11 to US-14)

Archives contain completed session state. These stories cover browsing, replay, restore, and timeline viewing.

---

### US-11: Browse Archives (Recent Runs Section)

**As-is:**

1. Archives are loaded asynchronously during activation via `loadArchives()` in `activateSidebar.ts`
2. Archive entries parsed from `.claudeloop/archive/*/metadata.txt` and `PROGRESS.md`
3. Sidebar state includes `archives: ArchiveView[]` array
4. `renderArchives()` generates "Recent Runs" section with expandable entries
5. Each archive entry shows: name (timestamp-based), status icon, phase count
6. Archive section appears in all non-running sidebar views (empty, ready, stale, stopped, failed, completed)
7. Each entry has action icons: Replay (play icon), Restore (folder-open icon), Timeline (clock icon)
8. User can click "Refresh" icon in archives header to reload

**States touched:**
- Sidebar: archives array populated, section rendered in most views

**Edge cases:**
- No archives exist → section hidden entirely
- Archive parsing fails → entry omitted silently, others still shown
- Large archive count → no pagination (all shown)
- Archive refresh while session running → safe, archives are read-only

---

### US-12: View Archive Replay

**As-is:**

1. User clicks Replay icon on archive entry in sidebar
2. Sidebar sends `{ command: "openReplay", archive: "archiveName" }`
3. Dispatched to `oxveil.archiveReplay` command
4. Command resolves archive path: `.claudeloop/archive/{name}/replay.html`
5. `ReplayViewerPanel.reveal()` called with replay path
6. If panel doesn't exist: creates webview panel in column 1 with CSP headers
7. If panel exists: reveals existing panel
8. Reads `replay.html` content, injects security CSP meta tag
9. Renders claudeloop's replay HTML (terminal recording with playback controls)

**States touched:**
- ReplayViewerPanel: created or revealed

**Edge cases:**
- replay.html doesn't exist → shows "No replay available" info message, no panel created
- Panel already open with different replay → updates HTML content in place
- Multiple archive replays opened → single panel reused (latest wins)

---

### US-13: Restore Archive Session State

**As-is:**

1. User clicks Restore icon on archive entry in sidebar
2. Sidebar sends `{ command: "restoreArchive", archive: "archiveName" }`
3. Dispatched to `oxveil.archiveRestore` command
4. Command checks if session is running → if yes, shows error "Stop the current session first"
5. Shows confirmation dialog: "Restore will overwrite current session state. Continue?"
6. If confirmed: calls `processManager.restore(archiveName)`
7. claudeloop restores progress state from archive to current `.claudeloop/` directory
8. File watchers detect changes → SessionState updated → sidebar refreshes
9. Sidebar now shows restored progress (stopped/failed/completed based on restored state)

**States touched:**
- Session: `idle` → (depends on restored progress)
- Sidebar: refreshes based on restored state

**Edge cases:**
- Session running → blocked with error message
- User cancels confirmation → no action
- Restore fails (archive corrupt/missing) → shows error notification
- Restored state has failed phases → sidebar shows `failed` view with retry option

---

### US-14: View Archive Timeline

**As-is:**

1. User clicks Timeline icon on archive entry in sidebar
2. Sidebar sends `{ command: "archiveTimeline", archive: "archiveName" }`
3. Dispatched to `oxveil.archiveTimeline` command
4. Reads `PROGRESS.md` from archive directory
5. Parses progress to extract phase timing data
6. Optionally reads `metadata.txt` for cost/duration totals
7. `ArchiveTimelinePanel.reveal()` called with archive name, progress, and metadata
8. Panel renders horizontal timeline with phase bars showing duration/status

**States touched:**
- ArchiveTimelinePanel: created or revealed

**Edge cases:**
- PROGRESS.md missing → shows "No timeline data for this run" info message
- Progress has 0 phases → shows "No timeline data for this run"
- metadata.txt missing → proceeds without cost/duration totals (nullable)

---

## Part C: Configuration (US-15)

---

### US-15: Configure claudeloop Settings

**As-is:**

1. User clicks gear icon in sidebar header (configure command) or runs command palette "Oxveil: Open Config Wizard"
2. Sidebar sends `{ command: "configure" }` → dispatched to `oxveil.openConfigWizard`
3. Command resolves config path: `.claudeloop/config` in active workspace
4. `ConfigWizardPanel.reveal()` called with config path
5. If panel doesn't exist: creates webview panel with form UI
6. Panel reads current config via `parseConfig()`, renders form with current values
7. Form fields: PLAN_FILE, MAX_RETRIES, SIMPLE_MODE, timeouts, AI_PARSE, GRANULARITY, etc.
8. Session status checked — if running, form shows "Config changes won't affect running session" warning
9. User modifies fields and clicks Save
10. Panel sends `{ type: "save", config: {...} }` message
11. Handler preserves comments/unknown keys, serializes new config, writes to file
12. Panel re-renders with saved state
13. Sets context key `oxveil.walkthrough.configured=true`

**States touched:**
- ConfigWizardPanel: created or revealed
- Context keys: `oxveil.walkthrough.configured=true`

**Edge cases:**
- Config file doesn't exist → creates with default values on save
- Session running → warning shown but editing allowed (changes apply to next run)
- Invalid values → form validation prevents save
- User clicks Reload → re-reads config file, discarding unsaved changes

---

## Part D: Visualization Panels (US-16, US-17)

---

### US-16: View Dependency Graph

**As-is:**

1. User clicks Graph icon in sidebar or runs "Oxveil: Show Dependency Graph" command
2. Sidebar sends `{ command: "openGraph" }` → dispatched to `oxveil.showDependencyGraph`
3. `DependencyGraphPanel.reveal()` called with current progress
4. If panel doesn't exist: creates webview panel with SVG rendering
5. `layoutDag()` computes node positions based on phase dependencies
6. `renderDagSvg()` generates SVG with phase nodes, dependency edges, status colors
7. Nodes are clickable — clicking a node sends message to open that phase's log
8. Panel receives `phases-changed` events during running session → `update()` re-renders DAG

**States touched:**
- DependencyGraphPanel: created or revealed

**Edge cases:**
- No progress exists → shows empty panel
- Phase has no dependencies → rendered as standalone node
- Many phases → SVG auto-scales, panel scrollable
- Click on node with no log → `oxveil.viewLog` handles gracefully

---

### US-17: View Execution Timeline

**As-is:**

1. User clicks Timeline icon in sidebar or runs "Oxveil: Show Timeline" command
2. Sidebar sends `{ command: "openTimeline" }` → dispatched to `oxveil.showTimeline`
3. `ExecutionTimelinePanel.reveal()` called with current progress
4. If panel doesn't exist: creates webview panel with timeline UI
5. `computeTimeline()` calculates phase start/end times relative to now
6. `renderTimelineHtml()` generates horizontal bar chart with phase durations
7. Bars colored by status (green=completed, yellow=in_progress, red=failed, gray=pending)
8. Panel receives `phases-changed` events during running session → `update()` re-renders

**States touched:**
- ExecutionTimelinePanel: created or revealed

**Edge cases:**
- No progress exists → shows "No timeline data available"
- Phases have no timing data → bars rendered with minimum width
- Session in progress → timeline updates live as phases complete

---

## Part E: Multi-Root Workspace (US-18)

---

### US-18: Switch Workspace Folder (Multi-Root)

**As-is:**

1. Multi-root workspace detected → `WorkspaceSessionManager` creates one `WorkspaceSession` per folder
2. User runs any Oxveil command (start, stop, etc.)
3. `resolveFolder()` called to determine which session to target
4. If command has explicit folder argument → uses that
5. If only one folder → uses it
6. If multiple folders → `pickWorkspaceFolder()` shows QuickPick
7. QuickPick lists all workspace folders with status details (Running, Done, Failed, Idle)
8. User selects folder → command executes against that session
9. Status bar shows multi-root format: `"folder — Phase 1/3 (+1 running, +1 failed)"`

**States touched:**
- Multiple SessionState instances (one per folder)
- StatusBar: shows folder name and aggregate summary

**Edge cases:**
- User cancels folder picker → command aborted
- All folders idle → picker still shown if >1 folder
- Folder added/removed mid-session → `WorkspaceSessionManager` handles dynamically
- Panels (DependencyGraph, Timeline, etc.) track `currentFolderUri` for targeted updates

---

## Part F: Recovery Commands (US-19, US-20)

---

### US-19: Force Unlock

**As-is:**

1. Lock file exists but process not running (orphaned lock from crash/kill)
2. User clicks "Force Unlock" in sidebar or runs command palette
3. Sidebar sends `{ command: "forceUnlock" }` → dispatched to `oxveil.forceUnlock`
4. `processManager.forceUnlock()` called
5. Deletes `.claudeloop/lock` file directly
6. File watcher detects lock removal → `SessionState.onLockChanged({ locked: false })`
7. Transition occurs based on progress state (done/failed based on phases)
8. Sidebar updates to show stopped/failed/completed view

**States touched:**
- Session: `running` (orphaned) → `done` or `failed`
- Sidebar: `running` → appropriate post-run view

**Edge cases:**
- No lock file exists → no-op (silent success)
- Process actually running → kills it (same as stop)
- Permissions error deleting lock → error thrown, user notified

---

### US-20: Reset Session

**As-is:**

1. User clicks "Restart" or "Create New Plan" button, or runs reset command
2. Dispatched to `oxveil.reset` command
3. `SessionState.reset()` called → transitions to `idle`
4. `wireSessionEvents` state-changed handler: sets `oxveil.processRunning=false`
5. Sidebar rebuilds based on plan detection → shows `empty`, `stale`, or `ready`

**States touched:**
- Session: `done`/`failed` → `idle`
- Sidebar: derives from idle + plan detection

**Edge cases:**
- Reset while running → should stop first (or be prevented)
- Reset with plan file still present → sidebar may show `stale` or `ready`
- Reset clears cost/todo/elapsed tracking in `SidebarMutableState`

---

## Part G: Plan Chat Lifecycle (US-21)

---

### US-21: End Plan Chat Session

**As-is:**

1. User closes Claude CLI terminal (Cmd+W or terminal close button)
2. Terminal close event fires → `onPlanChatSessionEnded` callback
3. Sets `oxveil.planChatActive=false`
4. `planPreviewPanel.setSessionActive(false)` → panel enters `session-ended` state
5. Annotation buttons removed, "Session ended" banner shown
6. Plan files remain on disk; user can Form Plan or start new chat
7. If PLAN.md was created during chat: sidebar shows `stale` (if no progress) or `ready` (if formed)

**States touched:**
- PlanPreview: `active` → `session-ended`
- Context keys: `oxveil.planChatActive=false`

**Edge cases:**
- Terminal killed externally (process exit) → same flow
- Multiple plan chat terminals → only the registered one triggers callbacks
- Closing terminal before any files written → sidebar stays in `empty`
