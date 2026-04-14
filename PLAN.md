# AI Parse Retry-with-Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose claudeloop's verify-then-retry feedback loop in Oxveil's UI and stream AI parse progress through the Live Run Panel.

**Architecture:** Oxveil controls the retry loop via separate atomic CLI calls. claudeloop gets two new flags (`--no-retry`, `--ai-parse-feedback`) that exit after parse+verify instead of entering the interactive prompt. The Live Run Panel hosts both streaming progress and the retry/continue/abort UI.

**Tech Stack:** TypeScript (Oxveil VS Code extension), Bash (claudeloop), Vitest (tests)

**Spec:** `docs/superpowers/specs/2026-04-14-ai-parse-retry-feedback-design.md`

---

## File Structure

### claudeloop (at `/Users/aleksi/source/claudeloop`)

| File | Action | Responsibility |
|------|--------|----------------|
| `claudeloop` | Modify | Add `--no-retry` and `--ai-parse-feedback` flags to parse_args, usage, variable init |
| `lib/ai_parser.sh` | Modify | Refactor `ai_verify_plan()` exit codes, add `ai_parse_no_retry()` and `ai_parse_feedback()` functions |
| `tests/test_ai_parser.sh` | Modify | Add tests for new flags and exit code convention |

### Oxveil (at `/Users/aleksi/source/oxveil`)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/interfaces.ts` | Modify | Update `IProcessManager` with new method signatures and return types |
| `src/core/processManager.ts` | Modify | Add `aiParseFeedback()`, change `aiParse()` return type, handle exit code 2 |
| `src/commands/aiParseLoop.ts` | Create | Shared retry orchestrator |
| `src/commands/aiParsePlan.ts` | Modify | Use `aiParseLoop` instead of direct `processManager.aiParse()` |
| `src/commands/formPlan.ts` | Modify | Use `aiParseLoop` instead of recursive `formPlanLoop` retry |
| `src/views/liveRunPanel.ts` | Modify | Add verify-failed/passed banners, retry action handling |
| `src/views/liveRunHtml.ts` | Modify | Add `renderVerifyBannerHtml()` render functions |
| `src/parsers/logFormatter.ts` | Modify | Add verification and retry separator patterns |
| `src/test/unit/core/processManager.test.ts` | Modify | Test exit code 2 handling, new `aiParseFeedback()` method |
| `src/test/unit/commands/aiParseLoop.test.ts` | Create | Test retry state machine |
| `src/test/unit/views/liveRunPanel.test.ts` | Modify | Test new message types |
| `src/test/unit/parsers/logFormatter.test.ts` | Modify | Test new patterns |

---

## Task 1: claudeloop — Refactor `ai_verify_plan()` exit codes

**Files:**
- Modify: `/Users/aleksi/source/claudeloop/lib/ai_parser.sh:257-330`
- Modify: `/Users/aleksi/source/claudeloop/tests/test_ai_parser.sh`

- [ ] **Step 1: Write failing test for exit code 2 on FAIL verdict**

In `tests/test_ai_parser.sh`, add a test that verifies `ai_verify_plan()` returns 2 (not 1) when the AI responds with FAIL:

```bash
@test "ai_verify_plan: returns 2 on FAIL verdict" {
  # Setup: mock run_claude_print to output "FAIL\nMissing requirement"
  run_claude_print() {
    printf 'FAIL\nMissing requirement X' > "$2"
    return 0
  }
  export -f run_claude_print

  mkdir -p .claudeloop
  echo "## Phase 1: Test" > .claudeloop/ai-parsed-plan.md
  echo "# Original plan" > /tmp/test-plan.md

  run ai_verify_plan .claudeloop/ai-parsed-plan.md /tmp/test-plan.md tasks .claudeloop
  [ "$status" -eq 2 ]
  [ -f .claudeloop/ai-verify-reason.txt ]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/aleksi/source/claudeloop && bats tests/test_ai_parser.sh --filter "returns 2 on FAIL"`
Expected: FAIL (currently returns 1)

- [ ] **Step 3: Change `ai_verify_plan()` to return 2 on FAIL**

In `/Users/aleksi/source/claudeloop/lib/ai_parser.sh:312-329`, change the FAIL case to `return 2` and keep the `*` (unexpected format) case as `return 1`:

```bash
  case "$first_line" in
    PASS)
      print_success "Verification passed"
      return 0
      ;;
    FAIL)
      local reason
      reason=$(printf '%s\n' "$verify_output" | tail -n +2)
      print_error "Verification failed: $reason"
      mkdir -p "$cl_dir"
      printf '%s\n' "$reason" > "$cl_dir/ai-verify-reason.txt"
      return 2
      ;;
    *)
      print_warning "Unexpected verification format (treating as fail): $first_line"
      return 1
      ;;
  esac
```

- [ ] **Step 4: Update `ai_parse_and_verify()` to handle exit code 2**

In `/Users/aleksi/source/claudeloop/lib/ai_parser.sh:478-484`, the verify call inside the `while true` loop needs to handle both 1 (error) and 2 (fail). Replace the `if ai_verify_plan ...` boolean check with explicit exit code capture:

```bash
    # Verify
    ai_verify_plan "$ai_plan" "$plan_file" "$granularity" "$cl_dir"
    local verify_rc=$?
    if [ "$verify_rc" -eq 0 ]; then
      _AI_VERIFY_VERDICT=pass
      exec 3<&-
      return 0
    elif [ "$verify_rc" -eq 1 ]; then
      # Hard error (unexpected format, API failure) — don't retry
      exec 3<&-
      return 1
    fi
    # verify_rc == 2: FAIL verdict — continue to retry logic below
```

