# Plan Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native plan creation experience that opens a Claude Code terminal for conversational brainstorming alongside a live plan preview webview with annotations.

**Architecture:** A `PlanChatSession` coordinates a VS Code integrated terminal (running `claude` CLI with a system prompt for plan-format output) and a `PlanPreviewPanel` webview (live-rendering PLAN.md via FileSystemWatcher + plan parser). Annotations in the preview inject text into the terminal via `terminal.sendText()`.

**Tech Stack:** TypeScript, VS Code Terminal API, VS Code Webview API, Vitest

**Spec:** `docs/superpowers/specs/2026-04-06-plan-chat-design.md`

**Incremental delivery:** Each task produces a demoable visual increment with `/visual-verification`.

---

### Visual Mockups

Reference these mockups when implementing the HTML/CSS. Source HTML files are in `docs/superpowers/plans/mockups/`.

**Active state** — Claude terminal on the left with conversation, plan preview on the right with phase cards and annotation input:

![Active state](mockups/plan-chat-active.png)

**Empty state** — fresh session, terminal just opened, preview shows "No plan yet" placeholder:

![Empty state](mockups/plan-chat-empty.png)

**Session ended** — terminal closed, preview shows warning banner with disabled annotations:

![Session ended](mockups/plan-chat-ended.png)

---

### Design Decisions

- **Reuse existing `Detection` class** for Claude CLI detection — same constructor pattern, different binary path and minimum version.
- **New single-file watcher** for PLAN.md — follow `WatcherManager` debounce pattern but don't modify the existing class. A simple `vscode.workspace.createFileSystemWatcher` with debounce is sufficient.
- **Plan parser extension** — `parsePlan()` extracts phases but not descriptions. We extend it to also extract body text (lines between headers). New `validatePlan()` function checks sequentiality and dependency references.
- **System prompt as inline `--append-system-prompt`** — avoid file management by using the CLI flag directly. Verified: `claude --help` shows `--append-system-prompt <prompt>`.
- **Terminal spawned as `shellPath`** — `vscode.window.createTerminal({ shellPath: claudePath, shellArgs: [...] })` gives us full control over the process.

---

### File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/core/claudeDetection.ts` | Detect `claude` CLI binary, reusing `Detection` class |
| Create | `src/test/unit/core/claudeDetection.test.ts` | Unit tests for Claude detection |
| Create | `src/parsers/planValidator.ts` | `validatePlan()`: sequential numbering + dependency reference checks |
| Create | `src/test/unit/parsers/planValidator.test.ts` | Unit tests for plan validation |
| Create | `src/parsers/planDescription.ts` | `parsePlanWithDescriptions()`: extends `parsePlan` to extract body text |
| Create | `src/test/unit/parsers/planDescription.test.ts` | Unit tests for description extraction |
| Create | `src/views/planPreviewHtml.ts` | HTML generation: phase cards, annotations, validation status |
| Create | `src/test/unit/views/planPreviewHtml.test.ts` | Unit tests for HTML rendering |
| Create | `src/views/planPreviewPanel.ts` | Webview panel lifecycle, file watching, annotation bridge |
| Create | `src/test/unit/views/planPreviewPanel.test.ts` | Unit tests for panel behavior |
| Create | `src/core/planChatSession.ts` | Links terminal + preview + watcher, lifecycle management |
| Create | `src/test/unit/core/planChatSession.test.ts` | Unit tests for session lifecycle |
| Create | `src/commands/planChat.ts` | Command handler: existing plan detection, terminal spawn, preview open |
| Create | `src/test/unit/commands/planChat.test.ts` | Unit tests for command handler |
| Modify | `src/activateViews.ts` | Instantiate `PlanPreviewPanel`, add to result |
| Modify | `src/commands.ts` | Register `oxveil.openPlanChat` and `oxveil.showPlanPreview` commands |
| Modify | `src/extension.ts` | Add Claude detection, wire plan chat session, set context keys |
| Modify | `package.json` | Add commands, settings, command palette entries |

