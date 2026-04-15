## Hard Rules

- NEVER recursively delete the `.claudeloop/` directory. It is managed by claudeloop and contains live runtime state.
- During mock cleanup, only remove individual mock-created files (those newer than `.MOCK_SESSION` marker). Never `rm -rf .claudeloop`.
- NEVER use `keystroke` via osascript for destructive operations (Cmd+W, Cmd+Q, Cmd+Shift+W). `keystroke` always targets the system frontmost app, not the `tell process` target — it can kill the terminal. Use accessibility menu clicks instead (`click menu item` of the target process's menu bar), which are process-scoped.
- For non-destructive keystrokes (Cmd+Shift+P, typing text, Enter, Escape), always `set frontmost to true` and `AXRaise` the target window first.
- NEVER edit non-plan files while plan mode is active. Plan mode restricts edits to the plan file only. Note needed changes in the plan and apply after exiting.
- NEVER `await` an external process (execFile, spawn, fetch) without a timeout in `activate()`. Use `Promise.race` with 5s timeout. A hanging CLI blocks `resolveWebviewView` and the sidebar stays on the loading spinner forever.
- Wrap non-critical awaits in `activate()` (bridge startup, optional detection) in try-catch. Activation must always complete.

## Project

- Oxveil is a VS Code extension for managing AI coding workflows, powered by [claudeloop](https://github.com/chmc/claudeloop).
- Both repos share the same author. Coordinate and ship changes across both repos simultaneously when needed.

## Git

- Use conventional commits.
- Never add yourself as co-author.

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

## Quality Gates

- Run `/visual-verification` for every UI-facing plan task. Do not report done until it passes. Non-UI tasks do not require visual verification unless the plan explicitly requests it.
- After every screenshot capture, read the image and describe what you see in concrete terms. Do not assume success from blurry/small screenshots. Verify keystrokes reached the intended target by checking for typed text.
- Run `npm run lint` and `npm test` before claiming work is complete. Pre-existing errors are not exempt — fix them.
- Never suggest the user test something manually when you can do it yourself.
- Before requesting plan approval, launch 2-3 critic agents from different angles (feasibility, scope/completeness, alternatives). Never rush to ExitPlanMode without critical review.

## Writing Style

- AI-facing files (CLAUDE.md, skills): imperative voice, flat bullet lists, one rule per line, no prose. Front-load constraints. Add YAML frontmatter to skill files.
- Remove redundancy. One rule per line.

## Continuous Improvement

- Raise friction points and missing guardrails at natural pause points. Suggest concrete changes targeting CLAUDE.md, skills/hooks, or MCP tools/plugins.
- Behavioral corrections go in CLAUDE.md (cross-cutting) or the relevant skill file (workflow-scoped). Never use the memory system for this project.

## Documentation

When implementation changes affect user-facing behavior, update stale sections in README.md and make sure technical big picture is uptodate in ARCHITECTURE.md.

**ADR workflow (mandatory):** For architectural decisions (new pattern, technology choice, significant design change): assign next number from `docs/adr/`, create `docs/adr/NNNN-slug.md` using the [template](docs/adr/TEMPLATE.md), update `docs/adr/README.md`.

**Workflow state docs (mandatory):** When modifying state machines or UI state derivation (`sidebarState.ts`, `sessionState.ts`, `statusBar.ts`, `planPreviewPanel.ts`, `sidebarMessages.ts`, `sessionWiring.ts`, `activateSidebar.ts`, `types.ts`), update `docs/workflow/states.md`. Run `npm test` to catch state enumeration drift.
