# Oxveil v0.3 — Config & Plan Editing

## Context

v0.1 (entry point, run & monitor) and v0.2 (rich monitoring with dependency graph, archive browser, smart notifications, phase diffs) are complete. v0.3 replaces CLI prompts with native VS Code UI for configuration and plan editing — the planned A-to-B progression from the issue.

All required claudeloop CLI flags already exist: `--phase N`, `--mark-complete N`, `--continue`, `--ai-parse`, `--granularity <level>`. No cross-repo changes needed. Oxveil is not yet published — no feature flags needed.

## Architectural Decisions

### Config file ownership (ADR 0003)
Extension writes to `.claudeloop/.claudeloop.conf` — bidirectional file ownership. Acceptable because: (a) claudeloop documents it as "edit or delete freely", (b) only read at startup, (c) round-trip editor preserving unknown keys and comments. VS Code settings control CLI flags at spawn; `.claudeloop.conf` controls claudeloop internals. No overlap.

### Plan language support (ADR 0004)
Dedicated language ID `claudeloop-plan` for `PLAN.md` files — not injection into all markdown. Scopes highlighting and CodeLens to plan files only.

### Replay viewer CSP
Nonce injection via regex on the single `<script>` and `<style>` tags in claudeloop's replay.html before loading into webview. Follows `dependencyGraph.ts` CSP pattern.

### Feature flag removal
Not published yet — remove entire `oxveil.experimental` system. Ship all features directly.

---

## Implementation Tasks

**MANDATORY RULE:** Every implementation task MUST be followed by a visual verification gate task. Run `/visual-verification` at each gate. No exceptions. Each task produces a visible increment; the gate confirms it.

### Task 1: Remove feature flag system
**Visual increment:** Extension activates unconditionally. Archive view and Dependency Graph always available.

**Delete:**
- `src/core/featureFlag.ts`
- `src/test/unit/core/featureFlag.test.ts`

**Modify:**
- `src/extension.ts`:
  - Remove `import { shouldActivate } from "./core/featureFlag"` (line 17)
  - Remove the `if (!shouldActivate(...)) { return; }` guard block (lines 38-41)
- `package.json`:
  - Remove `oxveil.experimental` from `contributes.configuration.properties`
  - Remove `"when": "config.oxveil.experimental"` from archive view (line 42)
  - Remove `"when": "config.oxveil.experimental"` from dependency graph command palette entry (line 148)
- `src/test/integration/` — Remove any tests that reference `shouldActivate` or set `oxveil.experimental`
- `.claude/skills/feature-flags.md` — Update: no flags until marketplace publication

**Gate:** `npm run test && npm run lint && npm run build`

### Task 2: GATE — Visual verification of flag removal
**Compare against:** existing v0.2 behavior — everything works unconditionally
**Checklist:**
- Launch Extension Development Host (EDH) via `npm run build` then F5
- Confirm extension activates and shows status bar on startup (no settings needed)
- Open sidebar: Archive view ("Past Runs") visible unconditionally
- Open command palette (Cmd+Shift+P): "Oxveil: Show Dependency Graph" available
- Open VS Code Settings (Cmd+,), search "oxveil": `experimental` setting no longer appears
- Confirm all existing v0.1/v0.2 features still work (start, stop, phase tree, output channel)

**Action:** `/visual-verification`

### Task 3: Config parser + types
**Visual increment:** Tests pass for config parser. No UI yet — this is a pure-function foundation.

**Create:**
- `src/parsers/config.ts` — Pure function parser/serializer following `src/parsers/progress.ts` pattern:
  - `parseConfig(content: string): ParsedConfig` — Round-trip safe. Skips `#` comments (preserves them), trims whitespace, maps 18 known keys to typed fields. Unknown keys preserved as raw pairs.
  - `serializeConfig(parsed: ParsedConfig): string` — Writes back key=value format with comment header, preserving unknown keys and original comments.
  - 18 known keys matching `load_config()` in claudeloop `lib/config.sh`: PLAN_FILE, PROGRESS_FILE, MAX_RETRIES, SIMPLE_MODE, PHASE_PROMPT_FILE, BASE_DELAY, QUOTA_RETRY_INTERVAL, SKIP_PERMISSIONS, STREAM_TRUNCATE_LEN, HOOKS_ENABLED, MAX_PHASE_TIME, IDLE_TIMEOUT, VERIFY_TIMEOUT, AI_PARSE, GRANULARITY, VERIFY_PHASES, REFACTOR_PHASES, REFACTOR_MAX_RETRIES
