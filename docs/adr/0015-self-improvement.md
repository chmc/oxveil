# 15. Self-Improvement Mode

**Date:** 2026-04-25
**Status:** Accepted

## Context

When implementation runs via Oxveil/claudeloop, the learning loop is lost. In traditional Claude Code sessions, users give feedback and Claude updates CLAUDE.md. With Oxveil, implementation context is in claudeloop logs — expensive to process post-hoc.

This feature adds optional self-improvement mode that captures behavioral lessons during implementation and proposes updates to instruction files after session completion.

**Cross-repo scope:** claudeloop captures lessons, Oxveil provides the UI.

## Decision

### Token-Free Metrics Only (MVP)

Lessons capture only token-free metrics: retries, duration, and exit status per phase. Claude explanations (slow/retry/deviation triggers) deferred to future iterations.

**Rationale:** Token-free metrics are fast to capture and sufficient to identify problematic phases. Claude explanations require API calls during execution which adds latency and cost.

### Cross-Repo Architecture

- **claudeloop** writes `.claudeloop/lessons.md` after each phase completion
- **Oxveil** reads and parses `lessons.md`, displays in panel, spawns improvement session

**Rationale:** Follows existing IPC contract pattern where claudeloop owns `.claudeloop/` directory and Oxveil only reads. Keeps capture logic close to the execution engine.

### Terminal-Based Improvement Session

The improvement session spawns Claude CLI in a VS Code terminal rather than an in-panel chat interface.

**Rationale:** MVP simplicity. Terminal provides familiar Claude Code UX without building a custom chat interface. Users can naturally iterate with Claude on the proposals.

### lessons.md Format

```markdown
## Phase N: Title
- retries: N
- duration: Ns (expected: Ns)?
- exit: success|error
```

**Rationale:** Human-readable markdown consistent with other `.claudeloop/` files. Easy to parse, easy to inspect manually, included in archives.

## Consequences

**Positive:**
- Zero runtime overhead during execution (no API calls for explanations)
- Familiar Claude Code terminal UX for improvement session
- Clear separation: claudeloop captures, Oxveil presents
- Lessons archived with session for future reference

**Negative:**
- Manual copy/paste of Claude's suggestions to CLAUDE.md (no in-panel apply)
- No Claude explanations for slow phases or retries (deferred)
- Requires both repos to be updated for feature changes

**Future iterations:**
- Trigger-based Claude explanations (slow, retry, deviation)
- In-panel chat interface with inline diff display
- Dismissal learning (stop proposing rejected patterns)
- Positive reinforcement tracking

## Amendment: Auto-Start (2026-04-26)

**Change:** Terminal session now auto-starts when session completes with lessons captured. Previously, a launcher panel with Start/Skip buttons required manual interaction.

**Rationale:** Users expected the self-improvement session to open automatically (like plan chat), not require an extra click. The intermediate launcher panel created friction and was not discoverable.

**New flow:**
1. Session completes with `selfImprovement` enabled and `lessons.md` captured
2. Claude CLI terminal auto-starts with lessons context in system prompt
3. Sidebar shows "self-improvement" view with Focus Terminal / End Session buttons
4. Closing terminal returns to `completed` view

**Backward compatibility:** `SelfImprovementPanel` (lessons table) is retained for manual invocation via `oxveil.selfImprovement.focus`, but is no longer auto-shown.
