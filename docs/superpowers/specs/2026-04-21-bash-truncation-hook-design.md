# Bash Truncation Hook — PreToolUse Output Limiter

**Issue:** [chmc/oxveil#52](https://github.com/chmc/oxveil/issues/52)
**Date:** 2026-04-21

## Problem

Bash tool outputs (test runs, builds, finds) dump full raw output into context and persist for the entire session. A single verbose test run can consume 10K+ tokens that are never useful again.

PostToolUse hooks cannot truncate built-in tool output — only `updatedMCPToolOutput` exists, gated to MCP tools. PreToolUse `updatedInput` can rewrite commands before execution, enabling output truncation at the source.

## Design

### Approach: Hybrid deny + wrap

Two-phase PreToolUse hook on the Bash tool:

1. **Deny phase** — Block commands that should use a different tool. Return `permissionDecision: "deny"` with guidance.
2. **Wrap phase** — Rewrite remaining commands to pipe through `head`/`tail` truncation. Return `updatedInput` with modified command.

Commands matching an allowlist pass through unchanged.

### Hook Location

- **Script:** `.claude/hooks/bash-truncate.mjs` (Node.js, no external deps)
- **Config:** `.claude/settings.json` → `hooks.PreToolUse` matcher on `Bash`
- **Scope:** Project-level (Oxveil repo only)

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

### Deny Patterns

Block and redirect to proper tools:

| Pattern | Reason |
|---------|--------|
| `^cat\s+\S+` (no pipe) | "Use the Read tool with limit/offset" |
| `^find\s+` without `-maxdepth` | "Use the Glob tool" |
| `^grep\s+-r` without `\| head` | "Use the Grep tool" |

Output:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Use the Read tool with limit/offset instead of cat"
  }
}
```

### Allowlist (passthrough)

Commands that skip wrapping:

- `git *` — already bounded by Claude Code
- `echo`, `printf`, `pwd`, `which`, `type` — short output
- `ls` without `-R` — bounded
- Commands containing `| head`, `| tail`, `| wc`, `| grep` — already bounded
- Commands containing `> ` or `>> ` — output goes to file
- Commands containing `--help` or `-h` — short output

### Wrap Template

For commands not denied or allowlisted:

```bash
{ ORIGINAL_COMMAND; } 2>&1 | { head -150; dd of=/dev/null bs=64k 2>/dev/null; echo ''; echo '--- truncated (showing last 50 lines) ---'; tail -50; }
```

- `head -150` — first 150 lines (errors, first failures)
- `dd of=/dev/null` — drain pipe to prevent broken pipe errors
- `tail -50` — last 50 lines (summary, pass/fail counts)
- Max output: ~200 lines

Output:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "updatedInput": {
      "command": "{ npm test; } 2>&1 | { head -150; dd ... tail -50; }"
    }
  }
}
```

### Script Structure

```
bash-truncate.mjs
├── DENY_PATTERNS[]     — regex + reason pairs
├── ALLOWLIST[]         — regex patterns for passthrough
├── BOUNDED_PATTERNS[]  — already-bounded detection (| head, | tail, etc.)
├── readStdin()         — read JSON from stdin with timeout
├── isDenied(cmd)       — check deny patterns
├── isAllowlisted(cmd)  — check allowlist + bounded patterns
├── wrapCommand(cmd)    — apply head/tail template
└── main()              — orchestrate: deny → allowlist → wrap
```

### Error Handling

- stdin read timeout: 2s — if JSON parsing fails, exit 0 (allow unchanged)
- Hook timeout: 5s in settings — if script hangs, Claude Code kills it and runs command unmodified
- No external dependencies — Node.js builtins only

### Self-Maintenance via CLAUDE.md

```markdown
## Bash Truncation Hook (.claude/hooks/bash-truncate.mjs)

- NEVER work around the hook by modifying commands to avoid pattern matching. Fix the hook instead.
- On false positive (useful output truncated): add command pattern to ALLOWLIST in bash-truncate.mjs.
- On false negative (verbose output passed through): add pattern to WRAP_PATTERNS or DENY_PATTERNS.
- On wrong denial (valid cat/find/grep usage): add exception to DENY_PATTERNS.
- After editing, verify: `node .claude/hooks/bash-truncate.mjs <<< '{"tool_input":{"command":"TEST_CMD"}}'`
```

### Testing

- Unit test the script directly: pipe JSON to stdin, verify stdout JSON
- Integration test: run Claude Code with the hook active, execute verbose commands, verify truncation
- Verify deny patterns redirect correctly (model uses Read/Glob/Grep after denial)
- Verify allowlisted commands pass through unchanged
- Verify already-bounded commands are not double-wrapped

### What's Not in Scope

- **Read tool truncation** — Read already has `limit`/`offset`
- **Auto-compact threshold** — no hook API to trigger `/compact`; file upstream feature request
- **PostToolUse output replacement** — not possible for built-in tools; file upstream feature request