- `src/types.ts` — Add:
  - `ConfigState` interface with 18 typed fields (strings, numbers, booleans, `"phases" | "tasks" | "steps"` union for GRANULARITY)
  - `ParsedConfig { config: ConfigState; unknownKeys: Array<{key: string, value: string}>; comments: string[] }`
- `src/test/unit/parsers/config.test.ts` — Tests: round-trip preservation, comment handling, unknown keys passthrough, missing keys default, boolean string parsing ("true"/"false"), empty file, malformed lines

**Gate:** `npm run test && npm run lint && npm run build`

### Task 4: GATE — Visual verification of config parser
**Checklist:**
- Run `npm run test` — all config parser tests pass
- Run `npm run lint` — no type errors in new files
- Confirm `src/parsers/config.ts` exports `parseConfig` and `serializeConfig`
- Confirm `src/types.ts` has `ConfigState` and `ParsedConfig` interfaces
- Confirm round-trip test: parse then serialize produces equivalent output

**Action:** `/visual-verification`

### Task 5: Config wizard webview
**Visual increment:** "Oxveil: Edit Config" opens a two-column form webview matching the mockup.
**Mockup reference:** `docs/mockups/v03-config-wizard-webview.png`, `docs/mockups/v03-config-plan-editing.html`

**Create:**
- `src/views/configWizard.ts` — `ConfigWizardPanel` with `ConfigWizardDeps` interface (follows `src/views/dependencyGraph.ts` pattern):
  - Constructor takes: `{ createWebviewPanel, readFile, writeFile, sessionStatus }` deps
  - `reveal(configPath: string)` — Reads file, parses with `parseConfig`, renders HTML form
  - Message passing: webview sends `{ type: "save", config }` or `{ type: "reload" }`, extension writes via `writeFile`
  - **Two-column layout** (per mockup): form on left, live config preview on right
  - **Header bar:** "claudeloop Configuration" with gear icon (per mockup)
  - Form sections (per mockup layout with all 18 claudeloop config keys):
    - **EXECUTION:** MAX_RETRIES (number 0-10), BASE_DELAY (number), QUOTA_RETRY_INTERVAL (number), MAX_PHASE_TIME (number), IDLE_TIMEOUT (number), VERIFY_TIMEOUT (number)
    - **BEHAVIOR:** VERIFY_PHASES (toggle), REFACTOR_PHASES (toggle), REFACTOR_MAX_RETRIES (number), AI_PARSE (toggle), GRANULARITY (dropdown phases/tasks/steps, visible when AI_PARSE=true), SIMPLE_MODE (toggle), SKIP_PERMISSIONS (toggle + warning), HOOKS_ENABLED (toggle)
    - **PATHS:** PLAN_FILE (text), PROGRESS_FILE (text), PHASE_PROMPT_FILE (text)
    - **ADVANCED:** STREAM_TRUNCATE_LEN (number)
  - **Note:** Mockup shows a simplified subset (AI Provider, Model, Dry run, Working Directory) that don't map to claudeloop config keys. Implementation covers all 18 actual `.claudeloop.conf` keys instead. The mockup layout (two-column, toggles, header, preview) is followed but form fields reflect the real config format.
  - **Live config preview panel** on right: "GENERATED CONFIG PREVIEW" label, shows `.claudeloop.conf` with syntax coloring (keys: `#9cdcfe`, string values: `#ce9178`, numbers: `#b5cea8`, booleans: `#569cd6`, comments: `#6a9955`)
  - Footer: "Reset to Defaults" (secondary) and "Save Configuration" (primary blue) buttons
  - CSP with crypto nonce (same as `dependencyGraph.ts` line 72)
  - VS Code theme CSS variables, toggle on-state `#007acc`
  - `getState`/`setState` webview API for form persistence across tab switches
  - Warning banner when `sessionStatus()` returns `"running"`
  - Missing `.claudeloop/` directory: show "Run claudeloop first" message
  - `onDidDispose` cleanup
- `src/test/unit/views/configWizard.test.ts` — Message handler tests, form state, preview generation

**Gate:** `npm run test && npm run lint && npm run build`