---

### Task 1: Description Parser and Validator

**Demo after this task:** Tests pass for two new pure-function modules. No UI yet — foundation for the preview.

**Files:**
- Create: `src/parsers/planDescription.ts`
- Create: `src/test/unit/parsers/planDescription.test.ts`
- Create: `src/parsers/planValidator.ts`
- Create: `src/test/unit/parsers/planValidator.test.ts`

Non-UI task: no visual verification needed.

- [ ] **Step 1: Write failing tests for description parser**

Create `src/test/unit/parsers/planDescription.test.ts`. Test cases: extracts description between phase headers, excludes `depends-on` line, excludes `[status: ...]` annotation, returns empty description for header-only phase. Follow existing test patterns in `src/test/unit/parsers/`.

- [ ] **Step 2: Implement description parser**

Create `src/parsers/planDescription.ts` — `parsePlanWithDescriptions()` extends `parsePlan()` to extract body text between headers, filtering out status and depends-on lines.

- [ ] **Step 3: Run description parser tests**

Run: `npx vitest run src/test/unit/parsers/planDescription.test.ts` → PASS

- [ ] **Step 4: Write failing tests for plan validator**

Create `src/test/unit/parsers/planValidator.test.ts`. Test cases: valid sequential plan passes, gap in numbering fails, duplicate phase number fails, dependency referencing non-existent phase fails, empty plan passes. Follow existing test patterns.

- [ ] **Step 5: Implement plan validator**

Create `src/parsers/planValidator.ts` — `validatePlan()` checks sequential numbering and dependency references. Returns `{ valid: boolean, errors: string[] }`.

- [ ] **Step 6: Run validator tests**

Run: `npx vitest run src/test/unit/parsers/planValidator.test.ts` → PASS

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run` → All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/parsers/planDescription.ts src/parsers/planValidator.ts src/test/unit/parsers/planDescription.test.ts src/test/unit/parsers/planValidator.test.ts
git commit -m "feat: add plan description parser and validator"
```

---

### Task 2: Plan Preview HTML Generation

**Demo after this task:** Tests pass for HTML generation covering all four states. No panel yet — pure functions that produce HTML strings.

**Files:**
- Create: `src/views/planPreviewHtml.ts`
- Create: `src/test/unit/views/planPreviewHtml.test.ts`

Two functions: `renderPlanPreviewShell(nonce, cspSource)` and `renderPhaseCardsHtml(options)`.

Follow `liveRunHtml.ts` pattern exactly: CSP with nonce, `var(--vscode-*)` theme vars, `acquireVsCodeApi()`, message handler. Phase cards with colored left borders, "📝 Note" annotate buttons, yellow annotation input, "Live" badge, "Valid" badge.

States: active (phase cards), empty ("No plan yet"), session ended ("Session ended" banner), raw markdown fallback.

Visual reference: match ![Active state](mockups/plan-chat-active.png), ![Empty state](mockups/plan-chat-empty.png), ![Session ended](mockups/plan-chat-ended.png)

Non-UI task (pure function): no visual verification needed.

- [ ] **Step 1: Write failing tests for HTML generation**

Create `src/test/unit/views/planPreviewHtml.test.ts`. Test cases: shell contains CSP meta tag with nonce, shell contains `acquireVsCodeApi()`, active state renders phase cards with titles and descriptions, phase cards have colored left borders, annotate buttons present when session active, annotation buttons disabled when session ended, empty state shows "No plan yet" placeholder, session ended state shows warning banner, raw markdown fallback renders content. Reference `src/test/unit/views/liveRunHtml.test.ts` for patterns.

- [ ] **Step 2: Implement HTML generation**

