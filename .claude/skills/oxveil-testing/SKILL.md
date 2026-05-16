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
- State reset methods: reset ALL related fields together. Partial resets leave stale values visible (e.g., clearing `_lastTitle` but not `_lastFormat`).
- Testing `activateSidebar.ts` functions that delegate to `sidebarRefresh.ts`: mock `node:fs/promises` (`access`/`readdir`/`unlink`) and add `isRunning`/`start`/`stop` to `elapsedTimer` mock — otherwise `detectInconsistencies` and `fullReInit` throw at runtime.
- fs helpers catch internally → mock upstream dependency (e.g., `manager.getActiveSession()`) to trigger outer error boundary.
- Variables inside `vi.mock()` factories must use `vi.hoisted()` — vitest hoists mocks above imports, so outer-scope `const`s are undefined at factory call time.
- Hoisted `const` objects: mutate in-place (`delete obj.key`) in `beforeEach`, don't reassign — reassignment breaks the reference captured by the factory.
- Adding new utility calls (e.g., `ensureClaudeloopDir()`): mock must include all functions the utility calls (`mkdir`, etc.) even if test doesn't assert on them — vitest throws 'No X export defined on mock' otherwise.
- Async command handlers: always `await` in tests. Adding mock state (e.g., `workspaceFolders`) can cause existing non-awaited handlers to race with assertions — failures appear unrelated to the change.
- Race condition tests: use deferred promise (`new Promise` + external `resolve`) for mocked async calls. Resolve AFTER triggering the state change to verify guards fire correctly—the guard must re-check state after the await returns (`if (session.status !== "done")`).
- Async methods returning exit promises (e.g., `spawn()` returns `_exitPromise`): don't `await` when testing mid-run guards (`_stopping`, `_process !== null`). Use `startSpawn`/`flushMicrotasks` pattern, trigger `close()` separately for cleanup.
- Path-returning functions: unit test with absolute path, relative path, empty string, undefined. Relative paths resolved incorrectly cause EROFS when extension cwd is read-only bundle.
- Vitest coverage peer deps: pin `@vitest/coverage-v8` to match vitest major (e.g., `^3.0.0` for vitest 3.x) — npm resolves latest otherwise, causing peer dep failures
- Disposal guards: place `if (this._disposed) return` at method ENTRY, not just post-await — poll timers and debounce callbacks can fire synchronously after `dispose()` clears refs
