# 2. Webview DAG rendering via inline SVG

**Date:** 2026-03-26
**Status:** Accepted

## Context

v0.2 adds a rich monitoring webview that displays phase execution as a directed acyclic graph (DAG). The DAG visualizes phase dependencies, status, and execution order.

Options considered:
- **Mermaid.js in webview** — load Mermaid inside the webview sandbox. Handles layout automatically but adds a runtime dependency, requires CSP configuration for script execution, and introduces version management for the bundled library.
- **Inline SVG generation** — generate SVG strings from pure TypeScript functions. No runtime deps, no CSP complexity, deterministic output, fully unit-testable.

## Decision

Generate inline SVG from pure TypeScript functions.

- Zero runtime deps constraint applies to the extension bundle. The webview sandbox *could* load external JS, but inline SVG avoids CSP complexity and version management.
- DAG is simple (~20 nodes max). Layout algorithm: topological sort → assign layers → center nodes within each layer.
- Cap at 20 phases. Beyond that, fall back to a vertical list view.
- SVG generation is implemented as pure functions: `(phases: Phase[]) → string`. No DOM access, no side effects.

## Consequences

- Positive: Zero external dependencies. Deterministic output. Fully unit-testable as pure functions.
- Positive: No CSP configuration needed in the webview. No library version management.
- Negative: More layout code to write and maintain (topological sort, layer assignment, edge routing).
- Negative: Limited to simple graph aesthetics — no animation, no interactive pan/zoom without additional code.