Create `src/views/planPreviewHtml.ts`. Follow `src/views/liveRunHtml.ts` structure. Implement `renderPlanPreviewShell()` and `renderPhaseCardsHtml()`. Use `var(--vscode-*)` CSS variables for theming. Match mockup styling for phase cards, badges, and annotation inputs.

- [ ] **Step 3: Run HTML tests**

Run: `npx vitest run src/test/unit/views/planPreviewHtml.test.ts` → PASS

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run` → All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/views/planPreviewHtml.ts src/test/unit/views/planPreviewHtml.test.ts
git commit -m "feat: add plan preview HTML generation with phase cards"
```

---

### Task 3: Plan Preview Panel

**Demo after this task:** Tests pass for panel lifecycle with mocked webview. No extension wiring yet — panel is unit-tested in isolation.

**Files:**
- Create: `src/views/planPreviewPanel.ts`
- Create: `src/test/unit/views/planPreviewPanel.test.ts`

Follow `liveRunPanel.ts` pattern: deps injection, `reveal()`, `onFileChanged()`, `setSessionActive()`, `dispose()`.

`PlanPreviewPanelDeps` interface with `createWebviewPanel`, `readFile`, `onAnnotation`. Opens in `ViewColumn.Two` (beside terminal). Reads PLAN.md on `onFileChanged`, parses with `parsePlanWithDescriptions`, validates with `validatePlan`, sends to webview. Handles `"annotation"` messages from webview → forwards to `onAnnotation` callback.

Non-UI task (unit tested with mocks): no visual verification needed.

- [ ] **Step 1: Write failing tests for plan preview panel**

Create `src/test/unit/views/planPreviewPanel.test.ts`. Test cases: `reveal()` creates webview panel in ViewColumn.Two, `onFileChanged()` reads PLAN.md and sends parsed data to webview, `onFileChanged()` with invalid plan sends validation errors, `setSessionActive(false)` sends session ended state, `dispose()` disposes panel, annotation message from webview calls `onAnnotation` callback. Reference `src/test/unit/views/liveRunPanel.test.ts` for mock patterns.

- [ ] **Step 2: Implement plan preview panel**

Create `src/views/planPreviewPanel.ts`. Follow `src/views/liveRunPanel.ts` structure. Implement `PlanPreviewPanel` class with `PlanPreviewPanelDeps` interface. Wire `parsePlanWithDescriptions` and `validatePlan` into `onFileChanged`. Handle webview messages for annotations.

- [ ] **Step 3: Run panel tests**

Run: `npx vitest run src/test/unit/views/planPreviewPanel.test.ts` → PASS

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run` → All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/views/planPreviewPanel.ts src/test/unit/views/planPreviewPanel.test.ts
git commit -m "feat: add plan preview panel with deps injection"
```

---

### Task 4: Wire Plan Preview into Extension

**Demo after this task:** `Oxveil: Show Plan Preview` command opens the webview showing phase cards (if PLAN.md exists) or empty state.

**Files:**
- Modify: `src/activateViews.ts` — instantiate PlanPreviewPanel
- Modify: `src/commands.ts` — register `oxveil.showPlanPreview` command
- Modify: `package.json` — add command + command palette entry

- [ ] **Step 1: Wire PlanPreviewPanel into activateViews**

Modify `src/activateViews.ts` — instantiate `PlanPreviewPanel` with real deps, add to returned disposables. Follow existing pattern for `LiveRunPanel`.

- [ ] **Step 2: Register showPlanPreview command**

Modify `src/commands.ts` — register `oxveil.showPlanPreview` command that calls `planPreviewPanel.reveal()`. Follow existing command registration pattern.

- [ ] **Step 3: Update package.json**

