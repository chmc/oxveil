# Data Flow Tracing Guardrail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CLAUDE.md guardrail and a standalone skill that enforce tracing data flow before assuming where to fix multi-component bugs.

**Architecture:** Two documentation files — a CLAUDE.md rule addition (always-on) and a new `.claude/skills/data-flow-tracing/SKILL.md` (invocable procedure). No code changes.

**Tech Stack:** Markdown only.

**Spec:** `docs/superpowers/specs/2026-04-16-data-flow-tracing-guardrail-design.md`

---

### Task 1: Add TDD Addendum rules to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` — TDD Addendum section (after existing "trace the actual broken path" rule)

- [ ] **Step 1: Add the three new rules**

After the existing rule at line 66, add:

```markdown
- For multi-component bugs: trace the data flow backward from symptom to source before choosing where to fix.
- Document which component owns the broken transformation before writing the fix.
- When an issue attributes a bug to a specific function, verify the attribution. If the function's inputs are already wrong, the fix belongs upstream.
```

- [ ] **Step 2: Verify style**

Read the updated TDD Addendum section. Confirm:
- Imperative voice
- Flat bullet list
- One rule per line
- No prose

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add data-flow tracing rules to TDD Addendum"
```

---

### Task 2: Create data-flow-tracing skill

**Files:**
- Create: `.claude/skills/data-flow-tracing/SKILL.md`

- [ ] **Step 1: Create the skill file**

```markdown
---
name: data-flow-tracing
description: Trace data flow backward from symptom to source for multi-layer bugs. Use when a bug symptom appears in a derived layer but the root cause may be upstream.
---

# Data Flow Tracing

## When to Invoke

Bug symptoms appear in a derived/projection layer (sidebar view, status bar, rendered HTML) but the root cause may be upstream (state machine, wiring, watcher).

## Constraints

- Layers on top of systematic-debugging. Use that skill first for general investigation; use this one when you suspect a multi-layer data flow issue.
- Do not skip steps. The checklist prevents fixing the wrong component.

## Checklist

1. **Map the pipeline** — Starting from the symptom, list every component in the data flow chain (e.g., `lockWatcher → sessionState → sidebarState → sidebarHtml`). Use grep/read to trace the actual call chain, don't guess.
2. **Instrument boundaries** — For each boundary, check what value crosses it. Read tests or add logging to verify the value is correct at each handoff point.
3. **Narrow the fault** — Identify the first boundary where the value goes wrong. That component owns the fix.
4. **Document the trace** — Before writing the fix, note in the plan/commit which component was suspected vs. which actually owns the bug, and why.
```

- [ ] **Step 2: Verify structure**

Read the created file. Confirm:
- YAML frontmatter with `name` and `description`
- "When to Invoke" section
- "Constraints" section
- Numbered checklist

Compare against existing skill format in `.claude/skills/workflow-docs/SKILL.md`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/data-flow-tracing/SKILL.md
git commit -m "docs: add data-flow-tracing skill for multi-layer bug investigation"
```
