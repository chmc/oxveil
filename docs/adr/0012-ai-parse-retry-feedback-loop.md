# 12. AI parse retry-with-feedback loop

**Date:** 2026-04-14
**Status:** Accepted

## Context

AI parse can produce a plan that fails claudeloop's built-in verification step. Without a feedback mechanism the user has to re-invoke the command manually, has no visibility into why the plan was rejected, and cannot guide the AI toward a fix. We needed a retry loop with user-visible progress and a way to pass corrective feedback back to claudeloop.

## Decision

### Control the retry loop in Oxveil, not claudeloop

The retry orchestrator (`commands/aiParseLoop.ts`) lives in Oxveil. claudeloop exposes two primitives — `--no-retry` (suppress its internal retry) and `--ai-parse-feedback` (read feedback text from a file) — and Oxveil drives the loop. This keeps UI concerns (progress display, feedback form, cancellation) out of the CLI engine and lets the loop evolve independently.

### Exit code convention: 0 = pass, 2 = verification fail, 1 = error

`claudeloop --ai-parse` exits with:
- `0` — plan generated and passed verification
- `2` — plan generated but failed verification (retry eligible)
- `1` — unexpected error (abort)

Exit code 2 is distinct from 1 so the orchestrator can distinguish a recoverable condition (bad plan) from an unrecoverable one (process crash, missing files).

### Host the retry UI in the Live Run Panel

Feedback prompts and streaming AI output appear in the Live Run Panel rather than VS Code notifications or quick-pick inputs. Two new webview message types drive the UI state:
- `verify-failed` — renders a feedback form inside the panel
- `verify-passed` — shows a success banner and dismisses the form

This reuses the existing streaming log infrastructure and keeps all AI parse activity in one place, consistent with how phase execution is monitored.

### `--ai-parse-feedback` reads from a file, not a CLI argument

Feedback text is written to a temp file; claudeloop reads the path from the flag. This avoids shell-quoting issues with multi-line or special-character feedback and keeps the IPC pattern consistent with how claudeloop already reads other state from disk.

## Consequences

**Positive:**
- Full visibility: users see AI output stream in real time during retries.
- Iterative correction: users can refine feedback across multiple retry rounds without re-invoking the command.
- Clean separation: claudeloop remains a stateless CLI; all loop state lives in Oxveil.
- Testable in isolation: the orchestrator and panel message types can be unit-tested without spawning a real process.

**Negative:**
- Adds a new IPC contract (exit code 2, `--ai-parse-feedback` flag, temp file path) that must stay in sync across both repos.
- The Live Run Panel now serves two distinct use cases (phase execution and AI parse); panel state management is more complex.
