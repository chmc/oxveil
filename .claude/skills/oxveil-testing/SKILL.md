---
name: oxveil-testing
description: Oxveil-specific TDD patterns. Use alongside superpowers:test-driven-development.
---

# Oxveil Testing Patterns

- Bug fix test passes immediately? Testing wrong path. Trace actual broken path first.
- Multi-component bugs: trace data flow backward from symptom to source before fixing.
- Document which component owns the broken transformation before writing fix.
- Issue attributes bug to function? Verify attribution. If inputs already wrong, fix upstream.
- Error path unreachable via UI → unit test required; visual verification insufficient.
- Adding public methods to widely-mocked classes: grep `src/test/**/*.test.ts` for mock sites first. Update all in same phase.
- Adding `reset()` to stateful manager: audit `sessionWiring.ts` for closure vars (`lastProgress`) and `SidebarMutableState` fields (`cost`, `todoDone`, `todoTotal`) needing reset.
- Don't add closure-scoped state to `wireSessionEvents` for data `buildFullState()` needs. Use `SidebarMutableState` — closure state invisible to `buildFullState()` callers.
- VS Code config with `??`: check if schema default is `""`. `get<string>()` returns `""`, and `"" ?? fallback` doesn't fall through. Use `||` instead.
- `deps.folderUri` is URI string (`file:///path`), not path. Use `vscode.Uri.parse(deps.folderUri).fsPath` with `join()`.
- Claudeloop files: uppercase (`PROGRESS.md`, `PLAN.md`). Watchers case-sensitive.
- Adding `SidebarMutableState` fields: check if reset needed in `to === "running"` block of `sessionWiring.ts`. Session-scoped (cost, todos, selfImprovementActive) resets; persistent (detectionStatus, planDetected) doesn't.
- Testing `activateSidebar.ts` functions that delegate to `sidebarRefresh.ts`: mock `node:fs/promises` (`access`/`readdir`/`unlink`) and add `isRunning`/`start`/`stop` to `elapsedTimer` mock — otherwise `detectInconsistencies` and `fullReInit` throw at runtime.
- fs helpers catch internally → mock upstream dependency (e.g., `manager.getActiveSession()`) to trigger outer error boundary.
- Variables inside `vi.mock()` factories must use `vi.hoisted()` — vitest hoists mocks above imports, so outer-scope `const`s are undefined at factory call time.
- Hoisted `const` objects: mutate in-place (`delete obj.key`) in `beforeEach`, don't reassign — reassignment breaks the reference captured by the factory.
