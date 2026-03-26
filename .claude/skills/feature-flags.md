---
name: feature-flags
description: Rules for gating unreleased features behind feature flags. Currently deferred until marketplace publication.
---

# Feature Flags

No feature flags until Oxveil is published to the VS Code Marketplace. Ship all dev features unconditionally.

## Post-Publication: Per-Feature Flags

- Use individual `oxveil.features.<name>` boolean settings, each `default: false`.
- End each description with `*(experimental)*`.
- Use per-feature `when` clause: `"when": "config.oxveil.features.<name>"`.

## Flag Lifecycle

1. **Ship** — Add flag with `default: false`.
2. **Stabilize** — Flip to `default: true`. Add `// FLAG:remove-after:YYYY-MM-DD` at every flag check.
3. **Clean up** — In the next release, remove the flag: delete the setting from `package.json`, remove code guards, remove `when` clauses.

Do not let flags accumulate. Cleanup is mandatory.
