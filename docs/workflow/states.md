---
title: Oxveil Workflow State Specification
version: 1.0.0
source_of_truth: true
machines: [session]
projections: [sidebar, statusbar, plan-preview]
related_files:
  - src/core/sessionState.ts
  - src/views/sidebarState.ts
  - src/views/statusBar.ts
  - src/views/planPreviewPanel.ts
  - src/views/planPreviewHtml.ts
  - src/types.ts
  - src/sessionWiring.ts
  - src/views/sidebarMessages.ts
  - src/views/sidebarRenderers.ts
  - src/activateSidebar.ts
  - src/activateDetection.ts
  - src/extension.ts
  - src/commands/formPlan.ts
---

# Oxveil Workflow State Specification

This document is the single source of truth for Oxveil's UI state systems. It covers four state systems, their interactions, message schemas, and the complete user journey through 10 user stories.

**Key distinction:** Only `SessionState` is a true state machine with explicit transitions. The sidebar view, status bar, and plan preview are **derived projections** — pure functions of their inputs, recomputed on every change.

---

## A. Session State Machine

**Source:** `src/core/sessionState.ts` — `SessionState` class

SessionState is a typed EventEmitter with four explicit states and transition logic in `onLockChanged()`.

### Statechart

```mermaid
stateDiagram-v2
    [*] --> idle

    idle --> running : lock acquired (onLockChanged)
    running --> done : lock released + all phases completed
    running --> failed : lock released + any phase failed
    running --> done : lock released + no clear terminal (default)
    failed --> running : lock reacquired (onLockChanged)
    done --> idle : reset()
    failed --> idle : reset()
```

### State Table

| State | Description | Entry Condition |
|-------|-------------|-----------------|
| `idle` | No active session. Initial state and reset target. | Extension start, or `reset()` from `done`/`failed` |
| `running` | Lock acquired, claudeloop process active. | `onLockChanged({ locked: true })` while idle or failed |
| `done` | Lock released, session finished successfully or with partial progress. | `onLockChanged({ locked: false })` while running, all phases completed or no failed phases |
| `failed` | Lock released, at least one phase failed. | `onLockChanged({ locked: false })` while running, `progress.phases.some(p.status === "failed")` |

### Transition Matrix

| From | To | Trigger | Guard | Source Function |
|------|----|---------|-------|-----------------|
| `idle` | `running` | Lock file appears | `lock.locked === true && status === "idle"` | `SessionState.onLockChanged()` |
| `failed` | `running` | Lock file appears | `lock.locked === true && status === "failed"` | `SessionState.onLockChanged()` |
| `running` | `done` | Lock file removed | `!lock.locked && allCompleted` | `SessionState.onLockChanged()` |
| `running` | `failed` | Lock file removed | `!lock.locked && hasFailed` | `SessionState.onLockChanged()` |
| `running` | `done` | Lock file removed | `!lock.locked && !allCompleted && !hasFailed` (default) | `SessionState.onLockChanged()` |
| `done` | `idle` | Reset command | `status === "done"` | `SessionState.reset()` |
| `failed` | `idle` | Reset command | `status === "failed"` | `SessionState.reset()` |
| `running` | `idle` | Full reset command | (process stopped first) | `fullReset` → `processManager.stop()` → `onFullReset()` → `SessionState.reset()` |

### Orphan Recovery

On activation, `checkInitialState()` reads existing lock and progress files. If a lock exists (extension restarted while claudeloop was running), it transitions directly to `running`. Progress is restored from the filesystem.

### Lock File Polling Fallback

VS Code's `FileSystemWatcher.onDidDelete` is unreliable on macOS. `WatcherManager` polls the lock file every 5 seconds as a fallback. The poll calls the same `_handleFile()` path as watcher events — on ENOENT it triggers `onLockChange("")`, which drives the `running → done/failed` transition. `SessionState.onLockChanged()` is idempotent, so concurrent watcher + poll events are safe.

### Events Emitted

| Event | Payload | Emitted By | Subscribers |
|-------|---------|------------|-------------|
| `state-changed` | `[from: SessionStatus, to: SessionStatus]` | `_transition()` | `wireSessionEvents()` in `sessionWiring.ts` |
| `phases-changed` | `[progress: ProgressState]` | `onProgressChanged()` | `wireSessionEvents()` — updates sidebar, statusbar, panels |
| `log-appended` | `[content: string]` | `onLogAppended()` | `wireSessionEvents()` — forwards to LiveRunPanel, extracts cost/todos |
| `lock-changed` | `[lock: LockState]` | `onLockChanged()` | Internal use |

