---
name: self-optimize
description: Analyze and optimize instruction surface (CLAUDE.md, skills, settings, hooks). Find dead refs, redundancy, verbosity. Show diff + token delta. Apply with --apply.
---

# Self-Optimize

## When to Invoke
- `/self-optimize` — manual
- After editing multiple `.claude/` files in a session
- When Claude notices instruction bloat or redundancy during normal work

## Phase 1: Inventory

Scan and compute tokens (chars/4):
- `CLAUDE.md` (project root)
- `.claude/skills/*/SKILL.md`
- `.claude/settings.json`, `.claude/settings.local.json`
- `.claude/hooks/*`

## Phase 2: Analyze

Find:
- **Dead refs** — backtick paths/functions that don't exist in codebase (`stat`, `grep -r`)
- **Redundancy** — rules expressing the same constraint in multiple files or sections
- **Verbosity** — rules that can be compressed without losing meaning or precision

## Phase 3: Report

Output format:

```
### Token Summary
| File | Before | After | Δ |
|------|--------|-------|---|
| CLAUDE.md | 2,481 | 2,200 | -281 (-11%) |
| **Total** | 9,363 | 8,900 | -463 (-5%) |

### [1] CLAUDE.md — dead ref (high confidence)
[unified diff]

### [2] CLAUDE.md — redundancy (medium confidence)
[unified diff]
```

Skip files with no changes. Show confidence (high/medium) per change.

## Phase 4: Plan

If changes found:
1. Write proposed changes to plan file
2. Call ExitPlanMode for user approval
3. On approval: apply edits, `git diff` to confirm

No `--apply` flag. Always goes through plan approval.