### Task 6: Config wizard wiring + command
**Visual increment:** "Oxveil: Edit Config" command works end-to-end in EDH.

**Modify:**
- `package.json` — Add to `contributes.commands`: `{ "command": "oxveil.openConfigWizard", "title": "Oxveil: Edit Config" }`. Add to `commandPalette` menus: `{ "command": "oxveil.openConfigWizard", "when": "oxveil.detected" }`
- `src/commands.ts` — Add `configWizard?: ConfigWizardPanel` to `CommandDeps`. Register `oxveil.openConfigWizard` handler that calls `configWizard.reveal(configPath)` where `configPath = path.join(workspaceRoot, ".claudeloop", ".claudeloop.conf")`.
- `src/extension.ts` — Instantiate `ConfigWizardPanel` with deps, push to disposables, pass to `registerCommands`.

**Gate:** `npm run test && npm run lint && npm run build`

### Task 7: GATE — Visual verification of config wizard
**Compare against:** `docs/mockups/v03-config-wizard-webview.png`, `docs/mockups/v03-config-plan-editing.html`
**Checklist:**
- Launch EDH, run "Oxveil: Edit Config" from command palette
- Webview opens with two-column layout: form left, preview right
- Header shows "claudeloop Configuration" with gear icon
- Three form sections: EXECUTION (dropdown, text, numbers), BEHAVIOR (toggles), PATHS (text inputs)
- Live preview panel updates as form values change with syntax-colored key=value output
- Toggles render with blue (#007acc) active state
- Footer shows "Reset to Defaults" and "Save Configuration" buttons
- Save button writes to `.claudeloop/.claudeloop.conf`
- Reload reflects saved values

**Action:** `/visual-verification`

### Task 8: Plan language support — grammar + snippets
**Visual increment:** Opening PLAN.md shows syntax highlighting with phase headers in blue, status markers in yellow.
**Mockup reference:** `docs/mockups/v03-plan-editor-with-codelens.png`, `docs/mockups/v03-config-plan-editing.html`

**Create:**
- `syntaxes/plan.tmLanguage.json` — Standalone grammar:
  - Scope: `text.md.plan.oxveil`
  - Extends markdown base patterns
  - Custom patterns (per mockup):
    - Phase headers `## Phase N[.N]: Title` → `entity.name.section.phase` (blue `#569cd6`)
    - Phase numbers → `constant.numeric.phase-number`
    - Top-level heading `# Title` → `markup.heading.1` (bold blue)
    - Status markers `[status: ...]` → `entity.name.tag.status` (yellow `#dcdcaa`)
    - `**Depends on:**` → `keyword.other.depends-on`
    - Phase references `Phase N` in dependency lines → `entity.name.tag.phase-reference`
- `snippets/plan.json` — Snippets: `phase` (new phase header) and `phase-deps` (phase with dependencies), scoped to `claudeloop-plan`
- `language-configuration.json` — Bracket pairs, auto-closing, comment rules (markdown defaults)

**Modify:**
- `package.json`:
  - Add `contributes.languages`: `[{ "id": "claudeloop-plan", "aliases": ["Claudeloop Plan"], "filenames": ["PLAN.md"], "configuration": "./language-configuration.json" }]`
  - Add `contributes.grammars`: `[{ "language": "claudeloop-plan", "scopeName": "text.md.plan.oxveil", "path": "./syntaxes/plan.tmLanguage.json" }]`
  - Add `contributes.snippets`: `[{ "language": "claudeloop-plan", "path": "./snippets/plan.json" }]`

**Gate:** `npm run build` (no TS to lint, grammar is JSON)

### Task 9: GATE — Visual verification of plan language support
**Compare against:** `docs/mockups/v03-plan-editor-with-codelens.png`, `docs/mockups/v03-config-plan-editing.html`
**Checklist:**
- Launch EDH, open or create a `PLAN.md` file
- Confirm language mode shows "Claudeloop Plan" in status bar (not "Markdown")
- Phase headers (`## Phase 1: Title`) highlighted in blue
- Status markers (`[status: complete]`) highlighted in yellow
- Bullet list items in standard text color
- Bold text (file paths) renders correctly
- Type `phase` → snippet completion triggers, inserts phase template

**Action:** `/visual-verification`

### Task 10: Plan parser
**Visual increment:** Tests pass for plan parser. Foundation for CodeLens.

**Create:**
- `src/parsers/plan.ts` — Pure function following `src/parsers/progress.ts` pattern:
  - `parsePlan(content: string): PlanState` — Extracts phase headers (`##`/`###` + `Phase N[.N]: Title`), status markers `[status: ...]`, dependency lines `**Depends on:**`, body ranges (0-indexed line numbers for CodeLens placement)
  - Canonical format only. Empty content → `{ phases: [] }`. Decimal phase numbers supported.
- `src/types.ts` — Add:
  - `PlanPhase { number: number | string; title: string; headerLine: number; status?: string; dependencies?: string[]; bodyEndLine: number }`
  - `PlanState { phases: PlanPhase[] }`
- `src/test/unit/parsers/plan.test.ts` — Tests: decimal phases, mixed `##`/`###`, dependencies, status markers, empty plan, no headers, malformed headers

**Gate:** `npm run test && npm run lint && npm run build`

### Task 11: GATE — Visual verification of plan parser
**Checklist:**
- Run `npm run test` — all plan parser tests pass
- Run `npm run lint` — no type errors
- Confirm `src/parsers/plan.ts` exports `parsePlan`
- Confirm `src/types.ts` has `PlanPhase` and `PlanState` interfaces
- Confirm parser handles: empty input, single phase, multiple phases with deps, decimal numbers

**Action:** `/visual-verification`

### Task 12: CodeLens on phase headings
**Visual increment:** PLAN.md shows inline actions above each phase header: "Run from here | Mark complete | View log".
**Mockup reference:** `docs/mockups/v03-plan-editor-with-codelens.png`, `docs/mockups/v03-config-plan-editing.html`

**Create:**
- `src/views/planCodeLens.ts`:
  - Pure function `computePlanLenses(content: string): Array<{ line: number; phaseNumber: number | string; title: string }>` — Testable without VS Code. Reuses regex from `src/parsers/plan.ts`.
  - `PlanCodeLensProvider` implementing `vscode.CodeLensProvider` — Thin adapter. 3 actions per phase (per mockup):
    - "Run from here" → `oxveil.runFromPhase`
    - "Mark complete" → `oxveil.markPhaseComplete`
    - "View log" → existing `oxveil.viewLog` with `{ phaseNumber: N }`
  - Pending phase actions: "Mark complete" and "View log" are dimmed (disabled command) per mockup
- `src/test/unit/views/planCodeLens.test.ts` — Tests for `computePlanLenses`

**Modify:**
- `src/core/processManager.ts` — Add methods (all through existing `_spawnChild(args)` pattern):
  - `spawnFromPhase(phase: number | string)` — `["--phase", String(phase), "--continue", ...settingsArgs]`. Lock check first.
  - `markComplete(phase: number | string)` — `["--mark-complete", String(phase)]`. Short-lived, waits for exit.
- `src/core/interfaces.ts` — Add `spawnFromPhase` and `markComplete` to `IProcessManager`
- `package.json`:
  - Add commands: `oxveil.runFromPhase` ("Oxveil: Run from Phase"), `oxveil.markPhaseComplete` ("Oxveil: Mark Phase Complete")
  - Add to `commandPalette`: both gated with `"when": "oxveil.detected"`
- `src/commands.ts` — Register both commands. `runFromPhase` shows confirmation dialog ("This will mark all phases before N as complete. Continue?") and checks `processManager.isRunning`.
- `src/extension.ts`:
  - Register `CodeLensProvider` with `{ language: "claudeloop-plan" }` selector
  - Push disposable to `disposables[]`

**Gate:** `npm run test && npm run lint && npm run build`

### Task 13: GATE — Visual verification of CodeLens
**Compare against:** `docs/mockups/v03-plan-editor-with-codelens.png`, `docs/mockups/v03-config-plan-editing.html`
**Checklist:**
- Launch EDH, open PLAN.md
- CodeLens appears above each `## Phase N:` header
- Three actions per phase: "Run from here", "Mark complete", "View log"
- For pending phases: "Mark complete" and "View log" appear grayed out
- Click "Run from here" → confirmation dialog appears
- Click "View log" on a completed phase → opens log file

**Action:** `/visual-verification`

### Task 14: Inline replay viewer
**Visual increment:** "Oxveil: Open Replay" opens replay.html in a VS Code webview tab.
**Mockup reference:** `docs/mockups/v03-replay-viewer.png`, `docs/mockups/v03-config-plan-editing.html`

**Create:**
- `src/views/replayViewer.ts` — `ReplayViewerPanel` with `ReplayViewerDeps` interface (follows `dependencyGraph.ts` pattern):
  - `reveal(replayPath: string)` — Reads replay.html from disk, injects nonces into `<script>` and `<style>` tags via regex, sets CSP meta tag, sets as `webview.html`
  - `localResourceRoots` set to `.claudeloop/` directory
  - Missing file → info message "No replay available"
  - `onDidDispose` cleanup
- `src/test/unit/views/replayViewer.test.ts` — Nonce injection, missing file, panel lifecycle

**Note:** claudeloop's existing replay.html already contains its own timeline, playback controls, and styled content (matching the mockup's visual). The viewer embeds this HTML — it does not rebuild the UI from scratch. The mockup represents the rendered result.