---

## B. Sidebar View Projection

**Source:** `src/views/sidebarState.ts` — `deriveViewState()` pure function

The sidebar view is **not a state machine**. It is a deterministic projection recomputed from five inputs. There are no explicit transitions — the view changes when any input changes.

### Inputs

| Input | Type | Source |
|-------|------|--------|
| `detection` | `DetectionStatus` (`"detected" \| "not-found" \| "version-incompatible"`) | `activateDetection()` |
| `sessionStatus` | `SessionStatus` (`"idle" \| "running" \| "done" \| "failed"`) | `SessionState.status` |
| `planDetected` | `boolean` | PLAN.md file watcher in `activateSidebar.registerPlanWatcher()` |
| `progress` | `ProgressState \| undefined` | `SessionState.progress` |
| `planUserChoice` | `PlanUserChoice` (`"none" \| "resume" \| "dismiss" \| "planning"`) | User interaction in stale view; `activateSidebar.onPlanFormed()` / `onPlanReset()` / `onPlanChatStarted()` |
| `selfImprovementActive` | `boolean` | Whether self-improvement mode is active after session completion. Set to `true` by `sessionWiring` when session completes and lessons are captured. Reset by `skipSelfImprovement` command or `onFullReset()`. |
| `cachedPlanPhases` | `PhaseView[]` | Plan phases for sidebar display before session runs. Populated by `loadPlanPhases()` from four sites: (1) `onPlanFormed()` after `formPlan` completes, (2) `onDidCreate` file watcher, (3) initial activation when `initialPlanDetected`, (4) `onPlanChoice("resume")` fallback when phases are empty |

### Output States

| View | Description |
|------|-------------|
| `not-found` | claudeloop not installed or version incompatible |
| `empty` | Detected, idle, no plan, no progress |
| `planning` | Plan chat session is active — user is conversing with Claude to create a plan |
| `ready` | Plan detected with all-pending phases, ready to execute |
| `stale` | Plan file found on activation, no progress, user hasn't chosen what to do |
| `running` | Session actively running |
| `stopped` | Session done but partial progress (not all completed, not all failed) |
| `failed` | At least one phase failed (session failed, or orphaned failed progress) |
| `completed` | Session done, all phases completed |
| `self-improvement` | Session completed, self-improvement mode active (lessons captured) |

### Decision Table

The `deriveViewState()` function evaluates conditions top-to-bottom. First match wins.

| # | detection | sessionStatus | planDetected | progress | planUserChoice | selfImprovementActive | → View |
|---|-----------|---------------|--------------|----------|----------------|----------------------|--------|
| 1 | `≠ "detected"` | any | any | any | any | any | `not-found` |
| 2 | `"detected"` | `"idle"` | any | any | `"planning"` | any | `planning` |
| 3 | `"detected"` | `"running"` | any | any | any | any | `running` |
| 4 | `"detected"` | `"failed"` | any | any | any | any | `failed` |
| 5 | `"detected"` | `"done"` | any | all completed | any | `true` | `self-improvement` |
| 6 | `"detected"` | `"done"` | any | all completed | any | `false`/undefined | `completed` |
| 7 | `"detected"` | `"done"` | any | not all completed | any | any | `stopped` |
| 8 | `"detected"` | `"idle"` | any | has failed phase | any | any | `failed` |
| 9 | `"detected"` | `"idle"` | any | has `in_progress` phase | any | any | `stopped` |
| 10 | `"detected"` | `"idle"` | any | has completed + pending | any | any | `stopped` |
| 11 | `"detected"` | `"idle"` | any | all completed | any | any | `completed` |
| 12 | `"detected"` | `"idle"` | `false` | `undefined` | any | any | `empty` |
| 13 | `"detected"` | `"idle"` | any | all pending | any | any | `ready` |
| 14 | `"detected"` | `"idle"` | `true` | `undefined` | `"dismiss"` | any | `empty` |
| 15 | `"detected"` | `"idle"` | `true` | `undefined` | `"resume"` | any | `ready` |
| 16 | `"detected"` | `"idle"` | `true` | `undefined` | `"none"` | any | `stale` |
| 17 | `"detected"` | `"idle"` | `false` | `undefined` | any | any | `ready` |

