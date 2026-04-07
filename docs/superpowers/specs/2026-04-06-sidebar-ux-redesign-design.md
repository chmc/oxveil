# Sidebar UX Redesign — Unified Webview Panel

## Problem

The current sidebar uses native VS Code tree views (Phases + Past Runs) that provide a poor developer experience:
- Empty state shows broken codicon text ("$(info) No active session") with no actionable guidance
- Past runs display raw timestamps (e.g. "20260406-190416") instead of human-readable labels
- No onboarding flow — new users don't know how to create a plan, configure, or start
- No quick action buttons — all interactions require the command palette
- Two disconnected sections with no visual continuity between states

## Solution

Replace both tree views with a single webview sidebar panel that adapts to 7 context-aware states. Each state is purpose-built with clear CTAs, rich formatting, and seamless transitions.

## State Machine

```
NotFound ──install──→ Empty
Empty ──create plan──→ Ready ──start──→ Running
Running ──all done──→ Completed
Running ──user stops──→ Stopped ──resume──→ Running
Running ──retries exhausted──→ Failed ──retry/skip──→ Running
Stopped / Failed / Completed ──reset──→ Ready
Ready ──plan deleted──→ Empty
```

## States

### 0. Not Found (claudeloop not installed)

- Centered layout with warning icon
- Title: "claudeloop not found"
- Brief explanation of what claudeloop is and how to install it
- Primary CTA: "Install claudeloop" button
- Secondary: "Set custom path..." link

Trigger: `DetectionStatus === "not-found"` or `"version-incompatible"`.

### 1. Empty (no plan detected)

- Centered layout with icon, title "Create a Plan", brief explainer
- Primary CTA: "+ Create Plan" button
- Secondary: "Open existing plan..." link
- "How it works" section: 3 numbered steps explaining the Oxveil workflow
- Show past runs if any exist (returning user with no active plan)

Trigger: claudeloop detected, no plan file in workspace, no active progress.

### 2. Ready (plan exists, session idle)

Integrated card structure:
- **Header**: Plan filename + "Ready" badge (green). Icon buttons: ✏️ Edit, ⚙️ Configure
- **Phase list**: All phases with ○ pending icons, numbered titles
- **Action toolbar**: ▶ Start (primary), 🤖 AI Parse, 💬 Chat (secondary)
- **Recent Runs** section below card with human-readable entries

Trigger: Plan file detected, `SessionState.status === "idle"`, no leftover incomplete progress.

### 3. Running (live session)

Same card, now live:
- **Header**: Plan filename + "Running" badge (blue). ⏹ Stop button replaces edit/configure
- **Progress bar**: Blue, width = completed phases / total phases
- **Phase list**: ✓ completed (strikethrough, gray, with duration), ↻ active (highlighted row with blue left border, white text), ○ pending (dimmed)
- **Info bar**: 💰 cost, 📝 todo progress, attempt count (shows "attempt 2/3" during auto-retries)
- **Quick links** below card: Timeline, Graph, Log buttons

Trigger: `SessionState.status === "running"`.

Updates: Extension sends `progressUpdate` messages on `phases-changed` events. Webview updates phase list, progress bar, and info bar incrementally (no full re-render).

### 4. Stopped (user interrupted or process crashed)

- **Header**: Plan filename + "Stopped" badge (amber)
- **Progress bar**: Amber, frozen at interruption point
- **Phase list**: ✓ completed, ⏸ paused phase (amber highlight, "stopped" label), ○ remaining
- **Action toolbar**: ▶ Resume from Phase N (primary), 🔄 Restart (secondary)
- **Additional actions** below: Edit Plan, Configure, Log

Trigger: `SessionState.status === "done"` AND progress has incomplete phases with none failed.

This is a **view-layer concept only** — the underlying `SessionState` transitions to `"done"` when the lock is released regardless of completion. The sidebar's `deriveViewState()` inspects the progress to distinguish "done with all phases complete" (→ Completed) from "done with phases remaining" (→ Stopped). No changes to `SessionState` or `SessionStatus` are needed.

### 5. Failed (retries exhausted)

- **Header**: Plan filename + "Failed" badge (red)
- **Progress bar**: Red, frozen at failure point
- **Phase list**: ✓ completed, ✗ failed phase (red highlight, attempt count), ○ remaining
- **Error context**: Inline snippet from last phase log line + "View full log →" link
- **Action toolbar**: 🔄 Retry Phase N (primary), ⏭ Skip (secondary, marks phase complete)
- **Additional actions** below: Edit Plan, Configure, Diff

Trigger: `SessionState.status === "failed"`.

Error snippet: Read the last non-empty line from `.claudeloop/phase-N.log` when entering failed state. Cached in `SidebarState.session.errorSnippet`.

### 6. Completed (all phases done)

