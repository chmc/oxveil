---
name: trunk-based-dev
description: Rules for trunk-based development — all work lands on main, no long-lived branches.
---

# Trunk-Based Development

All development happens on `main`.

## DO

- Commit and merge all work to `main`.
- Use short-lived branches (< 1 day) only for pull requests. Merge and delete immediately.
- Keep `main` releasable at all times.
- Gate unfinished features behind feature flags.

## DO NOT

- Create long-lived, release, beta, or version branches.
- Merge broken code to `main`.
- Cherry-pick between branches.

## Enforcement

These are conventions for Claude Code. A human or explicit user instruction can override them. For hard enforcement, configure branch protection rules and pre-push git hooks on the GitHub remote.
