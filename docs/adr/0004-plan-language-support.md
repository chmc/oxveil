# 4. Dedicated language ID + TextMate grammar for plan files

**Date:** 2026-03-28
**Status:** Accepted

## Context

v0.3 adds first-class editing support for claudeloop plan files (`PLAN.md`). Plan files use Markdown with structured conventions (phase headers, dependency annotations, gate declarations). The extension needs syntax highlighting and CodeLens actions (run phase, view diff) anchored to phase boundaries.

Options considered:
- **Markdown injection grammar** — inject additional scopes into the built-in Markdown grammar. Avoids a new language ID but is fragile (depends on VS Code's Markdown grammar internals) and cannot override Markdown's own scoping.
- **Semantic tokens provider** — provide token types via the Language Server Protocol. Powerful but heavyweight for pattern-based highlighting, requires an active extension host, and doesn't work in file previews.
- **Dedicated language ID + TextMate grammar** — register `claudeloop-plan` as a new language associated with `PLAN.md`. Full control over scoping. TextMate grammars are declarative, fast, and work without the extension host running.

## Decision

Register a dedicated language ID (`claudeloop-plan`) with a TextMate grammar (`syntaxes/plan.tmLanguage.json`):

- **Language ID:** `claudeloop-plan`, associated with `PLAN.md` filename pattern in `package.json`.
- **Grammar:** TextMate JSON grammar in `syntaxes/plan.tmLanguage.json`. Scopes phase headers, dependency lines, gate declarations, and status markers.
- **CodeLens:** `planCodeLens.ts` provides CodeLens actions anchored to phase header patterns. Registered for the `claudeloop-plan` language ID.
- **AI Parse Plan command:** Parses plan content with configurable granularity, registered in the command palette.
- **Preserves Markdown readability.** Plan files remain valid Markdown. The custom language ID adds structure on top — users can switch back to Markdown mode if needed.

## Consequences

- Positive: Full control over syntax scopes. No dependency on VS Code's Markdown grammar internals.
- Positive: TextMate grammar is declarative and fast — works in file previews, remote sessions, and without extension host.
- Positive: Clean CodeLens registration scoped to `claudeloop-plan` language only.
- Negative: Users lose built-in Markdown features (preview, outline) unless they manually switch language mode. Mitigated by the grammar including Markdown base patterns.
- Negative: Filename association (`PLAN.md`) is rigid — users with non-standard plan filenames must manually set the language.