Modify `package.json` — add `oxveil.showPlanPreview` to `contributes.commands` with title `"Oxveil: Show Plan Preview"` and command palette entry.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run` → All tests pass

- [ ] **Step 5: Install extension**

Action: `/install-dev`

- [ ] **Step 6: MANDATORY — Visual verification gate**

Action: `/visual-verification`

**This step is a blocker.** Do NOT proceed to the commit or mark this task done until visual verification passes. Compare against mockups and verify:
- `Oxveil: Show Plan Preview` appears in command palette
- Panel opens showing empty state matching ![Empty state](mockups/plan-chat-empty.png) (no "Live" badge yet, no terminal)
- If PLAN.md exists in workspace, shows phase cards matching ![Active state](mockups/plan-chat-active.png) styling
- Phase cards have colored left borders, titles, descriptions
- Empty state shows centered placeholder message

If any check fails: fix, rebuild, re-verify. Do not skip.

- [ ] **Step 7: Commit**

```bash
git add src/activateViews.ts src/commands.ts package.json
git commit -m "feat: wire plan preview panel into extension"
```

---

### Task 5: Live PLAN.md File Watching

**Demo after this task:** Open Plan Preview, then edit PLAN.md in the editor → preview updates live.

**Files:**
- Modify: `src/views/planPreviewPanel.ts` — add `startWatching(workspaceRoot)` and `stopWatching()`
- Modify: `src/test/unit/views/planPreviewPanel.test.ts` — add watcher tests
- Modify: `src/activateViews.ts` or `src/extension.ts` — wire watcher when panel is revealed

- [ ] **Step 1: Add file watcher to PlanPreviewPanel**

Add `startWatching(workspaceRoot)` and `stopWatching()` methods to `PlanPreviewPanel`. Use `vscode.workspace.createFileSystemWatcher` with glob pattern for `PLAN.md`. Debounce with 200ms timeout. On file change, call `onFileChanged()`. Dispose watcher in `stopWatching()` and `dispose()`.

- [ ] **Step 2: Write tests for file watcher behavior**

Add tests to `src/test/unit/views/planPreviewPanel.test.ts`: `startWatching` creates watcher, file change triggers `onFileChanged`, `stopWatching` disposes watcher, debounce prevents rapid re-reads.

- [ ] **Step 3: Wire watcher into extension**

Modify extension code to call `startWatching(workspaceRoot)` when panel is revealed. Ensure watcher is stopped on dispose.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run` → All tests pass

- [ ] **Step 5: Install extension**

Action: `/install-dev`

- [ ] **Step 6: MANDATORY — Visual verification gate**

Action: `/visual-verification`

**This step is a blocker.** Do NOT proceed to the commit or mark this task done until visual verification passes. Verify:
- Open Plan Preview panel
- Edit PLAN.md in the editor (add/modify a phase)
- Preview updates within ~200ms showing the change
- Adding a new phase shows a new card appearing
- Removing a phase removes the card

If any check fails: fix, rebuild, re-verify. Do not skip.

- [ ] **Step 7: Commit**

```bash
git add src/views/planPreviewPanel.ts src/test/unit/views/planPreviewPanel.test.ts src/activateViews.ts src/extension.ts
git commit -m "feat: add live PLAN.md file watching to plan preview"
```

---

### Task 6: Claude Detection + Plan Chat Command

**Demo after this task:** Run `Oxveil: Plan Chat` → Claude terminal opens on left + Plan Preview on right.

**Files:**
- Create: `src/core/claudeDetection.ts` + `src/test/unit/core/claudeDetection.test.ts`
- Create: `src/commands/planChat.ts` + `src/test/unit/commands/planChat.test.ts`
- Modify: `src/extension.ts` — run detection, set `oxveil.claudeDetected` context key
- Modify: `src/commands.ts` — register `oxveil.openPlanChat`
- Modify: `package.json` — add command, setting `oxveil.claudePath`, command palette entry with `when: oxveil.claudeDetected`

- [ ] **Step 1: Write failing tests for Claude detection**

Create `src/test/unit/core/claudeDetection.test.ts`. Test cases: detects claude at default path, detects claude at custom path from setting, returns null when binary not found, returns null when binary not executable. Follow existing `Detection` class pattern.