- **Header**: Plan filename + "Completed" badge (green)
- **Success banner**: ✓ icon, "All N phases completed", duration + cost summary
- **Phase list**: All ✓ with durations
- **Post-run actions**: 🔄 Replay, 📊 Timeline, 🔀 Diff
- **"What's next?"** section: + Create new plan, 🔄 Run again
- **Past Runs** with latest run highlighted (green border)

Trigger: `SessionState.status === "done"` AND all phases completed.

## Shared Card Structure

States 2–6 share a consistent card layout for smooth visual transitions:

```
┌─────────────────────────────────┐
│ Plan name    [badge] [actions]  │  ← Header
├─────────────────────────────────┤
│ ████████░░░░░░░░░░░░░░░░░░░░░░ │  ← Progress bar (states 3-6)
├─────────────────────────────────┤
│ ✓ 1. Phase one           32s   │
│ ↻ 2. Phase two          1m 2s  │  ← Phase list
│ ○ 3. Phase three                │
├─────────────────────────────────┤
│ 💰 $0.42  📝 3/7  attempt 1    │  ← Info bar (state 3 only)
├─────────────────────────────────┤
│ [▶ Start] [AI Parse] [Chat]    │  ← Action toolbar
└─────────────────────────────────┘
```

## Multi-Root Workspace Support

The webview sidebar is a singleton (one per VS Code window). For multi-root workspaces:

- Show a folder selector dropdown at the top when >1 workspace folder exists
- The selected folder determines which `WorkspaceSession` drives the sidebar state
- Default to the active editor's folder, or the first folder if no editor is open
- Folder selector shows per-folder status indicators (running/stopped/idle)
- `WorkspaceSessionManager.getActiveSession()` already handles folder selection — reuse this

This matches the existing behavior where the status bar shows the active folder's session.

## Past Runs Section

Displayed below the main card in states 1 (if archives exist), 2, 4, 5, 6 (not Running).

Each entry shows:
- Status icon: ✓ (green/completed), ⚠ (amber/unknown), ✗ (red/failed)
- Plan name (derived from metadata, not raw timestamp)
- Relative date + phase count + duration
- Click → expand to show Replay, Timeline, Restore actions

Entries sorted by date descending. "View all" link when >3 entries. Refresh button in section header.

## Communication Protocol

### Webview → Extension (commands)

| Message | Triggers |
|---|---|
| `{ command: 'install' }` | Install claudeloop button |
| `{ command: 'setPath' }` | Set custom path link |
| `{ command: 'createPlan' }` | Create Plan button |
| `{ command: 'openPlan' }` | Open existing plan link |
| `{ command: 'editPlan' }` | ✏️ icon button |
| `{ command: 'configure' }` | ⚙️ icon button |
| `{ command: 'start' }` | ▶ Start button |
| `{ command: 'stop' }` | ⏹ Stop button |
| `{ command: 'resume', phase: number }` | ▶ Resume from Phase N |
| `{ command: 'restart' }` | 🔄 Restart button |
| `{ command: 'retry', phase: number }` | 🔄 Retry Phase N |
| `{ command: 'skip', phase: number }` | ⏭ Skip button (marks complete) |
| `{ command: 'markComplete', phase: number }` | Mark phase as done |
| `{ command: 'runFromPhase', phase: number }` | Run from specific phase |
| `{ command: 'aiParse' }` | 🤖 AI Parse button |
| `{ command: 'planChat' }` | 💬 Chat button |
| `{ command: 'openTimeline' }` | Timeline button |
| `{ command: 'openGraph' }` | Graph button |
| `{ command: 'openLog', phase?: number }` | Log button / View full log |
| `{ command: 'openDiff', phase?: number }` | Diff button |
| `{ command: 'openReplay', archive: string }` | Replay from past run |
| `{ command: 'restoreArchive', archive: string }` | Restore from past run |
| `{ command: 'forceUnlock' }` | Force unlock (shown in stuck Running) |
| `{ command: 'reset' }` | Reset / start fresh |
| `{ command: 'refreshArchives' }` | Refresh past runs |
| `{ command: 'selectFolder', uri: string }` | Switch active folder (multi-root) |

### Extension → Webview (state updates)

| Message | When |
|---|---|
| `{ type: 'fullState', state: SidebarState }` | On state transitions, initial render, folder switch |
| `{ type: 'progressUpdate', update: ProgressUpdate }` | During running (on phases-changed) |

### Types

```typescript
interface SidebarState {
  view: 'not-found' | 'empty' | 'ready' | 'running' | 'stopped' | 'failed' | 'completed'
  notFoundReason?: 'not-installed' | 'version-incompatible'
  plan?: {
    filename: string
    phases: PhaseView[]
  }
  session?: {
    elapsed: string
    cost?: string
    todos?: { done: number; total: number }
    currentPhase?: number
    attemptCount?: number
    maxRetries?: number
    errorSnippet?: string
  }
  archives: ArchiveView[]
  folders?: FolderView[]        // Only present when >1 workspace folder
  activeFolder?: string          // URI of active folder
}

interface ProgressUpdate {
  phases: PhaseView[]
  elapsed: string
  cost?: string
  todos?: { done: number; total: number }
  currentPhase?: number
  attemptCount?: number
  maxRetries?: number
}

interface PhaseView {
  number: number | string
  title: string
  status: 'pending' | 'completed' | 'in_progress' | 'failed'
  duration?: string
  attempts?: number
}

interface ArchiveView {
  name: string
  label: string
  date: string
  phaseCount: number
  duration?: string
  status: 'completed' | 'failed' | 'unknown'
}

interface FolderView {
  uri: string
  name: string
  sessionStatus: 'idle' | 'running' | 'done' | 'failed'
}
```