**Modify:**
- `package.json` — Add command `oxveil.openReplayViewer` ("Oxveil: Open Replay"), `when: "oxveil.detected"`
- `src/commands.ts`:
  - Register `oxveil.openReplayViewer` — Opens current session `.claudeloop/replay.html`
  - Modify existing `oxveil.archiveReplay` — Open in webview instead of `openExternal`
  - Add `replayViewer?: ReplayViewerPanel` to `CommandDeps`
- `src/extension.ts` — Instantiate `ReplayViewerPanel`, push to disposables, pass to `registerCommands`

**Gate:** `npm run test && npm run lint && npm run build`

### Task 15: GATE — Visual verification of replay viewer
**Compare against:** `docs/mockups/v03-replay-viewer.png`, `docs/mockups/v03-config-plan-editing.html`
**Checklist:**
- Launch EDH, run "Oxveil: Open Replay" from command palette
- Replay.html renders in a webview tab (not external browser)
- Header shows replay title and playback controls
- Timeline scrubber with progress bar visible
- Monospace content area shows phase execution steps
- Respects dark/light theme (replay.html has `prefers-color-scheme`)
- Right-click archived run in Past Runs → "Replay" opens in webview (not browser)
- Open Developer Tools (Help → Toggle Developer Tools): no CSP errors in console

