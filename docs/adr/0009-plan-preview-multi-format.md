# 9. Plan Preview Multi-Format Support

**Date:** 2026-04-06
**Status:** Accepted

## Context

Plan Preview watched only `${workspaceRoot}/.claude/plans/*.md` and parsed only `## Phase N: Title` format. Native Claude Code plan mode writes to `~/.claude/plans/`, and Superpowers writes design specs to `docs/superpowers/specs/` and implementation plans to `docs/superpowers/plans/`. Plan Preview showed nothing for either workflow.

Users can run multiple Claude sessions simultaneously, each writing plan files. Plan Preview needed to identify which file belongs to the current Plan Chat session.

## Decision

**Multi-location watching:** Watch three directories using `vscode.RelativePattern` (required for paths outside the workspace):
- `~/.claude/plans/*.md` — native plan mode
- `docs/superpowers/specs/*.md` — Superpowers design specs
- `docs/superpowers/plans/*.md` — Superpowers implementation plans

**Parser fallback chain:** Try parsers in order:
1. Phase parser (`## Phase N: Title`) — existing, for Oxveil Plan Chat format
2. Section parser (generalized `### <Keyword> N: Title` or `### N. Title`) — new, covers Superpowers Task/Step/numbered formats
3. Formatted markdown rendering — fallback for free-form plans with no numbered sections

**Session pinning:** Record `Date.now()` when Plan Chat starts. Pin to the first file whose `birthtimeMs` exceeds the session start time. Pinned file is tracked until session ends.

## Consequences

**Positive:**
- Plan Preview works with native plan mode, Superpowers, and mixed workflows
- Multi-session safety via timestamp pinning
- Free-form plans render as formatted markdown instead of raw `<pre>` blocks

**Negative:**
- `birthtimeMs` may be unreliable on older Linux kernels (acceptable — primary target is macOS)
- `RelativePattern` with `Uri.file()` for home directory watching is less common than workspace-relative patterns
- Three watchers consume more resources than one (negligible for file system watchers)
