# Live Run Panel

Replace the VS Code Output Channel with a native Oxveil webview that shows rich, real-time run progress — phase dashboard, todo tracking, and color-coded log stream.

## Problem

Users can only watch claudeloop execution via VS Code's Output Channel, which renders raw text without colors, structure, or interactivity. The terminal claudeloop experience (spinners, colored tool calls, todo checklists, timestamps) is lost.

## Solution

A single `LiveRunPanel` webview with two sections:

1. **Dashboard header** (collapsible): Phase list with status icons, elapsed time, cost, and a todo progress section for the current phase
2. **Formatted log stream**: Color-coded, parsed log output with timestamps, tool call badges, todo updates, and a "thinking" indicator

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/views/liveRunPanel.ts` | Panel class — creates webview, handles message passing, manages lifecycle |
| `src/views/liveRunHtml.ts` | Initial HTML shell with CSS, webview JavaScript for receiving messages |
| `src/parsers/logFormatter.ts` | Pure function: raw log line → HTML string |

### Removed Files

| File | Reason |
|------|--------|
| `src/views/outputChannel.ts` | Replaced by LiveRunPanel |

### Data Flow

Two update paths, both via `postMessage` (never full `webview.html` replacement — preserves scroll position and animation state):

1. **Dashboard updates** (`phases-changed` event): Extension renders dashboard HTML via `liveRunHtml.ts`, sends `{ type: "dashboard", html }`. Webview JS replaces dashboard container innerHTML.

2. **Log updates** (`log-appended` event): Extension parses new lines via `logFormatter.ts`, sends `{ type: "log-append", html }`. Webview JS appends to log container, auto-scrolls if user is at bottom of scroll.

### Log Formatter

`formatLogLine(line: string): string` — pure function, no inter-line state.

Patterns detected:

| Pattern | Regex hint | CSS class |
|---------|-----------|-----------|
| Timestamp `[HH:MM:SS]` | `^\s*\[(\d{2}:\d{2}:\d{2})\]` | `.log-ts` (dimmed) |
| Phase header `▶ Executing Phase N/T: ...` | `▶ Executing Phase` | `.log-phase-header` (bold blue + divider) |
| Tool call `[Tool: Name] ...` | `\[Tool: (\w+)\]` | `.log-tool` (blue badge) + `.log-path` (gray) |
| Todo update `[Todos: N/T done]` | `\[Todos: (\d+)/(\d+) done\]` | `.log-todo` (green) |
| TodoWrite `[TodoWrite] N items` | `\[TodoWrite\]` | `.log-todo-create` |
| Warning `⚠ ...` | `⚠` | `.log-warn` (yellow) |
| Success `✓ ...` | `✓` | `.log-success` (green) |
| Session summary `[Session: ...]` | `\[Session:` | `.log-session` (formatted metrics) |
| Error result `[Result [error]: ...]` | `\[Result \[error\]` | `.log-error` (red) |
| Refactor `🔧 Refactoring ...` | `🔧` | `.log-refactor` (orange) |
| Divider `─────` or `┄┄┄┄` | `[─┄]{5,}` | `.log-divider` (hr) |
| Default text | everything else | `.log-text` (default gray) |

### Dashboard HTML

`SessionMeta` is a new type built by the panel from available data:

```typescript
interface SessionMeta {
  planName: string;       // from .claudeloop/plan.md filename or PROGRESS.md title
  startedAt: string;      // from first phase's `started` timestamp
  totalCost: number;      // accumulated from [Session: ...] log lines (see Cost Data)
}
```

Rendered server-side by `renderDashboardHtml(progress: ProgressState, meta: SessionMeta): string`.

Sections:
- **Title bar**: Plan name, elapsed time (live-updating via JS interval), total cost
- **Phase list**: Each phase as a row — status icon (✓/↻/✗/○), phase number + title, duration + cost for completed phases, running timer for active phase. Active phase gets highlighted row. Pending phases dimmed.
- **Todo progress** (for current phase): Progress bar, completed/total count, checklist of todo items with status icons. Only shown when todos exist.
- **Collapse toggle**: Text link "▼ Dashboard" / "▶ Dashboard" that collapses the phase list into a single-line summary bar. The **todo section is always visible** regardless of collapse state — it is critical for tracking live progress. Initial state from `oxveil.liveRunDashboardCollapsed` setting; user toggles persisted in `workspaceState` for the current session (resets to setting default on next run).

### Webview JavaScript

The initial HTML shell includes a `<script>` (nonce-protected) that:
- Listens for `message` events from extension
- Handles `{ type: "dashboard", html }` — replaces dashboard container
- Handles `{ type: "log-append", html }` — appends to log, trims if over limit, auto-scrolls
- Handles `{ type: "run-finished", html }` — shows completion banner
- Sends `{ type: "toggle-dashboard" }` on collapse click
- Sends `{ type: "open-replay" }` on replay button click
- Sends `{ type: "show-earlier" }` when user clicks "Show earlier output"
- Runs a 1-second interval to update elapsed time display

### Line Buffer

- Extension keeps formatted HTML lines in a ring buffer (max configurable, default 1000)
- When webview opens mid-run, extension sends buffered lines as initial batch
- When buffer exceeds limit, extension sends `{ type: "log-trim", count: N }` and webview removes oldest N lines from DOM
- "Show earlier output (N lines)" link at top — clicking sends message to extension, which re-reads `live.log` from disk and sends historical lines

## Wiring & Lifecycle

### Auto-Open

When `session.on("state-changed")` fires with `to === "running"` and `oxveil.liveRunAutoOpen` is `true` (default), the panel opens in `ViewColumn.One`.

### During Run

- `phases-changed` → render dashboard HTML → postMessage to webview
- `log-appended` → format lines → postMessage to webview
- Panel can be closed and reopened mid-run (buffered state replayed)

### Run Completion

Panel stays open. Shows completion banner:
- Status (completed/failed), total duration, total cost
- "Open Replay" button that triggers `oxveil.openReplayViewer`

### Manual Open

Command `oxveil.showLiveRun` — opens panel for active session. If no session running, shows empty state ("No active run").

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `oxveil.liveRunAutoOpen` | boolean | `true` | Auto-open panel when run starts |
| `oxveil.liveRunDashboardCollapsed` | boolean | `false` | Default collapsed state of dashboard |
| `oxveil.liveRunLogLines` | number | `1000` | Max log lines visible in panel |

## Cost Data

Cost comes from `[Session: model=... cost=$X ...]` log lines. Each `[Session:]` line appears when a Claude session ends — typically once per phase, but also for retries and refactors.

**Per-phase cost:** Each `[Session:]` line falls between phase header dividers (`▶ Executing Phase N`). The panel tracks which phase is active when a `[Session:]` line arrives and attributes the cost to that phase. If multiple sessions occur within one phase (retries), their costs are summed.

**Total cost:** Sum of all per-phase costs.

**Fallback:** If no `[Session:]` lines have been seen yet, cost columns show "—" instead of "$0.00".

## Testing

- `logFormatter.ts`: Unit tests for each pattern — input line → expected HTML output
- `liveRunHtml.ts`: Unit tests for dashboard rendering given various ProgressState inputs
- `liveRunPanel.ts`: Integration test — verify message passing wiring (mock webview)
- Manual: Run claudeloop, verify panel auto-opens, dashboard updates, log streams with colors, collapse works, completion banner appears
