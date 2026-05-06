# Plan: Issue #39 — Oxveil Plan Chat dual-CLI

## Context

Enable Plan Chat to spawn either Claude CLI or OpenCode CLI based on `oxveil.provider` setting. Currently hardcoded to Claude.

## Phase 1: Add provider support to PlanChatSession

**File:** `src/core/planChatSession.ts`

- Add `provider` and `opencodePath` to `PlanChatSessionDeps`
- In `start()`: branch on provider
  - Claude: `--model`, `--append-system-prompt`, `--permission-mode plan`
  - OpenCode: `--model`, `--prompt`
- Update terminal name: "Plan Chat (Claude)" / "Plan Chat (OpenCode)"

## Phase 2: Wire provider config in registerPlanChat

**File:** `src/commands/registerPlanChat.ts`

- Read `oxveil.provider` and `oxveil.opencodePath` from config
- Pass to PlanChatSession
- Update missing binary error message per provider

## Phase 3: Tests

- Unit tests for both provider branches
- `/visual-verification` with each provider setting

## Verification (from #39)

- [ ] `oxveil.provider = "claude"` → Claude CLI terminal
- [ ] `oxveil.provider = "opencode"` → OpenCode CLI terminal  
- [ ] Provider indicator in terminal name
- [ ] Switching providers starts new session

## Final Step

`gh issue close 39 --repo chmc/claudeloop`
