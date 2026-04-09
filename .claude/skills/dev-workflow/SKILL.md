---
name: dev-workflow
description: Trunk-based development and feature flag rules for Oxveil.
---

# Development Workflow

## Trunk-Based Development

- All work lands on `main`. Keep `main` releasable at all times.
- Use short-lived branches (< 1 day) only for pull requests. Merge and delete immediately.
- Do not create long-lived, release, beta, or version branches.
- Do not cherry-pick between branches.

## Feature Flags

No feature flags until Oxveil is published to the VS Code Marketplace. Ship all features unconditionally.

### Post-Publication Policy

- Use individual `oxveil.features.<name>` boolean settings, each `default: false`.
- End each description with `*(experimental)*`.
- Use per-feature `when` clause: `"when": "config.oxveil.features.<name>"`.

### Flag Lifecycle

1. **Ship** — Add flag with `default: false`.
2. **Stabilize** — Flip to `default: true`. Add `// FLAG:remove-after:YYYY-MM-DD` at every flag check.
3. **Clean up** — Next release: remove setting, code guards, and `when` clauses. Do not let flags accumulate.

## Enforcement

These are conventions for Claude Code. A human or explicit user instruction can override them. For hard enforcement, configure branch protection rules and pre-push git hooks on the GitHub remote.
