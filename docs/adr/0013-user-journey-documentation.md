# 13. User journey documentation with LLM-consumable workflow spec

**Date:** 2026-04-15
**Status:** Accepted

## Context

Oxveil has four UI state systems — sidebar view projection, session state machine, status bar projection, and plan preview states — spread across multiple source files. No unified documentation exists for LLMs or humans to reference when modifying state transitions, message types, or view rendering. This leads to inconsistent changes and makes onboarding harder.

The issue (chmc/oxveil#22) requests synchronized human-readable and machine-readable artifacts covering the complete user journey from activation to plan completion.

## Decision

Create a single unified workflow spec at `docs/workflow/states.md` with:

- **YAML frontmatter** for machine-readable metadata
- **Embedded Mermaid diagrams** (GitHub renders natively) — statechart for SessionState, flowcharts for derived projections
- **State tables and transition matrices** with function-name cross-references (not line numbers)
- **Decision tables** for derived projections (SidebarView, StatusBar) instead of statecharts, since these are pure-function projections, not state machines
- **Message schemas** enumerating all webview command/update types
- **10 user stories** with as-is, to-be, and gap analysis

Maintenance strategy:

- **Vitest test** validates documented state enumerations match TypeScript types
- **Claude skill** (`.claude/skills/workflow-docs/SKILL.md`) reminds contributors which spec sections to update per source file
- **CLAUDE.md rule** makes workflow doc updates mandatory for state-related changes

One file instead of two (no separate `.mermaid` file) to eliminate a sync point. The LLM spec is the single source of truth.

## Consequences

- (+) LLMs can consume the spec as context for safer state-related edits
- (+) Visual Mermaid diagrams render on GitHub for human review
- (+) Test + skill + CLAUDE.md rule create three layers of drift prevention
- (+) Decision tables accurately represent derived projections (vs misleading statecharts)
- (-) Manual maintenance cost for the spec file, mitigated by the three-layer maintenance strategy
