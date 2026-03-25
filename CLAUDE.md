## Project

- Oxveil is a VS Code extension providing a GUI for [claudeloop](https://github.com/chmc/claudeloop).
- Both repos share the same author. Coordinate and ship changes across both repos simultaneously when needed.

## Git

- Use conventional commits.
- Never add yourself as co-author.

## Development Process

- Follow trunk-based development. See `.claude/skills/trunk-based-dev.md`.
- Gate all unreleased features behind feature flags. See `.claude/skills/feature-flags.md`.
- Do not create long-lived branches.
- Do not ship ungated experimental features.

## Writing Style

- Write all AI-facing files (CLAUDE.md, skill files, memory files) in LLM-optimized format.
- Use imperative voice and direct commands.
- Front-load constraints and hard rules.
- Use flat bullet lists, not prose paragraphs.
- One rule per line. Remove redundancy.
- Add YAML frontmatter (`name`, `description`) to all skill files.
