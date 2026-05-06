# Self-Improvement Dual-CLI Support

GitHub: chmc/claudeloop#40

## Context

Self-Improvement tab currently hardcodes Claude CLI spawning. Plan Chat already supports dual-CLI (Claude/OpenCode) via provider setting. This task ports the same pattern to Self-Improvement, enabling users to analyze session lessons with either CLI.

## Phase 1: Update SelfImprovementSession

**File:** `src/core/selfImprovementSession.ts`

1. Add to `SelfImprovementSessionDeps` interface (line 9):
   ```typescript
   provider?: "claude" | "opencode";
   opencodePath?: string;
   ```

2. Rewrite `start()` method (lines 61-79) with provider branching:
   - OpenCode: `--prompt` for lessons, positional arg for initial question, terminal name `"Self-Improvement (OpenCode)"`
   - Claude: existing `--append-system-prompt`, `--permission-mode plan`, `--allow-dangerously-skip-permissions`, terminal name `"Self-Improvement (Claude)"`
   - Note: `--allow-dangerously-skip-permissions` only applies to Claude

**Reference:** `src/core/planChatSession.ts:30-51`

## Phase 2: Update Command Registration

**File:** `src/commands/selfImprovement.ts`

1. Add to `SelfImprovementCommandDeps` interface (after line 8):
   ```typescript
   provider?: "claude" | "opencode";
   opencodePath?: string | null;
   ```

2. Replace single validation (lines 22-27) with provider-aware logic:
   - If `provider === "opencode"`: check `opencodePath`, error if empty
   - Else: check `claudePath`, error if missing

3. Pass `provider` and `opencodePath` to session constructor (lines 56-61)

**Reference:** `src/commands/registerPlanChat.ts:17-35`

## Phase 3: Wire Provider Config

**File:** `src/activateCommands.ts`

1. In `selfImprovementDeps` object, add:
   ```typescript
   provider: config.get<"claude" | "opencode">("provider", "claude"),
   opencodePath: config.get<string>("opencodePath", ""),
   ```

2. Ensure `config` is read from `vscode.workspace.getConfiguration("oxveil")` before use

## Phase 4: Unit Tests

**File:** `src/test/unit/core/selfImprovementSession.test.ts`

Add `describe("OpenCode provider")` block:
- Uses `--prompt` for lessons, not `--append-system-prompt`
- Initial question as positional arg
- Terminal name includes "(OpenCode)"
- No `--allow-dangerously-skip-permissions`

**File:** `src/test/unit/commands/selfImprovement.test.ts`

Add provider validation tests:
- OpenCode provider with missing path shows error
- OpenCode provider with path proceeds
- Claude provider with missing path shows error

## Phase 5: Verification

1. `npm run lint` — fix all
2. `npm test` — fix all
3. `/visual-verification` with acceptance criteria:
   - Provider setting "claude" → terminal named "Self-Improvement (Claude)"
   - Provider setting "opencode" + path configured → terminal named "Self-Improvement (OpenCode)"
4. Close issue: `gh issue close 40 --repo chmc/claudeloop`

## Critical Files

| File | Change |
|------|--------|
| `src/core/selfImprovementSession.ts` | Provider branching in deps and start() |
| `src/commands/selfImprovement.ts` | Provider validation and passthrough |
| `src/activateCommands.ts` | Wire provider config to deps |
| `src/test/unit/core/selfImprovementSession.test.ts` | OpenCode provider tests |
| `src/test/unit/commands/selfImprovement.test.ts` | Provider validation tests |

## Reusable Patterns

- `src/core/planChatSession.ts:30-51` — provider branching pattern
- `src/commands/registerPlanChat.ts:17-35` — provider validation pattern
