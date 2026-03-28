# 5. Removal of feature flag system before marketplace publication

**Date:** 2026-03-28
**Status:** Accepted

## Context

Oxveil used an `oxveil.experimental` boolean setting as a feature flag gate. When `false` (the default), the extension activated but silently did nothing. This was introduced early in development to prevent incomplete features from affecting users during pre-publication development.

As of v0.3, all core features (monitoring, config wizard, plan editing, CodeLens, replay viewer) are implemented and stable. The extension is approaching marketplace publication.

## Decision

Remove the feature flag system entirely:

- **Delete `core/featureFlag.ts`** and its test file.
- **Remove the `oxveil.experimental` setting** from `package.json` contributes.
- **Remove the gate check** from `extension.ts` activation. The extension activates unconditionally.
- **No replacement mechanism.** Individual features do not need flags — they are either shipped or not shipped. If a feature needs gating in the future, introduce a targeted flag at that time rather than maintaining a global gate.

## Consequences

- Positive: Simpler activation path. No hidden "nothing works" failure mode for new users who forget to set the flag.
- Positive: Removes a developer gotcha — the most common setup issue was forgetting to enable `oxveil.experimental`.
- Positive: Cleaner codebase — one less module, one less setting, one less test file.
- Negative: No built-in way to hide incomplete features during future development. Accepted because trunk-based development with short-lived work mitigates this, and a targeted flag can be added if needed.
