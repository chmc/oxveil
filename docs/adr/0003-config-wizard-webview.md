# 3. Config wizard webview for .claudeloop.conf

**Date:** 2026-03-28
**Status:** Accepted

## Context

v0.3 adds a graphical configuration editor for `.claudeloop.conf`. Previously, users configured claudeloop via VS Code settings (a subset of CLI flags). Full configuration requires editing `.claudeloop.conf` directly — a flat key=value file with no validation, no discoverability, and easy typos.

Options considered:
- **VS Code settings only** — expose all claudeloop options as VS Code settings. Simple but creates a parallel config surface that diverges from the CLI's native config file. Users switching between VS Code and terminal workflows see different configs.
- **Webview form with bidirectional file sync** — render `.claudeloop.conf` as a form in a webview panel. Reads from and writes back to the file. The file remains the source of truth.

## Decision

Implement a webview form with bidirectional file ownership:

- **File is source of truth.** The webview reads `.claudeloop.conf` on open and re-reads on external file changes (via `FileSystemWatcher`).
- **Webview writes back.** Form changes are written to `.claudeloop.conf` immediately. No intermediate state.
- **Parser is a pure function.** `parsers/config.ts` handles `key=value` parsing and serialization. No VS Code dependency — fully unit-testable.
- **HTML generation is separated.** `views/configWizardHtml.ts` generates the webview HTML. `views/configWizard.ts` manages the panel lifecycle and message passing.
- **Validation in the form.** Known keys get type-appropriate inputs (checkbox, number, text). Unknown keys are preserved on round-trip but flagged visually.

## Consequences

- Positive: Single source of truth (`.claudeloop.conf`). Works identically whether user edits via VS Code or terminal.
- Positive: Discoverability — users see all available options with descriptions without reading docs.
- Positive: Pure parser enables thorough unit testing of serialization round-trips.
- Negative: Webview adds complexity (CSP, message passing, HTML generation) compared to plain settings.
- Negative: Must track claudeloop config schema changes to keep the form accurate.
