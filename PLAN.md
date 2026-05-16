# Regression Prevention Improvements

## Context

Accidental regressions have increased recently. Git history shows patterns:
1. **Race conditions** (40%) - async state transitions completing after session state changes
2. **Stale state** (30%) - data persisting incorrectly across session boundaries
3. **Plan preview churn** (20%) - file watching edge cases
4. **UI state sync** (10%) - webview lifecycle vs extension state

Root cause: No CI on PRs, no coverage tracking, no pre-commit hooks. Tests exist but gaps in activation modules and concurrent operation handling.

---

## Phase 1: CI Pipeline (High Impact, Low Effort)

### 1.1 Create `.github/workflows/ci.yml`
Runs on every push to main. Developer signal: commit status badge (green/red) visible on GitHub commits page.

```yaml
name: CI
on:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm run test:coverage
```

**Signal back to developer:**
- GitHub shows check status on commits (✓/✗)
- Failed runs show in Actions tab with logs
- Desktop notification via ntfy.sh (see 1.4)

### 1.4 Automatic desktop notifications

**CI workflow addition:**
```yaml
- name: Notify on failure
  if: failure()
  run: |
    curl -d "CI failed: ${GITHUB_SHA::7}" \
      -H "Title: Oxveil CI" -H "Priority: high" \
      ntfy.sh/oxveil-ci-${{ github.repository_owner }}
```

**VS Code task (auto-starts on workspace open):**
Create `.vscode/tasks.json` — uses native macOS notifications, no external service:
```json
{
  "version": "2.0.0",
  "tasks": [{
    "label": "CI Notifications",
    "type": "shell",
    "command": "while true; do status=$(gh run list -L1 --json conclusion -q '.[0].conclusion' 2>/dev/null || true); if [ \"$status\" = \"failure\" ]; then osascript -e 'display notification \"CI failed\" with title \"Oxveil\"'; fi; sleep 60; done",
    "isBackground": true,
    "runOptions": { "runOn": "folderOpen" },
    "problemMatcher": []
  }]
}
```

**Prerequisites (document in README):**
- Requires `gh` CLI authenticated: `gh auth login`
- Without auth, notifications silently disabled (no errors)
- Verify setup: `gh run list -L1` should show recent runs

### 1.2 Add coverage to `vitest.config.ts`
- Provider: v8
- Thresholds: 60% statements, 50% branches
- Install: `npm i -D @vitest/coverage-v8`

### 1.3 Add ESLint async rules
Focus on race condition detection:
- `@typescript-eslint/no-floating-promises`: error
- `@typescript-eslint/no-misused-promises`: error
- Install: `npm i -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser`
- Run `npx eslint src --fix` to baseline existing code before enabling in CI

---

## Phase 2: Pre-commit Hooks (Fast Feedback)

### 2.1 Install lefthook
```bash
npm i -D lefthook && npx lefthook install
```

### 2.2 Create `lefthook.yml`
```yaml
pre-commit:
  parallel: true
  commands:
    typecheck:
      glob: "*.ts"
      run: npx tsc --noEmit
    test-related:
      glob: "src/**/*.ts"
      run: npx vitest related {staged_files} --run
```

---

## Phase 3: Architectural Guards (Prevent Bug Classes)

### 3.1 State machine validation in `sessionState.ts`
Add transition validation to reject invalid state changes:
```typescript
const TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  idle: ["running"],
  running: ["done", "failed", "idle"],
  done: ["idle", "running"],
  failed: ["idle", "running"],
};
```

### 3.2 Sequence guard for async file ops in `planPreviewPanel.ts`
Simpler than full version vector — per-watcher sequence number + existing debounce:
```typescript
private _readSeq = 0;
async onFileChanged(): Promise<void> {
  const seq = ++this._readSeq;
  const content = await this._deps.readFile(path);
  if (seq !== this._readSeq) return; // superseded
}
```

### 3.3 Webview disposal guards
Add `_disposed` flag to `SidebarPanel` and `PlanPreviewPanel`:
```typescript
private _disposed = false;
dispose(): void {
  this._disposed = true;
  // existing cleanup
}
// In async methods:
if (this._disposed) return;
```

### 3.4 Typed transition error in `sessionState.ts`
```typescript
export class InvalidTransitionError extends Error {
  constructor(from: SessionStatus, to: SessionStatus) {
    super(`Invalid transition: ${from} → ${to}`);
  }
}
```

---

## Phase 4: Targeted Regression Tests

### 4.1 Race condition tests (`src/test/unit/core/raceConditions.test.ts`)
- Double spawn → error
- Async op completes after panel disposed → no-op
- State transition during self-improvement → abort

### 4.2 Session boundary tests (`src/test/unit/core/sessionBoundary.test.ts`)
- All mutable state resets on new session
- Progress/cost cleared on session reset

### 4.3 Cleanup verification tests (`src/test/unit/core/cleanup.test.ts`)
- `.claude/plans/*.md` cleaned on completion
- Process killed on deactivate
- Watchers disposed

### 4.4 Test utilities (`src/test/helpers/raceHelpers.ts`)
```typescript
export function createDeferred<T>(): Deferred<T>;
export function flushMicrotasks(): Promise<void>;
```

---