<!-- NOTE: Row 15 is the final fallback for planDetected=false — reachable when progress exists but is empty (0 phases). -->

### Decision Flowchart

```mermaid
flowchart TD
    Start([deriveViewState called]) --> D1{detection = detected?}
    D1 -- No --> NotFound[not-found]
    D1 -- Yes --> Dplan{planUserChoice = planning?}
    Dplan -- Yes --> Planning[planning]
    Dplan -- No --> D2{sessionStatus?}
    D2 -- running --> Running[running]
    D2 -- failed --> Failed1[failed]
    D2 -- done --> D3{all phases completed?}
    D3 -- Yes --> D3b{selfImprovementActive?}
    D3b -- Yes --> SelfImprove[self-improvement]
    D3b -- No --> Completed[completed]
    D3 -- No --> Stopped1[stopped]
    D2 -- idle --> D4{any phase failed?}
    D4 -- Yes --> Failed2[failed]
    D4 -- No --> D4b{any phase in_progress?}
    D4b -- Yes --> Stopped3[stopped]
    D4b -- No --> D5{completed + pending mix?}
    D5 -- Yes --> Stopped2[stopped]
    D5 -- No --> D5b{all phases completed?}
    D5b -- Yes --> Completed2[completed]
    D5b -- No --> D6{planDetected=false AND no progress?}
    D6 -- Yes --> Empty1[empty]
    D6 -- No --> D7{all phases pending?}
    D7 -- Yes --> Ready1[ready]
    D7 -- No --> D8{planUserChoice?}
    D8 -- dismiss --> Empty2[empty]
    D8 -- resume --> Ready2[ready]
    D8 -- none --> D9{planDetected?}
    D9 -- Yes --> Stale[stale]
    D9 -- No --> Ready3[ready]
```

### Renderer Table

Each view maps to a renderer function in `sidebarRenderers.ts` and a set of user-facing actions.

| View | Renderer | Badge | Primary Action | Secondary Actions | UI Elements |
|------|----------|-------|----------------|-------------------|-------------|
| `not-found` | `renderNotFound()` | — | Install | Set custom path (link) | Warning icon, description |
| `empty` | `renderEmpty()` | — | Let's Go (`createPlan`) | Write Plan, AI Parse, Form Plan | "How it works" steps, archives |
| `planning` | `renderPlanning()` | — | — | — | Same as `empty` but during active plan chat session |
| `ready` | `renderReady()` | Ready | Start | Edit, Discard (links) | Phase list, plan filename, self-improvement status, archives |
| `stale` | `renderStale()` | Found | Resume (`resumePlan`) | Dismiss (`dismissPlan`) | Plan filename, description, archives |
| `running` | `renderRunning()` | Running | Stop | — | Progress bar, info bar (elapsed, cost, todos, attempts), phase list |
| `stopped` | `renderStopped()` | Stopped | Resume (from next pending phase) | Restart | Progress bar, phase list (paused phase highlighted), archives |
| `failed` | `renderFailed()` | Failed | Retry (failed phase) | Skip (failed phase) | Progress bar, error snippet, phase list, archives |
| `completed` | `renderCompleted()` | Completed | Replay (latest archive) | Create New Plan | Success banner, summary (elapsed, cost), phase list, self-improvement status, archives |
| `self-improvement` | `renderSelfImprovement()` | Learning | Focus Terminal (`focusSelfImprovement`) | End Session (`skipSelfImprovement`) | Lightbulb icon, "Self-improvement session active", archives |

### Self-Improvement Status Section

The `ready` and `completed` views include a self-improvement status section rendered by `renderSelfImprovementStatus()`. This section displays:

| Config State | Display |
|--------------|---------|
| `selfImprovement.enabled = false` | "Self-improvement: Off" badge + "Enable" link (opens settings) |
| `selfImprovement.enabled = true`, `lessonsAvailable = false` | "Self-improvement: On" badge + "No lessons available" |
| `selfImprovement.enabled = true`, `lessonsAvailable = true` | "Self-improvement: On" badge + "Lessons captured" |

The `lessonsAvailable` field is derived from the presence of `lessons.md` in the latest archive directory. It is populated by `findLessonsContent()` during sidebar state building.

### Self-Improvement Session Lifecycle

When a session completes with `selfImprovement` enabled and lessons captured:

