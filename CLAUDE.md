## Hard Rules

- NEVER recursively delete the `.claudeloop/` directory. It is managed by claudeloop and contains live runtime state.
- During mock cleanup, only remove individual mock-created files (those newer than `.MOCK_SESSION` marker). Never `rm -rf .claudeloop`.
- NEVER use `keystroke` via osascript for destructive operations (Cmd+W, Cmd+Q, Cmd+Shift+W). `keystroke` always targets the system frontmost app, not the `tell process` target — it can kill the terminal. Use accessibility menu clicks instead (`click menu item` of the target process's menu bar), which are process-scoped.
- For non-destructive keystrokes (Cmd+Shift+P, typing text, Enter, Escape), always `set frontmost to true` and `AXRaise` the target window first.
- NEVER edit non-plan files while plan mode is active. Plan mode restricts edits to the plan file only. When a change is needed, write it to the plan file and call ExitPlanMode to request permission — do not make the change directly.
- NEVER `await` an external process (execFile, spawn, fetch) without a timeout in `activate()`. Use `Promise.race` with 5s timeout. A hanging CLI blocks `resolveWebviewView` and the sidebar stays on the loading spinner forever.
- Wrap non-critical awaits in `activate()` (bridge startup, optional detection) in try-catch. Activation must always complete.
- NEVER call ExitPlanMode without first launching and completing 2-3 critic agents. This is a hard gate, not a suggestion. **Exception — trivial changes** (config-only, docs-only, no source code, no interface changes): skip critics, but tell the user explicitly: "Skipping critic review — trivial change: [reason]." If the user disagrees, run critics. "The fix is simple" is not sufficient — the change must be mechanically trivial (no logic, no branching, no new behavior).
- After critic agents complete, personally spot-check their blind spots before declaring confidence: grep for mock/call sites of changed interfaces, verify the plan's file list is complete, and trace one end-to-end code path through the fix. Do not trust critic output without verification. Critics catch design issues; mechanical blast radius is your responsibility.
- All subagent prompts must request compressed output. Gate-check agents (critics, Codex review): end with "terse. bullets only. no preamble. if clean: LGTM." Deliverable agents (Plan, Explore, general-purpose): end with "no preamble. no trailing summary. no filler. bullets for status and progress. prose only for deliverable content."
- NEVER suggest manual verification when automated tools exist. Forbidden phrases: "Manual test:", "manually verify", "confirm by hand", "test this yourself". Use `/visual-verification`, MCP bridge, fake_claude, cliclick. If automation gaps exist, research and fix the tooling — do not fall back to manual.

## Project

- Oxveil is a VS Code extension for managing AI coding workflows, powered by [claudeloop](https://github.com/chmc/claudeloop).
- Both repos share the same author. Coordinate and ship changes across both repos simultaneously when needed.

## Git

- Use conventional commits.
- Never add yourself as co-author.
- When fixing a GitHub issue, always include `Closes #N` or `Fixes #N` in the commit message. Do not push automatically — tell the user the issue will close on `git push`.
- NEVER commit without first completing the full Quality Gates sequence (lint, tests, visual verification if UI-facing, Codex review if available). "The change is only docs/skills" is not an exemption.

## Development Process

- Follow trunk-based development and feature flag policy. See `.claude/skills/dev-workflow/SKILL.md`.
- Oxveil is not yet published. Ship all features directly — no feature flags. Re-evaluate when publishing to marketplace.
- Automate processes (CI, releases, testing) from the start. Do not defer to manual workflows.

## Cost Control for External Services

- When building features that spawn external paid services (Claude CLI, APIs), always implement dev-mode cost control:
  - Detect `ExtensionMode.Development` to auto-default to the cheapest option (e.g., `haiku` for Claude).
  - Provide an `OXVEIL_<SERVICE>_<PARAM>` env var override (takes precedence over dev-mode default).
  - Precedence: (1) env var, (2) cheapest default in dev mode, (3) no override (user's default in production).
- Never modify user-level settings files for testing. Use dependency injection and extension mode detection.
- Prefer fake/mock services (e.g., fake_claude for claudeloop) over real API calls when the interaction is not user-facing.

## Execution Discipline

- When a skill has a checklist, read it fully, create a task per item, then execute in order. Do not skip, merge, or shortcut items — the checklist exists to prevent exactly that reasoning.
- When executing a plan phase, the description is your specification. Follow it literally.
- If the description says "Action: `/skill-name`", invoke that skill via the Skill tool. Do not substitute programmatic checks. Do not rationalize skipping it.
- If the description contains a checklist, complete every item. Do not mark the phase done with items unchecked.
- If the description says "Compare against" a reference, read that file and compare.
- Each skill defines its own terminal action. Do not substitute a different exit (e.g., calling `ExitPlanMode` from brainstorming). Read the skill's terminal state before starting.
- If plan mode activates during a skill, the skill's checklist still governs — plan mode is a tool within the skill, not a replacement for it.
- "I already have evidence" and "this is simple enough" are not valid reasons to skip a specified action.

## Automation Discipline

- When an automation approach fails, do NOT retry the same method. Immediately research alternatives (web search, explore similar tools, check documentation).
- Fix the tooling gap, then document the solution in the relevant skill file.
- Retrying a failing approach multiple times before researching is a pattern violation.

## Plan File Hygiene

- When a plan's work is complete, clear the plan file or mark it done.
- Do not leave stale completed plans sitting in the plan file.

## Quality Gates

- When writing plans: always include documentation (README, ARCHITECTURE), workflow state docs (`docs/workflow/states.md`), and test coverage for affected user stories. Code-only plans are incomplete.
- When writing plans: every task that touches rendering, webview, or user-visible state must include a `/visual-verification` step with task-specific acceptance criteria. Omitting it is a plan defect.
- When executing: do not mark a UI-facing task done until its `/visual-verification` step passes. If the plan omits verification for a task that touches rendering, webview, or user-visible state, add it before marking done.
- For UI-facing changes executed without a plan, run `/visual-verification` before claiming done.
- When running visual verification on uncommitted changes, do NOT stash — the changes are what you're testing.
- After every screenshot capture, read the image and describe what you see in concrete terms. Do not assume success from blurry/small screenshots. Verify keystrokes reached the intended target by checking for typed text.
- If sidebar shows wrong phases after manual PLAN.md edit, check for stale `.claudeloop/ai-parsed-plan.md`. `loadPlanPhases()` reads ai-parsed-plan.md first before falling back to PLAN.md.
- Run `npm run lint` and `npm test` before claiming work is complete. Pre-existing errors are not exempt — fix them.
- After lint, tests, and visual verification (if UI-facing) pass, run a Codex review if either `codex:review` or `codex:rescue` is listed in available skills.
  - If `codex:review` is available: run `/codex:review --wait --scope working-tree`.
  - If only `codex:rescue` is available: spawn a subagent (type `codex:codex-rescue`) with prompt "review `git diff`. issues only. terse. no preamble. if clean: LGTM. under 200 words."
- Read Codex findings and fix them. After fixes, re-run lint, tests, and `/visual-verification` (if UI-facing). Then re-run the same Codex review method.
- Loop until Codex review is clean or 3 review cycles complete. If issues remain after 3 cycles, report them to the user.
- Auto-fix Codex findings without asking. This overrides the `codex:codex-result-handling` default of requiring user approval before applying fixes.
- `/codex:adversarial-review` is not part of the automated loop. Use only when explicitly requested.
- Never suggest the user test something manually when you can do it yourself.
- Critic agents before ExitPlanMode must cover: (1) root cause correctness / feasibility, (2) scope completeness / missing steps (when interfaces change, grep `src/test/` for all mock sites of the changed class), (3) alternatives / UX impact. Run in parallel. End all critic prompts with "terse. bullets only. no preamble. if clean: LGTM."
- One critic agent must always verify the plan includes `/visual-verification` for every phase that changes user-visible behavior (sidebar, status bar, webview, notifications). "This is backend logic" is not a valid exemption if the change affects what the user sees. "This is state derivation, not rendering" is not a valid exemption. Visual verification is dynamic testing — it verifies app behavior the way a real user would. Any change that alters what the user experiences requires it. Trace the call chain to the UI before deciding.
- One critic must verify the plan contains no manual verification steps when `/visual-verification` or other automation exists.
- When reviewing interfaces that pass mutable state (wiring contexts, dependency injection), critic agents should check: are any fields stale snapshots of values that can change at runtime? Prefer getters or callbacks over copied values.

## Writing Style

- AI-facing files (CLAUDE.md, skills): imperative voice, flat bullet lists, one rule per line, no prose. Front-load constraints. Add YAML frontmatter to skill files.
- Remove redundancy. One rule per line.

## Output Discipline

- No trailing summaries. Do not restate what was just done.
- No preamble ("I'll now...", "Let me..."). Start with the action or answer.
- No filler ("Great question", "Certainly", "I'd be happy to").
- Prefer bullet lists over prose for status updates and findings.
- Completion reports: state result and next step only.

## TDD Addendum

- For bug fixes: if your first test passes immediately, you are likely testing the wrong code path. Trace the actual broken path before writing the test. The test must exercise the code that contains the bug, not a parallel path that happens to work.
- For multi-component bugs: trace the data flow backward from symptom to source before choosing where to fix.
- Document which component owns the broken transformation before writing the fix.
- When an issue attributes a bug to a specific function, verify the attribution. If the function's inputs are already wrong, the fix belongs upstream.
- When adding public methods to widely-mocked classes, grep for the class/interface name across `src/test/**/*.test.ts` before writing the implementation. Update all mock sites in the same phase.
- When adding `reset()` or cleanup logic to a stateful manager, audit the wiring closure (`sessionWiring.ts`) for local variables (`lastProgress`, etc.) and `SidebarMutableState` fields (`cost`, `todoDone`, `todoTotal`) that also need resetting.
- Do not add new closure-scoped tracking state to `wireSessionEvents` for data that `buildFullState()` needs. Use `SidebarMutableState` fields instead — closure state is invisible to `buildFullState()` and all its callers (MCP bridge, webview init, archive refresh).

## Continuous Improvement

- Raise friction points and missing guardrails at natural pause points. Suggest concrete changes targeting CLAUDE.md, skills/hooks, or MCP tools/plugins.
- Behavioral corrections go in CLAUDE.md (cross-cutting) or the relevant skill file (workflow-scoped). Never use the memory system for this project.

## Bash Truncation Hook (.claude/hooks/bash-truncate.mjs)

- NEVER work around the hook by modifying commands to avoid pattern matching. Fix the hook instead.
- NEVER wrap commands in `sh -c` or `bash -c` to bypass the hook.
- NEVER remove or disable the hook entry in `.claude/settings.json`.
- On false positive (useful output truncated): add command pattern to ALLOWLIST in bash-truncate.mjs.
- On false negative (verbose output passed through): add pattern to BOUNDED_PIPES.
- After editing, verify: `node .claude/hooks/bash-truncate.mjs <<< '{"tool_input":{"command":"TEST_CMD"}}'`
- To disable for a session without editing the hook: `export OXVEIL_BASH_HOOK=0`

## Documentation

When implementation changes affect user-facing behavior, update stale sections in README.md and make sure technical big picture is uptodate in ARCHITECTURE.md.

**ADR workflow (mandatory):** For architectural decisions (new pattern, technology choice, significant design change): assign next number from `docs/adr/`, create `docs/adr/NNNN-slug.md` using the [template](docs/adr/TEMPLATE.md), update `docs/adr/README.md`.

**Workflow state docs (mandatory):** When modifying state machines or UI state derivation (`sidebarState.ts`, `sessionState.ts`, `statusBar.ts`, `planPreviewPanel.ts`, `sidebarMessages.ts`, `sessionWiring.ts`, `activateSidebar.ts`, `types.ts`), update `docs/workflow/states.md`. Run `npm test` to catch state enumeration drift.