## Phase 5: Fill Test Coverage Gaps

Priority activation modules (untested):
- `src/activateCommands.ts`
- `src/activateNotifications.ts`
- `src/activateSessionHandlers.ts`
- `src/activateConfigWatcher.ts`
- `src/activateMcpBridge.ts`

---

## Implementation Order

| Phase | Effort | Impact | Files |
|-------|--------|--------|-------|
| 1.1 CI workflow | 10 min | High | `.github/workflows/ci.yml` |
| 1.2 Coverage | 5 min | High | `vitest.config.ts`, `package.json` |
| 1.3 ESLint async | 15 min | High | `eslint.config.mjs`, `package.json` |
| 2.1-2.2 Pre-commit | 10 min | Medium | `lefthook.yml` |
| 3.1 State validation | 30 min | High | `src/core/sessionState.ts` |
| 3.2 Version vector | 20 min | Medium | `src/views/planPreviewPanel.ts` |
| 4.x Regression tests | 2 hrs | High | `src/test/unit/core/` |
| 5 Coverage gaps | 3 hrs | Medium | `src/test/unit/` |

---

## Verification

1. `npm run lint` passes with new ESLint rules
2. `npm run test:coverage` shows thresholds met
3. Pre-commit hook triggers on staged .ts files
4. CI runs on PR creation (test with draft PR)
5. State transition validation catches invalid transitions in tests

---

---

## Feature

| regression-prevention |

Infrastructure improvements:
- CI pipeline on PRs (currently only manual release)
- Coverage tracking with thresholds
- Pre-commit hooks for fast feedback
- ESLint async rules to catch race conditions at lint time
- State machine validation to prevent invalid transitions
- Targeted regression tests for historical bug patterns

---

## Architecture Impact

- `sessionState.ts`: Add transition validation map — rejects invalid state changes
- `planPreviewPanel.ts`: Version vector pattern for async file operations
- `watchers.ts`: Content hash deduplication (optional)
- New test infrastructure: race condition helpers, cleanup verification

No breaking changes. All changes are additive guards.

---

## ADR

N/A - Infrastructure/testing changes, no architectural decisions requiring ADR.

---

## State Machine / Sync

Add explicit transition validation to `SessionState`:
```typescript
const TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  idle: ["running"],
  running: ["done", "failed", "idle"],
  done: ["idle", "running"],
  failed: ["idle", "running"],
};
```
Invalid transitions logged and rejected rather than silently applied.

---

## Tests

**New test files:**
- `src/test/unit/core/raceConditions.test.ts` - concurrent operation handling
- `src/test/unit/core/sessionBoundary.test.ts` - state reset verification
- `src/test/unit/core/cleanup.test.ts` - artifact cleanup verification
- `src/test/helpers/raceHelpers.ts` - deferred promise utilities

**Coverage:** Add v8 coverage with 60% statement threshold.

---

## Documentation

- `docs/workflow/states.md`: Update if state transition rules change
- No user-facing doc changes needed

---

## package.json / contributes

**Scripts:**
- `"test:coverage": "vitest run --coverage"`
- Update `"lint"` to include ESLint

**devDependencies:**
- `@vitest/coverage-v8`
- `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`
- `lefthook`

No `contributes` changes.

---

## CHANGELOG

```markdown
### Added
- CI workflow for PR checks with coverage reporting
- ESLint async rules to catch floating promises
- Pre-commit hooks via lefthook
- State transition validation in SessionState
- Regression test suite for race conditions and cleanup
```

---

## README

N/A - Internal infrastructure, not user-facing.

---

## Tasks

1. Create `.github/workflows/ci.yml` with push trigger + ntfy failure step
2. Add coverage config to `vitest.config.ts` (v8, 60% threshold)
3. Install + configure ESLint async rules (`eslint.config.mjs`)
4. Run `eslint src --fix` to baseline existing code
5. Install lefthook, create `lefthook.yml`
6. Create `.vscode/tasks.json` for CI notifications
7. Add `_disposed` flag to `PlanPreviewPanel`, guard async methods
8. Add `_disposed` flag to `SidebarPanel`, guard async methods
9. Add `_readSeq` sequence guard to `PlanPreviewPanel.onFileChanged()`
10. Add `InvalidTransitionError` and transition validation to `SessionState`
11. Create `src/test/unit/core/raceConditions.test.ts`
12. Create `src/test/unit/core/sessionBoundary.test.ts`
13. Create `src/test/unit/core/cleanup.test.ts`
14. Create `src/test/helpers/raceHelpers.ts`
15. Update `package.json` scripts and devDependencies
16. Document gh CLI requirement in README
17. Lint and typecheck
18. Run full test suite

---

## Acceptance Criteria

- [ ] `npm run lint` passes with new ESLint async rules
- [ ] `npm run test:coverage` meets 60% statement threshold
- [ ] Pre-commit hook runs typecheck + related tests on staged files
- [ ] CI workflow triggers on push to main, shows commit status
- [ ] Desktop notification appears on CI failure (native macOS via gh CLI poll)
- [ ] Webview disposal guards prevent post-dispose operations
- [ ] InvalidTransitionError thrown on invalid state changes
- [ ] Invalid state transitions throw/log error
- [ ] New regression tests pass
