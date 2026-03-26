# 1. Automated release system adapted from claudeloop

**Date:** 2026-03-26
**Status:** Accepted

## Context

Oxveil needs a release pipeline. Claudeloop has a working system (`release.sh` + GitHub Actions) but targets shell scripts and GitHub tarballs. Oxveil targets VS Code Marketplace via `vsce`.

## Decision

Adapt claudeloop's release pattern to the VS Code extension ecosystem:

- **Release script** (`scripts/release.mjs`): Node.js instead of shell. Reads version from `package.json`, auto-detects bump type from conventional commits (with scoped commit support), runs `npm version`, commits, tags.
- **GitHub Actions** (`.github/workflows/release.yml`): `workflow_dispatch` trigger. Builds, lints, tests, packages `.vsix`, publishes exact validated artifact via `--packagePath`.
- **Standard semver** — no odd/even minor convention for pre-release. VS Code's `--pre-release` flag handles pre-release as a publish-time boolean.
- **Single marketplace target** — VS Code Marketplace only. Open VSX deferred until requested.
- **No static CHANGELOG** — `gh release create --generate-notes` handles release notes.

## Consequences

- Positive: One-click releases from GitHub Actions UI, auto-bump from conventional commits, exact artifact published.
- Positive: Node.js release script avoids shell portability issues (sed, sort -V).
- Negative: No Open VSX coverage for VS Code fork users (deferred, not rejected).
- Negative: First release requires explicit bump type (no prior tags for auto-detection).