- [ ] **Step 2: Implement Claude detection**

Create `src/core/claudeDetection.ts` — `detectClaude(executor, path)` function. Reuse `Detection` class constructor pattern. Check binary exists and is executable.

- [ ] **Step 3: Write failing tests for plan chat command helpers**

Create `src/test/unit/commands/planChat.test.ts`. Test cases: `buildSystemPrompt()` returns prompt with plan format instructions, `handleExistingPlan()` returns correct action for each quick pick choice (edit/create new/cancel).

- [ ] **Step 4: Implement plan chat command helpers**

Create `src/commands/planChat.ts` — `buildSystemPrompt()` and `handleExistingPlan()` functions. System prompt instructs Claude to write PLAN.md in the expected format.

- [ ] **Step 5: Wire detection and command into extension**

Modify `src/extension.ts` — run `detectClaude()` on activation, set `oxveil.claudeDetected` context key. Modify `src/commands.ts` — register `oxveil.openPlanChat` that spawns terminal with `shellPath: claudePath` and `shellArgs` including `--append-system-prompt` and `--permission-mode`, then reveals plan preview.

- [ ] **Step 6: Update package.json**

Add `oxveil.openPlanChat` command with title `"Oxveil: Plan Chat"`, `when: oxveil.claudeDetected`. Add `oxveil.claudePath` setting with default `"claude"`.

- [ ] **Step 7: Verify CLI flags**

Run: `claude --help | grep -E "(append-system-prompt|permission-mode)"` — confirm both flags exist.

- [ ] **Step 8: Run full test suite**

Run: `npx vitest run` → All tests pass

- [ ] **Step 9: Install extension**

Action: `/install-dev`

- [ ] **Step 10: MANDATORY — Visual verification gate**

Action: `/visual-verification`

**This step is a blocker.** Do NOT proceed to the commit or mark this task done until visual verification passes. Compare against mockups and verify:
- `Oxveil: Plan Chat` appears in command palette (only if Claude is detected)
- Running command opens Claude terminal on the left
- Plan Preview panel opens on the right (ViewColumn.Two)
- Layout matches ![Active state](mockups/plan-chat-active.png) with terminal left, preview right

If any check fails: fix, rebuild, re-verify. Do not skip.

- [ ] **Step 11: Commit**

```bash
git add src/core/claudeDetection.ts src/test/unit/core/claudeDetection.test.ts src/commands/planChat.ts src/test/unit/commands/planChat.test.ts src/extension.ts src/commands.ts package.json
git commit -m "feat: add Claude detection and plan chat command"
```

---

### Task 7: Plan Chat Session with Annotations

**Demo after this task:** Click annotation button on phase card → type note → text injected into Claude terminal. Close terminal → "Session ended" banner.

**Files:**
- Create: `src/core/planChatSession.ts` + `src/test/unit/core/planChatSession.test.ts`
- Modify: `src/extension.ts` — wire annotation callback and terminal close listener
- Modify: `src/commands.ts` — update `oxveil.openPlanChat` to create session

- [ ] **Step 1: Write failing tests for PlanChatSession**

Create `src/test/unit/core/planChatSession.test.ts`. Test cases: `start()` creates terminal and reveals preview, `sendAnnotation()` calls `terminal.sendText()` with formatted annotation, `matchesTerminal()` returns true for the session's terminal, `isActive()` returns true when started and false after dispose, `dispose()` cleans up terminal and panel.

- [ ] **Step 2: Implement PlanChatSession**

Create `src/core/planChatSession.ts` — `PlanChatSession` class with `start()`, `sendAnnotation(phaseNumber, text)`, `matchesTerminal(terminal)`, `isActive()`, `dispose()`. Stores terminal reference. `sendAnnotation` formats text as instruction to Claude and calls `terminal.sendText()`.

- [ ] **Step 3: Wire annotation callback**