**Action:** `/visual-verification`

### Task 16: AI parse command
**Visual increment:** "Oxveil: AI Parse Plan" shows a quick-pick with 4 granularity options.
**Mockup reference:** `docs/mockups/v03-ai-parse-granularity-picker.png`, `docs/mockups/v03-config-plan-editing.html`

**Modify:**
- `package.json` — Add command `oxveil.aiParsePlan` ("Oxveil: AI Parse Plan"), `when: "oxveil.detected && !oxveil.processRunning"`
- `src/core/processManager.ts` — Add `aiParse(granularity: string): Promise<void>` — `["--ai-parse", "--granularity", granularity]` through `_spawnChild`. Lock check first.
- `src/core/interfaces.ts` — Add `aiParse` to `IProcessManager`
- `src/commands.ts` — Register `oxveil.aiParsePlan`:
  1. Check PLAN.md exists in workspace → if not, error "No plan file found. Create a PLAN.md first."
  2. `showQuickPick` with 4 items (per mockup):
     - `{ label: "Coarse — 3-5 phases", description: "High-level phases. Good for small tasks or quick iterations.", value: "coarse" }`
     - `{ label: "Medium — 5-10 phases (default)", description: "Balanced breakdown. Each phase is a meaningful unit of work.", value: "medium" }`
     - `{ label: "Fine — 10-20 phases", description: "Granular phases. Best for complex tasks requiring careful monitoring.", value: "fine" }`
     - `{ label: "Custom...", description: "Enter a custom prompt to guide phase generation.", value: "custom" }`
  3. If "Custom..." selected → `showInputBox({ prompt: "Enter custom granularity prompt" })`. On cancel → return.
  4. `withProgress({ location: ProgressLocation.Notification, title: "Parsing plan..." })` during execution
  5. Success: open parsed plan in editor
  6. Failure: error notification with "View Output" action

**Gate:** `npm run test && npm run lint && npm run build`

