# Plan Chat — Design Spec

## Problem

Creating plans in Oxveil requires manually writing PLAN.md files. Users want to brainstorm with Claude to figure out what to build, then save the result as a claudeloop-executable plan. There is no conversational interface for plan creation.

## Solution

A two-part feature: (1) a VS Code integrated terminal running Claude Code CLI for conversational plan creation, and (2) a plan preview webview that live-renders the evolving PLAN.md with interactive annotations.

## Architecture

### Components

1. **Plan Chat Terminal** — VS Code integrated terminal running `claude` CLI with a system prompt that instructs Claude to write/update PLAN.md in claudeloop format.
2. **Plan Preview Webview** — editor tab showing live-rendered PLAN.md with phase cards, annotations, and validation.
3. **Claude Detection** — binary detection for `claude` CLI (separate from existing `claudeloop` detection).
4. **Annotation Bridge** — `terminal.sendText()` to inject annotation context from the preview into the terminal.

### Data Flow

```
User opens "Plan Chat"
  → Extension detects existing PLAN.md (offer: edit existing / create new / cancel)
  → Extension generates system prompt file (includes PLAN.md format spec + existing plan if editing)
  → Extension opens VS Code terminal: claude --system-prompt-file <path> --cwd <workspace>
  → Extension opens Plan Preview webview beside terminal
  → User chats with Claude in terminal
  → Claude writes/updates PLAN.md in workspace root
  → FileSystemWatcher detects PLAN.md change
  → Plan parser validates format → preview webview updates
  → User clicks annotation on a phase → extension calls terminal.sendText()
  → Claude receives annotation as next message, responds in terminal
```

### System Prompt Strategy

A generated system prompt file instructs Claude to:
- Write the plan directly to PLAN.md in the workspace root
- Use claudeloop format: `## Phase N: Title` headers, `**Depends on:** Phase N` lines
- Update the file iteratively as the conversation evolves
- Include phase descriptions under each header

If editing an existing plan, the system prompt includes the current PLAN.md content as context.

**System prompt template (key constraints):**
```
You are helping the user create a plan for an AI coding workflow.

Write the plan to PLAN.md in the workspace root. Use this exact format:

## Phase N: Title
Description of what this phase accomplishes.
**Depends on:** Phase X, Phase Y

Rules:
- Number phases sequentially starting from 1
- Include clear descriptions under each phase header
- Declare dependencies explicitly
- Update PLAN.md after each refinement (overwrite, don't append)
- Keep phase count reasonable (3-15 phases for most projects)
```

## Plan Preview Webview

### Layout

Single editor tab with:
- Header bar: "Plan Preview" title, "Live" indicator (green badge), validation status
- Phase list: vertical stack of phase cards
- Each phase card: colored left border (green=completed, blue=in_progress, gray=pending), title, description, dependency list
- Annotation UI: click a phase → inline text input → submit sends to terminal

### Live Updates

- FileSystemWatcher on `PLAN.md` in workspace root (follow the watcher pattern from `src/core/watchers.ts`, creating a new single-file watcher rather than modifying the existing `WatcherManager`)
- On change: read file → parse with existing `parsePlan()` from `src/parsers/plan.ts` → send parsed state to webview
- If parse fails (Claude wrote non-standard format): show raw markdown with a warning banner

### Annotations

1. User clicks a phase card → inline text input appears below the phase
2. User types annotation (e.g., "Add error handling here") and presses Enter
3. Extension constructs message: `"Regarding Phase 2 (Build API layer): Add error handling here"`
4. Extension calls `terminal.sendText(message)` to inject into the Claude terminal
5. Annotation dismissed from preview UI after sending

### Validation

After each PLAN.md update, run the plan parser and perform additional validation (new logic, not part of existing `parsePlan()`):
- All phases have valid `## Phase N: Title` headers (existing parser check)
- Phase numbers are sequential (new validation)
- Dependencies reference existing phases (new validation)
- Show validation status in the header bar (green check / yellow warning)

## Terminal Integration

### Spawn

The exact Claude CLI flags must be verified at implementation time against the installed version. The intent is:
- Pass a system prompt (via `--system-prompt` inline or `--system-prompt-file` if supported)
- Restrict Claude to plan mode (via `--permission-mode plan` or `--allowedTools` with read-only tools)
- Set CWD to workspace root

