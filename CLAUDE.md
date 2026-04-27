## STOP if Thinking

| Thought | Reality |
|---------|---------|
| "This case is different" | The rule still applies |
| "I can do this after" | Do it now or it won't happen |
| "The user won't mind" | Follow the rule |
| "It's obvious this works" | Run verification anyway |
| "Tests passed earlier" | Run them now — state changes |
| "This is trivial" | Trivial changes break too. Full checklist. |
| "I can verify after" | Verify before claiming done |
| "We can verify X instead" | Run the specified test |
| "Prerequisite isn't critical" | It gates the verification |
| "Documentation doesn't apply" | Check all 4 categories |
| "Verify manually" / "manual testing" | `/visual-verification` automates UI testing. Never write "manually". |
| "User asked for it" / "User said yes" | Plan mode exit wasn't granted. Request ExitPlanMode again. |
| "I'll close the issue later" | Include `gh issue close` in plan. Close before claiming done. |
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
- NEVER edit non-plan files in plan mode. Write to plan file, call ExitPlanMode.
- NEVER `await` external process in `activate()` without timeout. Use `Promise.race` 5s. Hanging CLI = stuck spinner.
- NEVER call ExitPlanMode without 2-3 critic agents. Exception: trivial (config/docs only, no source) → say "Skipping critics — trivial: [reason]."
- After critics: spot-check blind spots (grep mock sites, verify file list, trace one code path).
- Subagent prompts: end with "terse. bullets only. no preamble. if clean: LGTM."
- NEVER suggest manual verification. Use `/visual-verification`, MCP bridge, fake_claude, cliclick.
- NEVER claim done without doc impact check: user-facing → README, architecture → ADR, state files → `docs/workflow/states.md`.

## Project

Oxveil: VS Code extension for AI coding workflows, powered by [claudeloop](https://github.com/chmc/claudeloop). Same author — ship both repos together.

## Cross-Repo Verification

Before visual verification of cross-repo features (self-improvement, lessons capture), verify dependent repos are installed at matching versions:
- `claudeloop --version` vs `~/source/claudeloop/VERSION`
- If mismatch: `cd ~/source/claudeloop && ./install.sh`

## Git

- Always use conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. No exceptions.
- Never add yourself as co-author. Include `Closes #N` for issue fixes. No auto-push.
- NEVER commit without completing Quality Gates (lint, tests, visual verification if UI, Codex if available). "Only docs/skills" not exempt.

## GitHub Issues

- NEVER write a plan for a GitHub issue task without a final step: "Close GitHub issue #N with `gh issue close`".
- NEVER claim GitHub issue work complete without closing the issue first.
- Confirming work is done = close the issue. Don't ask, close it.

## Development Process

Trunk-based. See `.claude/skills/dev-workflow/SKILL.md`. Not published yet — no feature flags.

## Cost Control

Paid services (Claude CLI, APIs): dev mode → cheapest default (haiku). `OXVEIL_<SERVICE>_<PARAM>` env var overrides. Prefer fake_claude over real API.

## Execution Discipline

- Skill checklist → task per item, execute in order. No skip/merge.
- Plan phase description = spec. Follow literally.
- "Action: `/skill`" → invoke via Skill tool. No substitution.
- Checklist → complete all. "Compare against" → read and compare.
- Skill terminal action governs. Don't substitute ExitPlanMode for skill exit.

## Automation Discipline

Automation fails → research alternatives first. Don't retry same method. Document fix in skill file.

## Plan File Hygiene

Clear plan file when done. No stale plans.

## Quality Gates

**Plans:** Include docs (README, ARCHITECTURE, states.md), test coverage. UI tasks → `/visual-verification` with acceptance criteria. GitHub issue tasks → final step closes issue.

**Executing:** UI task not done until `/visual-verification` passes. No stash for uncommitted changes. Read screenshots, describe concretely.

**Debug:** Wrong sidebar phases → check stale `.claudeloop/ai-parsed-plan.md`.

### Completion Checklist (execute in order before claiming done)

Execute in order. Do not skip.

0. GitHub issue task? → plan MUST end with `gh issue close #N`
1. `npm run lint` — fix all
2. `npm test` — fix all
3. Doc scan: state files → `docs/workflow/states.md`, user-facing → README, architecture → ADR
4. UI changes → `/visual-verification`
5. Codex review if available
6. After 1-5: state result + next step

**Codex review:** After checklist passes, run `/codex:review --wait` or spawn `codex:codex-rescue`. Auto-fix findings. Loop until clean or 3 cycles. `/codex:adversarial-review` only when requested.

**Critic agents (before ExitPlanMode):** Run 2-3 in parallel covering: (1) root cause, (2) scope/mock sites, (3) alternatives/UX. Each must verify:
- `/visual-verification` included for UI-visible changes (trace call chain to UI)
- No manual verification when automation exists
- `docs/workflow/states.md` updated when touching state files
- GitHub issue tasks include `gh issue close #N` as final step

## Verification Integrity

- NEVER claim verification passed if prerequisites missing. Missing prerequisite = FAILED, not "passed with caveats."
- NEVER substitute weaker test. "File isolation" ≠ "UI state bleeding." Run specified test.
- NEVER rationalize blocked paths. Prerequisite fails → fix or report failure.
- Check prerequisites FIRST. If any fail, stop and report which.
- Results must match what was tested. "X: PASS. Y: NOT TESTED (prerequisite failed)."
- Mutable state interfaces: check for stale snapshots. Prefer getters over copied values.

## Writing Style

AI files: imperative, flat bullets, one rule per line. YAML frontmatter for skills.

## Output Discipline

No summaries, preamble, filler. Bullets for status. Completion: result + next step.

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