### Task 17: GATE — Visual verification of AI parse command
**Compare against:** `docs/mockups/v03-ai-parse-granularity-picker.png`, `docs/mockups/v03-config-plan-editing.html`
**Checklist:**
- Launch EDH, run "Oxveil: AI Parse Plan" from command palette
- Quick-pick shows 4 options: Coarse, Medium (default), Fine, Custom
- Each option has title and description matching mockup
- Select "Custom..." → input box appears for custom prompt
- Cancel input box → command cancels gracefully
- Progress notification appears during execution (if claudeloop available)
- Error message appears when no PLAN.md exists

**Action:** `/visual-verification`

### Task 18: Documentation + ADRs
**Visual increment:** Updated docs reflecting v0.3 features and architectural decisions.

**Create:**
- `docs/adr/0003-config-wizard-webview.md` — Webview form for `.claudeloop.conf`. Bidirectional file ownership model. Using ADR template from `docs/adr/TEMPLATE.md`.
- `docs/adr/0004-plan-language-support.md` — Dedicated language ID + TextMate grammar (not injection, not semantic tokens).
- `docs/adr/0005-feature-flag-removal.md` — Removal of feature flag system before marketplace publication.

**Modify:**
- `docs/adr/README.md` — Add entries for ADRs 0003-0005
- `ARCHITECTURE.md` — Add v0.3 components (config parser, plan parser, config wizard webview, plan language, CodeLens provider, replay viewer), update file structure listing, mark v0.3 in roadmap
- `README.md` — Add v0.3 features section describing all 5 features

**Gate:** `npm run build`

### Task 19: GATE — Visual verification of documentation
**Compare against:** `docs/adr/TEMPLATE.md` for format, existing ADRs 0001-0002 for style
**Checklist:**
- ADRs 0003-0005 exist in `docs/adr/` with correct template format, titles, status "Accepted"
- `docs/adr/README.md` lists all 5 ADRs (0001-0005) with titles
- `ARCHITECTURE.md` includes v0.3 components and updated file structure
- `README.md` v0.3 section describes config wizard, plan language, CodeLens, replay viewer, AI parse
- All docs render correctly in markdown preview

**Action:** `/visual-verification`

---

## Build Order

```
Task 1 (flag removal) → Task 2 (verify)
    |
    +→ Task 3 (config parser) → Task 4 (verify)
    |       |
    |       +→ Task 5 (config webview) → Task 6 (wiring) → Task 7 (verify)
    |
    +→ Task 8 (plan grammar) → Task 9 (verify)
    |       |
    |       +→ Task 10 (plan parser) → Task 11 (verify)
    |               |
    |               +→ Task 12 (CodeLens) → Task 13 (verify)
    |
    +→ Task 14 (replay) → Task 15 (verify)
    |
    +→ Task 16 (AI parse) → Task 17 (verify)
                                    |
                            Task 18 (docs) → Task 19 (verify)
```

Sequential execution order for claudeloop:
1→2→3→4→5→6→7→8→9→10→11→12→13→14→15→16→17→18→19

## Critical Files

| File | Role |
|------|------|
| `src/core/featureFlag.ts` | Delete entirely |
| `src/parsers/progress.ts` | Reference pattern for new parsers |
| `src/views/dependencyGraph.ts` | Reference pattern for webview panels |
| `src/core/processManager.ts` | Add `spawnFromPhase`, `markComplete`, `aiParse` |
| `src/core/interfaces.ts` | Update `IProcessManager` |
| `src/commands.ts` | Register 5 new commands, update `CommandDeps` |
| `src/extension.ts` | Wire new components, remove `shouldActivate`, register disposables |
| `package.json` | Commands, language, grammar, snippets, remove experimental |

## Package.json Changes Summary

- Remove `oxveil.experimental` setting and its 2 `when` clauses
- 5 new commands: `openConfigWizard`, `runFromPhase`, `markPhaseComplete`, `openReplayViewer`, `aiParsePlan`
- 5 new `commandPalette` entries with `when` clauses
- 1 language contribution (`claudeloop-plan` for `PLAN.md`)
- 1 grammar contribution (`syntaxes/plan.tmLanguage.json`)
- 1 snippet contribution (`snippets/plan.json`)

## Deliverable

Create `PLAN.md` in workspace root with the 19 phases in claudeloop format. Each phase is self-contained with full context for a fresh Claude instance.
