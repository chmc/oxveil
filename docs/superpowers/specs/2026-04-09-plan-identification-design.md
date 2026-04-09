# Plan Identification — Design Spec

## Problem

Plan Preview matches plan files using timing heuristics (birthtimeMs during active sessions, mtimeMs fallback after reload). This is fragile: after VS Code reload, the newest file in `~/.claude/plans/` may belong to a different project. Oxveil needs deterministic plan identification that works across live sessions and reloads.

## Solution

A 4-layer resolution pipeline. Each layer is tried in order; first match wins.

1. **workspaceState cache** — persisted plan path, instant on reload
2. **Session JSONL lookup** — cross-references Claude CLI session transcripts for `planFilePath`
3. **FSWatcher + birthtimeMs** — real-time detection during active Plan Chat sessions (existing)
4. **mtimeMs fallback** — picks newest file across plan directories (existing)

## Architecture

### Layer 1: workspaceState Persistence

Persist `{ planPath, resolvedAt }` to `context.workspaceState` under key `oxveil.activePlan`. Written when any layer resolves a plan. Cleared by `beginSession()` (new session = new plan) and sidebar discard.

Injected into `PlanPreviewPanel` via `persistPlanPath` / `loadPersistedPlanPath` callbacks on the deps interface. No direct VS Code dependency in the panel class.

### Layer 2: Session JSONL Lookup (`src/core/planResolver.ts`)

Claude CLI writes `planFilePath` into `ExitPlanMode` tool inputs in session JSONL transcripts at `~/.claude/projects/<project-hash>/<sessionId>.jsonl`.

Algorithm:
1. Derive project hash from workspace root (path with `/` replaced by `-`)
2. List `*.jsonl` in that directory, sort by mtime descending
3. Read newest 20 files backwards (tail-first) looking for `"planFilePath":"`
4. JSON-parse matched line to extract path
5. Verify file exists on disk

Runs once on activation when workspaceState cache misses. Fails gracefully (catch-all, log warning, return undefined).

### Layers 3-4: Existing

FSWatcher + birthtimeMs for live sessions. mtimeMs fallback as last resort. Layer 3 now also writes to workspaceState on match.

### Updated `onFileChanged()` Flow

- **Active session:** Layer 3 (existing) + persist to Layer 1 on match
- **Sessionless:** Layer 1 (cache) → Layer 2 (JSONL, once) → Layer 4 (mtimeMs)

## Files

| File | Change |
|------|--------|
| `src/core/planResolver.ts` | New: `deriveProjectHash()`, `resolveFromSessionData()` |
| `src/views/planPreviewPanel.ts` | Add persistence deps, update sessionless branch |
| `src/activateViews.ts` | Wire workspaceState and resolver into panel deps |
| `src/extension.ts` | Pass `context` to `createWebviewPanels` |
| `src/test/unit/core/planResolver.test.ts` | New: resolver unit tests |
| `src/test/unit/views/planPreviewPanel.test.ts` | Resolution pipeline tests |

## Known Limitations

- Layer 2 depends on undocumented Claude CLI internals (project hash scheme, JSONL format). Changes to Claude CLI could break it. Layers 3-4 remain as fallback.
- Layer 2 only finds plans after `ExitPlanMode` is called. During active plan writing, Layer 3 covers the gap.
- Scan limit of 20 JONLs may miss very old sessions.