```typescript
// Flag names are illustrative — verify against `claude --help` during implementation
const terminal = vscode.window.createTerminal({
  name: `Plan Chat (${folderName})`,
  cwd: workspaceRoot,
  shellPath: claudePath,
  shellArgs: buildClaudeArgs(systemPromptContent),
});
terminal.show();
```

Implementation must check `claude --help` output and select the correct flags. If `--permission-mode plan` is not available, use `--allowedTools "Read,Glob,Grep"` to restrict to read-only tools.

### Annotation Timing

`terminal.sendText()` injects text regardless of whether Claude is mid-response or waiting for input. If Claude is currently responding, the injected text will queue and be sent after the current response completes. The annotation UI should indicate "Sending..." until the user sees the text appear in the terminal.

### Lifecycle

- Terminal and preview are linked: opening Plan Chat creates both, tracked by a `PlanChatSession` object
- Closing terminal: preview shows "Session ended" indicator, annotations disabled
- Closing preview: terminal keeps running, user can reopen preview via `oxveil.showPlanPreview`
- Reopening Plan Chat when session exists: focus existing terminal + preview

## Claude CLI Detection

New detection for the `claude` binary, separate from existing `claudeloop` detection:
- Check PATH for `claude`
- Check VS Code setting `oxveil.claudePath` for custom path
- Run `claude --version` to verify
- Set context key `oxveil.claudeDetected` for command enablement
- Show "Install Claude Code" action if not found

## Edge Cases

### Existing PLAN.md

On open, detect existing PLAN.md:
- **Edit existing**: system prompt includes current content, Claude refines it
- **Create new**: rename existing to `PLAN.md.bak`, start fresh
- **Cancel**: abort

### Format Mismatch

If Claude writes PLAN.md in a non-standard format:
- Preview shows raw markdown with warning: "Plan format not recognized"
- Phase cards not rendered
- User can ask Claude to reformat via the terminal

### Multi-root Workspace

- Plan Chat opens for the active workspace folder
- Terminal CWD set to that folder
- Watcher scoped to that folder's PLAN.md
- Folder name in terminal title: `Plan Chat (my-project)`

### Process Crash / Network Failure

- Terminal shows Claude's own error handling (built-in retry, error messages)
- Preview stays on last known PLAN.md state
- User can restart by reopening Plan Chat

### Duplicate Prevention

- If Plan Chat is already open for a folder: focus existing terminal + preview
- One Plan Chat session per workspace folder

## New Files

| File | Purpose |
|------|---------|
| `src/views/planPreviewPanel.ts` | Plan preview webview panel lifecycle |
| `src/views/planPreviewHtml.ts` | HTML generation for plan preview (phase cards, annotations) |
| `src/commands/planChat.ts` | Command handler: detect state, generate system prompt, open terminal + preview |
| `src/core/claudeDetection.ts` | Claude CLI binary detection and version check |
| `src/core/planChatSession.ts` | Session object linking terminal + preview + watcher |

## Reused Existing Code

| File | What to Reuse |
|------|---------------|
| `src/parsers/plan.ts` | `parsePlan()` for PLAN.md parsing and validation |
| `src/core/watchers.ts` | `WatcherManager` pattern for FileSystemWatcher on PLAN.md |
| `src/views/liveRunPanel.ts` | Webview panel lifecycle pattern (create, reveal, dispose) |
| `src/views/liveRunHtml.ts` | HTML generation pattern (nonce CSP, VS Code theme vars) |
| `src/core/detection.ts` | Detection pattern for binary discovery + version check |

## Commands

| Command ID | Title | When |
|------------|-------|------|
| `oxveil.openPlanChat` | Oxveil: Plan Chat | `oxveil.claudeDetected && !oxveil.processRunning` |
| `oxveil.showPlanPreview` | Oxveil: Show Plan Preview | `oxveil.planChatActive` |

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `oxveil.claudePath` | string | `""` | Custom path to claude CLI binary |

## Verification

1. Open Plan Chat in a workspace with no PLAN.md → terminal opens, preview shows empty state
2. Chat with Claude → PLAN.md created → preview shows phase cards
3. Continue chatting → PLAN.md updated → preview updates live
4. Click annotation on Phase 2 → type note → text appears in terminal
5. Close preview → reopen via command → preview restores from current PLAN.md
6. Close terminal → preview shows "Session ended"
7. Open Plan Chat with existing PLAN.md → offered edit/create new/cancel
8. Multi-root: Plan Chat binds to correct folder
9. Claude not installed → command shows install prompt
10. Malformed PLAN.md → preview shows warning with raw markdown