1. **Auto-start:** A Claude CLI terminal auto-starts with lessons context in the system prompt (no user click required)
2. **Sidebar view:** Transitions to `self-improvement` view showing "Self-improvement session active"
3. **Terminal close:** When user closes the terminal, `selfImprovementActive` resets to `false`, transitioning sidebar back to `completed` view
4. **Manual skip:** User can click "End Session" to close the terminal and return to `completed` view

```mermaid
stateDiagram-v2
    completed --> self_improvement: lessons found + config ON (auto-start terminal)
    self_improvement --> completed: terminal closed / End Session clicked
```

### AI Parsing State

**Source:** `src/activateSidebar.ts` — `onAiParseStarted()`, `onAiParseEnded()`

When the user clicks "Form Plan", Oxveil invokes AI parsing to convert the plan chat output into a structured claudeloop plan. During this process, the sidebar tracks parsing state to provide visual feedback and prevent concurrent operations.

#### State Flow

```mermaid
sequenceDiagram
    participant User
    participant Sidebar
    participant FormPlan
    participant SidebarState

    User->>Sidebar: Click "Form Plan"
    Sidebar->>FormPlan: oxveil.formPlan
    FormPlan->>FormPlan: isAiParsing()? → false
    FormPlan->>SidebarState: onAiParseStarted()
    SidebarState->>SidebarState: aiParsing = true
    SidebarState->>Sidebar: updateState() → button disabled with spinner
    FormPlan->>FormPlan: aiParseLoop() runs
    FormPlan->>SidebarState: onAiParseEnded() (in finally)
    SidebarState->>SidebarState: aiParsing = false
    SidebarState->>Sidebar: updateState() → button re-enabled
```

#### UI Behavior

| `aiParsing` | "Form Plan" Button |
|-------------|-------------------|
| `false` | Enabled: `<button data-command="formPlan">Form Plan</button>` |
| `true` | Disabled with spinner: `<button disabled><span class="codicon codicon-sync spin"></span> Forming...</button>` |

#### Concurrency Guard

The `formPlan` command includes an `isAiParsing()` guard that returns early if parsing is already in progress. This prevents duplicate AI parse operations from concurrent button clicks.

```typescript
if (deps.isAiParsing?.()) {
  vscode.window.showWarningMessage("Oxveil: AI parsing already in progress");
  return;
}
```

---

## C. Status Bar Projection

**Source:** `src/views/statusBar.ts` — `StatusBarManager.update()`

The status bar is a renderer — it displays whatever `StatusBarState` it receives. It does not hold state or compute transitions. Callers in `sessionWiring.ts` and `extension.ts` determine which state to send.

When transitioning to `idle` or on startup, the status bar state is derived from the sidebar view via `deriveStatusBarFromView()` in `src/views/deriveStatusBar.ts`. This ensures the status bar reflects orphan progress states (stopped/failed) that `deriveViewState()` detects.

### State Mapping

| Kind | Text | Icon | Background | Tooltip | Caller |
|------|------|------|------------|---------|--------|
| `not-found` | "Oxveil: claudeloop not found" | `$(warning)` | warningBackground | "claudeloop not found — click to install" | `extension.ts` activation (detection failed), `deriveStatusBarFromView` |
| `installing` | "Oxveil: installing claudeloop..." | `$(sync~spin)` | none | "Installing claudeloop..." | Installer callback |
| `ready` | "Oxveil: ready" | `$(symbol-event)` | none | "claudeloop detected — ready to run" | `extension.ts` post-init via `deriveStatusBarFromView` |
| `idle` | "Oxveil: idle" | `$(symbol-event)` | none | "No active session" | `wireSessionEvents()` on state→idle via `deriveStatusBarFromView` (when sidebar view is empty/stale) |
| `stopped` | "Oxveil: stopped" | `$(debug-pause)` | none | "Execution stopped — click to resume" | `wireSessionEvents()` on state→idle via `deriveStatusBarFromView` (orphan partial progress) |
| `running` | "Oxveil: Phase N/M \| elapsed" | `$(sync~spin)` | none | "Running — Phase N of M (elapsed)" | `wireSessionEvents()` on state→running + phases-changed + elapsedTimer tick |
| `failed` | "Oxveil: Phase N failed" | `$(error)` | errorBackground | "Phase N failed — click for details" | `wireSessionEvents()` on state→failed, or via `deriveStatusBarFromView` (orphan failed progress) |
| `done` | "Oxveil: done \| elapsed" | `$(check)` | none | "All phases completed (elapsed)" | `wireSessionEvents()` on state→done, or via `deriveStatusBarFromView` (orphan all-completed, elapsed="—") |

