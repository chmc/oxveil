# VV Diagnosis Playbook

Symptom → first checks → anti-patterns from past failures.

---

## Silent exit on formPlan (view stays `planning`)

**First checks (in order):**
1. `/log-tail?grep=formPlan` — look for `[formPlan] outcome=silent-exit reason=<X>`
2. `GET /state | jq .processManager.exists` — must be `true`
3. If `false`: `oxveil.start` via MCP, wait for `processManager.exists=true`, retry sentinel

**Anti-pattern (session 20260626-163445):** Blamed `CLAUDELOOP_CLAUDE_BIN` env var not inheriting through `createTerminal`. Actual cause: no claudeloop session → `processManager` null → silent exit. **Check `processManager.exists` before diagnosing env vars.**

**Anti-pattern:** Used sidebar Form Plan button directly. That path bypasses ExitPlanMode → sentinel → watcher. Use the real user path or write the sentinel manually (see handover recipe).

---

## ExitPlanMode not firing / intercept not appearing

**First checks:**
1. `cat .claude/.plan-marker` — must exist and have `denyCount < 5`
2. `echo $OXVEIL_PLAN_MARKER` inside the Plan Chat terminal — must point to the marker file
3. Check `~/Library/Caches/oxveil/oxveil-plan-intercept.sh` exists and is executable
4. Confirm `planning-checklist.sh` is not blocking — if so, write minimal valid plan file

**Anti-pattern:** Assuming the hook isn't registered when ExitPlanMode fires without intercept. Actually fires if `OXVEIL_PLAN_MARKER` is unset or file is missing — hook does `allow` passthrough in both cases.

---

## Tabs disappear during re-maximize

**First checks:**
1. Grep the recipe being used for `closeAllEditors` — must NOT be present in Phase 3 pre-capture variant
2. Phase 1 maximize may call `closeAllEditors`; Phase 3 must not
3. Check `src/commands/planChatSession.ts` — Plan Chat tab is opened via `createTerminal`, not `showTextDocument`; `closeAllEditors` closes editor tabs but not terminals

**Fix:** Phase 3 recipe: `closePanel` + `closeAuxiliaryBar` + `workbench.view.extension.oxveil` only. No `closeAllEditors`.

---

## Enter key not submitting in Plan Chat terminal

**First checks:**
1. Verify using `workbench.action.terminal.sendSequence` with `\r`, NOT `cliclick kp:return`
2. `cliclick kp:return` requires VS Code to be frontmost — unreliable in automation

**Fix:** Always use:
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"workbench.action.terminal.sendSequence","args":[{"text":"\r"}]}' \
  "http://127.0.0.1:$PORT/command"
```

---

## TaskUpdate completion denied (hook blocks `completed` status)

**First checks:**
1. `grep -n '^\- \[ \]' verification-sessions/*/SESSION.md` — any unchecked AC boxes?
2. `grep -n '^Status: BLOCKED\|^Status: FAILED' verification-sessions/*/SESSION.md` — unresolved per-AC records?
3. Hook: `marker-validator.sh` now also denies marker write if ACs are unchecked

**Fix:** Mark all ACs `[x]` in SESSION.md, update Per-AC Records to PASS/BLOCKED/FAILED with observations. Then retry `TaskUpdate`.

**Anti-pattern (session 20260626-181630):** Tried to mark task completed before checking SESSION.md AC checkbox state. Hook denied. Fix the gate input, then retry — don't route around.