Connect `PlanPreviewPanel`'s `onAnnotation` callback to `PlanChatSession.sendAnnotation()`. When webview sends `"annotation"` message, forward phase number and text to the session.

- [ ] **Step 4: Wire terminal close listener**

Register `vscode.window.onDidCloseTerminal` listener in extension. When closed terminal matches session via `matchesTerminal()`, call `planPreviewPanel.setSessionActive(false)` and set `oxveil.planChatActive` context key to false.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run` → All tests pass

- [ ] **Step 6: Install extension**

Action: `/install-dev`

- [ ] **Step 7: MANDATORY — Visual verification gate**

Action: `/visual-verification`

**This step is a blocker.** Do NOT proceed to the commit or mark this task done until visual verification passes. Verify:
- Click "📝 Note" button on a phase card → annotation input appears (yellow)
- Type a note and submit → text appears in Claude terminal
- Close the Claude terminal → "Session ended" banner appears matching ![Session ended](mockups/plan-chat-ended.png)
- Annotation buttons are disabled after session ends

If any check fails: fix, rebuild, re-verify. Do not skip.

- [ ] **Step 8: Commit**

```bash
git add src/core/planChatSession.ts src/test/unit/core/planChatSession.test.ts src/extension.ts src/commands.ts
git commit -m "feat: add plan chat session with annotation support"
```

---

### Task 8: Edge Cases and Final Polish

**Demo after this task:** All 10 verification items from the spec pass. Complete end-to-end flow works.

**Files:**
- Modify: `src/commands/planChat.ts` — existing PLAN.md handling
- Modify: `src/core/planChatSession.ts` — duplicate session prevention
- Modify: `src/extension.ts` — error handling for missing Claude
- Modify: `src/views/planPreviewPanel.ts` — malformed PLAN.md fallback

- [ ] **Step 1: Handle existing PLAN.md**

Modify `src/commands/planChat.ts` — when PLAN.md exists, show quick pick with options: "Edit existing plan", "Create new plan (backup current)", "Cancel". On "Create new", rename current to `PLAN.md.bak` before starting session.

- [ ] **Step 2: Prevent duplicate sessions**

Modify `src/core/planChatSession.ts` and command handler — if a session `isActive()`, focus the existing terminal instead of creating a new one. Show info message: "Plan Chat session already active".

- [ ] **Step 3: Handle Claude not installed**

Modify extension activation — when `detectClaude()` returns null, show error message with link to install Claude CLI. Do not register `oxveil.openPlanChat` command in command palette.

- [ ] **Step 4: Handle malformed PLAN.md**

Modify `src/views/planPreviewPanel.ts` — when `parsePlanWithDescriptions()` throws or returns no phases but file has content, render raw markdown content with a yellow warning banner: "Could not parse plan format. Showing raw content."

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run` → All tests pass

- [ ] **Step 6: Install extension**

Action: `/install-dev`

- [ ] **Step 7: MANDATORY — Visual verification gate (full end-to-end)**

Action: `/visual-verification`

**This step is a blocker.** Do NOT proceed to the commit or mark this task done until visual verification passes. Verify all 3 mockup states:
- ![Empty state](mockups/plan-chat-empty.png) — fresh session with "No plan yet" placeholder
- ![Active state](mockups/plan-chat-active.png) — phase cards with annotations, "Live" badge, colored borders
- ![Session ended](mockups/plan-chat-ended.png) — warning banner, disabled annotations

Additionally verify edge cases:
- Existing PLAN.md triggers quick pick dialog
- Running Plan Chat twice focuses existing session
- Malformed PLAN.md shows raw markdown fallback with warning

If any check fails: fix, rebuild, re-verify. Do not skip.

- [ ] **Step 8: Commit**

```bash
git add src/commands/planChat.ts src/core/planChatSession.ts src/extension.ts src/views/planPreviewPanel.ts src/test/
git commit -m "feat: add edge case handling and polish for plan chat"
```