Note: `PhaseView.status` uses the same `PhaseStatus` values from `types.ts` — no synthetic "stopped" status. The "stopped" appearance (⏸ icon, amber highlight) is derived in the webview rendering layer: a phase with `status === 'pending'` that follows a completed phase, when `view === 'stopped'`, gets the paused visual treatment.

## State Detection Logic

```typescript
function deriveViewState(
  detection: DetectionStatus,
  sessionStatus: SessionStatus,
  planDetected: boolean,
  progress: ProgressState | undefined
): SidebarState['view'] {
  if (detection !== 'detected') return 'not-found'
  if (sessionStatus === 'running') return 'running'
  if (sessionStatus === 'failed') return 'failed'
  if (sessionStatus === 'done') {
    const allCompleted = progress?.phases.length &&
      progress.phases.every(p => p.status === 'completed')
    return allCompleted ? 'completed' : 'stopped'
  }
  // status === 'idle' — check for orphaned progress (e.g. extension restart after crash)
  if (progress?.phases.some(p => p.status === 'failed')) return 'failed'
  if (progress?.phases.some(p => p.status === 'completed') &&
      progress?.phases.some(p => p.status === 'pending')) return 'stopped'
  if (!planDetected && !progress) return 'empty'
  return 'ready'
}
```

Key design decisions:
- The "stopped" vs "completed" distinction is made at the view layer by inspecting progress. No changes to `SessionState`, `SessionStatus`, or `PhaseStatus` types.
- Uses `DetectionStatus` (not boolean) so the Not Found state can show "not installed" vs "wrong version" messaging.
- Handles orphaned progress on extension restart: idle + partial progress → stopped, idle + failed phase → failed.

## Loading State

On extension activation, the webview renders a minimal loading state (spinner + "Initializing...") as its default HTML before any `fullState` message arrives. This is not a `SidebarState.view` value — it's the webview's initial DOM rendered by `resolveWebviewView()`, replaced when the first `fullState` message is received. This prevents a flash of "Empty" before detection and state parsing complete.

## Archive Refresh

Archives are re-fetched and included in the `fullState` message on every state transition (Running→Completed, Running→Stopped, Running→Failed, any→Ready via reset). The manual `refreshArchives` command is for edge cases where archive files change outside Oxveil (e.g. manual file operations).

## Files to Modify

### Remove
- `src/views/phaseTree.ts` — replaced by webview
- `src/views/archiveTree.ts` — replaced by webview
- `src/views/treeAdapter.ts` — no longer needed
- Tree view registrations and context menus in `package.json`

### Add
- `src/views/sidebarPanel.ts` — `WebviewViewProvider` implementation, state management, message handling
- `src/views/sidebarHtml.ts` — HTML/CSS rendering for all 7 states (including loading)
- `src/views/sidebarMessages.ts` — Message type definitions and command dispatch

### Modify
- `package.json` — Replace tree view contributions with webview view, update menus
- `src/extension.ts` — Register `WebviewViewProvider` instead of tree providers
- `src/activateViews.ts` — Wire sidebar panel instead of tree adapters
- `src/sessionWiring.ts` — Send state/progress updates to sidebar webview instead of tree emitters
- `src/commands.ts` — Commands still exist but are now also triggered via webview messages

## CSS Approach

- Use VS Code CSS custom properties (`--vscode-*`) for theme-aware colors
- Dark/light theme support via CSS variables (no hardcoded colors in final implementation)
- The mockups use hardcoded dark theme colors for illustration only
- Codicons via `@vscode/codicons` font for icons (not emoji — emoji is mockup-only)

## Testing

- Unit test `deriveViewState()` with all state combinations (including edge cases: orphaned progress without plan, not-found state)
- Unit test HTML rendering for each state (snapshot or string matching)
- Unit test message handling (command dispatch maps to correct VS Code commands)
- Unit test `PhaseView` rendering logic: "stopped" visual treatment for pending phases in stopped view
- Integration test: activate extension, verify webview resolves and renders
- Visual verification: build, launch EDH, screenshot sidebar in each state

## Migration Path

1. Build sidebar webview alongside existing tree views (both registered, both visible during development)
2. Wire state updates to both tree views and webview
3. Validate all 7 states work correctly via visual verification
4. Remove tree view registrations and code in a single commit
5. Clean up unused tree adapter code
