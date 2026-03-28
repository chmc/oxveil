# Archive Timeline Viewer

View past run timelines in a dedicated read-only panel without restoring the session.

## Problem

The Execution Timeline only shows data for the active session. Past runs appear in the sidebar but clicking them only offers Replay (HTML log viewer) or Restore (overwrites current state). There is no way to quickly view the phase timing of a past run without restoring it.

## Solution

Add a "Show Timeline" action to each past run in the sidebar. Clicking it opens a new read-only webview panel showing the archived run's phase timeline with a metadata header bar.

## Design Decisions

- **Separate panel** — archive timelines open in their own panel, independent of the live Execution Timeline. Users can view both simultaneously.
- **Header bar** — each archive timeline shows a metadata bar with: status icon, plan name, date, phase count, duration, and a READ-ONLY badge. Distinguishes it clearly from the live timeline.
- **No NOW line** — historical runs have no live cursor. The NOW line and its update interval are omitted.
- **Reuse existing parsers** — `parseProgress()` and `computeTimeline()` are used unchanged. `renderTimelineHtml()` gets an optional header parameter.
- **Duration source** — the header bar duration comes from PROGRESS.md phase timestamps (earliest start to latest completion), not `metadata.txt`. This matches what the timeline bars show. The `renderTimelineHtml` built-in "Total" elapsed label serves as the single duration display.

## Data Flow

1. User clicks `$(graph-line)` icon on a past run tree item
2. `oxveil.archiveTimeline` command fires with `archiveName`
3. Resolve workspace root via `getActive()?.workspaceRoot` (same pattern as `archiveReplay` and `archiveRestore`)
4. Read `{workspaceRoot}/.claudeloop/archive/{archiveName}/PROGRESS.md`
   - If missing or empty: show info message "No timeline data for this run" and abort
5. Parse with `parseProgress()` → `ProgressState`
   - If no phases parsed: show info message and abort
6. Read `metadata.txt` for header info (plan name, dates, status)
   - If missing: fall back to `archiveName` as title, "unknown" as status, omit date/duration from header
7. Compute timeline with `computeTimeline(progress, finishedDate)` — uses latest phase completion timestamp from PROGRESS.md, not current time
8. Render with `renderTimelineHtml(data, nonce, cspSource, header)` — header triggers metadata bar and suppresses NOW line
9. Display in `ArchiveTimelinePanel` webview

## Components

### New: `src/views/archiveTimelinePanel.ts`

- `ArchiveTimelinePanel` class
- Constructor takes `{ createWebviewPanel }` (subset of `ExecutionTimelineDeps` — `executeCommand` not needed)
- `reveal(archiveName, progress, metadata)` — creates or reveals panel
- Tracks open panels by `archiveName` in a `Map<string, WebviewPanel>` to prevent duplicates
- On `onDidDispose`: remove panel from tracking map so re-opening works correctly
- Panel title: `"Timeline: {plan name}"`
- Static rendering only — no live updates, no folder tracking, no interval scripts

### Modified: `src/views/timelineHtml.ts`

- `renderTimelineHtml()` accepts optional `header?: { title: string; date: string; duration: string; status: string; phaseCount: number }`
- When `header` is present:
  - Renders metadata bar below the main header (status icon + plan name + date + phases + duration + READ-ONLY badge)
  - Changes header text to "Past Run Timeline"
  - Omits the NOW line element
  - Omits the `setInterval` script
- When `header` is absent: behavior unchanged (NOW line and script remain). Existing `ExecutionTimelinePanel.update()` calls continue to work without modification.

### Modified: `src/commands.ts`

- Extend `CommandDeps` interface with `archiveTimelinePanel?: ArchiveTimelinePanel`
- Register `oxveil.archiveTimeline` command
- Resolve workspace root via `getActive()?.workspaceRoot`
- Read archived `PROGRESS.md` and `metadata.txt`, handle missing files
- Parse both, construct header info with fallbacks
- Call `archiveTimelinePanel.reveal()`

### Modified: `package.json`

- Add `oxveil.archiveTimeline` command definition
- Hide from command palette with `"when": "false"` (requires `archiveName` argument)
- Add `$(graph-line)` icon button to `view/item/context` for `viewItem == archive` (inline group)

### Modified: `src/extension.ts`

- Instantiate `ArchiveTimelinePanel` and pass to `registerCommands`

### Unchanged

- `src/parsers/progress.ts` — `parseProgress()` works on any PROGRESS.md
- `src/parsers/timeline.ts` — `computeTimeline()` accepts any `ProgressState` + `Date`
- `src/parsers/archive.ts` — already parses `metadata.txt`
- `src/views/archiveTree.ts` — no changes needed
- `src/sessionWiring.ts` — archive timeline is not wired to live events

## UX Details

- Tree icon: `$(graph-line)` alongside existing `$(open-preview)` and `$(history)`
- Panel opens in `ViewColumn.One`
- Multiple archive timelines can be open simultaneously (one per archive)
- Reopening the same archive reveals existing panel; closing removes from tracking map
- Header bar uses `--vscode-titleBar-activeBackground` background
- READ-ONLY badge: small pill with muted styling

## Testing

- Unit test `ArchiveTimelinePanel`: mock webview, verify `reveal()` creates panel with correct HTML
- Unit test `renderTimelineHtml` with header: verify header bar rendered, NOW line absent
- Unit test `renderTimelineHtml` without header: verify NOW line present (backward compat)
- Unit test duplicate panel prevention: second `reveal()` with same archiveName reuses panel
- Unit test disposal: close panel, verify removed from map, re-reveal creates new panel
- Unit test missing PROGRESS.md: verify info message shown
- Unit test missing metadata.txt: verify fallback values in header
- Integration: build extension, open EDH, run a session, let it archive, click timeline icon on past run, verify timeline renders with header