### Multi-Root Display

In multi-folder workspaces, `running`, `failed`, `done`, and `stopped` states prepend the folder name and append a summary of other roots (e.g., `"folder — Phase 1/3 (2m 30s) (+1 running, +1 failed)"`).

---

## D. Plan Preview States

**Source:** `src/views/planPreviewPanel.ts` — `_sendUpdate()` method

The plan preview panel tracks files written during a plan chat session and renders them as phase cards or raw markdown.

### State Derivation

```mermaid
flowchart TD
    Start([_sendUpdate called]) --> D1{lastRawContent defined?}
    D1 -- Yes --> RawMd[raw-markdown]
    D1 -- No --> D2{has phases?}
    D2 -- No --> Empty[empty]
    D2 -- Yes --> D3{sessionActive?}
    D3 -- Yes --> Active[active]
    D3 -- No --> SessionEnded[session-ended]
```

### State Table

| State | Condition | Display | User Actions |
|-------|-----------|---------|--------------|
| `empty` | No phases parsed, no raw content | "Waiting for Claude..." (session active) or "Form a plan..." (no session) | — |
| `raw-markdown` | Content exists but doesn't parse to phases | Raw markdown rendered | Form Plan button |
| `active` | Phases parsed, session active (`_sessionActive = true`) | Phase cards with "Note" annotation buttons, "Live" badge | Annotate phases, switch tabs |
| `session-ended` | Phases parsed, session inactive (`_sessionActive = false`) | Phase cards without annotation buttons, "Session ended" banner | Form Plan button, switch tabs |

### Transition Table

| From | To | Trigger | Method |
|------|----|---------|--------|
| any | `empty` | `beginSession()` called, no plan file yet | `beginSession()` |
| any | `raw-markdown` | File changed, content doesn't parse to phases | `onFileChanged()` → `_parseAndRender()` |
| `raw-markdown` | `active`/`session-ended` | File changed, phases now parseable | `onFileChanged()` → `_parseAndRender()` |
| `active` | `session-ended` | Terminal closed | `setSessionActive(false)` |
| `session-ended` | `active` | New plan chat session started | `setSessionActive(true)` |
| any | (re-derived) | File changed (200ms debounce) | `onFileChanged()` |

### Tab System

When multiple plan files exist (design, implementation, plan), the resolver tracks them and provides tab navigation. Tabs are available when 2+ categories are tracked. Categories: `"design" | "implementation" | "plan"`.

### Form Plan Button State

**Source:** `src/views/planPreviewPanel.ts` — `_planFormed`, `setPlanFormed()`

The Plan Preview panel includes a "Form Claudeloop Plan" button that triggers AI parsing. This button has two independent disable conditions:

1. **After plan is formed:** Once `onPlanFormed` fires, the button is permanently disabled (until a new plan chat starts)
2. **During AI parsing:** Handled by the sidebar's `aiParsing` state (see Section B)

#### planFormed Flag

| `_planFormed` | Button State |
|---------------|--------------|
| `false` | Enabled: `<button class="form-plan-btn">Form Claudeloop Plan</button>` |
| `true` | Disabled with tooltip: `<button class="form-plan-btn" disabled title="Plan already formed. Start from sidebar.">Form Claudeloop Plan</button>` |

#### Lifecycle

```mermaid
stateDiagram-v2
    [*] --> enabled: Panel created
    enabled --> disabled: onPlanFormed()
    disabled --> enabled: onPlanChatStarted() (new session)
```

The `setPlanFormed()` method is called:
- `setPlanFormed(true)` — by `activateViews.onPlanFormed()` after AI parse completes successfully
- `setPlanFormed(false)` — by `activateViews.onPlanChatStarted()` when user starts a new plan chat

This ensures users don't accidentally re-run AI parsing on an already-formed plan.

---

## E. Cross-Machine Wiring

**Source:** `src/sessionWiring.ts` — `wireSessionEvents()`

This module connects SessionState events to all UI projections. It is the central dispatch point.

### Sidebar State Delegation

