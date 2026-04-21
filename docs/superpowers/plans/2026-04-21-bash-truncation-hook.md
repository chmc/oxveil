# Bash Truncation Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PreToolUse hook that truncates Bash output to ~200 lines via awk circular buffer, with allowlist passthrough and self-maintaining CLAUDE.md rules.

**Architecture:** Single Node.js script reads hook JSON from stdin, checks command against allowlist/bounded patterns, and returns `updatedInput` with the command wrapped in `set -o pipefail; { CMD; } 2>&1 | awk '...'`. No external deps.

**Tech Stack:** Node.js (builtins only), awk, Claude Code hooks API

**Spec:** `docs/superpowers/specs/2026-04-21-bash-truncation-hook-design.md`

---

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `.claude/hooks/bash-truncate.mjs` | Create | Hook script — stdin JSON parsing, allowlist, wrapping |
| `.claude/settings.json` | Modify | Add PreToolUse hook config |
| `CLAUDE.md` | Modify | Add self-maintenance rules |

---

### Task 1: Create hook script with allowlist and wrap logic

**Files:**
- Create: `.claude/hooks/bash-truncate.mjs`

- [ ] **Step 1: Create hooks directory and script skeleton**

```bash
mkdir -p .claude/hooks
```

Write `.claude/hooks/bash-truncate.mjs`:

```javascript
#!/usr/bin/env node

// --- Configuration (edit these lists to maintain the hook) ---

const HEAD_LINES = 150;
const TAIL_LINES = 50;

// Commands that produce short/no output — skip wrapping
const ALLOWLIST = [
  /^(echo|printf|pwd|which|type|date|whoami)\b/,
  /^(mkdir|cp|mv|rm|chmod|touch|ln)\b/,
  /^ls\b(?!.*\s-\S*R)/,           // ls without -R
  /^git\b/,
  /^node\s+-[ep]\b/,
  /^(npx|npm)\s+--version\b/,
  /^npm\s+version\b/,
  /^(export|source|cd|kill|set|true|false)\b/,
];

// Pipe targets that already bound output
const BOUNDED_PIPES = [
  /\|\s*(head|tail|wc|grep|jq|awk|sed|sort\s*\|\s*head|xargs)\b/,
];

// --- Core logic ---

function readStdin() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => resolve(''), 2000);
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { clearTimeout(timeout); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timeout); resolve(''); });
  });
}

function isAllowlisted(cmd) {
  const trimmed = cmd.trim();
  if (ALLOWLIST.some((re) => re.test(trimmed))) return true;
  if (BOUNDED_PIPES.some((re) => re.test(trimmed))) return true;
  return false;
}

function shouldSkipWrap(cmd) {
  // Heredocs break when wrapped
  if (/<</.test(cmd)) return true;
  // Output redirected to file — no context tokens consumed
  if (/\s>\s|^>|>>/.test(cmd)) return true;
  // Already has 2>&1 piped elsewhere — avoid double-redirect
  if (/2>&1\s*\|/.test(cmd)) return true;
  // Help flags — short output
  if (/\s--help\b|\s-h\b/.test(cmd)) return true;
  return false;
}

function wrapCommand(cmd) {
  const awkScript = [
    `NR<=${HEAD_LINES}{print;next}`,
    `{buf[NR%${TAIL_LINES}]=$0;t=NR}`,
    `END{if(t>${HEAD_LINES}){print "";`,
    `print "--- truncated (showing last ${TAIL_LINES} lines) ---";`,
    `s=t-${TAIL_LINES - 1};for(i=s;i<=t;i++)print buf[i%${TAIL_LINES}]}}`,
  ].join('');
  return `set -o pipefail; { ${cmd}; } 2>&1 | awk '${awkScript}'`;
}

async function main() {
  // Kill switch
  if (process.env.OXVEIL_BASH_HOOK === '0') {
    process.exit(0);
  }

  const raw = await readStdin();
  if (!raw) process.exit(0);

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const cmd = input?.tool_input?.command;
  if (!cmd || typeof cmd !== 'string') process.exit(0);

  if (isAllowlisted(cmd)) process.exit(0);
  if (shouldSkipWrap(cmd)) process.exit(0);

  const wrapped = wrapCommand(cmd);
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { command: wrapped },
    },
  };
  process.stdout.write(JSON.stringify(output));
}

main();
```

