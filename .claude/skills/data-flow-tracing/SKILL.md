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
