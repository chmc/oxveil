---
name: feature-flags
description: Rules for gating unreleased features behind feature flags with a tiered approach and mandatory cleanup lifecycle.
---

# Feature Flags

Gate all unreleased or experimental features behind feature flags.

## Tier Selection

### v0.1–v0.2: Single gatekeeper flag

- One `oxveil.experimental` boolean setting in `package.json` `contributes.configuration`, `default: false`.
- All experimental features check this single flag.
- Code guard: `vscode.workspace.getConfiguration("oxveil").get<boolean>("experimental")`.
- UI gating via `when` clause: `"when": "config.oxveil.experimental"`.

### v0.3+: Per-feature flags

- Use individual `oxveil.features.<name>` boolean settings, each `default: false`.
- End each description with `*(experimental)*`.
- Use per-feature `when` clause: `"when": "config.oxveil.features.<name>"`.

## Flag Lifecycle

1. **Ship** — Add flag with `default: false`.
2. **Stabilize** — Flip to `default: true`. Add `// FLAG:remove-after:YYYY-MM-DD` at every flag check.
3. **Clean up** — In the next release, remove the flag: delete the setting from `package.json`, remove code guards, remove `when` clauses.

Do not let flags accumulate. Cleanup is mandatory.

## When Flags Are Not Needed

Ship features without flags if they belong to the current stable milestone. Only gate work-in-progress, experimental, or ahead-of-milestone features.
