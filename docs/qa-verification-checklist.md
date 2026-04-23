# Oxveil QA Verification Checklist

Reusable checklist for comprehensive quality verification of the Oxveil VS Code extension.

---

## 1. Pre-Flight

- [ ] `npm run lint` passes
- [ ] `npm test` passes (note test count: _____)
- [ ] No uncommitted changes (or stash if needed)
- [ ] macOS permissions: Accessibility, Screen Recording

---

## 2. State Machine Audit

### SessionState (`src/core/sessionState.ts`)

- [ ] 4 states verified: idle, running, done, failed
- [ ] Transitions match docs: idle→running, running→done, running→failed, done→idle, failed→idle, failed→running
- [ ] Orphan recovery (checkInitialState) documented

### SidebarState (`src/views/sidebarState.ts`)

- [ ] All 9 views verified: not-found, empty, planning, ready, stale, running, stopped, failed, completed
- [ ] Decision table matches code (16 rules)
- [ ] PlanUserChoice includes all 4 values: none, resume, dismiss, planning

### StatusBar (`src/views/statusBar.ts`)

- [ ] All 8 kinds verified: not-found, installing, ready, idle, stopped, running, failed, done
- [ ] Multi-root display format correct

### PlanPreview (`src/views/planPreviewPanel.ts`)

- [ ] All 4 states verified: empty, raw-markdown, active, session-ended
- [ ] Tab system working (design, implementation, plan)
- [ ] File watching with debounce

---

## 3. Visual Verification

### Setup

```bash
npm run build
code --extensionDevelopmentPath="$(pwd)"
```

Wait for `.oxveil-mcp` discovery file.

### MCP Bridge Test

```bash
DISCOVERY=$(cat .oxveil-mcp)
PORT=$(echo "$DISCOVERY" | python3 -c "import sys, json; print(json.load(sys.stdin)['port'])")
TOKEN=$(echo "$DISCOVERY" | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])")
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/state | python3 -m json.tool
```

### Sidebar States

- [ ] Empty state: "From Idea to Reality", Let's Go button, How it works steps
- [ ] Planning state: During active plan chat
- [ ] Stale state: PLAN.md found, no progress, Resume/Dismiss buttons
- [ ] Ready state: Plan parsed, phases visible, Start button
- [ ] Running state: Progress bar, phase list, Stop button, elapsed timer
- [ ] Stopped state: Partial progress, Resume/Restart buttons
- [ ] Failed state: Error snippet, Retry/Skip buttons
- [ ] Completed state: Success banner, summary, Replay button

### Panels

- [ ] Config Wizard: Opens, shows settings, saves correctly
- [ ] Dependency Graph: DAG renders, status colors work
- [ ] Live Run: Streams output during session
- [ ] Plan Preview: Updates during plan chat, tabs work

### Status Bar

- [ ] Updates during session lifecycle
- [ ] Shows correct icon per state
- [ ] Click navigates to sidebar

---

## 4. User Story Verification

### Core Lifecycle (US-01 to US-10)

- [ ] US-01: Extension loads correctly
- [ ] US-02: Empty state displays on fresh workspace
- [ ] US-03: "Let's Go" launches Plan Chat terminal
- [ ] US-04: Plan conversation creates PLAN.md
- [ ] US-05: "Form Plan" triggers AI parse
- [ ] US-06: "Start" launches session, view=running
- [ ] US-07: Session completes, view=completed
- [ ] US-08: Session fails, view=failed with actions
- [ ] US-09: "Stop" pauses session, view=stopped
- [ ] US-10: Stale plan discovery works

### Extended (US-11 to US-21)

- [ ] Archive browse and replay
- [ ] Config wizard edit and save
- [ ] Dependency graph interaction
- [ ] Timeline view
- [ ] Multi-root folder switching (if applicable)

---

## 5. Test Coverage

### Critical Paths

- [ ] sidebarState.test.ts covers all 9 views
- [ ] activateSidebar.test.ts covers onPlanChatStarted/Ended
- [ ] statusBar.test.ts covers all 8 kinds
- [ ] sessionState.test.ts covers all transitions

### Sync Test

- [ ] `workflowStatesSync.test.ts` passes (validates docs match code)

---

## 6. Documentation Sync

- [ ] `docs/workflow/states.md` matches implementation
- [ ] All type definitions in Appendix are current
- [ ] Decision tables are numbered correctly
- [ ] Flowcharts reflect current logic

---

## 7. Findings Documentation

Create session folder: `docs/qa-sessions/YYYY-MM-DD-<session>/`

Contents:
- `baseline.md` — lint/test results at session start
- `findings.md` — all discoveries, triaged by severity
- `screenshots/` — visual evidence (gitignored)
- `videos/` — workflow recordings (gitignored)

---

## 8. GitHub Issues

For each finding by severity:

- **Critical**: Immediate fix required, blocks release
- **Major**: Should fix before release
- **Minor**: Can defer to future release
- **Info**: Document only, no action required

---

## Quick Reference

### MCP Bridge Commands

| Command | Action |
|---------|--------|
| `GET /state` | Current sidebar state |
| `POST /click {"command":"start"}` | Click sidebar button |
| `POST /command {"command":"oxveil.xxx"}` | Execute VS Code command |

### Screenshot Pipeline

```bash
WINDOW_ID=$(swift -e 'import CoreGraphics; let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String: Any]]; for w in windows { let owner = w["kCGWindowOwnerName"] as? String ?? ""; let name = w["kCGWindowName"] as? String ?? ""; if owner.contains("Code") && name.contains("[Extension Development Host]") { print(w["kCGWindowNumber"] as? Int ?? 0); break } }')
screencapture -l "$WINDOW_ID" screenshot.png
sips --resampleWidth 1568 screenshot.png --out screenshot.png > /dev/null
```

### fake_claude Scenarios

| Scenario | Use Case |
|----------|----------|
| `success` | Full lifecycle verification |
| `failure` | Failed state verification |
| `slow` | Elapsed timer, spinner |
