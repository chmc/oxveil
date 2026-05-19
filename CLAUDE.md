## Behavioral Guidelines

- Think before coding. State your assumptions out loud. If the request is ambiguous, ask. If a simpler approach exists, push back. Stop when you are confused, name what is unclear, do not just pick one interpretation and run.
- Simplicity first. Write the minimum code that solves the problem. No speculative abstractions. No flexibility nobody asked for. The test: would a senior engineer call this overcomplicated.
- Extracting to shared utility? Grep call sites, verify tests cover the new function's full contract (not just the happy path the inline code happened to use).
- Surgical changes. Touch only what the task requires. Do not improve neighboring code. Do not refactor what is not broken. Every changed line should trace back to the request.
- Goal-driven execution. Turn vague instructions into verifiable targets before writing a line. “Add validation” becomes “write tests for invalid inputs, then make them pass.”
- Bug fix plans: verify actual behavior first. Reading code shows intent, not behavior. Run/trace before writing fix.

## STOP if Thinking

| Thought | Reality |
|---------|---------|
| "It's obvious this works" | Run verification anyway |
| "Tests passed earlier" | Run them now — state changes |
| "I can verify after" | Verify before claiming done |
| "We can verify X instead" | Run the specified test |
| "Prerequisite isn't critical" | It gates the verification |
| "Verify manually" / "manual testing" | `/visual-verification` automates UI testing. Never write "manually". |
| "User asked for it" / "User said yes" | Plan mode exit wasn't granted. Request ExitPlanMode again. |
| "Let me explore the codebase" | Read `graphify-out/GRAPH_REPORT.md` first. Use `graphify query/path/explain`. |

## Index

