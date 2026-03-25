# Oxveil v0.1 Implementation Plan

## Context

Oxveil is a VS Code extension for managing AI coding workflows, powered by claudeloop. No source code exists yet. This plan breaks v0.1 ("Entry Point, Run & Monitor") into 5 phases, each delivering a visual demoable increment with mandatory TDD and visual verification.

Source issue: https://github.com/chmc/oxveil/issues/1

## Verified Formats (from claudeloop source)

### Lock file (`.claudeloop/lock`)
- **Format**: Plain text, single line, contains only the shell PID (`echo $$ > "$LOCK_FILE"`)
- **Source**: `claudeloop` line 201
- **Process detection**: `kill -0 "$pid"` to check if alive
- **Stale lock**: claudeloop auto-removes stale locks on next start. Oxveil provides Force Unlock as escape hatch.
- **ARCHITECTURE.md fix needed**: says "JSON file" → change to "plain text file containing the PID"

### PROGRESS.md
- **Phase header**: `### [emoji] Phase [N]: [Title]`
- **Emojis**: `✅` completed, `🔄` in_progress, `❌` failed, `⏳` pending
- **4 valid statuses only**: `pending`, `completed`, `failed`, `in_progress`. No "skipped" status exists.
- **`in_progress` normalization**: claudeloop resets to `pending` on read (crash recovery). Oxveil sees `in_progress` in live files during active runs.
- **Fields per phase** (in order, all optional except Status):
  - `Status: <value>`
  - `Started: YYYY-MM-DD HH:MM:SS`
  - `Completed: YYYY-MM-DD HH:MM:SS` (only if completed or failed)
  - `Attempts: N` (plain integer, only if > 0)
  - `Attempt N Started: YYYY-MM-DD HH:MM:SS` (per attempt)
  - `Attempt N Strategy: <value>` (per attempt)
  - `Attempt N Fail Reason: <value>` (per attempt)
  - `Refactor: <value>` (e.g., "in_progress 3/5", "completed")
  - `Refactor SHA: <value>`
  - `Refactor Attempts: N`
  - `Depends on: Phase X [emoji] Phase Y [emoji]...`
- **Header section**: `# Progress for <plan_file>`, `Last updated:`, `## Status Summary` (counts), `## Phase Details`
- **Atomic writes**: temp file + `mv` to prevent corruption
- **Decimal phase numbers**: supported (e.g., "Phase 2.5")
- **Source**: `claudeloop/lib/progress.sh` lines 111-253

### claudeloop CLI
- **Version output**: `printf '%s\n' "$VERSION"` → just `"0.22.1"` on stdout. Current version: 0.22.1.
- **Version flag**: `--version` or `-V`
- **Setting defaults that differ from ARCHITECTURE.md**:
  - `--verify` defaults to **true** (ARCHITECTURE.md setting has `false`) → fix to `true`
  - `--refactor` defaults to **true** (ARCHITECTURE.md setting has `false`) → fix to `true`
  - `--ai-parse` defaults to **true** (ARCHITECTURE.md setting has `false`) → fix to `true`
- **Signal handling**: traps INT+TERM → kills pipeline (SIGTERM to child process group), marks in_progress→pending, saves progress, removes lock, exits 130
- **Install locations**: `/usr/local/lib/claudeloop` (system) or `~/.local/lib/claudeloop` (user), wrapper in corresponding `bin/`

## UI Design Reference

All mockups are in `/Users/aleksi/source/oxveil/docs/mockups/`. These are the authoritative visual targets for visual verification.

| Mockup | What it shows | Used in |
|--------|--------------|---------|
| `v01-entry-point.html` | Interactive mockup with ALL v0.1 UI states (CSS + JS) | All phases — master reference |
| `v01-status-bar.png` | 7 status bar states: not-found, installing, ready, idle, running, failed, done | Phase 1, 3, 5 |
| `v01-phase-tree-view.png` | Tree view: not-found guidance, welcome, running phases, completed, failed | Phase 2, 3 |
| `v01-command-palette.png` | 5 commands with when-clause gating across states | Phase 4 |
| `v01-output-channel.png` | Live log streaming with stderr prefix | Phase 3 |
| `v01-notifications.png` | Install prompt, phase complete, phase failed, double-spawn, version mismatch | Phase 5 |