This same pattern applies to the verify call at the top of the `while true` loop (line 480). Since the loop only has one verify call site, this single change covers it. The existing code uses `if ai_verify_plan ...; then` which treats exit 1 and exit 2 identically — after this change, exit 1 (error) aborts immediately while exit 2 (FAIL verdict) enters the retry prompt.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/aleksi/source/claudeloop && bats tests/test_ai_parser.sh`
Expected: All tests pass (including existing tests — verify no regressions from exit code change)

- [ ] **Step 6: Commit**

```bash
cd /Users/aleksi/source/claudeloop
git add lib/ai_parser.sh tests/test_ai_parser.sh
git commit -m "refactor: distinguish verify FAIL (exit 2) from errors (exit 1) in ai_verify_plan"
```

---

## Task 2: claudeloop — Add `--no-retry` and `--ai-parse-feedback` flags

**Files:**
- Modify: `/Users/aleksi/source/claudeloop/claudeloop:60-93` (variable init + sentinels)
- Modify: `/Users/aleksi/source/claudeloop/claudeloop:292-343` (usage)
- Modify: `/Users/aleksi/source/claudeloop/claudeloop:453-461` (parse_args)
- Modify: `/Users/aleksi/source/claudeloop/claudeloop:965-975` (init_live_log)
- Modify: `/Users/aleksi/source/claudeloop/claudeloop:977-1015` (run_ai_parsing)
- Modify: `/Users/aleksi/source/claudeloop/lib/ai_parser.sh`
- Modify: `/Users/aleksi/source/claudeloop/tests/test_ai_parser.sh`

- [ ] **Step 1: Write failing tests for both flags**

Add to `tests/test_ai_parser.sh`:

```bash
@test "ai_parse_no_retry: exits 0 on verify pass" {
  # Mock ai_parse_plan to succeed, ai_verify_plan to return 0 (pass)
  ai_parse_plan() { echo "## Phase 1: Test" > "$3/ai-parsed-plan.md"; return 0; }
  ai_verify_plan() { return 0; }
  export -f ai_parse_plan ai_verify_plan

  mkdir -p .claudeloop
  echo "# Plan" > PLAN.md
  run ai_parse_no_retry PLAN.md tasks .claudeloop
  [ "$status" -eq 0 ]
}

@test "ai_parse_no_retry: exits 2 on verify fail" {
  ai_parse_plan() { echo "## Phase 1: Test" > "$3/ai-parsed-plan.md"; return 0; }
  ai_verify_plan() {
    printf 'Missing requirement' > "$4/ai-verify-reason.txt"
    return 2
  }
  export -f ai_parse_plan ai_verify_plan

  mkdir -p .claudeloop
  echo "# Plan" > PLAN.md
  run ai_parse_no_retry PLAN.md tasks .claudeloop
  [ "$status" -eq 2 ]
  [ -f .claudeloop/ai-verify-reason.txt ]
}

@test "ai_parse_feedback: reads reason from file and reparses" {
  ai_reparse_with_feedback() { echo "## Phase 1: Fixed" > "$3/ai-parsed-plan.md"; return 0; }
  ai_verify_plan() { return 0; }
  export -f ai_reparse_with_feedback ai_verify_plan

  mkdir -p .claudeloop
  echo "# Plan" > PLAN.md
  echo "Missing requirement" > .claudeloop/ai-verify-reason.txt
  run ai_parse_feedback PLAN.md tasks .claudeloop
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/aleksi/source/claudeloop && bats tests/test_ai_parser.sh --filter "ai_parse_no_retry|ai_parse_feedback"`
Expected: FAIL (functions don't exist yet)

- [ ] **Step 3: Add `ai_parse_no_retry()` function to `lib/ai_parser.sh`**

Add after `ai_parse_and_verify()` (after line 548):

```bash
# Single-pass AI parse + verify without interactive retry loop.
# Used by Oxveil via --no-retry flag.
# Returns: 0 on pass, 2 on verify fail, 1 on error
ai_parse_no_retry() {
  local plan_file="$1"
  local granularity="${2:-tasks}"
  local cl_dir="${3:-.claudeloop}"

  if ! ai_parse_plan "$plan_file" "$granularity" "$cl_dir"; then
    return 1
  fi

  local ai_plan="$cl_dir/ai-parsed-plan.md"
  ai_verify_plan "$ai_plan" "$plan_file" "$granularity" "$cl_dir"
  # Returns 0 (pass), 2 (fail), or 1 (error) directly
}
```

- [ ] **Step 4: Add `ai_parse_feedback()` function to `lib/ai_parser.sh`**

Add after `ai_parse_no_retry()`:

```bash
# Reparse with feedback from previous verification failure, then verify.
# Used by Oxveil via --ai-parse-feedback flag.
# Reads feedback from $cl_dir/ai-verify-reason.txt (written by previous --no-retry call).
# Returns: 0 on pass, 2 on verify fail, 1 on error
ai_parse_feedback() {
  local plan_file="$1"
  local granularity="${2:-tasks}"
  local cl_dir="${3:-.claudeloop}"

  if [ ! -f "$cl_dir/ai-verify-reason.txt" ]; then
    print_error "No verification feedback file found at $cl_dir/ai-verify-reason.txt"
    return 1
  fi

  # Write separator to live.log
  if [ -n "${LIVE_LOG:-}" ]; then
    printf '\n  [%s] ───── Retry with feedback ─────\n' "$(date '+%H:%M:%S')" >> "$LIVE_LOG"
  fi

  if ! ai_reparse_with_feedback "$plan_file" "$granularity" "$cl_dir"; then
    return 1
  fi

  local ai_plan="$cl_dir/ai-parsed-plan.md"
  ai_verify_plan "$ai_plan" "$plan_file" "$granularity" "$cl_dir"
}
```

- [ ] **Step 5: Add variables and sentinels to main script**

In `/Users/aleksi/source/claudeloop/claudeloop`, add after line 78 (`GRANULARITY="tasks"`):

```bash
NO_RETRY=false
AI_PARSE_FEEDBACK=false
```

Add to the sentinels line (around line 89):

```bash
_CLI_NO_RETRY="" _CLI_AI_PARSE_FEEDBACK=""
```

- [ ] **Step 6: Add flag parsing to `parse_args()`**

In `/Users/aleksi/source/claudeloop/claudeloop`, after the `--granularity` case (after line 461):

```bash
      --no-retry)
        NO_RETRY=true; _CLI_NO_RETRY=1
        shift
        ;;
      --ai-parse-feedback)
        AI_PARSE_FEEDBACK=true; _CLI_AI_PARSE_FEEDBACK=1
        shift
        ;;
