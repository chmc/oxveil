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

Watch `.claudeloop/` files for state changes. Render in tree views, status bar, and output channel.

## IPC Contract

The `.claudeloop/` directory is the contract between Oxveil and claudeloop.

**Oxveil reads:**
- `live.log` — append-only process output
- `PROGRESS.md` — phase status and structure
- `lock` — plain text file containing the PID of the running process

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
│   Tree Views  │  Output Ch.    │  Status Bar             │
│   - Phases    │  - live.log    │  - Phase X/Y            │
│               │                │  - Elapsed time         │
├───────────────┴────────────────┴─────────────────────────┤
│                     Parsers                               │
│   - progress.ts (PROGRESS.md → ProgressState)            │
├──────────────────────────────────────────────────────────┤
│                     Core                                  │
│   - SessionState (state machine + EventEmitter)          │
│   - Process Manager (spawn/stop/reset)                   │
│   - Lock Manager (read-only lock observation)            │
│   - Watcher (single FileSystemWatcher + debounce)        │
├──────────────────────────────────────────────────────────┤
│               claudeloop CLI (engine)                     │
│   .claudeloop/ directory = IPC contract                   │
└──────────────────────────────────────────────────────────┘
```

Data flows upward: watcher detects file changes → parsers transform raw content into typed state → SessionState holds and broadcasts → views subscribe and render.

## File Structure

```
src/
├── extension.ts              # Activation, command registration, wiring
├── core/
│   ├── detection.ts          # claudeloop detection and version check
│   ├── installer.ts          # Platform-aware claudeloop installation
│   ├── sessionState.ts       # State machine + EventEmitter
│   ├── processManager.ts     # Spawn/stop/reset claudeloop
│   ├── lock.ts               # Read-only lock file observation
│   └── watchers.ts           # Single FileSystemWatcher + debounce
├── parsers/
│   └── progress.ts           # PROGRESS.md → ProgressState
├── views/
│   ├── phaseTree.ts          # Sidebar tree view provider
│   ├── statusBar.ts          # Status bar item
│   └── outputChannel.ts      # Output channel wrapper
└── test/
    ├── unit/
    │   ├── parsers/
    │   │   └── progress.test.ts
    │   └── core/
    │       ├── detection.test.ts
    │       ├── sessionState.test.ts
    │       └── lock.test.ts
    └── integration/
        └── extension.test.ts