## Pre-implementation: Architecture Updates

Before Phase 1, update ARCHITECTURE.md:
1. Lock file: "JSON file" → "plain text file containing the PID"
2. Settings defaults: `oxveil.verify`, `oxveil.refactor`, `oxveil.aiParse` → default `true` (match claudeloop)
3. Status bar running format: add attempt count → `Phase X/Y | attempt N | Xm`
4. Remove "skipped" icon from tree view (no such status in claudeloop)

---

## Phase 1: Scaffold + Detection + Dynamic Status Bar

**Goal**: Compilable, installable extension that detects claudeloop and shows the result in the status bar. First demo: "install the extension, it tells you whether claudeloop is available."

**TDD targets**:
- `src/test/unit/views/statusBar.test.ts` — all 7 status bar state renderings (text, icon, tooltip, background). Mock VS Code StatusBarItem as plain object.
- `src/test/unit/core/detection.test.ts`:
  - Returns `detected` when execFile resolves with valid version
  - Returns `not-found` when execFile rejects
  - Returns `version-incompatible` when version below minimum
  - Uses custom path from settings when provided
  - Parses version string correctly (e.g., "0.22.1")
  - Re-detects on setting change for `oxveil.claudeloopPath`
- Dependency injection: Detection takes an executor function, not `child_process` directly

**Implementation**:
- `package.json` — extension manifest, activation events (`onStartupFinished`, `onCommand:oxveil.*`, `workspaceContains:**/.claudeloop`), contributes: commands stub, configuration settings (`oxveil.experimental` default false, `oxveil.claudeloopPath` default "claudeloop", `oxveil.watchDebounceMs` default 100, `oxveil.verify` default true, `oxveil.refactor` default true, `oxveil.dryRun` default false, `oxveil.aiParse` default true) — defaults match claudeloop CLI defaults
- `tsconfig.json` — strict mode, ES2020 target
- `esbuild.mjs` — CommonJS output for extension host
- `vitest.config.ts`
- `.vscodeignore`
- `src/types.ts` — shared types: `DetectionStatus`, `SessionStatus`, `StatusBarState`, `PhaseStatus`, `ProgressState`, `PhaseState`
- `src/core/interfaces.ts` — `IDetection`, `ISessionState`, `IProcessManager`, `IInstaller`, `IWatcherManager`
- `src/core/detection.ts` — check setting → PATH → `--version` → compare minimum. Cache result, re-detect on setting change.
- `src/views/statusBar.ts` — `StatusBarManager` with `update(state)` and all 7 state renderings. Click command targets tree view (no-op until Phase 2).
- `src/extension.ts` — activate/deactivate with disposable tracking. Run detection, update status bar. Set VS Code context keys: `oxveil.detected`, `oxveil.processRunning`.

**Visual verification**: Without claudeloop → `$(warning) Oxveil: claudeloop not found`. With claudeloop → `$(symbol-event) Oxveil: ready`. Compare against `docs/mockups/v01-status-bar.png`.

**Files**: `package.json`, `tsconfig.json`, `esbuild.mjs`, `vitest.config.ts`, `.vscodeignore`, `src/extension.ts`, `src/types.ts`, `src/core/interfaces.ts`, `src/core/detection.ts`, `src/views/statusBar.ts`, `src/test/unit/views/statusBar.test.ts`, `src/test/unit/core/detection.test.ts`

---

## Phase 2: Progress Parser + Phase Tree View

**Goal**: Sidebar tree view renders phases from PROGRESS.md with correct icons per status.

**Demo prerequisites**: Create mock `.claudeloop/PROGRESS.md` before launching EDH. Use fixture from `test/fixtures/mock-running/PROGRESS.md`.

**TDD targets**:
- `src/test/unit/parsers/progress.test.ts`:
  - Parses well-formed PROGRESS.md with multiple phases
  - Extracts correct status for each phase (pending, completed, in_progress, failed)
  - Extracts attempt count per phase from `Attempts: N` field
  - Handles decimal phase numbers ("Phase 2.5")
  - Returns empty state on empty/malformed/truncated input (no crash)
  - Rejects unknown status values (e.g., "Status: maybe")
  - Monotonicity validation (phase count decrease = partial read)
  - Handles emoji-prefixed headers (`✅`, `🔄`, `❌`, `⏳`)
  - Extracts Started/Completed timestamps