Session wiring does **not** build sidebar state internally. It receives a `buildSidebarState: () => SidebarState` callback (the canonical `buildFullState()` from `activateSidebar.ts`) and calls it on every state change. This ensures the sidebar always reflects live mutable state (detection status, plan detection, user choice) rather than stale snapshots captured at wiring time. Cost and todo data are written to `SidebarMutableState.cost`/`.todoDone`/`.todoTotal` by the wiring's `log-appended` handler, so `buildFullState()` includes them natively in every call.

**Contract:** `buildSidebarState()` reads `SessionState.status` via the manager, so it must be called after `_transition()` sets `_status` (which it is — `_transition` sets status before emitting `state-changed`).

### Event → Update Matrix

| SessionState Event | Handler Action | Targets Updated |
|-------------------|----------------|-----------------|
| `state-changed` → `running` | Start elapsed timer, reset `SidebarMutableState` cost/todo fields, reset notification-dedup tracking, clear `lastProgress` | StatusBar (`running`), LiveRunPanel (auto-reveal), NotificationManager (`reset()`), Sidebar (via `buildSidebarState()`), context key `oxveil.processRunning=true` |
| `state-changed` → `done` | Stop elapsed timer, derive view from sidebar | StatusBar (`done` or `stopped` via `deriveViewState`), LiveRunPanel (`onRunFinished("done"` or `"stopped")`), Sidebar (via `buildSidebarState()`), context key `oxveil.walkthrough.hasRun=true`, archive refresh |
| `state-changed` → `failed` | Stop elapsed timer, find failed phase | StatusBar (`failed`), LiveRunPanel (`onRunFinished("failed")`), Sidebar (via `buildSidebarState()`), archive refresh |
| `state-changed` → `idle` | Stop elapsed timer | StatusBar (`idle`), Sidebar (via `buildSidebarState()`), context key `oxveil.processRunning=false` |
| `phases-changed` | Update panels, notify on completions/failures (failures deduplicated per phase — only first failure per run notified) | DependencyGraph, ExecutionTimeline, LiveRunPanel, StatusBar (current phase update), Sidebar (progress update) |
| `log-appended` | Extract cost/todo data from log lines, write to `SidebarMutableState.cost`/`.todoDone`/`.todoTotal` | LiveRunPanel, SidebarMutableState, Sidebar (progress update with cost/todos) |

### Context Keys

| Key | Set By | Values | Purpose |
|-----|--------|--------|---------|
| `oxveil.detected` | `activateDetection()` | `true`/`false` | claudeloop installed and compatible |
| `oxveil.processRunning` | `wireSessionEvents()` state-changed handler | `true`/`false` | Session actively running |
| `oxveil.claudeDetected` | `activateDetection()` | `true`/`false` | Claude CLI available |
| `oxveil.planChatActive` | `extension.ts` terminal close/create handlers | `true`/`false` | Plan chat terminal is open |
| `oxveil.walkthrough.hasPlan` | `activateSidebar.registerPlanWatcher()` | `true`/`false` | PLAN.md exists |
| `oxveil.walkthrough.hasRun` | `wireSessionEvents()` on done | `true`/`false` | At least one session completed |
| `oxveil.walkthrough.configured` | Config wizard command | `true`/`false` | Config wizard opened |

### Reset Flow

The `fullReset` command performs a complete workspace reset via `onFullReset()` callback wired from `activateSidebar.ts`:

1. **Command handler** (`commands.ts`):
   - Shows modal confirmation dialog
   - Stops running process if any (`processManager.stop()`)
   - Deletes `PLAN.md`
   - Deletes `.claudeloop/ai-parsed-plan.md`
   - Deletes `.claudeloop/` contents except `archive/` directory
   - Calls `onFullReset()` callback

2. **State reset** (`activateSidebar.onFullReset()`):
   - Resets `SidebarMutableState`: `cost=0`, `todoDone=0`, `todoTotal=0`, `cachedPlanPhases=[]`, `planUserChoice="none"`, `planDetected=false`, `selfImprovementActive=false`
   - Calls `sessionState.reset()` on active session (transitions to `idle`)
   - Refreshes sidebar via `buildFullState()`

**SessionState effect:** Unlike normal `reset()` which only transitions from `done`/`failed` to `idle`, `fullReset` first stops any running process, ensuring transition from any state (including `running`) to `idle`.

---

## F. Message Schemas

### Sidebar Commands (Webview → Extension)

**Source:** `src/views/sidebarMessages.ts` — `SidebarCommand` type

#### Simple Commands (no arguments)

