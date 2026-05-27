# ADR-0018: Terminal Plan Intercept

## Status
Accepted

## Context

When Claude calls `ExitPlanMode`, Oxveil needs to offer the user a choice: hand off to Oxveil for implementation, run critic agents first, or continue refining the plan.

The original implementation used a VS Code QuickPick dialog triggered from the extension. This had two problems:
1. The user's attention is in the Claude terminal, not VS Code, when they exit plan mode
2. The extension had to poll for Claude's response, creating a request/response file round-trip with UUID tracking and a 30-second poll loop

## Decision

Intercept `ExitPlanMode` in the Claude terminal using a `PreToolUse:ExitPlanMode` hook (`scripts/oxveil-plan-intercept.sh`):

1. **Hook denies `ExitPlanMode`** and injects `additionalContext` instructing Claude to call `AskUserQuestion` with three options: Form Plan with Oxveil, run critics, or continue planning.
2. **Claude presents the choice** natively in the terminal via `AskUserQuestion`.
3. **"Form Plan with Oxveil" writes a trigger file** (`.claude/oxveil-execute-{uuid}.json`) with a timestamp and action payload.
4. **Extension watches for trigger files** via `vscode.workspace.createFileSystemWatcher` matching `.claude/oxveil-execute-*.json`, validates the timestamp (<60s), calls `oxveil.formPlan`, then deletes the file.
5. **Loop breaker:** hook allows `ExitPlanMode` after 5 consecutive denies, preventing infinite loops if Claude ignores the instruction.
6. **Stale trigger cleanup:** `cleanupStaleTriggers()` runs on extension activation to purge leftover files from previous sessions.

The hook is active only when `.claude/oxveil-plan-active` marker file exists, so it does not affect non-plan sessions.

## Consequences

**Positive:**
- User interaction stays in the terminal where they are already focused
- Eliminates the polling loop and request/response file pair — the trigger file is one-way
- The `AskUserQuestion` UI is consistent with other Claude Code interactions
- Extension watcher is simpler than a poller: event-driven, no timeout management

**Negative:**
- Relies on Claude following the injected instruction — a sufficiently confused Claude could call `ExitPlanMode` repeatedly and exhaust the loop breaker (5 denies), bypassing the intercept
- Trigger files are written to `.claude/` which is a shared directory; stale files from crashes require the cleanup sweep on activation

## Files

- `scripts/oxveil-plan-intercept.sh` — PreToolUse hook: deny + inject AskUserQuestion instruction
- `src/planInterceptWatcher.ts` — file watcher for trigger files; `cleanupStaleTriggers()`
- `src/extension.ts` — registers watcher and calls `cleanupStaleTriggers()` on activation
- `.claude/oxveil-plan-active` — marker file controlling hook activation (runtime artifact, not committed)
