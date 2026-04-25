---
name: oxveil-testing
description: Oxveil-specific TDD patterns. Use alongside superpowers:test-driven-development.
---

# Oxveil Testing Patterns

- Bug fix test passes immediately? Testing wrong path. Trace actual broken path first.
- Multi-component bugs: trace data flow backward from symptom to source before fixing.
- Document which component owns the broken transformation before writing fix.
- Issue attributes bug to function? Verify attribution. If inputs already wrong, fix upstream.
- Adding public methods to widely-mocked classes: grep `src/test/**/*.test.ts` for mock sites first. Update all in same phase.
- Adding `reset()` to stateful manager: audit `sessionWiring.ts` for closure vars (`lastProgress`) and `SidebarMutableState` fields (`cost`, `todoDone`, `todoTotal`) needing reset.
- Don't add closure-scoped state to `wireSessionEvents` for data `buildFullState()` needs. Use `SidebarMutableState` — closure state invisible to `buildFullState()` callers.
- VS Code config with `??`: check if schema default is `""`. `get<string>()` returns `""`, and `"" ?? fallback` doesn't fall through. Use `||` instead.
- `deps.folderUri` is URI string (`file:///path`), not path. Use `vscode.Uri.parse(deps.folderUri).fsPath` with `join()`.
- Claudeloop files: uppercase (`PROGRESS.md`, `PLAN.md`). Watchers case-sensitive.
- Adding `SidebarMutableState` fields: check if reset needed in `to === "running"` block of `sessionWiring.ts`. Session-scoped (cost, todos, selfImprovementActive) resets; persistent (detectionStatus, planDetected) doesn't.