| Command | VS Code Command | Category |
|---------|-----------------|----------|
| `install` | `oxveil.install` | Installation |
| `setPath` | `workbench.action.openSettings` (direct, not via command map) | Installation |
| `createPlan` | `oxveil.createPlan` | Plan creation |
| `openPlan` | `oxveil.writePlan` | Plan editing |
| `editPlan` | `oxveil.writePlan` | Plan editing |
| `writePlan` | `oxveil.writePlan` | Plan editing |
| `configure` | `oxveil.openConfigWizard` | Configuration |
| `start` | `oxveil.start` | Execution |
| `stop` | `oxveil.stop` | Execution |
| `restart` | `oxveil.reset` | Execution |
| `aiParse` | `oxveil.aiParsePlan` | Plan processing |
| `formPlan` | `oxveil.formPlan` | Plan processing |
| `planChat` | `oxveil.openPlanChat` | Plan creation |
| `discardPlan` | `oxveil.discardPlan` | Plan management |
| `openTimeline` | `oxveil.showTimeline` | Visualization |
| `openGraph` | `oxveil.showDependencyGraph` | Visualization |
| `forceUnlock` | `oxveil.forceUnlock` | Recovery |
| `reset` | `oxveil.reset` | Recovery |
| `fullReset` | `oxveil.fullReset` | Recovery |
| `refreshArchives` | `oxveil.archiveRefresh` | Archives |
| `focusSelfImprovement` | `oxveil.selfImprovement.focus` | Self-improvement |
| `skipSelfImprovement` | `oxveil.selfImprovement.skip` | Self-improvement |

#### Phase Commands (with `phase: number`)

| Command | VS Code Command | Argument |
|---------|-----------------|----------|
| `resume` | `oxveil.runFromPhase` | `{ phaseNumber: phase }` |
| `retry` | `oxveil.runFromPhase` | `{ phaseNumber: phase }` |
| `skip` | `oxveil.markPhaseComplete` | `{ phaseNumber: phase }` |
| `markComplete` | `oxveil.markPhaseComplete` | `{ phaseNumber: phase }` |
| `runFromPhase` | `oxveil.runFromPhase` | `{ phaseNumber: phase }` |

#### Archive Commands (with `archive: string`)

| Command | VS Code Command | Argument |
|---------|-----------------|----------|
| `openReplay` | `oxveil.archiveReplay` | `{ archiveName: archive }` |
| `restoreArchive` | `oxveil.archiveRestore` | `{ archiveName: archive }` |

#### Log/Diff Commands (with optional `phase?: number`)

| Command | VS Code Command | Argument |
|---------|-----------------|----------|
| `openLog` | `oxveil.viewLog` | `{ phaseNumber: phase }` if phase present |
| `openDiff` | `oxveil.viewDiff` | `{ phaseNumber: phase }` if phase present |

#### Plan Intent Commands (no VS Code command — handled by sidebar panel)

| Command | Handler | Effect |
|---------|---------|--------|
| `resumePlan` | `SidebarPanel.onPlanChoice("resume")` | Sets `planUserChoice = "resume"`, rebuilds sidebar |
| `dismissPlan` | `SidebarPanel.onPlanChoice("dismiss")` | Sets `planUserChoice = "dismiss"`, rebuilds sidebar |

### Sidebar Updates (Extension → Webview)

| Type | Payload | When Sent |
|------|---------|-----------|
| `fullState` | `{ html: string }` | On any state change (view transition, detection change, archive refresh) |
| `progressUpdate` | `{ update: ProgressUpdate }` | During running session — incremental updates for info bar, progress bar, phase list |

### Plan Preview Messages (Webview → Extension)

| Type | Payload | Handler |
|------|---------|---------|
| `ready` | — | `_sendUpdate()` (sync state to newly loaded webview) |
| `switchTab` | `{ category: PlanFileCategory }` | `_onTabSwitch()` — categories: design, implementation, plan, ai-parsed |
| `annotation` | `{ phase: number, text: string }` | Forwarded to `PlanChatSession.sendAnnotation()`, then `focusTerminal()` to bring user attention to terminal |
| `formPlan` | — | `deps.onFormPlan?.()` |

---

## G. User Stories

See [user-stories.md](user-stories.md) for the full 10 user stories with as-is/to-be analysis, state traces, context keys, edge cases, and gap annotations.

---

## H. Sub-Step Progress