```

- [ ] **Step 7: Add flags to `usage()` help text**

In `/Users/aleksi/source/claudeloop/claudeloop`, after line 322 (`--granularity` help):

```
  --no-retry             Skip interactive retry loop during AI parse (exit 2 on verify fail)
  --ai-parse-feedback    Reparse using feedback from previous verification failure
```

- [ ] **Step 8: Update `init_live_log()` to skip archive for feedback flag**

In `/Users/aleksi/source/claudeloop/claudeloop:966-974`, change to:

```bash
init_live_log() {
  if ! $DRY_RUN && [ -z "${LIVE_LOG:-}" ]; then
    LIVE_LOG=".claudeloop/live.log"
    if [ "$AI_PARSE_FEEDBACK" = "true" ]; then
      # Feedback mode: append to existing log (don't archive)
      touch "$LIVE_LOG"
    elif [ -f "$LIVE_LOG" ]; then
      _ts=$(date '+%Y%m%d-%H%M%S')
      mv "$LIVE_LOG" ".claudeloop/live-${_ts}.log"
      : > "$LIVE_LOG"
    else
      : > "$LIVE_LOG"
    fi
  fi
}
```

- [ ] **Step 9: Update `run_ai_parsing()` to handle new flags**

In `/Users/aleksi/source/claudeloop/claudeloop:977-1015`, add at the start of the function (after `_parse_msg="Parsing plan file"`):

```bash
  # --ai-parse-feedback: reparse with feedback and exit
  if [ "$AI_PARSE_FEEDBACK" = "true" ]; then
    ai_parse_feedback "$PLAN_FILE" "$GRANULARITY"
    exit $?
  fi

  # --no-retry: single-pass parse+verify and exit
  if [ "$NO_RETRY" = "true" ] && [ "$AI_PARSE" = "true" ]; then
    ai_parse_no_retry "$PLAN_FILE" "$GRANULARITY"
    exit $?
  fi
```

- [ ] **Step 10: Run all tests**

Run: `cd /Users/aleksi/source/claudeloop && bats tests/test_ai_parser.sh`
Expected: All tests pass

- [ ] **Step 11: Commit**

```bash
cd /Users/aleksi/source/claudeloop
git add claudeloop lib/ai_parser.sh tests/test_ai_parser.sh
git commit -m "feat: add --no-retry and --ai-parse-feedback flags for non-interactive AI parse"
```

---

## Task 3: Oxveil — Update `IProcessManager` and `ProcessManager`

**Files:**
- Modify: `/Users/aleksi/source/oxveil/src/core/interfaces.ts:20-28`
- Modify: `/Users/aleksi/source/oxveil/src/core/processManager.ts:91-102,131-167`
- Modify: `/Users/aleksi/source/oxveil/src/test/unit/core/processManager.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `/Users/aleksi/source/oxveil/src/test/unit/core/processManager.test.ts`:

```typescript
describe("aiParse", () => {
  it("passes --no-retry flag", async () => {
    const pm = createManager();
    const promise = pm.aiParse("tasks");
    await flushMicrotasks();

    expect(spawnCalls[0].args).toContain("--no-retry");
    closeCallback?.(0);
    const result = await promise;
    expect(result).toEqual({ exitCode: 0 });
  });

  it("resolves with exitCode 2 on verification failure", async () => {
    const pm = createManager();
    const promise = pm.aiParse("tasks");
    await flushMicrotasks();

    closeCallback?.(2);
    const result = await promise;
    expect(result).toEqual({ exitCode: 2 });
  });

  it("rejects on exit code 1 (process error)", async () => {
    const pm = createManager();
    const promise = pm.aiParse("tasks");
    await flushMicrotasks();

    closeCallback?.(1);
    await expect(promise).rejects.toThrow("claudeloop exited with code 1");
  });
});

describe("aiParseFeedback", () => {
  it("spawns with --ai-parse-feedback flag", async () => {
    const pm = createManager();
    const promise = pm.aiParseFeedback("tasks");
    await flushMicrotasks();

    expect(spawnCalls[0].args).toContain("--ai-parse-feedback");
    expect(spawnCalls[0].args).toContain("--granularity");
    expect(spawnCalls[0].args).toContain("tasks");
    closeCallback?.(0);
    const result = await promise;
    expect(result).toEqual({ exitCode: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/aleksi/source/oxveil && npx vitest run src/test/unit/core/processManager.test.ts`
