## Project

- Oxveil is a VS Code extension for managing AI coding workflows, powered by [claudeloop](https://github.com/chmc/claudeloop).
- Both repos share the same author. Coordinate and ship changes across both repos simultaneously when needed.

## Git

- Use conventional commits.
- Never add yourself as co-author.

## Development Process

- Follow trunk-based development. See `.claude/skills/trunk-based-dev.md`.
- Gate all unreleased features behind feature flags. See `.claude/skills/feature-flags.md`.
- Do not create long-lived branches.
- Do not ship ungated experimental features.
- Automate processes (CI, releases, testing) from the start. Do not defer to manual workflows.

## Verification

**Visual verification (mandatory):** After completing UI-facing features, invoke `/visual-verification`. Do not report the task as done until visual verification passes. Skip only for documentation-only or test-only changes with no implementation modifications.

**Autonomous verification (mandatory):** Never suggest the user test something manually when you can do it yourself. If you can build, launch EDH, screenshot, and compare — do it without asking.

## Writing Style

- Write all AI-facing files (CLAUDE.md, skill files, memory files) in LLM-optimized format.
- Use imperative voice and direct commands.
- Front-load constraints and hard rules.
- Use flat bullet lists, not prose paragraphs.
- One rule per line. Remove redundancy.
- Add YAML frontmatter (`name`, `description`) to all skill files.

## Continuous improvement (mandatory)

When you notice a friction point, missing guardrail, or automation opportunity, raise it and suggest a concrete change targeting **CLAUDE.md**, **skills/hooks**, or **MCP tools/plugins**. Keep suggestions brief and actionable. Don't derail the current task — note it at a natural pause point.

When a behavioral correction applies to this project, update CLAUDE.md or the relevant skill file — don't write a memory as a substitute. Rules scoped to a single workflow (e.g., releases, rebasing) belong in that workflow's skill file. CLAUDE.md is for cross-cutting project rules only. Memory is for ephemeral context and cross-project user preferences.

## Documentation

When implementation changes affect user-facing behavior, update stale sections in README.md and make sure technical big picture is uptodate in ARCHITECTURE.md.

**ADR workflow (mandatory):** For architectural decisions (new pattern, technology choice, significant design change): assign next number from `docs/adr/`, create `docs/adr/NNNN-slug.md` using the [template](docs/adr/TEMPLATE.md), update `docs/adr/README.md`. Examples: changing shell dialect, adding dependency, altering state model, choosing serialization format, modifying execution pipeline.