- [ ] **Step 2: Verify script parses and runs without errors**

```bash
echo '{"tool_input":{"command":"npm test"}}' | node .claude/hooks/bash-truncate.mjs
```

Expected: JSON output with `updatedInput` containing wrapped command.

- [ ] **Step 3: Commit**

```bash
git add .claude/hooks/bash-truncate.mjs
git commit -m "feat: add PreToolUse bash truncation hook script"
```

---

### Task 2: Unit-test all code paths

**Files:**
- Reference: `.claude/hooks/bash-truncate.mjs`

No test framework — these are shell-level verifications run directly.

- [ ] **Step 1: Test allowlisted commands pass through**

```bash
echo '{"tool_input":{"command":"git status"}}' | node .claude/hooks/bash-truncate.mjs
echo '{"tool_input":{"command":"echo hello"}}' | node .claude/hooks/bash-truncate.mjs
echo '{"tool_input":{"command":"ls -la"}}' | node .claude/hooks/bash-truncate.mjs
echo '{"tool_input":{"command":"mkdir -p foo"}}' | node .claude/hooks/bash-truncate.mjs
```

Expected: No stdout for any of these (exit 0, passthrough).

- [ ] **Step 2: Test non-allowlisted commands get wrapped**

```bash
echo '{"tool_input":{"command":"npm test"}}' | node .claude/hooks/bash-truncate.mjs
echo '{"tool_input":{"command":"npm run build"}}' | node .claude/hooks/bash-truncate.mjs
echo '{"tool_input":{"command":"seq 1 10000"}}' | node .claude/hooks/bash-truncate.mjs
```

Expected: JSON with `updatedInput.command` containing `set -o pipefail; { ... } 2>&1 | awk '...'`.

- [ ] **Step 3: Test already-bounded commands pass through**

```bash
echo '{"tool_input":{"command":"npm test | head -20"}}' | node .claude/hooks/bash-truncate.mjs
echo '{"tool_input":{"command":"find . -name *.ts | wc -l"}}' | node .claude/hooks/bash-truncate.mjs
echo '{"tool_input":{"command":"curl -s url | jq ."}}' | node .claude/hooks/bash-truncate.mjs
```

Expected: No stdout (passthrough).

- [ ] **Step 4: Test skip-wrap conditions**

```bash
echo '{"tool_input":{"command":"cat <<EOF\nhello\nEOF"}}' | node .claude/hooks/bash-truncate.mjs
echo '{"tool_input":{"command":"npm test > output.log"}}' | node .claude/hooks/bash-truncate.mjs
echo '{"tool_input":{"command":"node --help"}}' | node .claude/hooks/bash-truncate.mjs
```

Expected: No stdout (passthrough).

- [ ] **Step 5: Test kill switch**

```bash
echo '{"tool_input":{"command":"npm test"}}' | OXVEIL_BASH_HOOK=0 node .claude/hooks/bash-truncate.mjs
```

Expected: No stdout (passthrough).

- [ ] **Step 6: Test malformed/empty input**

```bash
echo '' | node .claude/hooks/bash-truncate.mjs
echo 'not json' | node .claude/hooks/bash-truncate.mjs
echo '{}' | node .claude/hooks/bash-truncate.mjs
echo '{"tool_input":{}}' | node .claude/hooks/bash-truncate.mjs
```

Expected: No stdout, exit 0 for all.

- [ ] **Step 7: Test awk truncation correctness end-to-end**

