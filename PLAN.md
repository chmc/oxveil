# Move PLAN.md to .claudeloop/

## Context

PLAN.md currently lives at workspace root, separate from other session files. Moving it to `.claudeloop/PLAN.md` creates session cohesion - when phases complete and claudeloop archives, PLAN.md archives with ai-parsed-plan.md and other session files. Clean start/end lifecycle.

## Phase 1: Create shared path utility + config loader

**File:** `src/core/paths.ts` (new)

```typescript
import * as path from "path";
import * as fs from "fs/promises";

export const CLAUDELOOP_DIR = ".claudeloop";
export const PLAN_FILENAME = "PLAN.md";

export function getPlanPath(workspaceRoot: string, planFileOverride?: string): string {
  if (planFileOverride) return planFileOverride;
  return path.join(workspaceRoot, CLAUDELOOP_DIR, PLAN_FILENAME);
}

export function getClaudeloopDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, CLAUDELOOP_DIR);
}

export async function ensureClaudeloopDir(workspaceRoot: string): Promise<void> {
  await fs.mkdir(getClaudeloopDir(workspaceRoot), { recursive: true });
}

/** Load PLAN_FILE from .claudeloop/.claudeloop.conf if it exists */
export async function loadPlanFileOverride(workspaceRoot: string): Promise<string | undefined> {
  const confPath = path.join(workspaceRoot, CLAUDELOOP_DIR, ".claudeloop.conf");
  try {
    const content = await fs.readFile(confPath, "utf-8");
    const match = content.match(/^PLAN_FILE=(.+)$/m);
    return match?.[1]?.trim() || undefined;
  } catch {
    return undefined;
  }
}
```

**Acceptance:** File exists, exports compile, `npm run lint` passes.

## Phase 1b: Thread planFileOverride through WorkspaceSession

**File:** `src/core/workspaceSession.ts`

Add `planFileOverride?: string` to `WorkspaceSessionInit` and store on instance.

**File:** `src/workspaceSetup.ts`

Sessions created at:
- `initFolderSessions()` line 37 — make async, call `loadPlanFileOverride(root)` per folder
- `handleWorkspaceFolderChange()` line 143 — same pattern

**File:** `src/extension.ts`

- Line 91: `await initFolderSessions(...)` (add await, function now async)
- Line 110: `checkInitialPlanState(workspaceRoot, manager.getActiveSession()?.planFileOverride)`

**File:** `src/activateSidebar.ts`

Update `checkInitialPlanState` signature:
```typescript
export async function checkInitialPlanState(
  workspaceRoot: string | undefined,
  planFileOverride?: string,
): Promise<boolean> {
  if (!workspaceRoot) return false;
  const planPath = getPlanPath(workspaceRoot, planFileOverride);
  // ...
}
```

**Acceptance:** `manager.getActiveSession()?.planFileOverride` returns value from `.claudeloop.conf`.

## Phase 2: Update plan write commands

| File | Line | Change |
|------|------|--------|
| `src/commands/writePlan.ts` | 14 | Use `getPlanPath(workspaceRoot, session.planFileOverride)`, add `ensureClaudeloopDir()` before write |
| `src/commands/formPlan.ts` | 68 | Use `getPlanPath(workspaceRoot, session.planFileOverride)` |
| `src/commands/aiParsePlan.ts` | all refs | Use `getPlanPath(workspaceRoot, session.planFileOverride)` |

Commands access session via `WorkspaceSessionManager.getActive()`.

**Acceptance:** `npm test` passes for affected commands.

## Phase 3: Update plan lifecycle commands

**File:** `src/commands/planLifecycle.ts` lines 33, 57, 86

Access via: `const session = sessionManager.getActiveSession();`
Then: `getPlanPath(workspaceRoot, session?.planFileOverride)`

**Acceptance:** `npm test` passes.

## Phase 4: Update sidebar and views

| File | Lines | Change |
|------|-------|--------|
| `src/activateSidebar.ts` | 69 | `filename: path.basename(getPlanPath(...))` for display |
| `src/activateSidebar.ts` | 172,284 | Use `getPlanPath(workspaceRoot, manager.getActiveSession()?.planFileOverride)` |
| `src/activateSidebar.ts` | 134 | `new vscode.RelativePattern(folder, ".claudeloop/PLAN.md")` |
| `src/sidebarRefresh.ts` | 43,108 | Use `getPlanPath(workspaceRoot, session?.planFileOverride)` — has manager in ctx |
| `src/activateViews.ts` | 233 | Add `planFileOverride?: string` to `WebviewPanelsDeps`, use in check |

**Watcher:** Uses `RelativePattern` matching existing `ai-parsed-plan.md` watcher pattern. Custom `PLAN_FILE` users won't get auto-refresh (rare, acceptable).

**Acceptance:** `npm test` passes, file watcher triggers on new path.

## Phase 5: Update tests

Files to update mock paths:
- `src/test/unit/activateSidebar.test.ts`
- `src/test/unit/commands/formPlan.test.ts`
- `src/test/unit/commands/planChat.test.ts`
- `src/test/integration/fullReset.test.ts`
- `src/test/integration/aiParsePlan.test.ts`
- `src/test/integration/activateSidebar.test.ts`
- `src/test/unit/views/planPreviewPanel.*.test.ts`
- `src/test/unit/views/sidebarRenderers.test.ts`

**Acceptance:** `npm test` all green.

## Phase 6: Update docs and config

| File | Change |
|------|--------|
| `docs/workflow/states.md` | Update PLAN.md references (lines 105, 413, 425) |
| `package.json` | Update language association pattern for PLAN.md |
| `.claude/skills/visual-verification/references/visual-verification-recipes.md` | Update paths |

**Acceptance:** Docs reflect new location.

## Phase 7: Visual verification

Run `/visual-verification` with criteria:
- Click "Let's Go" → start chat → "Form Plan" creates `.claudeloop/PLAN.md`
- No PLAN.md at workspace root
- Sidebar reflects plan phases correctly
- Plan deletion removes `.claudeloop/PLAN.md`

## Verification

1. `npm run lint` - no errors
2. `npm test` - all pass
3. `/visual-verification` - UI flow works end-to-end
4. Manual check: `.claudeloop/PLAN.md` created, workspace root clean

## Notes

- **No migration:** Clean break from old root location
- **Git:** PLAN.md gitignored (ephemeral, archived with session)
- **Archive:** No claudeloop changes needed - plan now inside `.claudeloop/`, archived automatically
