---
name: complex-feature-planning
description: Checklist to prevent drift and overengineering in multi-phase feature plans
trigger: planning features with >3 phases, IPC, cross-process communication, or new storage locations
---

## Checklist

### Before Writing the Plan

- [ ] **Spike first** — if plan involves IPC, new VS Code APIs, or untested CLI behavior: build a 30-min prototype before designing phases. Document as `Spike: [what you tested and result]` in the plan.
- [ ] **Mark unverified assumptions** — any assumption about external behavior (VS Code API, hook execution order, CLI flags) gets `[UNVERIFIED]` tag in plan. Add Phase 0 to verify them before implementation. Plans with 4+ phases and unresolved `[UNVERIFIED]` tags are blocked at ExitPlanMode.
- [ ] **No spike needed?** — add `[SPIKE-NOT-NEEDED: reason]` with approved category: `single api call` | `well-documented pattern` | `config only` | `refactor only` | `trivial change`. Plans with 4+ phases require this or spike evidence.
- [ ] **Simplest-first** — can the goal be achieved with zero new files? Without polling? Without bidirectional IPC? Write that version first.
- [ ] **Location research** — if storing files/state: list candidate locations (workspace vs storageUri vs globalStorageUri vs ~/.claude), check VS Code lifecycle docs, grep `grep -r "globalStorageUri\|workspaceState\|storageUri" src/`. Commit to ONE location before coding.

### During Implementation

- [ ] **Issue scope lock** — every commit references current issue #N or is `chore:`/`docs:` tooling-only. "While I'm here" fix → stop, create new issue, don't inline.
- [ ] **Switching issues mid-session** — commit all #N work first, then switch. Don't mix commits.

### Before ExitPlanMode

- [ ] State the minimum viable implementation in 1-2 sentences
- [ ] If plan has polling, UUID generation, or request/response file pairs — justify why simpler alternative won't work

## Background

Derived from ExitPlanMode intercept (#129) retrospective. That feature took 30 commits due to:
- 8-phase initial design → final solution was hook writes file, watcher calls function (no polling, no UUIDs)
- Hook install location changed 4 times (missing upfront lifecycle research)
- CSS issue #131 interspersed mid-session (no scope lock)
- `code --command` assumed to work — VS Code issue #174082 blocked it, discovered mid-implementation
