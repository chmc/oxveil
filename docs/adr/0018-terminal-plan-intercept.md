# ADR-0018: Terminal Plan Intercept

## Status
Accepted (amended 2026-06-24)

## Context

When Claude calls `ExitPlanMode`, Oxveil needs to offer the user a choice: hand off to Oxveil for implementation, run critic agents first, or continue refining the plan.

The original implementation used a VS Code QuickPick dialog triggered from the extension. This had two problems:
1. The user's attention is in the Claude terminal, not VS Code, when they exit plan mode
2. The extension had to poll for Claude's response, creating a request/response file round-trip with UUID tracking and a 30-second poll loop

## Decision

Intercept `ExitPlanMode` in the Claude terminal using a `PreToolUse:ExitPlanMode` hook (`resources/oxveil-plan-intercept.sh`):

1. **Hook denies `ExitPlanMode`** and injects `additionalContext` instructing Claude to call `AskUserQuestion` with three options: Form Plan with Oxveil, run critics, or continue planning.
2. **Claude presents the choice** natively in the terminal via `AskUserQuestion`.
3. **"Form Plan with Oxveil" writes a trigger file** (`.claude/oxveil-execute`) containing `{"action":"formPlan","planFile":"<absolute path>"}`. The `planFile` value is sourced from Claude's plan-mode `## Plan File Info:` block — the canonical path of the plan just written.
4. **Extension watches for the trigger file** via `vscode.workspace.createFileSystemWatcher`. On creation it reads the sentinel, validates `planFile` (absolute path, realpath containment under `<workspaceRoot>/.claude/plans/`, file must be accessible), calls `oxveil.formPlan` with `{ filePath }`, then deletes the trigger.
5. **Loop breaker:** hook allows `ExitPlanMode` after 5 consecutive denies, preventing infinite loops if Claude ignores the instruction.
6. **Validation rejection:** if `planFile` is absent or fails validation, an error notification is shown. No automatic fallback to heuristic resolution — the user must re-trigger from the plan chat.

The hook is active only when the `$OXVEIL_PLAN_MARKER` env var is set and the referenced file exists. The marker lives in VS Code's `context.storageUri` (outside the workspace) to avoid git pollution. The env var is injected into all terminals opened after extension activation via `context.environmentVariableCollection`.

## Consequences

**Positive:**
- User interaction stays in the terminal where they are already focused
- Eliminates the polling loop and request/response file pair — the trigger file is one-way
- The `AskUserQuestion` UI is consistent with other Claude Code interactions
- Extension watcher is simpler than a poller: event-driven, no timeout management

**Negative:**
- Relies on Claude following the injected instruction — a sufficiently confused Claude could call `ExitPlanMode` repeatedly and exhaust the loop breaker (5 denies), bypassing the intercept
- Trigger file is written to `.claude/` (shared directory); if Claude crashes mid-write the sentinel may be malformed — validation rejects it cleanly
- Relies on Claude correctly copying the absolute plan path from its system message — a hallucinated-sibling path (different plan in the same dir) passes validation and would pick the wrong file; detected only at AI-parse time

## Amendment (2026-06-24): Explicit Plan Path Handover

**Problem:** the original sentinel (`{"action":"formPlan"}`) contained no plan path. The extension re-derived the source plan via `PlanFileResolver` heuristics (mtime, birthtime, workspaceState cache, sticky tab pick), which could pick a stale or wrong plan when multiple `.claude/plans/*.md` files existed.

**Change:** sentinel schema extended to `{"action":"formPlan","planFile":"<absolute>"}`. The watcher validates and uses this path directly. `planFileOverride` (from `.claudeloop.conf`) governs only the *destination* `PLAN.md` path — it is no longer used as a source path. The `getPlanFile` callback parameter on `createPlanInterceptWatcher` was removed.

## Files

- `resources/oxveil-plan-intercept.sh` — PreToolUse hook: deny + inject AskUserQuestion instruction
- `src/planInterceptWatcher.ts` — file watcher for trigger files; `cleanupStaleTriggers()`
- `src/extension.ts` — registers watcher and calls `cleanupStaleTriggers()` on activation
- `.claude/oxveil-plan-active` — marker file controlling hook activation (runtime artifact, not committed)