**Source:** `src/parsers/progress.ts` — `buildSubSteps()`, `src/views/sidebarState.ts` — `mapPhases()`

Sub-step progress tracks the internal stages within each phase: implement, verify, and refactor. When verify/refactor options are enabled in claudeloop, PROGRESS.md includes sub-step status lines that Oxveil parses and displays.

### Parsing Flow

```
PROGRESS.md → parseProgress() → buildSubSteps() → SubStepState[]
                                                        ↓
                              mapPhases() → SubStepView[] → renderSubSteps() → HTML
```

1. **parseProgress()** in `progress.ts` reads PROGRESS.md and extracts `Verify:` and `Refactor:` status lines per phase
2. **buildSubSteps()** constructs `SubStepState[]` from the extracted status values:
   - Skipped for `pending` phases (no sub-steps yet)
   - `implement` is inferred: `completed` if verify/refactor exists, else matches phase status
   - `verify` and `refactor` added when their status lines are present
   - Returns `undefined` if only one sub-step (no value in showing just "implement")
3. **mapPhases()** in `sidebarState.ts` converts `SubStepState[]` to `SubStepView[]`:
   - Capitalizes names ("implement" → "Implement")
   - Filters attempts (only shown when > 1)
4. **renderSubSteps()** in `sidebarPhaseHelpers.ts` generates HTML with status icons

### Sub-Step Status Icons

| Status | Icon | CSS Class |
|--------|------|-----------|
| `completed` | ✓ | `sub-step-icon--completed` |
| `in_progress` | ◐ | `sub-step-icon--running` |
| `failed` | ✗ | `sub-step-icon--failed` |
| `pending` | ○ | `sub-step-icon--pending` |

### PROGRESS.md Format

Sub-step status appears within phase blocks:

```markdown
## Phase 1: Setup

Status: in_progress
Verify: completed
Verify Attempts: 2
Refactor: in_progress
```

Parsed into:
```typescript
subSteps: [
  { name: "implement", status: "completed" },
  { name: "verify", status: "completed", attempts: 2 },
  { name: "refactor", status: "in_progress" }
]
```

---

## Appendix: Type Definitions

### SessionStatus
```typescript
type SessionStatus = "idle" | "running" | "done" | "failed";
```

### DetectionStatus
```typescript
type DetectionStatus = "detected" | "not-found" | "version-incompatible";
```

### SidebarView
```typescript
type SidebarView = "not-found" | "empty" | "planning" | "ready" | "stale" | "running" | "stopped" | "failed" | "completed" | "self-improvement";
```

### StatusBarState
```typescript
type StatusBarState =
  | { kind: "not-found" }
  | { kind: "installing" }
  | { kind: "ready" }
  | { kind: "idle" }
  | { kind: "stopped"; folderName?: string; otherRootsSummary?: string }
  | { kind: "running"; currentPhase: number; totalPhases: number; elapsed: string; folderName?: string; otherRootsSummary?: string }
  | { kind: "failed"; failedPhase: number; folderName?: string; otherRootsSummary?: string }
  | { kind: "done"; elapsed: string; folderName?: string; otherRootsSummary?: string };
```

### PhaseStatus
```typescript
type PhaseStatus = "pending" | "completed" | "in_progress" | "failed";
```

### SubStepName
```typescript
type SubStepName = "implement" | "verify" | "refactor";
```

### SubStepState
```typescript
interface SubStepState {
  name: SubStepName;
  status: PhaseStatus;
  attempts?: number;  // Only present when > 1
}
```

### SubStepView
```typescript
interface SubStepView {
  name: string;       // Capitalized: "Implement", "Verify", "Refactor"
  status: PhaseStatus;
  attempts?: number;  // Only present when > 1
}
```

### SelfImprovementConfig
```typescript
interface SelfImprovementConfig {
  enabled: boolean;           // Mirrors oxveil.selfImprovement config setting
  lessonsAvailable?: boolean; // True when lessons.md exists in latest archive
}
```

Used in `SidebarState.selfImprovement` to render the self-improvement status section in ready and completed views.

### PlanUserChoice
```typescript
type PlanUserChoice = "none" | "resume" | "dismiss" | "planning";
```

### PlanPreviewState
```typescript
// Inline in planPreviewPanel.ts _sendUpdate() — not a named export
type PlanPreviewState = "active" | "empty" | "session-ended" | "raw-markdown";
```
