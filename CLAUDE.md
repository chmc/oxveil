## Hard Rules

- NEVER recursively delete the `.claudeloop/` directory. It is managed by claudeloop and contains live runtime state.
- During mock cleanup, only remove individual mock-created files (those newer than `.MOCK_SESSION` marker). Never `rm -rf .claudeloop`.
- NEVER use `keystroke` via osascript for destructive operations (Cmd+W, Cmd+Q, Cmd+Shift+W). `keystroke` always targets the system frontmost app, not the `tell process` target — it can kill the terminal. Use accessibility menu clicks instead (`click menu item` of the target process's menu bar), which are process-scoped.
- For non-destructive keystrokes (Cmd+Shift+P, typing text, Enter, Escape), always `set frontmost to true` and `AXRaise` the target window first.
- NEVER edit non-plan files while plan mode is active. Plan mode restricts edits to the plan file only. If you discover a needed change (e.g., CLAUDE.md update), note it in the plan and apply it after exiting plan mode.

## Project

- Oxveil is a VS Code extension for managing AI coding workflows, powered by [claudeloop](https://github.com/chmc/claudeloop).
- Both repos share the same author. Coordinate and ship changes across both repos simultaneously when needed.

## Git

- Use conventional commits.
- Never add yourself as co-author.

## Development Process

- Follow trunk-based development. See `.claude/skills/trunk-based-dev/SKILL.md`.
- Oxveil is not yet published. Do not gate features behind feature flags — ship directly. Re-evaluate when publishing to VS Code Marketplace.
- Do not create long-lived branches.
- Automate processes (CI, releases, testing) from the start. Do not defer to manual workflows.

## Skill Checklist Discipline

- When a skill has a checklist, read the FULL checklist first, create a task for each item, then execute in order.
- Do not skip, merge, or shortcut checklist items. "This is simple enough" is not a valid reason — the checklist exists to prevent exactly that reasoning.
- Each skill defines its own terminal action. Do not substitute a different exit (e.g., calling `ExitPlanMode` from brainstorming). Read the skill's terminal state before starting.
- If plan mode activates during a skill, the skill's checklist still governs — plan mode is a tool within the skill, not a replacement for it.

## Following Plan Instructions

When executing a phase under claudeloop, the phase description is your specification. Follow it literally:

- If the description says **"Action: `/skill-name`"**, invoke that skill via the Skill tool. Do not substitute programmatic checks for a skill invocation. Do not rationalize skipping it.
- If the description contains a **checklist**, complete every item. Do not mark the phase done with items unchecked.
- If the description says **"Compare against"** a mockup or reference, you must read that file and compare.
- "I already have evidence" is not a reason to skip a specified action. The plan author chose that action deliberately.

## Verification

**Visual verification (mandatory):** Every UI-facing task in a plan must include a visual verification gate. Invoke `/visual-verification`. Do not report the task as done until visual verification passes. Non-UI tasks (parsers, types, tests) do not require visual verification unless the plan explicitly requests it.

**Autonomous verification (mandatory):** Never suggest the user test something manually when you can do it yourself. If you can build, launch EDH, screenshot, and compare — do it without asking.

**Zero errors (mandatory):** Run `npm run lint` and `npm test` before claiming work is complete. Pre-existing errors are not exempt — fix them. Work is not done until both pass clean.

**Plan review (mandatory):** Before requesting plan approval, launch 2-3 critic agents from different angles (feasibility, scope/completeness, alternatives). Never rush to ExitPlanMode without deep critical review.

## Writing Style

- Write all AI-facing files (CLAUDE.md, skill files) in LLM-optimized format.
- Use imperative voice and direct commands.
- Front-load constraints and hard rules.
- Use flat bullet lists, not prose paragraphs.
- One rule per line. Remove redundancy.
- Add YAML frontmatter (`name`, `description`) to all skill files.

## Continuous improvement (mandatory)

When you notice a friction point, missing guardrail, or automation opportunity, raise it and suggest a concrete change targeting **CLAUDE.md**, **skills/hooks**, or **MCP tools/plugins**. Keep suggestions brief and actionable. Don't derail the current task — note it at a natural pause point.

When a behavioral correction applies to this project, update CLAUDE.md or the relevant skill file. Rules scoped to a single workflow (e.g., releases, rebasing) belong in that workflow's skill file. CLAUDE.md is for cross-cutting project rules only. NEVER use the memory system for this project — all persistent context belongs in CLAUDE.md or skill files.

## Documentation

When implementation changes affect user-facing behavior, update stale sections in README.md and make sure technical big picture is uptodate in ARCHITECTURE.md.

**ADR workflow (mandatory):** For architectural decisions (new pattern, technology choice, significant design change): assign next number from `docs/adr/`, create `docs/adr/NNNN-slug.md` using the [template](docs/adr/TEMPLATE.md), update `docs/adr/README.md`. Examples: changing shell dialect, adding dependency, altering state model, choosing serialization format, modifying execution pipeline.