- `src/test/unit/views/phaseTree.test.ts`:
  - Returns welcome message when detected + no phases
  - Returns not-found guidance when not detected
  - Returns correct tree items with icons per phase status
  - Shows attempt count in description for phases with attempts > 1

**Implementation**:
- `src/parsers/progress.ts` — pure function `parseProgress(content: string): ProgressState`. Crash-proof (try-catch, returns empty state on failure). Strict parsing — rejects unknown status values. Monotonicity validation.
- `src/views/phaseTree.ts` — `TreeDataProvider<PhaseTreeItem>`. Icons: `check`/green (completed), `sync~spin`/blue (in_progress), `error`/red (failed), `circle-outline`/gray (pending). 4 statuses only — no "skipped". Welcome/not-found/install guidance states. Phase transition detection for notifications (old vs new ProgressState comparison) — emit events, actual notification display deferred to Phase 4.
- `test/fixtures/` — mock PROGRESS.md files for running, failed, done states
- Register tree view in `package.json` (viewsContainers, views)
- Wire status bar click → focus tree view

**Visual verification**: Verify tree view in all states: not-found guidance, welcome (no session), running (mock PROGRESS.md with mixed statuses), completed. Compare against `docs/mockups/v01-phase-tree-view.png`.

**Files**: `src/parsers/progress.ts`, `src/views/phaseTree.ts`, `test/fixtures/`, `src/test/unit/parsers/progress.test.ts`, `src/test/unit/views/phaseTree.test.ts`, modified `package.json`, `src/extension.ts`

---

## Phase 3: Session State + Watchers + Output Channel

**Goal**: Live reactivity — file changes in `.claudeloop/` drive UI updates in real time. Output channel streams live.log.

**Demo prerequisites**: Create mock `.claudeloop/` with lock + PROGRESS.md + live.log before launching EDH. Use `test/fixtures/mock-running/` directory.

**TDD targets**:
- `src/test/unit/core/sessionState.test.ts`:
  - Initial state is `idle`
  - Transitions: idle → running (lock detected), running → done (all phases completed), running → failed (phase fails)
  - Emits correct events: `state-changed`, `phases-changed`, `log-appended`, `lock-changed`
  - Rejects invalid transitions (idle → done)
  - Done/failed → idle (reset)
  - `checkInitialState()` picks up running session (lock exists + PROGRESS.md present → running)
  - `checkInitialState()` handles no `.claudeloop/` dir → stays idle
- `src/test/unit/core/lock.test.ts`:
  - Parses valid PID from plain text lock content
  - Returns unlocked for empty/non-numeric/missing content
  - Handles leading/trailing whitespace in PID
- `src/test/unit/core/watchers.test.ts`:
  - Debounce: rapid events produce single callback
  - Routes lock file changes to lock handler
  - Routes PROGRESS.md changes to progress handler
  - Routes live.log changes to log handler
  - 64KB cap: reads at most 64KB, schedules `setImmediate` for remainder
  - Ignores unrecognized files in `.claudeloop/`
- `src/test/unit/views/outputChannel.test.ts`:
  - Appends content from log-appended events
  - Prefixes stderr lines with `[stderr]`

**Implementation**:
- `src/core/sessionState.ts` — state machine: `idle → running → done | failed → idle`. Typed EventEmitter with events: `state-changed`, `phases-changed`, `log-appended`, `lock-changed`. `checkInitialState()` reads existing lock + PROGRESS.md on activation.
- `src/core/lock.ts` — parse plain PID from `.claudeloop/lock`. Validate PID is a number.
- `src/core/watchers.ts` — single `FileSystemWatcher` on `**/.claudeloop/**`. Per-file debounce (`setTimeout`/`clearTimeout` at configurable interval). 64KB cap on live.log reads with `setImmediate` follow-up. Route by filename to session state.
- `src/views/outputChannel.ts` — wraps `vscode.window.createOutputChannel("Oxveil")`. Subscribes to `log-appended`. Prefixes stderr with `[stderr]`.
- Wire in `extension.ts`: watchers → parsers → session state → status bar + tree view + output channel

