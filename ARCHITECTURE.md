# Oxveil Architecture

## Overview

Oxveil is a VS Code extension for managing AI coding workflows. It uses [claudeloop](https://github.com/chmc/claudeloop) as its execution engine. Both repos share the same author — changes can be coordinated and shipped simultaneously.

**Core principle:** Oxveil is the product. claudeloop is the engine. Users install Oxveil and it handles the full lifecycle — detect, install, configure, run, and monitor claudeloop. Users never need to touch the CLI.

**Progression:**
- **v0.1–v0.2:** Entry point + monitoring. Detection, installation, spawn, observe, render.
- **v0.3–v0.4:** Layer editing features (config wizard webview, plan editing, CodeLens) while still delegating execution to the CLI.

**Not supported:** VS Code for Web. The extension requires Node.js APIs (`child_process`, `fs`, `process.kill`).

## User Lifecycle

```
Install Extension → Detect claudeloop → Install claudeloop → Configure → Run → Monitor
```

### Detection

On activation, Oxveil determines whether claudeloop is available:

1. Check `oxveil.claudeloopPath` setting (if non-default, use it)
2. Look up `claudeloop` in PATH
3. Run `claudeloop --version` to verify and extract version
4. Compare against minimum supported version

**Result states:**
- `detected` — claudeloop found and version compatible. Extension fully operational.
- `not-found` — claudeloop not on PATH and no custom path set. Offer installation.
- `version-incompatible` — claudeloop found but version too old. Offer update guidance.

### Installation

When claudeloop is not found, Oxveil offers to install it.

**macOS / Linux:**
- Run `install.sh` from GitHub releases via VS Code integrated terminal
- Command: `curl -fsSL https://raw.githubusercontent.com/chmc/claudeloop/main/install.sh | sh`
- Installs to `/usr/local/lib/claudeloop` (system) or `~/.local/lib/claudeloop` (user)

**Windows:**
- claudeloop is a POSIX shell script — requires WSL
- Detect WSL via `wsl --status`
- If WSL available: run `install.sh` through WSL
- If WSL not available: guide user to install WSL first, then retry

After installation, re-run detection to confirm success.

### Configuration

- **v0.1:** VS Code settings for common claudeloop arguments (`--verify`, `--refactor`, `--dry-run`, `--ai-parse`)
- **v0.3:** Full config wizard webview for `.claudeloop.conf`

### Execution

Spawn claudeloop as a child process. Monitor via file-based IPC.

### Monitoring

Watch `.claudeloop/` files for state changes. Render in sidebar webview, status bar, and Live Run Panel.

## IPC Contract

The `.claudeloop/` directory is the contract between Oxveil and claudeloop.

**Oxveil reads:**
- `live.log` — append-only process output (written in both normal and dry-run mode when ai-parse is active)
- `PROGRESS.md` — phase status and structure
- `lock` — plain text file containing the PID of the running process
- `lessons.md` — phase metrics (retries, duration, exit) for self-improvement mode

**Contract rules:**
- claudeloop owns all files in `.claudeloop/`. It creates, writes, and cleans them up.
- Oxveil only reads. It never creates, modifies, or deletes files in `.claudeloop/` (exception: Force Unlock command).
- A `version` field should be added to enable compatibility detection across repo versions.
- Format details are documented in the claudeloop repo. Oxveil uses strict parsing — reject unknown formats loudly rather than guessing.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                         Oxveil                            │
├──────────────────────────────────────────────────────────┤
│                  Lifecycle Management                     │
│   - Detection (PATH / setting / version check)           │
│   - Installation (install.sh via terminal / WSL)         │
│   - Configuration (VS Code settings → v0.3 wizard)       │
├───────────────┬────────────────┬─────────────────────────┤
│ Sidebar       │  Webviews       │  Status Bar             │
│  Webview      │  - Dep. Graph   │  - Phase X/Y            │
│               │  - Config Wizard│  - Elapsed time         │
│               │  - Replay Viewer│  - Folder prefix        │
│               │  - Timeline     │    (multi-root)         │
├───────────────┼─────────────────┼─────────────────────────┤
│   Log Viewer  │  Diff Provider  │  Live Run Panel         │
│   - Phase logs│  - Git diffs    │  - Dashboard + log      │
├───────────────┼─────────────────┼─────────────────────────┤
│   CodeLens    │  Plan Language  │  Welcome Walkthrough    │
│   - Run phase │  - TextMate     │  - 4-step onboarding    │
│   - View diff │    grammar      │  - Context key tracking │
├───────────────┼─────────────────┼─────────────────────────┤
│   FolderPicker│                 │                         │
│   - Multi-root│                 │                         │
│     resolution│                 │                         │
├───────────────┴─────────────────┴─────────────────────────┤
│                     Parsers                                │
│   - progress.ts (PROGRESS.md → ProgressState)             │
│   - archive.ts  (archive dirs → ArchiveEntry[])           │
│   - config.ts   (.claudeloop.conf → ConfigState)          │
│   - plan.ts     (PLAN.md → PlanState)                     │
│   - timeline.ts (ProgressState → TimelineData)            │
├──────────────────────────────────────────────────────────┤
│                     Core                                  │
│   - WorkspaceSessionManager (multi-root session hub)     │
│   - WorkspaceSession (per-folder session container)      │
│   - SessionState (state machine + EventEmitter)          │
│   - Process Manager (spawn/stop/reset)                   │
│   - Lock Manager (read-only lock observation)            │
│   - Watcher (single FileSystemWatcher + debounce)        │
│   - Git Integration (phase diffs via git)                │
├──────────────────────────────────────────────────────────┤
│               claudeloop CLI (engine)                     │
│   .claudeloop/ directory = IPC contract                   │
└──────────────────────────────────────────────────────────┘
```

Data flows upward: watcher detects file changes → parsers transform raw content into typed state → SessionState holds and broadcasts → views subscribe and render.

## File Structure

```
media/
└── walkthrough/
    ├── detect.md                 # Walkthrough step 1: detect claudeloop
    ├── configure.md              # Walkthrough step 2: configure settings
    ├── createPlan.md             # Walkthrough step 3: create a plan
    └── runSession.md             # Walkthrough step 4: run a session
syntaxes/
└── plan.tmLanguage.json          # TextMate grammar for claudeloop-plan language
src/
├── extension.ts                  # Activation, command registration, wiring
├── activateViews.ts              # View instantiation and webview panel factory
├── commands.ts                   # Command handler registration
├── commands/
│   ├── createPlan.ts             # Plan creation command with walkthrough trigger
│   ├── aiParseLoop.ts            # Shared retry orchestrator for AI parse with feedback
│   └── selfImprovement.ts        # Self-improvement command registration (start, skip, focus)
├── types.ts                      # Shared type definitions (DetectionStatus, SessionStatus, etc.)
├── sessionWiring.ts              # Connects session events to UI updates
├── workspaceInit.ts              # File watcher setup for .claudeloop directory
├── core/
│   ├── detection.ts              # claudeloop detection and version check
│   ├── gitIntegration.ts         # Phase-specific git diff generation
│   ├── installer.ts              # Platform-aware claudeloop installation
│   ├── interfaces.ts             # Core interface definitions for DI
│   ├── lock.ts                   # Read-only lock file observation
│   ├── processManager.ts         # Spawn/stop/reset claudeloop
│   ├── selfImprovementSession.ts # Terminal session for Claude-based improvement proposals
│   ├── sessionState.ts           # State machine + EventEmitter
│   ├── watchers.ts               # Single FileSystemWatcher + debounce
│   ├── workspaceSession.ts       # Per-folder session container
│   └── workspaceSessionManager.ts # Multi-root session hub + active folder tracking
├── parsers/
│   ├── archive.ts                # Archive directory → ArchiveEntry[]
│   ├── config.ts                 # .claudeloop.conf → ConfigState (key=value parsing)
│   ├── lessons.ts                # lessons.md → Lesson[] (phase metrics)
│   ├── plan.ts                   # PLAN.md → PlanState (phase structure + dependencies)
│   ├── progress.ts               # PROGRESS.md → ProgressState
│   └── timeline.ts               # ProgressState → TimelineData (bar positions + durations)
├── views/
│   ├── archiveTree.ts            # Archive data layer (ArchiveTreeItem[])
│   ├── configWizard.ts           # Config wizard webview panel lifecycle
│   ├── configWizardHtml.ts       # Config wizard HTML generation
│   ├── dagLayout.ts              # DAG layout algorithm for dependency graphs
│   ├── dagSvg.ts                 # SVG generation from DAG layout
│   ├── dependencyGraph.ts        # Dependency graph webview panel
│   ├── diffProvider.ts           # Virtual document provider for git diffs
│   ├── elapsedTimer.ts           # Elapsed time display (updates every second)
│   ├── executionTimeline.ts      # Execution timeline webview panel
│   ├── folderPicker.ts           # Multi-root folder picker (quick-pick UI)
│   ├── logViewer.ts              # Click-to-open phase log files
│   ├── notifications.ts          # Smart failure notifications with attempt count
│   ├── outputChannel.ts          # Output channel wrapper
│   ├── planCodeLens.ts           # CodeLens actions for plan file phases
│   ├── replayViewer.ts           # Inline replay viewer webview panel
│   ├── selfImprovementHtml.ts    # Self-improvement panel HTML generation
│   ├── selfImprovementPanel.ts   # Self-improvement webview panel lifecycle
│   ├── sidebarHtml.ts            # Sidebar HTML rendering (renderSidebar())
│   ├── sidebarMessages.ts        # Sidebar message dispatch (user actions → commands)
│   ├── sidebarPanel.ts           # WebviewViewProvider registered as oxveil.sidebar
│   ├── sidebarState.ts           # deriveViewState() — maps detection + session + plan to view state
│   ├── statusBar.ts              # Status bar item
│   └── timelineHtml.ts           # Timeline HTML/CSS/JS generation
└── test/
    ├── unit/
    │   ├── core/
    │   │   ├── detection.test.ts
    │   │   ├── gitIntegration.test.ts
    │   │   ├── installer.test.ts
    │   │   ├── lock.test.ts
    │   │   ├── processManager.test.ts
    │   │   ├── sessionState.test.ts
    │   │   ├── watchers.test.ts
    │   │   ├── workspaceSession.test.ts
    │   │   └── workspaceSessionManager.test.ts
    │   ├── parsers/
    │   │   ├── archive.test.ts
    │   │   ├── config.test.ts
    │   │   ├── plan.test.ts
    │   │   ├── progress.test.ts
    │   │   └── timeline.test.ts
    │   └── views/
    │       ├── archiveTree.test.ts
    │       ├── configWizard.test.ts
    │       ├── dagLayout.test.ts
    │       ├── dagSvg.test.ts
    │       ├── dependencyGraph.test.ts
    │       ├── elapsedTimer.test.ts
    │       ├── executionTimeline.test.ts
    │       ├── folderPicker.test.ts
    │       ├── logViewer.test.ts
    │       ├── notifications.test.ts
    │       ├── outputChannel.test.ts
    │       ├── phaseTree.test.ts
    │       ├── planCodeLens.test.ts
    │       ├── replayViewer.test.ts
    │       ├── statusBar.test.ts
    │       ├── timelineHtml.test.ts
    │       └── walkthrough.test.ts
    └── integration/
        ├── commands.test.ts
        └── extension.test.ts
```

Parsers and webview providers are added as their milestones are implemented.

## User-Facing Surface

### Commands

| ID | Title | When |
|----|-------|------|
| `oxveil.start` | Oxveil: Start | claudeloop detected, no process running |
| `oxveil.stop` | Oxveil: Stop | Process running |
| `oxveil.reset` | Oxveil: Reset | claudeloop detected |
| `oxveil.forceUnlock` | Oxveil: Force Unlock | claudeloop detected |
| `oxveil.install` | Oxveil: Install claudeloop | claudeloop not detected |
| `oxveil.showTimeline` | Oxveil: Show Execution Timeline | claudeloop detected |

### Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `oxveil.claudeloopPath` | string | `"claudeloop"` | Path to claudeloop executable |
| `oxveil.watchDebounceMs` | number | `100` | Debounce interval for file watcher events |
| `oxveil.verify` | boolean | `true` | Run verification after each phase (`--verify`) |
| `oxveil.refactor` | boolean | `true` | Run refactoring after each phase (`--refactor`) |
| `oxveil.dryRun` | boolean | `false` | Preview plan without executing (`--dry-run`) |
| `oxveil.aiParse` | boolean | `true` | Auto-parse plan into phases (`--ai-parse`) |

### Activation Events

- `onStartupFinished` — run detection on workspace open
- `onCommand:oxveil.*` — activate on any Oxveil command
- `workspaceContains:**/.claudeloop` — activate when workspace has an existing session

### Error UX

- **User-actionable errors** (claudeloop not found, double-spawn): VS Code notification with action buttons
- **Diagnostics** (stderr, parse failures): Output channel
- **No silent failures.** Strict parsing means unknown formats surface as visible errors, not silent degradation.

## Components

### Detection

Determines claudeloop availability on activation and on demand.

**Interface:** `IDetection { status: 'detected' | 'not-found' | 'version-incompatible', path?: string, version?: string, minimumVersion: string }`

**Flow:** Check setting → check PATH → run `--version` → compare minimum version. Caches result until re-detection is triggered (e.g., after installation or path change).

**Re-detection triggers:** Setting change for `oxveil.claudeloopPath`, after `oxveil.install` completes, manual command.

### Installer

Platform-aware claudeloop installation via VS Code integrated terminal.

**macOS/Linux:** Creates a terminal, runs the install.sh curl command. Monitors terminal close event to trigger re-detection.

**Windows:** Checks for WSL via `child_process.execSync('wsl --status')`. If present, runs install.sh through WSL. If absent, shows notification guiding user to install WSL.

**Interface:** `IInstaller { install(): Promise<void>, isSupported(): boolean }`

### SessionState

Typed EventEmitter with an explicit state machine. Central hub — all watchers emit to it, all views subscribe to it. No view reads files directly.

**State machine:** `idle → running → done | failed → idle`

**Events:** `state-changed`, `phases-changed`, `log-appended`, `lock-changed`

**Interface boundary:** Components depend on the `ISessionState` interface, not the implementation. This enables unit testing with Vitest without mocking VS Code APIs.

### Process Manager

Manages the claudeloop child process lifecycle.

**Spawn:** `child_process.spawn(executable, args, { cwd, stdio: ["ignore", "ignore", "pipe"] })`. Live output comes from the `live.log` file watcher, not from stdout — this decouples monitoring from process ownership and works for externally-started processes too. Stderr is piped for error diagnostics only. Arguments are built from VS Code settings (`oxveil.verify`, `oxveil.refactor`, etc.).

**Stop:** Platform-aware. SIGINT on Unix, SIGTERM on Windows (via WSL). If still alive after 5 seconds, escalate to SIGKILL. Ensure claudeloop handles the same signals on each platform (cross-repo coordination).

**Reset:** Spawns `claudeloop --reset`, waits for exit.

**AI parse with feedback:** `aiParseFeedback(feedbackText)` spawns `claudeloop --ai-parse --ai-parse-feedback` after writing feedback to a temp file. Returns `AiParseResult { exitCode: number }` — exit code 0 means the plan passed verification, exit code 2 means verification failed (retry eligible), exit code 1 means an unexpected error.

**Double-spawn prevention:** Read the lock file before spawning. If a process is already running, show an error notification.

**Deactivate:** `deactivate()` sends SIGINT/SIGTERM immediately, SIGKILL after 3 seconds.

### Lock Manager

Read-only observation of the lock file. claudeloop owns its lock lifecycle — creates on start, removes on exit, cleans stale locks on next start.

**On activation:** Read lock → if present, treat as running process → update SessionState.

**Escape hatch:** `oxveil.forceUnlock` command deletes the lock file for cases where claudeloop crashed without cleanup and won't be restarted. This is the only write Oxveil performs to `.claudeloop/`.

### Watcher

Single `FileSystemWatcher` on `**/.claudeloop/**` with event filtering by filename. Lock file is also polled every 5 seconds as a fallback for unreliable `onDidDelete` events on macOS.

**Debouncing:** Per-file `setTimeout`/`clearTimeout` at configurable interval (`oxveil.watchDebounceMs`). Lock file polling bypasses debounce to guarantee delivery.

**File reads:** `fs.promises.readFile` for all reads. Async, non-blocking.

**Capped incremental reads:** For live.log, read at most 64KB per callback. Schedule follow-up via `setImmediate` if more data is available.

**Initial state:** `checkInitialState()` on activation reads existing lock, PROGRESS.md, and live.log. Handles the case where claudeloop was already running before the extension activated.

### Progress Parser

Pure function, no VS Code dependency.

**Input:** Raw PROGRESS.md content string.
**Output:** `ProgressState { phases: PhaseState[], currentPhaseIndex?: number, totalPhases: number }`

**Strict parsing:** Reject unknown status values with a parse error rather than normalizing synonyms. We own both repos — if the format changes, update both sides. Strict parsing catches contract drift early.

**Crash-proof:** Tolerates truncated input (half-written files from mid-write watcher events). Wraps in try-catch — never throws to callers. Returns a "no data" state on unparseable input so the sidebar can show "Unable to parse progress" instead of appearing empty.

**Monotonicity validation:** Phase count should not decrease during a run. If it does, treat as partial read and retry after a short delay.

### Sidebar Webview

`SidebarPanel` implements `WebviewViewProvider`, registered as `oxveil.sidebar`.

**States:** 8 context-aware states: `not-found`, `empty`, `ready`, `stale`, `running`, `stopped`, `failed`, `completed`. Each renders distinct HTML with appropriate actions and messaging. See [docs/workflow/states.md](docs/workflow/states.md) for the full state specification, decision tables, and user journey documentation.

**State derivation:** `deriveViewState()` in `sidebarState.ts` maps detection status + session state + plan state into the current view state. Pure function, fully testable.

**Rendering:** HTML rendered server-side via `renderSidebar()` in `sidebarHtml.ts`. Updates pushed to the webview via `webview.html` assignment (full replacement, no incremental patching).

**User actions:** Dispatched via `dispatchSidebarMessage()` in `sidebarMessages.ts`, which maps webview message types to VS Code commands (start, stop, install, open plan, etc.).

**Notifications:** Compares old vs new ProgressState on each update. Info notification on phase completion, error notification on failure.

**Sub-step progress:** When verify/refactor options are enabled, phases show internal progress (implement → verify → refactor). Parsed from PROGRESS.md via `buildSubSteps()` in `progress.ts`, mapped to `SubStepView[]` in `mapPhases()`, rendered via `renderSubSteps()` in `sidebarPhaseHelpers.ts`.

### Status Bar

`StatusBarItem` on the left side, always visible.

**States:**
- Not found: `$(warning) Oxveil: claudeloop not found`
- Installing: `$(sync~spin) Oxveil: installing claudeloop...`
- Ready: `$(symbol-event) Oxveil: ready`
- Idle: `$(symbol-event) Oxveil: idle`
- Running: `$(sync~spin) Oxveil: Phase X/Y | attempt N | Xm`
- Failed: `$(error) Oxveil: Phase X failed` — with error background
- Done: `$(check) Oxveil: done | Xm`

**Elapsed timer:** Updates every 10 seconds.

**Click action:** Highlights in sidebar.

### Live Run Panel

Webview panel (`LiveRunPanel`) that displays real-time session progress. Replaces the output channel.

**Dashboard section:**
- Phase list with status icons (✓ completed, ↻ running, ✗ failed, ○ pending)
- Collapsible: toggle between full phase list and single-line summary
- Cost accumulator parsed from log lines (`cost=$X.XX`)
- Collapse state persisted via `liveRunDashboardCollapsed` config

**Todo progress:** Parsed from log pattern `[Todos: N/T done] ▸ "current item"`. Shows progress bar and current item. Always visible even when dashboard is collapsed.

**Completion banner:** Shown on run finish. Green for success (✓), red for failure (✗). Displays duration, phase count, total cost. "Open Replay" button opens the replay viewer.

**Log stream:** Formatted log lines streamed below the dashboard. Auto-scrolls. Lines formatted by `logFormatter` with CSS classes for timestamps, tools, paths, commands, todos, errors.

**Auto-open:** Controlled by `oxveil.liveRunAutoOpen` setting (default: true). Applies to both phase execution sessions and AI parse runs.

**AI parse integration:** The panel opens during AI parse (not just phase execution). Two additional webview message types support the retry-with-feedback loop:
- `verify-failed` — signals that the AI-generated plan failed verification; the panel renders a feedback form prompting the user to describe what needs fixing
- `verify-passed` — signals that the plan passed verification; the panel shows a success banner and closes the feedback form

### Archive Parser

Pure function, no VS Code dependency.

**Input:** List of archive directory entries from `.claudeloop/archive/`.
**Output:** `ArchiveEntry[]` with timestamp, phase info, and file paths.

Used by the sidebar webview to display past session runs. Supports replay (re-open logs) and restore (copy archive back to active session).

### Archive Tree View

`archiveTree.ts` is retained as a data layer only (no standalone tree view UI). Produces `ArchiveTreeItem[]` from parsed archive entries. Archives are displayed within the sidebar webview.

**Actions (via sidebar):**
- **Replay:** Opens archived log files in the replay viewer
- **Restore:** Copies archived session data back to the active `.claudeloop/` directory

### DAG Layout

Pure function that computes a layered DAG layout from phase dependency data.

**Input:** Phase list with dependency edges.
**Output:** Node positions and edge paths for SVG rendering.

Algorithm: topological sort → layer assignment → crossing minimization → coordinate assignment. No VS Code dependency — fully testable with Vitest.

### DAG SVG Generator

Converts DAG layout output into an SVG string for embedding in the dependency graph webview.

Renders nodes as rounded rectangles with phase status colors. Edges drawn as paths between connected nodes. Supports click interaction — nodes emit messages to the webview host.

### Dependency Graph Webview

`WebviewPanel` that renders a live dependency graph of phases.

**Live updates:** Subscribes to `phases-changed` events from SessionState. Re-renders the DAG on each update.

**Interaction:** Clicking a phase node in the graph highlights the corresponding entry in the sidebar.

**Lifecycle:** Opened via command or context menu. Disposed when the panel is closed. Handles visibility changes to pause/resume updates.

### Log Viewer

Opens phase log files directly from sidebar actions.

**Flow:** Click "View Log" in the sidebar → opens the corresponding log file from `.claudeloop/` in a VS Code editor tab.

### Diff Provider

Virtual document provider (`TextDocumentContentProvider`) that generates git diffs for individual phases.

**Flow:** Click "View Diff" in the sidebar → opens a diff view showing the git changes made during that phase.

**Implementation:** Uses `gitIntegration.ts` to run `git diff` between the commits that bracket a phase's execution.

### Git Integration

Core module for extracting phase-specific git diffs.

**Interface:** Provides methods to identify commits associated with each phase and generate diffs between them.

**Usage:** Called by the diff provider to populate virtual diff documents. No VS Code dependency beyond `child_process` for running git commands.

### Config Parser

Pure function, no VS Code dependency.

**Input:** Raw `.claudeloop.conf` content string (key=value format).
**Output:** Parsed config object with typed values.

Handles serialization round-trips — parse then serialize preserves unknown keys and comments. Used by the config wizard webview to read and write config files.

### Config Wizard Webview

`WebviewPanel` that renders `.claudeloop.conf` as an editable form.

**Bidirectional sync:** Reads config file on open, watches for external changes via `FileSystemWatcher`, writes back on form edits.

**Architecture:** Split into `configWizard.ts` (panel lifecycle, message passing) and `configWizardHtml.ts` (HTML generation). The config parser handles all file I/O.

**Validation:** Known keys get type-appropriate form inputs. Unknown keys are preserved on round-trip but flagged visually.

### Plan Parser

Pure function, no VS Code dependency.

**Input:** Raw plan file content string.
**Output:** Structured phase list with dependencies, gates, and descriptions.

Used by the CodeLens provider to anchor actions to phase boundaries and by the AI Parse Plan command to process plan content.

### Plan Language Support

Dedicated language ID (`claudeloop-plan`) with a TextMate grammar for plan files.

**Grammar:** `syntaxes/plan.tmLanguage.json` scopes phase headers, dependency lines, gate declarations, and status markers.

**Association:** Registered for `PLAN.md` filename pattern in `package.json`.

### Plan CodeLens Provider

`CodeLensProvider` registered for the `claudeloop-plan` language ID.

**Actions:** Provides inline actions at phase headers — run phase, view diff, view log. Grays out actions for pending phases that cannot be executed yet.

**AI Parse Plan:** Command palette action that parses plan content with configurable granularity (quick-pick for detail level). Uses `aiParseLoop.ts` to drive the retry-with-feedback loop.

### AI Parse Loop

`commands/aiParseLoop.ts` — shared retry orchestrator for the AI parse with feedback feature.

**Responsibility:** Drives the full retry cycle: invoke `aiParseFeedback()` on the process manager, interpret the exit code, signal the Live Run Panel via `verify-failed` or `verify-passed` webview messages, collect user feedback, and loop until exit code 0 or the user cancels.

**Exit code contract:**
- `0` — plan passed verification; loop exits successfully
- `2` — verification failed; prompt the user for feedback and retry
- `1` — unexpected error; surface to the output channel and abort

**Decoupling:** The orchestrator is independent of the specific command that invokes it (CodeLens, command palette, or sidebar). Any entry point that needs to run AI parse with UI feedback delegates here.

### Replay Viewer

`WebviewPanel` that displays inline replay of archived session runs.

**Flow:** Opened from the archive tree context menu. Renders phase progression, log output, and status transitions in a scrollable timeline view.

**CSP:** Uses `unsafe-inline` for inline event handlers in the webview HTML.

### Execution Timeline Panel

`WebviewPanel` that renders a Gantt-style horizontal timeline of phase execution.

**Data flow:** `ProgressState` → `computeTimeline()` (parser) → `renderTimelineHtml()` (HTML generator) → webview panel.

**Timeline parser** (`parsers/timeline.ts`): Pure function. Converts phase states into `TimelineBar` objects with start time, duration, and offset. Handles pending/in_progress/completed/failed phases. Assumes local timestamps from PROGRESS.md (no timezone conversion — see [ADR 0006](docs/adr/0006-execution-timeline-webview.md)).

**HTML renderer** (`views/timelineHtml.ts`): Generates inline HTML/CSS/JS. Renders horizontal bars per phase with status colors, grid lines, time axis ticks, and a "NOW" indicator line that auto-updates via `setInterval`.

**Lifecycle:** Opened via `oxveil.showTimeline` command. Subscribes to `phases-changed` events from SessionState. Re-renders on each update. Disposed when panel is closed.

**Architecture decision:** Separate webview panel rather than extending the dependency graph — see [ADR 0006](docs/adr/0006-execution-timeline-webview.md). Uses inline SVG/HTML consistent with the DAG rendering pattern.

### Plan Chat Session

Interactive Claude session for collaborative plan creation (`PlanChatSession` in `core/planChatSession.ts`).

**Flow:** Opened via `oxveil.openPlanChat` command. Creates a VS Code terminal with Claude CLI using `--permission-mode plan`. The system prompt guides Claude to write numbered phases and respond to user feedback.

**Lifecycle:** Terminal created on command invocation, tracked in `activePlanChatSession`. Terminal close event resets session state. Only one active session allowed at a time.

**Annotation support:** Plan Preview panel sends `annotation` messages when user clicks "Note" buttons. The extension forwards these to `sendAnnotation()`, which sends `[Phase N annotation] text` to the terminal, then calls `focusTerminal()` to bring user attention to the terminal.

### Plan Preview Panel

`WebviewPanel` that renders live preview of plan files during Plan Chat sessions (`PlanPreviewPanel` in `views/planPreviewPanel.ts`).

**Data flow:** File watcher detects plan file changes → `PlanFileResolver` tracks files by category → `parsePlanWithDescriptions()` extracts phases → `renderPhaseCardsHtml()` generates HTML → webview update.

**States:** `empty` (no plan), `raw-markdown` (unparseable content), `active` (session running, Note buttons visible), `session-ended` (terminal closed, annotations disabled).

**Tabs:** When multiple file categories exist (design/implementation/plan), tabs appear for switching between them. Auto-switches to newly created categories.

**Message types (webview → extension):**
- `ready` — sync state to newly loaded webview
- `switchTab` — switch to a different file category
- `annotation` — forward phase feedback to `PlanChatSession.sendAnnotation()` + `focusTerminal()`
- `formPlan` — invoke `oxveil.formPlan` command

### Lessons Parser

Pure function, no VS Code dependency (`parsers/lessons.ts`).

**Input:** Raw `.claudeloop/lessons.md` content string (markdown format with phase headers and metrics).
**Output:** `Lesson[]` with phase number, title, retries, duration, exit status, and optional failReason/summary.

**Format:**
```markdown
## Phase 1: Setup
- retries: 0
- duration: 45s
- exit: success
- summary: Established project structure and config files

## Phase 2: Implementation
- retries: 2
- duration: 312s (expected: 180s)
- exit: error
- fail_reason: verification_failed
- summary: Had to retry due to missing test coverage, added comprehensive unit tests
```

**Optional fields:**
- `fail_reason` — Present when retries > 0. Captures why the phase needed retry (e.g., `verification_failed`, `trapped_tool_calls`, `empty_log`, `no_session`).
- `summary` — Claude's LESSONS_SUMMARY marker content. One-sentence reflection on what was learned, a key decision made, or a pitfall encountered.

Used by the self-improvement panel to display captured metrics and by the self-improvement session to build the system prompt. The failReason and summary provide richer context for the self-improvement Claude instance to understand what happened.

### Self-Improvement Panel

`WebviewPanel` that displays captured lessons after session completion (`SelfImprovementPanel` in `views/selfImprovementPanel.ts`).

**Trigger:** Auto-opened by `sessionWiring.ts` when session completes, `oxveil.selfImprovement` is enabled, and `lessons.md` contains valid lessons.

**UI elements:**
- Header: "Self-Improvement"
- Lessons summary table (phase, retries, duration, exit status)
- "Start Improvement Session" button → invokes `oxveil.selfImprovement.start`
- "Skip" button → invokes `oxveil.selfImprovement.skip`

**Lifecycle:** Revealed via `reveal(lessons)` with lesson data. Disposed when user clicks Skip or closes the panel. Tracked via `selfImprovementActive` in `SidebarMutableState`.

### Self-Improvement Session

Terminal session for Claude-based improvement proposals (`SelfImprovementSession` in `core/selfImprovementSession.ts`).

**Flow:** User clicks "Start Improvement Session" → `oxveil.selfImprovement.start` command → creates terminal with Claude CLI using `--append-system-prompt`.

**System prompt:** Instructs Claude to analyze the captured lessons and propose CLAUDE.md updates. Includes formatted lesson data (phase, retries, duration, exit).

**Cost control:** In development mode (`ExtensionMode.Development`), defaults to `haiku` model. Production uses default model unless overridden via `OXVEIL_CLAUDE_MODEL` env var.

**Commands:**
- `oxveil.selfImprovement.start` — start terminal session
- `oxveil.selfImprovement.skip` — close panel, reset `selfImprovementActive`, return to completed state
- `oxveil.selfImprovement.focus` — reveal existing panel

### Welcome Walkthrough

VS Code native walkthrough (`contributes.walkthroughs` in `package.json`) that guides new users through first-time setup.

**Steps:**
1. **Detect claudeloop** — completed when `oxveil.detected` context key is set (on activation when claudeloop is found)
2. **Configure settings** — completed when `oxveil.walkthrough.configured` is set (on `oxveil.openConfigWizard` invocation)
3. **Create a plan** — completed when `oxveil.walkthrough.hasPlan` is set (on `oxveil.createPlan` or when PLAN.md detected)
4. **Run a session** — completed when `oxveil.walkthrough.hasRun` is set (on session transition to `done`)

**Step content:** Markdown files in `media/walkthrough/`. Each step has a primary action button that invokes the relevant command.

**Context key wiring:** Keys are set via `vscode.commands.executeCommand('setContext', key, true)` at various points: `extension.ts` (detection), `commands.ts` (configure), `commands/createPlan.ts` (plan creation), `sessionWiring.ts` (run completion).

### WorkspaceSessionManager

Central hub for multi-root workspace support. Manages per-folder sessions and tracks which folder is currently active.

**Pattern:** One `WorkspaceSession` per workspace folder. Each session owns its own `SessionState`, `ProcessManager`, and `GitIntegration` instances. The manager is the single source of truth for session lookup and lifecycle.

**Interface:**
- `createSession(init)` — creates or retrieves a session for a folder URI
- `getSession(folderUri)` — lookup by URI
- `getActiveSession()` — returns the currently active session
- `getAllSessions()` — all sessions across the workspace
- `removeSession(folderUri)` — dispose and remove
- `notifyActiveChanged()` — emit `active-session-changed` event

**WorkspaceSession** (`core/workspaceSession.ts`): Container class holding `folderUri`, `workspaceRoot`, `sessionState`, `processManager`, and `gitExec` for a single workspace folder.

**Backward compatibility:** In single-root workspaces, the manager creates one session automatically. All existing commands and views work unchanged — they resolve through the manager's active session.

**Folder scoping:** Webview panels, sidebar, and status bar display are scoped to the active folder. The status bar shows a folder prefix in multi-root workspaces. The sidebar groups phases by folder with a summary of other-root statuses.

### Folder Picker

Utility function (`views/folderPicker.ts`) for resolving which workspace folder a command targets in multi-root workspaces.

**Function:** `pickWorkspaceFolder(manager, placeHolder?) → Promise<WorkspaceSession | undefined>`

**Behavior:**
- Single session: returns it immediately (no UI)
- No sessions: returns `undefined`
- Multiple sessions: shows a VS Code quick-pick with folder names and status details (idle/running/done/failed, phase progress)

**Usage:** Called by the `resolveFolder()` helper in `commands.ts` when no active session is set. Commands that operate on a specific folder (start, stop, reset) route through this picker.

## Interfaces

Component boundaries are defined as interfaces for testability and replaceability.

- **IDetection:** detect, re-detect, current status. Isolates PATH/version logic.
- **IInstaller:** install, isSupported. Isolates platform-specific installation.
- **ISessionState:** State machine transitions, event subscription, current state queries. Views and tests depend on this, not the EventEmitter implementation.
- **IProcessManager:** spawn, stop, reset, isRunning. Isolates child_process details.
- **IWatcherManager:** start, stop, onFileChanged. Isolates FileSystemWatcher details.

Core logic is testable with Vitest. Thin adapters wrap VS Code APIs behind these interfaces.

## Technology

- **Language:** TypeScript (strict mode)
- **Bundler:** esbuild
- **Unit tests:** Vitest — parsers and core modules (anything behind interfaces)
- **Integration tests:** @vscode/test-electron — extension activation, commands, end-to-end flows
- **Minimum VS Code:** ^1.100.0
- **Runtime dependencies:** Zero. Node.js builtins and VS Code API only.

## MCP Bridge

Opt-in HTTP bridge (`oxveil.mcpBridge` setting) for programmatic extension interaction from Claude Code.

**Architecture:** Extension runs an HTTP server on `127.0.0.1:0`. A standalone MCP stdio server (`dist/mcp-server.js`) proxies tool calls to the bridge. Discovery via `<workspaceRoot>/.oxveil-mcp` containing `{ port, token, version, pid }`.

**Tools:** `get_sidebar_state`, `click_sidebar_button`, `execute_command`.

**Key files:**
- `src/mcp/bridge.ts` — HTTP server (routes: `/health`, `/state`, `/click`, `/command`)
- `src/mcp/server.ts` — MCP stdio server (bundled to `dist/mcp-server.js`)

**Constraints:** v1 single-root only. Bridge lazy-imported (zero overhead when disabled). Token auth, localhost-only. PID in discovery file for stale detection.

See [ADR 0011](docs/adr/0011-mcp-bridge-server.md) for design rationale.

## Testing Strategy

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | Parsers (pure functions), core modules behind interfaces (SessionState, lock, detection) |
| Integration | @vscode/test-electron | Extension activation, command execution, watcher→view pipeline, detection→install flow |
| Cross-repo E2E | Future | Start claudeloop → verify Oxveil observes correct state → stop → verify cleanup |

Cross-repo E2E tests are the highest-value tests. They validate the IPC contract in practice and are only possible because the same author owns both repos.

## Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| claudeloop not installed | Detection on activation. Persistent notification with "Install" and "Set Path" actions. Run commands disabled. Status bar: warning. Sidebar: install guidance. |
| claudeloop version incompatible | Notification with version mismatch and "Update" action. Same degraded mode as not-found. |
| No `.claudeloop/` directory | Ready/idle state. Watcher detects creation when claudeloop first runs |
| claudeloop started from terminal | Lock file watcher detects it. Status bar shows running state |
| Stale lock after crash | claudeloop cleans on next start. User can run Force Unlock if needed |
| Multiple VS Code windows | Lock check prevents double-spawn. Both windows can monitor independently |
| Windows without WSL | Installation blocked. Notification guides user to install WSL. |
| Windows platform | claudeloop runs via WSL. SIGTERM for graceful stop. |
| FileSystemWatcher misses event | **Mitigated.** Lock file polled every 5s as fallback. `SessionState.onLockChanged()` is idempotent. |

## Cross-Repo Coordination

Both repos share the same author. This enables tight coordination but requires discipline.

- **IPC contract:** `.claudeloop/` format is documented in the claudeloop repo. Oxveil strictly parses against that spec. Contract changes require updates to both repos.
- **Version compatibility:** Oxveil declares a minimum supported claudeloop version. The `version` field in `.claudeloop/` enables runtime detection of incompatible versions.
- **Signal handling:** Both repos agree on SIGINT (Unix) / SIGTERM (Windows) behavior. Changes to signal handling are coordinated.
- **Release coordination:** Ship breaking contract changes in lockstep. Non-breaking changes can ship independently.
- **Fitness function:** Cross-repo E2E tests in CI validate that the contract holds across both repos.

## Known Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| IPC contract drift between repos | High | Strict parsing, documented contract, cross-repo E2E tests |
| SIGINT no-op on Windows | High | Platform detection, SIGTERM on Windows, coordinated signal handling |
| Double-spawn from multiple windows | High | Lock file check before spawn |
| install.sh failure (network, permissions) | Medium | Clear error messages in terminal, re-detection after install attempt |
| WSL not available on Windows | Medium | Guide user to install WSL, block claudeloop install until WSL ready |
| FileSystemWatcher misses events | Medium | **Mitigated.** Lock file polled every 5s as fallback (see `WatcherManager`). Other files self-correct on next write. |
| Half-written PROGRESS.md parsed mid-write | Medium | Debounce + crash-proof parser + monotonicity validation |
| Unbounded live.log growth | Medium | 64KB cap per read, setImmediate for remainder |

## Release Strategy

- **Trunk-based development** on `main` — see `.claude/skills/trunk-based-dev/SKILL.md`
- **No feature flags** — ship directly on trunk (see [ADR 0005](docs/adr/0005-feature-flag-removal.md))
- **Automated releases** via GitHub Actions (`workflow_dispatch`) — see `.github/workflows/release.yml`
- **Version bumps** auto-detected from conventional commits (`scripts/release.mjs`)
- **Single artifact pipeline**: `vsce package` produces `.vsix`, same artifact published to Marketplace and attached to GitHub Release
- **Pre-release channel** via `vsce publish --pre-release` (standard semver, no odd/even convention)
- **Publish target:** VS Code Marketplace (Open VSX deferred until requested)
- **Cross-repo coordination:** `MINIMUM_VERSION` in `extension.ts` tracks claudeloop compatibility; release claudeloop first when shipping breaking IPC changes

## Roadmap

See [chmc/oxveil#1](https://github.com/chmc/oxveil/issues/1) for full milestone details.

- **v0.1 — Entry Point, Run & Monitor:** ✅ claudeloop detection + installation, basic config via VS Code settings, status bar, commands (start/stop/reset/install), sidebar webview, notifications
- **v0.2 — Rich Monitoring:** ✅ Dependency graph webview (live DAG with click interaction), archive browser (replay/restore), click-to-open phase logs, phase git diffs (View Diff context menu), smart failure notifications with attempt count
- **v0.3 — Config & Plan Editing:** ✅ Config wizard webview, plan file language support (TextMate grammar + CodeLens), AI Parse Plan command, replay viewer, feature flag removal
- **v0.4 — Deep Integration:** ✅ Execution timeline webview, multi-root workspace sessions (WorkspaceSessionManager, folder picker, folder-scoped views), welcome walkthrough (4-step onboarding with context key tracking), Live Run Panel (collapsible dashboard, todo progress, completion banner, log formatter)
- **v0.5 — Advanced Workflows:** Retry strategy picker (3 strategies: standard/stripped/targeted), prompt template editor with live preview

Each milestone adds its own parsers, views, and infrastructure when work begins — not before.