```bash
AWK_CMD="awk 'NR<=150{print;next}{buf[NR%50]=\$0;t=NR}END{if(t>150){print \"\";print \"--- truncated (showing last 50 lines) ---\";s=t-49;for(i=s;i<=t;i++)print buf[i%50]}}'"

# 10 lines — no truncation
seq 1 10 | eval "$AWK_CMD" | wc -l          # Expected: 10

# 150 lines — exact boundary, no truncation
seq 1 150 | eval "$AWK_CMD" | wc -l         # Expected: 150

# 200 lines — just over boundary
seq 1 200 | eval "$AWK_CMD" | wc -l         # Expected: 202

# 500 lines — truncated
seq 1 500 | eval "$AWK_CMD" | wc -l         # Expected: 202

# 10000 lines — large input
seq 1 10000 | eval "$AWK_CMD" | wc -l       # Expected: 202

# Verify tail content is correct
seq 1 500 | eval "$AWK_CMD" | tail -1       # Expected: 500
seq 1 10000 | eval "$AWK_CMD" | tail -1     # Expected: 10000

# Exit code preserved through pipefail
set -o pipefail; { false; } 2>&1 | awk '{print}'; echo $?
# Expected: 1
```

- [ ] **Step 8: Test chained command wrapping**

```bash
echo '{"tool_input":{"command":"git status && npm test"}}' | node .claude/hooks/bash-truncate.mjs
```

Expected: JSON with wrapped command. The `{ git status && npm test; }` grouping handles chains correctly.

```bash
echo '{"tool_input":{"command":"npm test 2>&1 | tee output.log"}}' | node .claude/hooks/bash-truncate.mjs
```

Expected: No stdout (passthrough — `2>&1 |` triggers shouldSkipWrap).

- [ ] **Step 9: Commit test results as verification notes**

No new files — tests are run-and-verify. Commit is deferred to Task 4.

---

### Task 3: Wire hook into settings and CLAUDE.md

**Files:**
- Modify: `.claude/settings.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add hook config to settings.json**

Add a `hooks` key to the existing `.claude/settings.json` — preserve the existing `env` key. The result should be:

```json
{
  "env": {
    "DISABLE_AUTOUPDATER": "1"
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/bash-truncate.mjs",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Add self-maintenance rules to CLAUDE.md**

Append after the "Continuous Improvement" section:

```markdown
## Bash Truncation Hook (.claude/hooks/bash-truncate.mjs)

- NEVER work around the hook by modifying commands to avoid pattern matching. Fix the hook instead.
- NEVER wrap commands in `sh -c` or `bash -c` to bypass the hook.
- NEVER remove or disable the hook entry in `.claude/settings.json`.
- On false positive (useful output truncated): add command pattern to ALLOWLIST in bash-truncate.mjs.
- On false negative (verbose output passed through): add pattern to BOUNDED_PIPES.
- After editing, verify: `node .claude/hooks/bash-truncate.mjs <<< '{"tool_input":{"command":"TEST_CMD"}}'`
- To disable for a session without editing the hook: `export OXVEIL_BASH_HOOK=0`
```

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.json CLAUDE.md
git commit -m "feat: wire bash truncation hook into project settings"
```

---

### Task 4: Integration verification

**Files:**
- Reference: `.claude/hooks/bash-truncate.mjs`, `.claude/settings.json`

- [ ] **Step 1: Run npm lint and npm test**

```bash
npm run lint
npm test
```

Expected: Both pass. The hook script is not TypeScript, so lint/test won't cover it — but we verify no regressions.

- [ ] **Step 2: Verify hook fires in a live Claude Code session**

Start a new Claude Code session in the Oxveil repo and run a verbose Bash command:

```bash
seq 1 1000
```

Expected: Output truncated to ~200 lines with `--- truncated (showing last 50 lines) ---` marker. Last line is `1000`.

- [ ] **Step 3: Verify allowlisted command passes through**

In the same session:

```bash
git status
```

Expected: Normal `git status` output, no truncation.

- [ ] **Step 4: Verify kill switch**

```bash
export OXVEIL_BASH_HOOK=0
seq 1 1000
```

Expected: Full 1000 lines, no truncation.

- [ ] **Step 5: Run Codex review**

Spawn codex:codex-rescue subagent: "review `git diff`. issues only. terse. no preamble. if clean: LGTM. under 200 words."

Fix any findings, re-run lint/test, re-review. Loop up to 3 times.

- [ ] **Step 6: Final commit**

If Codex review produced fixes:
```bash
git add -A
git commit -m "fix: address codex review findings for bash truncation hook

Closes #52"
```

If Codex review was clean (LGTM), amend `Closes #52` into the Task 3 commit:
```bash
git commit --amend -m "feat: wire bash truncation hook into project settings

Closes #52"
```