Expected: FAIL (method signatures don't match)

- [ ] **Step 3: Update `IProcessManager` interface**

In `/Users/aleksi/source/oxveil/src/core/interfaces.ts:20-28`:

```typescript
export interface AiParseResult {
  exitCode: number;
}

export interface IProcessManager {
  spawn(): Promise<void>;
  spawnFromPhase(phase: number | string): Promise<void>;
  markComplete(phase: number | string): Promise<void>;
  aiParse(granularity: string, options?: { dryRun?: boolean }): Promise<AiParseResult>;
  aiParseFeedback(granularity: string): Promise<AiParseResult>;
  stop(): Promise<void>;
  reset(): Promise<void>;
  readonly isRunning: boolean;
}
```

- [ ] **Step 4: Add `_spawnChildWithExitCode()` to `ProcessManager`**

In `/Users/aleksi/source/oxveil/src/core/processManager.ts`, add a new private method that resolves with exit code instead of rejecting on expected non-zero codes. Add after `_spawnChild()`:

```typescript
private _spawnChildWithExitCode(args: string[], expectedCodes: Set<number>): Promise<AiParseResult> {
  const child = this._deps.spawn(this._deps.claudeloopPath, args, {
    cwd: this._deps.workspaceRoot,
    stdio: ["ignore", "ignore", "pipe"],
  });

  this._process = child;

  const stderrChunks: Buffer[] = [];
  child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  const promise = new Promise<AiParseResult>((resolve, reject) => {
    this._exitResolve = () => resolve({ exitCode: 0 });

    child.on("error", (err: Error) => {
      this._process = null;
      this._exitResolve = null;
      this._stopping = false;
      reject(err);
    });

    child.on("close", (code: number | null) => {
      const wasStopping = this._stopping;
      this._process = null;
      this._exitResolve = null;
      this._stopping = false;
      const exitCode = code ?? 0;
      if (wasStopping || exitCode === 0 || expectedCodes.has(exitCode)) {
        resolve({ exitCode });
      } else {
        const stderr = Buffer.concat(stderrChunks).toString().trim();
        reject(new Error(
          `claudeloop exited with code ${exitCode}${stderr ? `: ${stderr}` : ""}`,
        ));
      }
    });
  });

  this._exitPromise = promise.then(() => {});
  return promise;
}
```

- [ ] **Step 5: Update `aiParse()` and add `aiParseFeedback()`**

Replace the existing `aiParse` method and add the new one:

```typescript
async aiParse(granularity: string, options?: { dryRun?: boolean }): Promise<AiParseResult> {
  if (await this._deps.lockExists()) {
    throw new Error("lock file exists — claudeloop is already running");
  }

  const args = ["--ai-parse", "--no-retry", "--granularity", granularity];
  if (options?.dryRun) {
    args.push("--dry-run");
  }
  return this._spawnChildWithExitCode(args, new Set([2]));
}

async aiParseFeedback(granularity: string): Promise<AiParseResult> {
  if (await this._deps.lockExists()) {
    throw new Error("lock file exists — claudeloop is already running");
  }

  const args = ["--ai-parse-feedback", "--granularity", granularity];
  return this._spawnChildWithExitCode(args, new Set([2]));
}
```

- [ ] **Step 6: Add `AiParseResult` import to processManager.ts**

Add to imports at top of file:

```typescript
import type { IProcessManager, AiParseResult } from "./interfaces";
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd /Users/aleksi/source/oxveil && npx vitest run src/test/unit/core/processManager.test.ts`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
cd /Users/aleksi/source/oxveil
git add src/core/interfaces.ts src/core/processManager.ts src/test/unit/core/processManager.test.ts
git commit -m "feat: add aiParseFeedback method and exit code 2 handling to ProcessManager"
```

---

## Task 4: Oxveil — Add log formatter patterns for verification lines

**Files:**
- Modify: `/Users/aleksi/source/oxveil/src/parsers/logFormatter.ts:1-13`
- Modify: `/Users/aleksi/source/oxveil/src/test/unit/parsers/logFormatter.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `/Users/aleksi/source/oxveil/src/test/unit/parsers/logFormatter.test.ts`:

```typescript
it("formats verification passed line", () => {
  const result = formatLogLine("  [14:33:12] ✓ Verification passed");
  expect(result).toContain('class="log-success"');
  expect(result).toContain("Verification passed");
});

it("formats verification failed line", () => {
  const result = formatLogLine("  [14:33:12] ✗ Verification failed");
  expect(result).toContain('class="log-error"');
  expect(result).toContain("Verification failed");
});

it("formats retry separator line", () => {
  const result = formatLogLine("  [14:33:18] ───── Retry with feedback ─────");
  expect(result).toContain('class="log-divider"');
});
```

- [ ] **Step 2: Run tests to verify behavior**

Run: `cd /Users/aleksi/source/oxveil && npx vitest run src/test/unit/parsers/logFormatter.test.ts`

The `✓` line should already match `SUCCESS_RE` and the retry separator should match `DIVIDER_RE`. The `✗` line needs a new pattern — check if it matches `ERROR_RE` (it won't, since `ERROR_RE` only matches `[Result [error]`).

- [ ] **Step 3: Add `VERIFY_FAIL_RE` pattern**

In `/Users/aleksi/source/oxveil/src/parsers/logFormatter.ts`, add after `ERROR_RE` (line 10):

```typescript
const VERIFY_FAIL_RE = /✗/;
```

And add the check after the `ERROR_RE` block (after line 69):

```typescript
  if (VERIFY_FAIL_RE.test(afterTs)) {
    return `<div class="log-line"><span class="log-error">${ts}${rest}</span></div>`;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/aleksi/source/oxveil && npx vitest run src/test/unit/parsers/logFormatter.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/aleksi/source/oxveil
git add src/parsers/logFormatter.ts src/test/unit/parsers/logFormatter.test.ts
git commit -m "feat: add verification failed pattern to log formatter"
```

---

## Task 5: Oxveil — Add verify banners to Live Run Panel

**Files:**
- Modify: `/Users/aleksi/source/oxveil/src/views/liveRunHtml.ts`
- Modify: `/Users/aleksi/source/oxveil/src/views/liveRunPanel.ts:32-98,153-163`
- Modify: `/Users/aleksi/source/oxveil/src/test/unit/views/liveRunPanel.test.ts`
- Modify: `/Users/aleksi/source/oxveil/src/test/unit/views/liveRunHtml.test.ts`

- [ ] **Step 1: Write failing tests for banner HTML**

Add to `/Users/aleksi/source/oxveil/src/test/unit/views/liveRunHtml.test.ts`:

```typescript
import { renderVerifyFailedBannerHtml, renderVerifyPassedBannerHtml } from "../../../views/liveRunHtml";

describe("renderVerifyFailedBannerHtml", () => {
  it("includes failure reason and action buttons", () => {
    const html = renderVerifyFailedBannerHtml({
      reason: "Phase 3 missing auth requirement",
      attempt: 1,
      maxAttempts: 3,
    });
    expect(html).toContain("Phase 3 missing auth requirement");
    expect(html).toContain("Retry");
    expect(html).toContain("Continue");
    expect(html).toContain("Abort");
    expect(html).toContain("attempt 1 of 3");
  });

  it("hides retry button at max attempts", () => {
    const html = renderVerifyFailedBannerHtml({
      reason: "Still failing",
      attempt: 3,
      maxAttempts: 3,
    });
    expect(html).not.toContain("Retry");
    expect(html).toContain("Continue");
    expect(html).toContain("Abort");
  });
});

describe("renderVerifyPassedBannerHtml", () => {
  it("shows success with retry count", () => {
    const html = renderVerifyPassedBannerHtml({ retryCount: 1 });
    expect(html).toContain("after 1 retry");
  });

  it("shows success without retry count when 0", () => {
    const html = renderVerifyPassedBannerHtml({ retryCount: 0 });
    expect(html).not.toContain("retry");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/aleksi/source/oxveil && npx vitest run src/test/unit/views/liveRunHtml.test.ts`
Expected: FAIL (functions don't exist)

- [ ] **Step 3: Add render functions to `liveRunHtml.ts`**

Add to `/Users/aleksi/source/oxveil/src/views/liveRunHtml.ts`:

```typescript
export interface VerifyFailedOptions {
  reason: string;
  attempt: number;
  maxAttempts: number;
}

export function renderVerifyFailedBannerHtml(options: VerifyFailedOptions): string {
  const { reason, attempt, maxAttempts } = options;
  const retryButton = attempt < maxAttempts
    ? `<button class="banner-btn primary" onclick="sendAction('ai-parse-retry')">Retry with Feedback</button>`
    : "";
  return `<div class="verify-banner failed">
    <div class="verify-title">Verification Failed <span class="verify-attempt">(attempt ${attempt} of ${maxAttempts})</span></div>
    <div class="verify-reason">${escapeHtml(reason)}</div>
    <div class="verify-actions">
      ${retryButton}
      <button class="banner-btn" onclick="sendAction('ai-parse-continue')">Continue As-Is</button>
      <button class="banner-btn" onclick="sendAction('ai-parse-abort')">Abort</button>
    </div>
  </div>`;
}

export interface VerifyPassedOptions {
  retryCount: number;
}

export function renderVerifyPassedBannerHtml(options: VerifyPassedOptions): string {
  const retryNote = options.retryCount > 0
    ? ` <span class="verify-attempt">(after ${options.retryCount} retry${options.retryCount > 1 ? "s" : ""})</span>`
    : "";
  return `<div class="verify-banner passed">
    <div class="verify-title">AI Parse Complete${retryNote}</div>
    <div class="verify-actions">
      <button class="banner-btn primary" onclick="sendAction('open-result')">Open Result</button>
    </div>
  </div>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/aleksi/source/oxveil && npx vitest run src/test/unit/views/liveRunHtml.test.ts`
Expected: All tests pass

- [ ] **Step 5: Write failing tests for LiveRunPanel message handling**

Add to `/Users/aleksi/source/oxveil/src/test/unit/views/liveRunPanel.test.ts`:

```typescript
describe("verify messages", () => {
  it("posts verify-failed message to webview", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());

    panel.onVerifyFailed({ reason: "Missing req", attempt: 1, maxAttempts: 3 });

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "verify-failed" }),
    );
  });

  it("posts verify-passed message to webview", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());

    panel.onVerifyPassed({ retryCount: 1 });

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "verify-passed" }),
    );
  });

  it("emits action events from webview messages", () => {
    const mockPanel = makeMockPanel();
    const deps = makeDeps(mockPanel);
    const panel = new LiveRunPanel(deps);
    panel.reveal(makeProgress());

    const actions: string[] = [];
    panel.onAiParseAction((action) => actions.push(action));

    (mockPanel as any)._simulateMessage({ type: "ai-parse-retry" });
    expect(actions).toEqual(["ai-parse-retry"]);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd /Users/aleksi/source/oxveil && npx vitest run src/test/unit/views/liveRunPanel.test.ts`
Expected: FAIL (methods don't exist)

- [ ] **Step 7: Add verify methods and action event to `LiveRunPanel`**

In `/Users/aleksi/source/oxveil/src/views/liveRunPanel.ts`, add imports:

```typescript
import { renderDashboardHtml, renderCompletionBannerHtml, renderVerifyFailedBannerHtml, renderVerifyPassedBannerHtml, type DashboardOptions, type VerifyFailedOptions, type VerifyPassedOptions } from "./liveRunHtml";
```

Add fields after `_runStartedAt` (line 46):

```typescript
private _aiParseActionListeners: Array<(action: string) => void> = [];
```

Add methods after `onRunFinished()`:

```typescript
onVerifyFailed(options: VerifyFailedOptions): void {
  if (!this._panel) return;
  const html = renderVerifyFailedBannerHtml(options);
  this._panel.webview.postMessage({ type: "verify-failed", html });
}

onVerifyPassed(options: VerifyPassedOptions): void {
  if (!this._panel) return;
  const html = renderVerifyPassedBannerHtml(options);
  this._panel.webview.postMessage({ type: "verify-passed", html });
}

onAiParseAction(listener: (action: string) => void): () => void {
  this._aiParseActionListeners.push(listener);
  return () => {
    const idx = this._aiParseActionListeners.indexOf(listener);
    if (idx !== -1) this._aiParseActionListeners.splice(idx, 1);
  };
}
```

In the `onDidReceiveMessage` handler (inside `reveal()`, around line 83), add cases:

```typescript
} else if (msg.type === "ai-parse-retry" || msg.type === "ai-parse-continue" || msg.type === "ai-parse-abort" || msg.type === "open-result") {
  for (const listener of this._aiParseActionListeners) {
    listener(msg.type);
  }
}
```

- [ ] **Step 8: Update the Live Run webview shell to handle new message types**

The `renderLiveRunShell()` function in `liveRunHtml.ts` needs the webview JS to handle `verify-failed` and `verify-passed` messages. Add to the message handler in the shell template's `<script>`:

```javascript
case 'verify-failed':
case 'verify-passed':
  // Insert banner after the log area
  let banner = document.getElementById('verify-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'verify-banner';
    document.getElementById('log').after(banner);
  }
  banner.innerHTML = msg.html;
  break;
```

Also add a `sendAction` function to the webview JS:

```javascript
function sendAction(type) {
  vscode.postMessage({ type });
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd /Users/aleksi/source/oxveil && npx vitest run src/test/unit/views/liveRunPanel.test.ts src/test/unit/views/liveRunHtml.test.ts`
Expected: All tests pass

- [ ] **Step 10: Commit**

```bash
cd /Users/aleksi/source/oxveil
git add src/views/liveRunHtml.ts src/views/liveRunPanel.ts src/test/unit/views/liveRunPanel.test.ts src/test/unit/views/liveRunHtml.test.ts
git commit -m "feat: add verification banners and action events to Live Run Panel"
```

---

## Task 6: Oxveil — Create `aiParseLoop` orchestrator

**Files:**
- Create: `/Users/aleksi/source/oxveil/src/commands/aiParseLoop.ts`
- Create: `/Users/aleksi/source/oxveil/src/test/unit/commands/aiParseLoop.test.ts`

- [ ] **Step 1: Write failing tests for the state machine**

Create `/Users/aleksi/source/oxveil/src/test/unit/commands/aiParseLoop.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiParseLoop } from "../../../commands/aiParseLoop";
import type { AiParseResult } from "../../../core/interfaces";

function makeProcessManager(results: AiParseResult[]) {
  let callIndex = 0;
  return {
    aiParse: vi.fn(async () => results[callIndex++]),
    aiParseFeedback: vi.fn(async () => results[callIndex++]),
    isRunning: false,
  };
}

function makeLiveRunPanel() {
  const actionCallbacks: Array<(action: string) => void> = [];
  return {
    reveal: vi.fn(),
    onVerifyFailed: vi.fn(),
    onVerifyPassed: vi.fn(),
    onAiParseAction: vi.fn((cb: (action: string) => void) => {
      actionCallbacks.push(cb);
      return () => { actionCallbacks.splice(actionCallbacks.indexOf(cb), 1); };
    }),
    onLogAppended: vi.fn(),
    visible: false,
    _triggerAction(action: string) {
      for (const cb of actionCallbacks) cb(action);
    },
  };
}

describe("aiParseLoop", () => {
  it("returns pass on immediate verification success", async () => {
    const pm = makeProcessManager([{ exitCode: 0 }]);
    const panel = makeLiveRunPanel();
    const readVerifyReason = vi.fn();

    const result = await aiParseLoop({
      processManager: pm as any,
      liveRunPanel: panel as any,
      granularity: "tasks",
      readVerifyReason,
    });

    expect(result.outcome).toBe("pass");
    expect(panel.onVerifyPassed).toHaveBeenCalled();
  });

  it("shows failure and returns aborted on abort", async () => {
    const pm = makeProcessManager([{ exitCode: 2 }]);
    const panel = makeLiveRunPanel();
    const readVerifyReason = vi.fn().mockResolvedValue("Missing requirement");

    const promise = aiParseLoop({
      processManager: pm as any,
      liveRunPanel: panel as any,
      granularity: "tasks",
      readVerifyReason,
    });

    // Wait for the verify-failed to be posted
    await vi.waitFor(() => {
      expect(panel.onVerifyFailed).toHaveBeenCalled();
    });

    panel._triggerAction("ai-parse-abort");
    const result = await promise;
    expect(result.outcome).toBe("aborted");
  });

  it("retries on retry action and returns pass", async () => {
    const pm = makeProcessManager([
      { exitCode: 2 },  // first: fail
      { exitCode: 0 },  // retry: pass
    ]);
    const panel = makeLiveRunPanel();
    const readVerifyReason = vi.fn().mockResolvedValue("Missing req");

    const promise = aiParseLoop({
      processManager: pm as any,
      liveRunPanel: panel as any,
      granularity: "tasks",
      readVerifyReason,
    });

    await vi.waitFor(() => {
      expect(panel.onVerifyFailed).toHaveBeenCalled();
    });

    panel._triggerAction("ai-parse-retry");
    const result = await promise;
    expect(result.outcome).toBe("pass");
    expect(pm.aiParseFeedback).toHaveBeenCalledWith("tasks");
  });

  it("returns continued on continue action", async () => {
    const pm = makeProcessManager([{ exitCode: 2 }]);
    const panel = makeLiveRunPanel();
    const readVerifyReason = vi.fn().mockResolvedValue("Issue");

    const promise = aiParseLoop({
      processManager: pm as any,
      liveRunPanel: panel as any,
      granularity: "tasks",
      readVerifyReason,
    });

    await vi.waitFor(() => {
      expect(panel.onVerifyFailed).toHaveBeenCalled();
    });

    panel._triggerAction("ai-parse-continue");
    const result = await promise;
    expect(result.outcome).toBe("continued");
  });

  it("removes retry button after max attempts", async () => {
    const pm = makeProcessManager([
      { exitCode: 2 }, { exitCode: 2 }, { exitCode: 2 }, { exitCode: 2 },
    ]);
    const panel = makeLiveRunPanel();
    const readVerifyReason = vi.fn().mockResolvedValue("Issue");

    const promise = aiParseLoop({
      processManager: pm as any,
      liveRunPanel: panel as any,
      granularity: "tasks",
      readVerifyReason,
    });

    // Retry 3 times
    for (let i = 0; i < 3; i++) {
      await vi.waitFor(() => {
        expect(panel.onVerifyFailed).toHaveBeenCalledTimes(i + 1);
      });
      panel._triggerAction("ai-parse-retry");
    }

    // 4th failure: should show maxAttempts reached (attempt 3 of 3)
    await vi.waitFor(() => {
      expect(panel.onVerifyFailed).toHaveBeenCalledTimes(4);
    });
    const lastCall = panel.onVerifyFailed.mock.calls[3][0];
    expect(lastCall.attempt).toBe(3);
    expect(lastCall.maxAttempts).toBe(3);

    panel._triggerAction("ai-parse-abort");
    const result = await promise;
    expect(result.outcome).toBe("aborted");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/aleksi/source/oxveil && npx vitest run src/test/unit/commands/aiParseLoop.test.ts`
Expected: FAIL (module doesn't exist)

- [ ] **Step 3: Implement `aiParseLoop`**

Create `/Users/aleksi/source/oxveil/src/commands/aiParseLoop.ts`:

```typescript
import type { IProcessManager, AiParseResult } from "../core/interfaces";
import type { LiveRunPanel } from "../views/liveRunPanel";

const MAX_RETRIES = 3;

export interface AiParseLoopResult {
  outcome: "pass" | "continued" | "aborted";
}

export interface AiParseLoopDeps {
  processManager: IProcessManager;
  liveRunPanel: LiveRunPanel;
  granularity: string;
  readVerifyReason: () => Promise<string>;
  options?: { dryRun?: boolean };
}

export async function aiParseLoop(deps: AiParseLoopDeps): Promise<AiParseLoopResult> {
  const { processManager, liveRunPanel, granularity, readVerifyReason, options } = deps;
  let attempt = 0;

  // Initial parse
  let result: AiParseResult = await processManager.aiParse(granularity, options);

  while (true) {
    if (result.exitCode === 0) {
      liveRunPanel.onVerifyPassed({ retryCount: attempt });
      return { outcome: "pass" };
    }

    // Exit code 2: verification failed
    attempt++;
    const reason = await readVerifyReason();
    const atMax = attempt >= MAX_RETRIES;

    liveRunPanel.onVerifyFailed({
      reason,
      attempt: Math.min(attempt, MAX_RETRIES),
      maxAttempts: MAX_RETRIES,
    });

    // Wait for user action
    const action = await waitForAction(liveRunPanel);

    if (action === "ai-parse-abort") {
      return { outcome: "aborted" };
    }

    if (action === "ai-parse-continue") {
      return { outcome: "continued" };
    }

    // action === "ai-parse-retry"
    if (atMax) {
      // Should not happen — retry button hidden at max, but guard anyway
      return { outcome: "aborted" };
    }

    result = await processManager.aiParseFeedback(granularity);
  }
}

function waitForAction(liveRunPanel: LiveRunPanel): Promise<string> {
  return new Promise((resolve) => {
    const unsubscribe = liveRunPanel.onAiParseAction((action) => {
      unsubscribe();
      resolve(action);
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/aleksi/source/oxveil && npx vitest run src/test/unit/commands/aiParseLoop.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/aleksi/source/oxveil
git add src/commands/aiParseLoop.ts src/test/unit/commands/aiParseLoop.test.ts
git commit -m "feat: add aiParseLoop retry orchestrator"
```

---

## Task 7: Oxveil — Wire `aiParsePlan` and `formPlan` to use `aiParseLoop`

**Files:**
- Modify: `/Users/aleksi/source/oxveil/src/commands/aiParsePlan.ts`
- Modify: `/Users/aleksi/source/oxveil/src/commands/formPlan.ts`
- Modify: `/Users/aleksi/source/oxveil/src/test/integration/aiParsePlan.test.ts`
- Modify: `/Users/aleksi/source/oxveil/src/test/unit/commands/formPlan.test.ts`

- [ ] **Step 1: Update `aiParsePlan` to use `aiParseLoop`**

Replace `/Users/aleksi/source/oxveil/src/commands/aiParsePlan.ts` contents. The command needs access to the LiveRunPanel — check how it's registered and how to inject the dependency. The key change: replace the `vscode.window.withProgress` + `processManager.aiParse()` call with `aiParseLoop()`, and open the Live Run Panel for streaming.

Read the registration site to understand dependency injection, then update accordingly. The `readVerifyReason` dependency reads `.claudeloop/ai-verify-reason.txt` from the workspace root.

- [ ] **Step 2: Update `formPlan` to use `aiParseLoop`**

In `/Users/aleksi/source/oxveil/src/commands/formPlan.ts`:
- Add `LiveRunPanel` to `FormPlanCommandDeps`
- Remove the `formPlanLoop` recursive retry pattern (lines 78-172)
- Replace the `try/catch` around `processManager.aiParse()` (lines 104-128) with a call to `aiParseLoop()`
- Keep the existing validation logic (parsePlan, phase count check, ai-parsed-plan.md handling) — move it after `aiParseLoop` returns
- Handle `outcome: "aborted"` by returning early
- Handle `outcome: "pass" | "continued"` by proceeding to validation and `onPlanFormed()`

- [ ] **Step 3: Update tests**

Update `/Users/aleksi/source/oxveil/src/test/integration/aiParsePlan.test.ts` and `/Users/aleksi/source/oxveil/src/test/unit/commands/formPlan.test.ts` to account for the new `aiParse` return type (`{ exitCode: number }` instead of `void`) and the `aiParseLoop` integration.

- [ ] **Step 4: Run all tests**

Run: `cd /Users/aleksi/source/oxveil && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/aleksi/source/oxveil
git add src/commands/aiParsePlan.ts src/commands/formPlan.ts src/test/integration/aiParsePlan.test.ts src/test/unit/commands/formPlan.test.ts
git commit -m "feat: wire aiParsePlan and formPlan to aiParseLoop retry orchestrator"
```

---

## Task 8: Oxveil — Open Live Run Panel during AI parse

**Files:**
- Modify: `/Users/aleksi/source/oxveil/src/commands/aiParseLoop.ts`
- Modify: `/Users/aleksi/source/oxveil/src/views/liveRunPanel.ts`

- [ ] **Step 1: Add `revealForAiParse()` method to LiveRunPanel**

The existing `reveal()` requires a `ProgressState` (phase data), which doesn't exist during AI parse. Add a lightweight reveal method:

```typescript
revealForAiParse(folderUri?: string): void {
  this._currentFolderUri = folderUri;
  if (!this._panel) {
    const nonce = randomBytes(16).toString("hex");
    this._panel = this._deps.createWebviewPanel(
      "oxveil.liveRun",
      "Live Run",
      1,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this._panel.webview.html = renderLiveRunShell(nonce, this._panel.webview.cspSource);
    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });
    this._panel.webview.onDidReceiveMessage((msg: any) => {
      if (msg.type === "ai-parse-retry" || msg.type === "ai-parse-continue" || msg.type === "ai-parse-abort" || msg.type === "open-result") {
        for (const listener of this._aiParseActionListeners) {
          listener(msg.type);
        }
      }
    });
  } else {
    this._panel.reveal();
  }
  this._flushBuffer();
}
```

Note: the `onDidReceiveMessage` handler registration is duplicated between `reveal()` and `revealForAiParse()`. Refactor the panel creation into a shared `_ensurePanel()` method to avoid duplication.

- [ ] **Step 2: Call `revealForAiParse()` in `aiParseLoop`**

At the start of `aiParseLoop()`, before the first `processManager.aiParse()` call:

```typescript
liveRunPanel.revealForAiParse();
```

- [ ] **Step 3: Write test for panel reveal during AI parse**

Add to `aiParseLoop.test.ts`:

```typescript
it("reveals Live Run Panel at start", async () => {
  const pm = makeProcessManager([{ exitCode: 0 }]);
  const panel = makeLiveRunPanel();
  const readVerifyReason = vi.fn();

  await aiParseLoop({
    processManager: pm as any,
    liveRunPanel: panel as any,
    granularity: "tasks",
    readVerifyReason,
  });

  expect(panel.revealForAiParse).toHaveBeenCalled();
});
```

Update `makeLiveRunPanel()` to include `revealForAiParse: vi.fn()`.

- [ ] **Step 4: Run tests**

Run: `cd /Users/aleksi/source/oxveil && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/aleksi/source/oxveil
git add src/commands/aiParseLoop.ts src/views/liveRunPanel.ts src/test/unit/commands/aiParseLoop.test.ts
git commit -m "feat: open Live Run Panel during AI parse for streaming visibility"
```

---

## Task 9: Visual verification

- [ ] **Step 1: Run `/visual-verification`**

Action: `/visual-verification`

Verify all 5 UI states:
1. Live Run Panel opens and streams log lines during AI parse
2. Success banner renders correctly on verification pass
3. Failure banner with reason text and Retry/Continue/Abort buttons renders on verification fail
4. Retry separator and continued log streaming after retry
5. Max-retries state shows only Continue/Abort

- [ ] **Step 2: Fix any issues found, re-run until passing**

---

## Task 10: Documentation updates — claudeloop

**Files:**
- Modify: `/Users/aleksi/source/claudeloop/README.md`
- Modify: `/Users/aleksi/source/claudeloop/QUICKSTART.md`
- Modify: `/Users/aleksi/source/claudeloop/docs/adr/0014-ai-verify-feedback-loop.md`
- Modify: `/Users/aleksi/source/claudeloop/CLAUDE.md`

- [ ] **Step 1: Update README.md**

Add `--no-retry` and `--ai-parse-feedback` to the CLI options table. Update the "AI Plan Decomposition" section to describe non-interactive usage with examples.

- [ ] **Step 2: Update QUICKSTART.md**

Add examples: `--ai-parse --no-retry` for CI/unattended, `--ai-parse-feedback` for programmatic retry.

- [ ] **Step 3: Update ADR 0014**

Add a "Consequences" subsection noting the new flags enable external callers (Oxveil) to drive the feedback loop non-interactively.

- [ ] **Step 4: Update CLAUDE.md**

Update the `lib/ai_parser.sh` entry in the libraries table to note `--no-retry` and `--ai-parse-feedback` parameter handling.

- [ ] **Step 5: Commit**

```bash
cd /Users/aleksi/source/claudeloop
git add README.md QUICKSTART.md docs/adr/0014-ai-verify-feedback-loop.md CLAUDE.md
git commit -m "docs: document --no-retry and --ai-parse-feedback flags"
```

---

## Task 11: Documentation updates — Oxveil

**Files:**
- Modify: `/Users/aleksi/source/oxveil/README.md`
- Modify: `/Users/aleksi/source/oxveil/ARCHITECTURE.md`
- Modify: `/Users/aleksi/source/oxveil/package.json`
- Create: `/Users/aleksi/source/oxveil/docs/adr/0012-ai-parse-retry-feedback-loop.md`
- Modify: `/Users/aleksi/source/oxveil/docs/adr/README.md`

- [ ] **Step 1: Update README.md**

Update the "AI Parse Plan" feature row to mention retry-with-feedback UI and streaming visibility. Update `oxveil.liveRunAutoOpen` setting description.

- [ ] **Step 2: Update ARCHITECTURE.md**

Update Process Manager section for new `aiParseFeedback()` method and return type changes. Update Live Run Panel section to note it opens during AI parse. Add `aiParseLoop.ts` to command orchestration docs.

- [ ] **Step 3: Update package.json**

Review `oxveil.liveRunAutoOpen` description — clarify it covers both phase execution and AI parse.

- [ ] **Step 4: Create ADR 0012**

Create `/Users/aleksi/source/oxveil/docs/adr/0012-ai-parse-retry-feedback-loop.md` using the template at `docs/adr/TEMPLATE.md`. Document:
- Decision to control the retry loop in Oxveil (not claudeloop)
- Exit code convention (0=pass, 2=fail, 1=error)
- Choice to host retry UI in the Live Run Panel
- `--ai-parse-feedback` as boolean flag reading from file

Update `docs/adr/README.md` with the new entry.

- [ ] **Step 5: Commit**

```bash
cd /Users/aleksi/source/oxveil
git add README.md ARCHITECTURE.md package.json docs/adr/0012-ai-parse-retry-feedback-loop.md docs/adr/README.md
git commit -m "docs: document AI parse retry-with-feedback loop and Live Run Panel integration"
```

---

## Task 12: Final quality gate

- [ ] **Step 1: Run Oxveil lint and tests**

Run: `cd /Users/aleksi/source/oxveil && npm run lint && npm test`
Expected: All pass with no errors

- [ ] **Step 2: Run claudeloop tests**

Run: `cd /Users/aleksi/source/claudeloop && bats tests/`
Expected: All pass

- [ ] **Step 3: Fix any failures, re-run until green**
