# Data Flow Tracing Guardrail

## Problem

GitHub issue #28 attributed 3 bugs to `deriveViewState()`. Investigation revealed one was actually in `sessionState.ts` — the symptom appeared in the view derivation layer, but the root cause was upstream in the state machine. The existing TDD Addendum catches wrong *test* paths but not wrong *fix* locations.

## Design

Two changes: a CLAUDE.md rule (always-on) and a standalone skill (detailed procedure).

### 1. CLAUDE.md TDD Addendum

Add after the existing "trace the actual broken path" rule:

- For multi-component bugs: trace the data flow backward from symptom to source before choosing where to fix.
- Document which component owns the broken transformation before writing the fix.
- When an issue attributes a bug to a specific function, verify the attribution. If the function's inputs are already wrong, the fix belongs upstream.

### 2. Standalone skill: `.claude/skills/data-flow-tracing/SKILL.md`

**Frontmatter**:

```yaml
---
name: data-flow-tracing
description: Trace data flow backward from symptom to source for multi-layer bugs. Use when a bug symptom appears in a derived layer but the root cause may be upstream.
---
```

**When to invoke**: Bug symptoms appear in a derived/projection layer (sidebar view, status bar, rendered HTML) but the root cause may be upstream (state machine, wiring, watcher).

**Checklist**:

1. **Map the pipeline** — Starting from the symptom, list every component in the data flow chain (e.g., `lockWatcher -> sessionState -> sidebarState -> sidebarHtml`). Use grep/read to trace the actual call chain, don't guess.
2. **Instrument boundaries** — For each boundary, check what value crosses it. Read tests or add logging to verify the value is correct at each handoff point.
3. **Narrow the fault** — Identify the first boundary where the value goes wrong. That component owns the fix.
4. **Document the trace** — Before writing the fix, note in the plan/commit which component was suspected vs. which actually owns the bug, and why.

Intentionally small. Layers on top of systematic-debugging for the specific pattern of "symptom in layer N, cause in layer N-1."

## Files to modify

- `CLAUDE.md` — TDD Addendum section
- `.claude/skills/data-flow-tracing/SKILL.md` — new file (auto-discovered from `.claude/skills/`, no registration needed)

## Verification

- Read CLAUDE.md and confirm the new rules follow existing style (imperative, flat bullets, one rule per line).
- Read the skill file and confirm it has YAML frontmatter, a when-to-invoke section, and a numbered checklist.
- No code changes, so no tests or lint needed.