- [Hard Rules](#hard-rules) - NEVER rules (tool, destructive ops, plan mode, activation, verification)
- [Quality Gates](#quality-gates) - Completion checklist, critic requirements
- [Verification Integrity](#verification-integrity) - No rationalization during verification

## Hard Rules

- NEVER claim tool unavailable without checking: (1) skill refs, (2) related repos (`~/source/claudeloop/tests/`), (3) workspace search. Single `which` insufficient.
- NEVER `rm -rf .claudeloop`. Remove only individual mock-created files (newer than `.MOCK_SESSION`).
- NEVER `keystroke` via osascript for destructive ops (Cmd+W/Q). `keystroke` targets frontmost app, not `tell process` target. Use `click menu item`.
- Non-destructive keystrokes: `set frontmost to true` + `AXRaise` first.
- osascript: Escape does NOT dismiss VS Code AXSheets — click Cancel/Don't Save button directly.
- osascript: merge related operations into single osascript call — separate bash calls introduce timing gaps.
- NEVER edit non-plan files in plan mode. Write to plan file, call ExitPlanMode.
- NEVER `await` external process in `activate()` without timeout. Use `Promise.race` 5s. Hanging CLI = stuck spinner.
- NEVER call ExitPlanMode without 2-3 critic agents. Exception: config/docs-only changes with zero source or skill code → "Skipping critics — no source: [files changed]."
- After critics: spot-check blind spots (grep mock sites, verify file list, trace one code path).
- If critics widen scope (new files, additional fixes), update plan before ExitPlanMode.
- Subagent prompts: end with "terse. bullets only. no preamble. if clean: LGTM."
- NEVER suggest manual verification. Use `/visual-verification`, MCP bridge, fake_claude, cliclick.
- NEVER install fake_claude to `~/.local/bin`. Use temp dir + scoped PATH: `FAKE_CLAUDE_DIR=$(mktemp -d -t fake_claude.XXXXXX); cp fake_claude "$FAKE_CLAUDE_DIR/claude"; chmod +x "$FAKE_CLAUDE_DIR/claude"; trap 'rm -rf "$FAKE_CLAUDE_DIR"' EXIT; PATH="$FAKE_CLAUDE_DIR:$PATH" code ...`. Temp dir propagates to EDH → claudeloop → claude.
- NEVER claim done without doc impact check: user-facing → README, architecture → ADR, state files → `docs/workflow/states.md` (see `workflow-docs` skill).

## Project

Oxveil: VS Code extension for AI coding workflows, powered by [claudeloop](https://github.com/chmc/claudeloop). Same author — ship both repos together.

## Cross-Repo Verification

Before visual verification of cross-repo features (self-improvement, lessons capture), verify dependent repos are installed at matching versions:
- `claudeloop --version` vs `~/source/claudeloop/VERSION`
- If mismatch: `cd ~/source/claudeloop && ./install.sh`

## Git

- Always use conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. No exceptions.
- Never add yourself as co-author. Include `Closes #N` for issue fixes. No auto-push.
- NEVER include sequence markers in commit messages (`phase-N`, `step-N`, `part-N`). Describe WHAT changed, not WHEN in a process. Exception: when the marker IS the feature name (e.g., `fix: phase-2 migration null handling`).
- NEVER commit without completing Quality Gates (lint, tests, visual verification if UI). "Only docs/skills" not exempt.

## CHANGELOG

- Entries go under existing section (`### Fixed`, `### Added`) within `## Unreleased`
- Prepend new bullet to the section — don't create duplicate headers
- One line per change: `- Brief description (#PR or issue)`

## GitHub Issues

- NEVER write a plan for a GitHub issue task without a final step that verifies the issue is closed.
- NEVER claim GitHub issue work complete without verifying the issue is closed first.
- Confirming work is done = verify closed state. Don't ask, verify.
- Prefer `Closes #N` in commit message — auto-closes on push. Parenthetical `(#N)` does NOT auto-close. Use `gh issue close` only when no commit is involved. Final step: `gh issue view #N --json state -q .state` to verify closed. If already closed, phase succeeds.

## Async State Patterns

- Async handlers in views: use `GuardedHandler` type (`src/core/state/GuardedHandler.ts`) — compiler enforces seq parameter
- State reads before await: use `session.readSnapshot()` + `assertFresh(seq)` or re-read after
- New panels: include `_disposed = false` field, set `_disposed = true` first in `dispose()`
- Adding optional field to shared interface? Grep all construction sites — TypeScript won't error on missing optional fields.
- Parallel code paths (e.g., `withSession` / `withoutSession`): state clearing in one path often needs mirroring in the other — grep all mutation sites, extract shared helper if duplicating
- Touch one switch case → verify all cases have equivalent coverage
- See `docs/patterns/async-guards.md` for copy-paste examples

## Development Process

Trunk-based. See `.claude/skills/dev-workflow/SKILL.md`. Not published yet — no feature flags.

## Branch Completion Cleanup

After merge or discard in `finishing-a-development-branch`, run:
```bash
bash .claude/scripts/cleanup-workflow-state.sh
```
Clears `workflow-state/*` (keeps `claudeloop-features-hash`) and `review-sessions/*`.

## Adding Settings

See `.claude/skills/adding-settings/SKILL.md` for checklist, async migration, and language contribution patterns.

## Cost Control

Paid services (Claude CLI, APIs): dev mode → cheapest default (haiku). `OXVEIL_<SERVICE>_<PARAM>` env var overrides. Prefer fake_claude over real API.

## Execution Discipline

- Skill checklist → task per item, execute in order. No skip/merge.
- Plan phase description = spec. Follow literally.
- "Action: `/skill`" → invoke via Skill tool. No substitution.
- Checklist → complete all. "Compare against" → read and compare.
- Skill terminal action governs. Don't substitute ExitPlanMode for skill exit.
- Plan-spec code inserted → run `npm run lint` immediately. Catches phantom API references before they compound.
- Before implementing plan phase → check git history. Work may have been co-committed in earlier phases.
- TodoWrite does not satisfy workflow gates. Use TaskCreate — only TaskCreate triggers `tasks-created.sh` marker. Subagents without TaskCreate: `touch .claude/workflow-state/tasks-created` before any Edit calls (blocking gate).

## Automation Discipline

Automation fails → research alternatives first. Don't retry same method. Document fix in skill file.

## Plan File Hygiene

Clear plan file when done. No stale plans.

## Quality Gates

**Debug:** Wrong sidebar phases → check stale `.claudeloop/ai-parsed-plan.md`.

### Completion Checklist (execute in order before claiming done)

0. GitHub issue task? → plan MUST verify issue closed (`gh issue view #N --json state -q .state`). See [GitHub Issues](#github-issues).
1. `npm run lint` — fix all
2. `npm test` — fix all (hook also runs `vitest related` on changed files at task completion)
3. Doc scan: state files → `docs/workflow/states.md` (see `workflow-docs` skill), user-facing → README, architecture → ADR
4. UI changes → `/visual-verification`
5. State result + next step

**Critic agents (before ExitPlanMode):** Run 2-3 in parallel covering: (1) root cause, (2) scope/mock sites, (3) alternatives/UX. Verify: `/visual-verification` for UI changes, `gh issue close` in plan, no manual verification.

**Visual Verification in Plans:** When a plan contains a Visual Verification phase, write descriptive checkboxes that serve as a ready-made script for `/visual-verification`. Each item must describe a specific observable behavior (>15 chars). Hook enforces this at ExitPlanMode.
- Good: `- [ ] Start button disables immediately when session begins`
- Bad: `- [ ] test`, `- [ ] verify UI works`

## Verification Integrity

- Missing prerequisite = FAILED, not "passed with caveats." Check prerequisites FIRST.
- NEVER substitute weaker test or rationalize blocked paths. Fix or report.
- Results must match what was tested: "X: PASS. Y: NOT TESTED (prerequisite failed)."
- Mutable state interfaces: prefer getters over copied values — snapshots go stale.

## Writing Style

AI files: imperative, flat bullets, one rule per line. YAML frontmatter for skills.

## Output Discipline

No summaries, preamble, filler. Bullets for status. Completion: result + next step.

## Task Tracking

After ExitPlanMode approval, create tasks for each plan step **before writing code**:
1. One task per implementation step
2. "Lint and typecheck" task (blockedBy all impl tasks)
3. "End session and cleanup" task (blockedBy lint task)

Mark `in_progress` before starting, `completed` when done.

## Task Hygiene

- NEVER claim "done" or "complete" while tasks remain in_progress
- If hook blocks TaskUpdate: fix the blocker, IMMEDIATELY RETRY the same TaskUpdate. Don't move to next task until current task status change succeeds.
- Before ending turn: `TaskList` to verify no orphaned in_progress tasks

## Oxveil Testing Patterns

See `.claude/skills/oxveil-testing/SKILL.md`. Use alongside `superpowers:test-driven-development`.

## Continuous Improvement

Raise friction at pause points. Corrections → CLAUDE.md or skill file. Memory banned.

## Bash Truncation Hook

NEVER bypass hook. Fix it: false positive → ALLOWLIST, false negative → BOUNDED_PIPES. Disable session: `export OXVEIL_BASH_HOOK=0`.

## Documentation

ADR: `docs/adr/NNNN-slug.md` using [template](docs/adr/TEMPLATE.md). Other docs enforced via Quality Gates.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

## Self-Optimization

After editing `.claude/` files, suggest `/self-optimize` if:
- Added >50 tokens to instruction surface
- Session involved multiple skill/rule edits
- User mentions instruction bloat or redundancy
