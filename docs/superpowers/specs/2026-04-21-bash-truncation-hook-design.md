# Bash Truncation Hook — PreToolUse Output Limiter

**Issue:** [chmc/oxveil#52](https://github.com/chmc/oxveil/issues/52)
**Date:** 2026-04-21

## Problem

Bash tool outputs (test runs, builds, finds) dump full raw output into context and persist for the entire session. A single verbose test run can consume 10K+ tokens that are never useful again.

PostToolUse hooks cannot truncate built-in tool output — only `updatedMCPToolOutput` exists, gated to MCP tools. PreToolUse `updatedInput` can rewrite commands before execution, enabling output truncation at the source.

## Design

### Approach: Wrap-only with allowlist

Single-phase PreToolUse hook on the Bash tool. All commands not matching an allowlist get wrapped with an awk-based truncation pipe that keeps the first 150 + last 50 lines.

No deny phase — wrapping alone achieves the token savings without causing model retry loops or false-positive denials.

### Hook Location

- **Script:** `.claude/hooks/bash-truncate.mjs` (Node.js, no external deps)
- **Config:** `.claude/settings.json` → `hooks.PreToolUse` matcher on `Bash`
- **Scope:** Project-level (Oxveil repo only)
- **Directory:** `.claude/hooks/` (create if missing)

### Settings Configuration

```json
{
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

### Allowlist (passthrough without wrapping)

Commands that skip wrapping:

- `echo`, `printf`, `pwd`, `which`, `type`, `date`, `whoami` — short output
- `mkdir`, `cp`, `mv`, `rm`, `chmod`, `touch`, `ln` — no/minimal output
- `ls` without `-R` — bounded
- `git` — bounded by Claude Code (except `git log --all` on huge repos, but acceptable)
- `node -e`, `node -p`, `npx --version`, `npm --version` — short output
- Commands already piping to bounded outputs: `| head`, `| tail`, `| wc`, `| grep`, `| jq`, `| awk`, `| sed`, `| sort | head`, `| xargs`
- Commands redirecting output: `> `, `>> `
- Commands with `--help` or `-h` flag
- `OXVEIL_BASH_HOOK=0` env var set → all commands pass through (session-level kill switch)

### Wrap Template

Single-pass awk circular buffer — verified working for 0, 10, 150, 500, and 10000 lines:

```bash
set -o pipefail; { ORIGINAL_COMMAND; } 2>&1 | awk 'NR<=150{print;next}{buf[NR%50]=$0;t=NR}END{if(t>150){print "";print "--- truncated (showing last 50 lines) ---";s=t-49;for(i=s;i<=t;i++)print buf[i%50]}}'
```

- `set -o pipefail` — preserves original command's exit code through the pipe
- `NR<=150` — first 150 lines pass through (errors, first failures)
- `buf[NR%50]` — O(1) memory circular buffer for last 50 lines
- Clean passthrough when output <= 150 lines (no truncation banner)
- Max output: ~202 lines (150 + marker + 50 + blank)

**Wrapping skipped when command:**
- Already contains `2>&1` with its own redirect to avoid double-redirect
- Contains heredoc (`<<`) — wrapping breaks heredoc semantics

Output:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "updatedInput": {
      "command": "set -o pipefail; { npm test; } 2>&1 | awk '...'"
    }
  }
}
```

### Script Structure

```
bash-truncate.mjs
├── ALLOWLIST[]         — regex patterns for passthrough
├── BOUNDED_PATTERNS[]  — already-bounded detection (| head, | tail, | jq, etc.)
├── HEAD_LINES = 150    — configurable line count for head
├── TAIL_LINES = 50     — configurable line count for tail
├── readStdin()         — read JSON from stdin with 2s timeout
├── isAllowlisted(cmd)  — check allowlist + bounded patterns
├── shouldSkipWrap(cmd) — check heredocs, existing redirects
├── wrapCommand(cmd)    — apply awk template with pipefail
└── main()              — orchestrate: kill switch → allowlist → skip check → wrap
```

### Error Handling

- **stdin read timeout:** 2s — if JSON parsing fails, exit 0 (allow unchanged)
- **Hook timeout:** 5s in settings — if script hangs, Claude Code kills it and runs command unmodified
- **Script syntax error / missing file:** Node exits non-zero → Claude Code treats as hook failure, runs command unmodified
- **Permission error:** Same as above — non-zero exit → command runs unmodified
- No external dependencies — Node.js builtins only (`process.stdin`, `JSON.parse`)

### Self-Maintenance via CLAUDE.md

```markdown
## Bash Truncation Hook (.claude/hooks/bash-truncate.mjs)

- NEVER work around the hook by modifying commands to avoid pattern matching. Fix the hook instead.
- NEVER wrap commands in `sh -c` or `bash -c` to bypass the hook.
- NEVER remove or disable the hook entry in `.claude/settings.json`.
- On false positive (useful output truncated): add command pattern to ALLOWLIST in bash-truncate.mjs.
- On false negative (verbose output passed through): add pattern to BOUNDED_PATTERNS.
- After editing, verify: `node .claude/hooks/bash-truncate.mjs <<< '{"tool_input":{"command":"TEST_CMD"}}'`
- To disable for a session without editing the hook: `export OXVEIL_BASH_HOOK=0`
```

### Testing

- **Unit:** pipe JSON to stdin, verify stdout JSON for each code path:
  - Allowlisted command → exit 0 with no stdout (passthrough)
  - Non-allowlisted command → `updatedInput` with wrapped command
  - Already-bounded command (contains `| head`) → passthrough
  - Heredoc command → passthrough
  - Empty/malformed stdin → exit 0 (passthrough)
  - `OXVEIL_BASH_HOOK=0` → passthrough
- **Exit code preservation:** run `set -o pipefail; { false; } 2>&1 | awk '...'` and verify exit code 1
- **Truncation correctness:** verify 10-line, 150-line, 200-line, 500-line, 10000-line inputs produce correct head+tail
- **Integration:** run Claude Code with hook active, execute `seq 1 1000`, verify truncated output
- **No interference:** verify existing PreToolUse hooks (if any) still fire

### Edge Cases Documented

- **`&&`/`||`/`;` chained commands:** wrapped as a whole — `{ git status && npm test; } 2>&1 | awk '...'`. The `{ }` grouping handles this correctly.
- **Commands with env var prefixes:** `NODE_ENV=test npm test` — not in allowlist, gets wrapped. Correct behavior.
- **Backgrounded commands (`&`):** wrapping breaks backgrounding. Acceptable — Claude Code rarely backgrounds commands.
- **Subshells (`$(...)`):** inner subshell output is captured by outer pipe. Acceptable.

### What's Not in Scope

- **Deny phase** — dropped to avoid retry loops and false-positive complexity. Re-evaluate if wrapping alone proves insufficient.
- **Read tool truncation** — Read already has `limit`/`offset`
- **Auto-compact threshold** — no hook API to trigger `/compact`; file upstream feature request
- **PostToolUse output replacement** — not possible for built-in tools; file upstream feature request