**Visual verification**: Launch EDH with mock running state. Verify: status bar shows `$(sync~spin) Oxveil: Phase 2/5 | attempt 3 | 0m`, tree view shows phases with live icons, output channel shows log content. Modify PROGRESS.md in mock dir while EDH runs — verify tree view updates. Compare against `docs/mockups/v01-status-bar.png` (running), `docs/mockups/v01-phase-tree-view.png` (running), `docs/mockups/v01-output-channel.png`.

**Files**: `src/core/sessionState.ts`, `src/core/lock.ts`, `src/core/watchers.ts`, `src/views/outputChannel.ts`, `src/test/unit/core/sessionState.test.ts`, `src/test/unit/core/lock.test.ts`, `src/test/unit/core/watchers.test.ts`, `src/test/unit/views/outputChannel.test.ts`, modified `src/extension.ts`, `src/views/statusBar.ts`, `src/views/phaseTree.ts`

---

## Phase 4: Commands + Process Manager + Installer

**Goal**: All 5 command palette commands work. Start spawns claudeloop, Stop kills it. Full command interaction loop.

**TDD targets**:
- `src/test/unit/core/processManager.test.ts`:
  - Spawn builds correct args from settings (verify, refactor, dryRun, aiParse)
  - Spawn rejects when lock file exists (double-spawn prevention)
  - Stop sends SIGINT, escalates to SIGKILL after 5s timeout
  - Deactivate sends SIGINT, escalates to SIGKILL after 3s timeout (distinct from stop)
  - Reset spawns with `--reset` flag
  - Platform-aware signal selection (SIGINT on Unix, SIGTERM on Windows)
  - Stdio config: `["ignore", "ignore", "pipe"]` — stdout ignored (live.log is the source), stderr piped
- `src/test/unit/core/installer.test.ts`:
  - Generates correct install command for macOS/Linux
  - `isSupported()` returns false for unsupported platforms
  - Triggers re-detection after terminal closes

**Implementation**:
- `src/core/processManager.ts` — `IProcessManager`. Spawn with settings-derived args, platform-aware stop (SIGINT → SIGKILL after 5s), deactivate (SIGINT → SIGKILL after 3s), reset with `--reset`. Stdio: `["ignore", "ignore", "pipe"]`.
- `src/core/installer.ts` — `IInstaller`. Creates VS Code terminal with curl install.sh. Re-detects after terminal closes. WSL check on Windows.
- Register commands in `package.json` with when-clauses:
  - `oxveil.start`: `oxveil.detected && !oxveil.processRunning`
  - `oxveil.stop`: `oxveil.processRunning`
  - `oxveil.reset`: `oxveil.detected && !oxveil.processRunning`
  - `oxveil.forceUnlock`: `oxveil.detected`
  - `oxveil.install`: `!oxveil.detected`
- `forceUnlock` deletes `.claudeloop/lock`, triggers session state update
- Update `oxveil.processRunning` context key dynamically
- Wire `deactivate()` to process manager cleanup

**Visual verification**: Open command palette, type "> Oxveil". Verify when-clause gating: not-found → only Install; detected idle → Start/Reset/ForceUnlock; running → Stop/ForceUnlock. Use fake CLI from visual-verification-recipes for safe Start/Stop demo. Verify "installing" status bar state during Install command. Compare against `docs/mockups/v01-command-palette.png`.

**Files**: `src/core/processManager.ts`, `src/core/installer.ts`, `src/test/unit/core/processManager.test.ts`, `src/test/unit/core/installer.test.ts`, modified `package.json`, `src/extension.ts`

---

## Phase 5: Notifications + Elapsed Timer + Feature Flag + Integration Tests

**Goal**: Notification toasts, elapsed timer, feature flag gate, integration tests. Final v0.1 polish.

**TDD targets**:
- `src/test/unit/views/notifications.test.ts`:
  - Phase complete triggers info notification with correct message
  - Phase failed triggers error notification with "Show Output" action
  - Not-found triggers warning notification with "Install" / "Set Path" actions
  - Double-spawn triggers error notification
  - Version-incompatible triggers warning with update guidance
- `src/test/unit/views/statusBar.test.ts` (additions):
  - Elapsed timer formats correctly (0m, 1m, 12m, etc.)
  - Timer starts on running state, stops on done/failed/idle
  - Timer resets on state transition away from running