```

Future parsers (plan, config) and webview providers are added when their milestones begin — not stubbed in advance.

## User-Facing Surface

### Commands

| ID | Title | When |
|----|-------|------|
| `oxveil.start` | Oxveil: Start | claudeloop detected, no process running |
| `oxveil.stop` | Oxveil: Stop | Process running |
| `oxveil.reset` | Oxveil: Reset | claudeloop detected |
| `oxveil.forceUnlock` | Oxveil: Force Unlock | claudeloop detected |
| `oxveil.install` | Oxveil: Install claudeloop | claudeloop not detected |

### Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `oxveil.claudeloopPath` | string | `"claudeloop"` | Path to claudeloop executable |
| `oxveil.watchDebounceMs` | number | `100` | Debounce interval for file watcher events |
| `oxveil.experimental` | boolean | `false` | Enable experimental features |
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

**Double-spawn prevention:** Read the lock file before spawning. If a process is already running, show an error notification.

**Deactivate:** `deactivate()` sends SIGINT/SIGTERM immediately, SIGKILL after 3 seconds.

### Lock Manager

Read-only observation of the lock file. claudeloop owns its lock lifecycle — creates on start, removes on exit, cleans stale locks on next start.

**On activation:** Read lock → if present, treat as running process → update SessionState.

**Escape hatch:** `oxveil.forceUnlock` command deletes the lock file for cases where claudeloop crashed without cleanup and won't be restarted. This is the only write Oxveil performs to `.claudeloop/`.

### Watcher

Single `FileSystemWatcher` on `**/.claudeloop/**` with event filtering by filename.

**Debouncing:** Per-file `setTimeout`/`clearTimeout` at configurable interval (`oxveil.watchDebounceMs`).

**File reads:** `fs.promises.readFile` for all reads. Async, non-blocking.

**Capped incremental reads:** For live.log, read at most 64KB per callback. Schedule follow-up via `setImmediate` if more data is available.

**Initial state:** `checkInitialState()` on activation reads existing lock, PROGRESS.md, and live.log. Handles the case where claudeloop was already running before the extension activated.

### Progress Parser

Pure function, no VS Code dependency.

**Input:** Raw PROGRESS.md content string.
**Output:** `ProgressState { phases: PhaseState[], currentPhaseIndex?: number, totalPhases: number }`

**Strict parsing:** Reject unknown status values with a parse error rather than normalizing synonyms. We own both repos — if the format changes, update both sides. Strict parsing catches contract drift early.

**Crash-proof:** Tolerates truncated input (half-written files from mid-write watcher events). Wraps in try-catch — never throws to callers. Returns a "no data" state on unparseable input so the tree view can show "Unable to parse progress" instead of appearing empty.

**Monotonicity validation:** Phase count should not decrease during a run. If it does, treat as partial read and retry after a short delay.

### Phase Tree View

`TreeDataProvider<PhaseTreeItem>`. Flat list of phases.

**Icons:** ThemeIcon per status with ThemeColor for accessibility:
- complete: `check` (green), running: `sync~spin` (blue), failed: `error` (red), pending: `circle-outline`

**Notifications:** Compares old vs new ProgressState on each update. Info notification on phase completion, error notification on failure.

**Welcome state:** When claudeloop is detected but no session exists, shows a welcome message: "Run 'Oxveil: Start' to begin."

**Not-found state:** When claudeloop is not detected, shows: "claudeloop not found. Run 'Oxveil: Install claudeloop'."

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

**Click action:** Focuses the phase tree view.

### Output Channel

Thin wrapper around `vscode.window.createOutputChannel("Oxveil")`. Streams `live.log` content. Prefixes stderr lines with `[stderr]`.

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
| claudeloop not installed | Detection on activation. Persistent notification with "Install" and "Set Path" actions. Run commands disabled. Status bar: warning. Tree view: install guidance. |
| claudeloop version incompatible | Notification with version mismatch and "Update" action. Same degraded mode as not-found. |
| No `.claudeloop/` directory | Ready/idle state. Watcher detects creation when claudeloop first runs |
| claudeloop started from terminal | Lock file watcher detects it. Status bar shows running state |
| Stale lock after crash | claudeloop cleans on next start. User can run Force Unlock if needed |
| Multiple VS Code windows | Lock check prevents double-spawn. Both windows can monitor independently |
| Windows without WSL | Installation blocked. Notification guides user to install WSL. |
| Windows platform | claudeloop runs via WSL. SIGTERM for graceful stop. |
| FileSystemWatcher misses event | Known VS Code issue on some platforms. Add polling fallback if users report it |

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
| FileSystemWatcher misses events | Medium | Add polling fallback if users report issues — not pre-built |
| Half-written PROGRESS.md parsed mid-write | Medium | Debounce + crash-proof parser + monotonicity validation |
| Unbounded live.log growth | Medium | 64KB cap per read, setImmediate for remainder |

## Release Strategy

- **Trunk-based development** on `main` — see `.claude/skills/trunk-based-dev.md`
- **Feature flags** with tiered approach — see `.claude/skills/feature-flags.md`
- **Pre-release channel** via `vsce publish --pre-release`
- **Publish targets:** VS Code Marketplace + Open VSX

## Roadmap

See [chmc/oxveil#1](https://github.com/chmc/oxveil/issues/1) for full milestone details.

- **v0.1 — Entry Point, Run & Monitor:** claudeloop detection + installation, basic config via VS Code settings, status bar, commands (start/stop/reset/install), output channel, phase tree view, notifications
- **v0.2 — Rich Monitoring:** Dependency graph webview, archive browser, click-to-open logs, phase git diffs
- **v0.3 — Config & Plan Editing:** Config wizard webview, plan file language support, CodeLens, replay viewer
- **v0.4 — Deep Integration:** Retry strategies, phase timeline, multi-root workspace, welcome walkthrough

Each milestone adds its own parsers, views, and infrastructure when work begins — not before.
