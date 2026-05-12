---
name: adding-settings
description: Checklist for adding a new VS Code setting to Oxveil, including async migration patterns and language contribution gotchas.
---

# Adding a VS Code Setting

**Warning:** `vscode.workspace.getConfiguration("oxveil")` must be called inside function bodies, not at module level — otherwise it won't reflect active workspace config at registration time.

1. `package.json` → `contributes.configuration.properties` with default
2. `src/core/processManager.ts` → add to `ProcessManagerSettings` interface
3. `src/processManagerFactory.ts:getSettings()` → add with same default as `package.json`
4. `src/core/processManager.ts:_settingsToArgs()` → map to CLI flag
5. `src/test/unit/core/processManager.*.test.ts` → add to mock's default return value in `beforeEach`
6. Verify: `npm test` passes, setting appears in VS Code settings UI

# Async Migration

When converting sync → async:
1. Update ALL call sites, including fire-and-forget event handlers
2. Add `.catch()` to fire-and-forget calls for unhandled rejection
3. Update tests to `await` async calls — state won't be ready otherwise

# VS Code Language Contributions

- `filenames` matches basename only — won't scope to subdirectory
- Use `filenamePatterns` with globs for path-specific matching (e.g., `**/.claudeloop/PLAN.md`)

# Import Conventions

- `src/core/` files: use `node:` prefixed imports (`node:path`, `node:fs/promises`)