- `src/test/unit/core/featureFlag.test.ts`:
  - When `oxveil.experimental` is false, `shouldActivate()` returns false
  - When `oxveil.experimental` is true, `shouldActivate()` returns true
- `src/test/integration/extension.test.ts` (via @vscode/test-electron):
  - Extension activates successfully
  - Status bar item created
  - All 5 commands registered
  - Tree view registered
  - Detection runs on activation
  - Feature flag disables all UI when false

**Implementation**:
- `src/views/notifications.ts` — notification manager. Subscribes to session state events. Compares old vs new ProgressState for phase transition detection.
- Elapsed timer in `statusBar.ts`: `setInterval` every 10s while running. Shows "Xm" format. Clears interval on state change.
- Feature flag check at top of `activate()`. When `oxveil.experimental` is false, register only the setting contribution — skip all UI, commands, watchers.
- Integration test setup with `@vscode/test-electron`

**Visual verification**: Full end-to-end verification against ALL v0.1 mockups:
1. Not-found notification toast with "Install" / "Set Path" actions → `docs/mockups/v01-notifications.png`
2. Phase complete info notification → `docs/mockups/v01-notifications.png`
3. Phase failed error notification with "Show Output" → `docs/mockups/v01-notifications.png`
4. Elapsed timer incrementing in status bar → `docs/mockups/v01-status-bar.png`
5. "Installing" status bar state during install → `docs/mockups/v01-status-bar.png`
6. Feature flag off: no Oxveil UI. Feature flag on: full UI.
7. All status bar states, all tree view states, output channel, command palette gating.

**Files**: `src/views/notifications.ts`, `src/test/unit/views/notifications.test.ts`, `src/test/unit/core/featureFlag.test.ts`, `src/test/integration/extension.test.ts`, modified `src/extension.ts`, `src/views/statusBar.ts`

---

## Phase Dependency Graph

```
Phase 1 (scaffold, detection, status bar)
  └→ Phase 2 (parser, tree view)
      └→ Phase 3 (session state, watchers, output channel)
          └→ Phase 4 (commands, process manager, installer)
              └→ Phase 5 (notifications, timer, feature flag, integration tests)
```

## Verification

After all phases complete:
1. `npm test` — all unit tests pass (Vitest)
2. Integration tests pass (extension activates, commands registered, views registered)
3. Full visual verification loop against all v0.1 mockups
4. Manual test with real claudeloop: start → monitor phases → stop
5. Feature flag toggle: `oxveil.experimental: false` hides all UI

## Key Design Decisions

- **Dependency injection** for all core modules — enables pure Vitest unit tests without VS Code mocking
- **Plain PID lock file** — verified from claudeloop source (`echo $$ > lock`). ARCHITECTURE.md must be corrected before Phase 1.
- **4 statuses only** — `pending`, `completed`, `failed`, `in_progress`. No "skipped". Verified from `progress.sh` lines 46-52.
- **Settings defaults match claudeloop** — `verify`, `refactor`, `aiParse` all default to `true` (not `false` as in current ARCHITECTURE.md)
- **Emoji-aware PROGRESS.md parser** — handles `✅🔄❌⏳` prefixed headers. Extracts all per-phase fields including per-attempt details.
- **Attempt count from PROGRESS.md** — `Attempts: N` field parsed and shown in status bar running state
- **Feature flag at activate() level** — single gate for entire v0.1 UI surface
- **Fake CLI for visual verification** — uses scenarios from visual-verification-recipes for safe dynamic testing in phases 3-5
- **Notifications in separate module** (not in tree view) — cleaner separation of concerns, easier to test
- **Deactivate timeout (3s) distinct from stop timeout (5s)** — per architecture spec
- **Reset requires `!oxveil.processRunning`** — prevents reset while running, safer than architecture's permissive `oxveil.detected` only
- **claudeloop signal behavior** — on SIGINT/SIGTERM: kills child pipeline (SIGTERM to process group), marks in_progress→pending, saves progress, removes lock, exits 130. Oxveil's Stop sends SIGINT (matching Ctrl+C behavior), not SIGTERM.

## Known Limitations (deferred)

- Multi-window monitoring: both windows can observe but only one can spawn. Covered by lock check.
- FileSystemWatcher polling fallback: add only if users report missed events.
- IPC version field in `.claudeloop/`: future cross-repo compatibility mechanism, not needed for v0.1.
